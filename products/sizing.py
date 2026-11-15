"""
Recomendador de talles de JPEX Store.

Este archivo tiene solo "funciones puras": no usan Django, ni la base de datos,
ni el request. Reciben números y textos, y devuelven números y textos.
Por eso se pueden probar sin levantar la base (ver products/tests.py).

IMPORTANTE: no importar nada de laboratory/ acá (laboratory/utils.py carga la IA).
"""


# =============================================================================
# !!! PARÁMETROS PROVISORIOS !!!
# Todos estos números son INVENTADOS como punto de partida razonable.
# NO están validados. Hay que reemplazarlos con mediciones reales de prendas
# y de clientes. Cuando un tipo de prenda tenga números reales, poner su
# valor en CALIBRATED en True (eso saca el aviso de "etapa de prueba").
# =============================================================================

# Rangos de holgura por tipo de prenda y calce, en cm de circunferencia: (mínimo, máximo)
FIT_EASE_CM = {
    "remera":    {"ajustado": (4, 10), "regular": (10, 16), "holgado": (16, 22)},
    "musculosa": {"ajustado": (4, 10), "regular": (10, 16), "holgado": (16, 22)},
    "buzo":      {"ajustado": (8, 14), "regular": (14, 20), "holgado": (20, 26)},
}

# Si el tipo de prenda ya tiene números reales. Mientras sea False, se muestra el aviso de "etapa de prueba".
CALIBRATED = {"remera": False, "musculosa": False, "buzo": False}

# Holgura extra cuando manda el abdomen (se suma al mínimo y al máximo del rango)
ABDOMEN_EXTRA_EASE_CM = 2

# Cuánto baja el mínimo del rango según la elasticidad de la tela
STRETCH_MIN_ADJUST_CM = {"none": 0, "low": -1, "high": -3}

# Encogimiento al lavar, por tipo de prenda (0.03 = 3 %). En 0 hasta medirlo.
SHRINKAGE = {"remera": 0.0, "musculosa": 0.0, "buzo": 0.0}

# Estimación del pecho (circunferencia, cm) desde altura y peso:
#   pecho = 98 + 0.7 * (peso - 75) - 0.2 * (altura - 175) + ajuste por silueta
CHEST_BASE_CM = 98
CHEST_REF_WEIGHT_KG = 75
CHEST_REF_HEIGHT_CM = 175
CHEST_PER_KG = 0.7
CHEST_PER_CM_HEIGHT = -0.2
BUILD_CHEST_ADJUST_CM = {"delgado": -3, "medio": 0, "atletico": 3, "robusto": 2}

# Diferencia entre cinta y estimación a partir de la cual se avisa "revisá tus medidas"
MISMATCH_CM = 10

# Valores aceptados (fuera de esto, ValueError)
VALID_RANGES = {
    "height_cm": (140, 220),
    "weight_kg": (40, 200),
    "chest_cm": (70, 160),
    "waist_cm": (60, 170),
}

# Tabla de respaldo PROVISORIA para prendas sin plantilla ni medidas propias.
# Copiada de laboratory/utils.py. chest_cm es ANCHO PLANO (axila a axila),
# o sea la MITAD del contorno. Corte: oversize.
DEFAULT_FIT_STYLE = "oversize"
DEFAULT_SIZES = [
    {
        "size_name": name,
        "chest_cm": chest,
        "length_cm": length,
        "shoulder_cm": shoulder,
        "sleeve_cm": None,
        "hem_cm": None,
        "detail_obj": None,
        "source": "default",
    }
    for name, chest, length, shoulder in [
        ("S", 53.0, 70.0, 49.0),
        ("M", 56.0, 72.0, 52.0),
        ("L", 59.0, 75.0, 55.0),
        ("XL", 62.0, 77.0, 58.0),
    ]
]


# =============================================================================
# Configuración del diseño (no son números a calibrar, son reglas del negocio)
# =============================================================================

# Qué calces se ofrecen según el corte de la prenda: (calces permitidos, preseleccionado)
# El preseleccionado es siempre "regular": con "holgado" preseleccionado en una
# oversize que vende pocos talles, una persona promedio recibía "no hay talle"
# sin haber elegido nada.
FIT_STYLE_OPTIONS = {
    "slim":     (["ajustado", "regular"], "regular"),
    "regular":  (["ajustado", "regular", "holgado"], "regular"),
    "oversize": (["regular", "holgado"], "regular"),
    "boxy":     (["regular", "holgado"], "regular"),
}

# Slug de la categoría -> tipo de prenda. Sumar un tipo nuevo = agregar una fila
# acá y otra en FIT_EASE_CM, CALIBRATED y SHRINKAGE.
CATEGORY_TO_GARMENT = {
    "remeras": "remera",
    "musculosas": "musculosa",
    "buzos": "buzo",
}


class SizingError(ValueError):
    """
    Error de datos del recomendador.

    Es un ValueError (así que cumple "lanza ValueError"), pero además guarda
    en `field` qué campo del formulario está mal ("height_cm", "fit", etc.),
    para que la pantalla pueda mostrar el mensaje al lado de ese campo.
    `field` es None cuando el problema no es del usuario (ej. prenda sin talles).
    """

    def __init__(self, message, field=None):
        super().__init__(message)
        self.field = field


# =============================================================================
# Funciones
# =============================================================================

FIELD_LABELS = {
    "height_cm": "la altura",
    "weight_kg": "el peso",
    "chest_cm": "el pecho",
    "waist_cm": "la cintura",
    "build": "la contextura",
    "fit": "el calce",
}

# Las cuentas se redondean a 2 decimales para que errores mínimos de la
# computadora (ej. 0.7 * 3 = 2.0999999) no cambien un veredicto en el borde.
ROUND_DECIMALS = 2


def estimate_chest_cm(height_cm, weight_kg, build):
    """Estima el contorno de pecho (cm) con la fórmula provisoria."""
    if build not in BUILD_CHEST_ADJUST_CM:
        raise SizingError("Elegí una contextura de la lista.", field="build")
    chest = (
        CHEST_BASE_CM
        + CHEST_PER_KG * (weight_kg - CHEST_REF_WEIGHT_KG)
        + CHEST_PER_CM_HEIGHT * (height_cm - CHEST_REF_HEIGHT_CM)
        + BUILD_CHEST_ADJUST_CM[build]
    )
    return round(chest, ROUND_DECIMALS)


def allowed_fits(fit_style):
    """Devuelve (lista de calces permitidos, calce preseleccionado) para un corte."""
    if fit_style not in FIT_STYLE_OPTIONS:
        raise SizingError(f"Corte de prenda desconocido: {fit_style!r}.")
    fits, default = FIT_STYLE_OPTIONS[fit_style]
    # Devolvemos una copia de la lista: si quien la recibe la modifica,
    # no rompe la tabla original.
    return list(fits), default


def recommend_size(sizes, garment_type, fit_style, stretch_level,
                   height_cm, weight_kg, build, fit,
                   chest_cm=None, waist_cm=None):
    """
    Recomienda un talle. Recorre los 4 pasos del diseño:
      1. obtener el pecho de la persona (cinta o estimación),
      2. decidir qué medida del cuerpo manda (pecho o abdomen),
      3. comparar contra cada talle,
      4. elegir el talle.
    Lanza SizingError (que es un ValueError) si algún dato está mal.
    """
    _validate_garment(sizes, garment_type, fit_style, stretch_level)
    _validate_person(height_cm, weight_kg, build, fit, chest_cm, waist_cm)
    if fit not in allowed_fits(fit_style)[0]:
        raise SizingError("Ese calce no está disponible para esta prenda.", field="fit")

    # Paso 1: pecho de la persona.
    estimate = estimate_chest_cm(height_cm, weight_kg, build)
    if chest_cm is not None:
        body_chest = chest_cm
        confidence = "alta"
        mismatch = abs(chest_cm - estimate) > MISMATCH_CM
    else:
        body_chest = estimate
        confidence = "media"
        mismatch = False

    # Paso 2: qué medida manda.
    abdomen_rules = waist_cm is not None and waist_cm > body_chest
    body = waist_cm if abdomen_rules else body_chest

    # Paso 3: comparar contra cada talle.
    ease_min, ease_max = _ease_range(garment_type, fit, stretch_level, abdomen_rules)
    shrinkage = SHRINKAGE[garment_type]
    comparison = []
    for size in sizes:
        ease = round(_garment_contour(size, abdomen_rules, shrinkage) - body, ROUND_DECIMALS)
        comparison.append({
            "size_name": size["size_name"],
            "verdict": _verdict(ease, ease_min, ease_max),
            "ease_cm": ease,
        })

    # Paso 4: elegir el talle.
    choice = _choose(sizes, comparison, ease_min, ease_max)

    return {
        **choice,
        "confidence": confidence,
        "measurements_mismatch": mismatch,
        "calibrated": CALIBRATED[garment_type],
        "comparison": comparison,
    }


# ---------------------------------------------------------------------------
# Piezas internas de recommend_size (el "_" adelante indica que son internas)
# ---------------------------------------------------------------------------

def _validate_garment(sizes, garment_type, fit_style, stretch_level):
    """Datos de la prenda: si fallan, es un problema de la tienda, no del usuario."""
    if not sizes:
        raise SizingError("Esta prenda no tiene talles cargados.")
    if garment_type not in FIT_EASE_CM:
        raise SizingError(f"Tipo de prenda desconocido: {garment_type!r}.")
    if fit_style not in FIT_STYLE_OPTIONS:
        raise SizingError(f"Corte de prenda desconocido: {fit_style!r}.")
    if stretch_level not in STRETCH_MIN_ADJUST_CM:
        raise SizingError(f"Elasticidad desconocida: {stretch_level!r}.")


def _validate_person(height_cm, weight_kg, build, fit, chest_cm, waist_cm):
    """Datos que carga el usuario."""
    required = {"height_cm": height_cm, "weight_kg": weight_kg, "build": build, "fit": fit}
    for field, value in required.items():
        if value is None or value == "":
            raise SizingError(f"Falta {FIELD_LABELS[field]}.", field=field)

    numbers = {"height_cm": height_cm, "weight_kg": weight_kg,
               "chest_cm": chest_cm, "waist_cm": waist_cm}
    for field, value in numbers.items():
        if value is None:  # pecho y cintura son opcionales
            continue
        # bool es un tipo de número en Python (True == 1): lo rechazamos a mano.
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise SizingError(f"Revisá {FIELD_LABELS[field]}: tiene que ser un número.", field=field)
        low, high = VALID_RANGES[field]
        # Si value es NaN ("no es un número"), esta comparación da False y cae en el error.
        if not (low <= value <= high):
            raise SizingError(
                f"Revisá {FIELD_LABELS[field]}: tiene que estar entre {low} y {high}.",
                field=field,
            )

    if build not in BUILD_CHEST_ADJUST_CM:
        raise SizingError("Elegí una contextura de la lista.", field="build")
    # Un calce existe si aparece en los rangos de algún tipo de prenda.
    if not any(fit in ranges for ranges in FIT_EASE_CM.values()):
        raise SizingError("Elegí un calce de la lista.", field="fit")


def _ease_range(garment_type, fit, stretch_level, abdomen_rules):
    """Rango de holgura (mínimo, máximo) para esta prenda, calce y tela."""
    ease_min, ease_max = FIT_EASE_CM[garment_type][fit]
    if abdomen_rules:
        ease_min += ABDOMEN_EXTRA_EASE_CM
        ease_max += ABDOMEN_EXTRA_EASE_CM
    # La elasticidad solo baja el mínimo: la tela cede si queda justa,
    # pero no hace que una prenda grande quede menos suelta.
    ease_min += STRETCH_MIN_ADJUST_CM[stretch_level]
    return ease_min, ease_max


def _garment_contour(size, abdomen_rules, shrinkage):
    """Contorno de la prenda (cm). Recordar: los datos son ANCHO PLANO, por eso × 2."""
    flat = size["chest_cm"]
    if abdomen_rules and size.get("hem_cm"):
        flat = size["hem_cm"]
    return flat * 2 * (1 - shrinkage)


def _verdict(ease, ease_min, ease_max):
    if ease < ease_min:
        return "justo"
    if ease < ease_max:
        return "ideal"
    return "suelto"


def _choose(sizes, comparison, ease_min, ease_max):
    """
    Paso 4. Devuelve recommended, alternative, alternative_direction y reason.

    "Más grande" se decide por el ancho de pecho de la prenda, no por el orden
    de la lista. Ante un empate, gana el talle más grande (algo un poco suelto
    se usa; algo justo, no).
    """
    rows = [
        {"name": row["size_name"], "ease": row["ease_cm"],
         "verdict": row["verdict"], "chest": size["chest_cm"]}
        for size, row in zip(sizes, comparison)
    ]
    ideals = [r for r in rows if r["verdict"] == "ideal"]

    if len(ideals) == 1:
        return _choice(ideals[0], None, "ok")

    if len(ideals) >= 2:
        center = (ease_min + ease_max) / 2
        # Ordena por distancia al centro; ante empate, el más grande primero.
        ideals.sort(key=lambda r: (abs(r["ease"] - center), -r["chest"]))
        return _choice(ideals[0], ideals[1], "ok")

    tight = [r for r in rows if r["verdict"] == "justo"]
    loose = [r for r in rows if r["verdict"] == "suelto"]
    if not loose:
        return _choice(None, None, "cuerpo_mayor")
    if not tight:
        return _choice(None, None, "cuerpo_menor")

    # Entre talles: el justo que menos falta y el suelto que menos sobra.
    best_tight = max(tight, key=lambda r: (r["ease"], r["chest"]))
    best_loose = min(loose, key=lambda r: (r["ease"], -r["chest"]))
    tight_gap = ease_min - best_tight["ease"]
    loose_gap = best_loose["ease"] - ease_max
    if loose_gap <= tight_gap:  # empate: gana el suelto (el más grande)
        return _choice(best_loose, best_tight, "entre_talles")
    return _choice(best_tight, best_loose, "entre_talles")


def _choice(recommended, alternative, reason):
    direction = None
    if recommended and alternative:
        direction = "suelto" if alternative["chest"] > recommended["chest"] else "ajustado"
    return {
        "recommended": recommended["name"] if recommended else None,
        "alternative": alternative["name"] if alternative else None,
        "alternative_direction": direction,
        "reason": reason,
    }
