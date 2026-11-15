"""
Pruebas del recomendador de talles.

Todos los datos de cuerpo son INVENTADOS (no hay datos de personas reales).
Estas pruebas no validan que los números provisorios sean buenos: comprueban
que la lógica hace lo que dice el diseño. Por eso, cuando se puede, las cuentas
esperadas se arman con los parámetros de sizing.py en vez de números a mano.
"""
import logging
from unittest.mock import patch

from django.apps import apps
from django.test import Client, SimpleTestCase, TestCase
from django.urls import reverse

from products import sizing
from products.models import (
    Category,
    Product,
    ProductMeasurementDetail,
    Size,
    SizeTemplate,
    SizeTemplateItem,
)
from products.sizing import (
    ABDOMEN_EXTRA_EASE_CM,
    BUILD_CHEST_ADJUST_CM,
    CHEST_BASE_CM,
    CHEST_PER_CM_HEIGHT,
    CHEST_PER_KG,
    DEFAULT_SIZES,
    FIT_EASE_CM,
    MISMATCH_CM,
    STRETCH_MIN_ADJUST_CM,
    allowed_fits,
    estimate_chest_cm,
    recommend_size,
)


def contour(size_dict):
    """Contorno de pecho de un talle (el ancho plano por 2)."""
    return size_dict["chest_cm"] * 2


def by_name(result, size_name):
    """Busca en result["comparison"] la fila de un talle."""
    for row in result["comparison"]:
        if row["size_name"] == size_name:
            return row
    raise AssertionError(f"No está el talle {size_name}")


def sizes_from_eases(body_cm, eases):
    """
    Arma una tabla de prueba donde, para un cuerpo de `body_cm`,
    cada talle queda con exactamente la holgura pedida.
    Los nombres son T0, T1, T2... de más chico a más grande.
    """
    return [
        {"size_name": f"T{i}", "chest_cm": (body_cm + ease) / 2, "hem_cm": None}
        for i, ease in enumerate(eases)
    ]


def rec(**overrides):
    """
    Llama a recommend_size con valores por defecto razonables (y inventados),
    cambiando solo lo que cada prueba necesita.
    """
    kwargs = {
        "sizes": DEFAULT_SIZES,
        "garment_type": "remera",
        "fit_style": "regular",
        "stretch_level": "none",
        "height_cm": 175,
        "weight_kg": 75,
        "build": "medio",
        "fit": "regular",
    }
    kwargs.update(overrides)
    return recommend_size(**kwargs)


class DefaultSizesTests(SimpleTestCase):
    def test_contornos_de_la_tabla_de_respaldo(self):
        # El diseño dice: contornos S 106, M 112, L 118, XL 124.
        self.assertEqual(
            [(s["size_name"], contour(s)) for s in DEFAULT_SIZES],
            [("S", 106), ("M", 112), ("L", 118), ("XL", 124)],
        )


class BasicRecommendationTests(SimpleTestCase):
    # Caso 1
    def test_pecho_100_regular_recomienda_M(self):
        r = rec(chest_cm=100)
        self.assertEqual(r["recommended"], "M")
        self.assertIsNone(r["alternative"])
        self.assertIsNone(r["alternative_direction"])
        self.assertEqual(r["reason"], "ok")
        self.assertEqual(r["confidence"], "alta")

    # Caso 2
    def test_ajustado_recomienda_S_y_holgado_L(self):
        self.assertEqual(rec(chest_cm=100, fit="ajustado")["recommended"], "S")
        self.assertEqual(rec(chest_cm=100, fit="holgado")["recommended"], "L")

    # Caso 3: si alguien se olvida de multiplicar por 2, esto da negativo.
    def test_unidades_holgura_de_M_es_12(self):
        r = rec(chest_cm=100)
        self.assertEqual(by_name(r, "M")["ease_cm"], 12)

    # Caso 4
    def test_veredicto_por_talle(self):
        r = rec(chest_cm=100)
        self.assertEqual(
            [(row["size_name"], row["verdict"]) for row in r["comparison"]],
            [("S", "justo"), ("M", "ideal"), ("L", "suelto"), ("XL", "suelto")],
        )

    def test_comparison_mantiene_el_orden_de_sizes(self):
        r = rec(chest_cm=100)
        self.assertEqual(
            [row["size_name"] for row in r["comparison"]],
            [s["size_name"] for s in DEFAULT_SIZES],
        )

    def test_calibrated_sale_del_parametro(self):
        self.assertFalse(rec(chest_cm=100)["calibrated"])
        with patch.dict(sizing.CALIBRATED, {"remera": True}):
            self.assertTrue(rec(chest_cm=100)["calibrated"])

    def test_encogimiento_achica_el_contorno(self):
        with patch.dict(sizing.SHRINKAGE, {"remera": 0.05}):
            r = rec(chest_cm=100)
        expected = round(contour(DEFAULT_SIZES[1]) * (1 - 0.05) - 100, 2)
        self.assertAlmostEqual(by_name(r, "M")["ease_cm"], expected)


class ChoiceTests(SimpleTestCase):
    """Cómo se elige el talle cuando no hay un único ideal."""

    BODY = 100

    def setUp(self):
        self.lo, self.hi = FIT_EASE_CM["remera"]["regular"]
        self.center = (self.lo + self.hi) / 2

    # Caso 5
    def test_dos_o_mas_ideales_gana_el_mas_cercano_al_centro(self):
        # T0 en el mínimo, T1 casi en el centro, T2 casi en el máximo: los tres ideales.
        eases = [self.lo, self.center + 0.1, self.hi - 0.5]
        r = rec(sizes=sizes_from_eases(self.BODY, eases), chest_cm=self.BODY)
        self.assertEqual(r["recommended"], "T1")
        # T2 está más cerca del centro que T0, así que es la alternativa.
        self.assertEqual(r["alternative"], "T2")
        self.assertEqual(r["alternative_direction"], "suelto")
        self.assertEqual(r["reason"], "ok")

    def test_alternativa_mas_chica_es_mas_ajustado(self):
        eases = [self.center - 0.5, self.center + 0.1]
        r = rec(sizes=sizes_from_eases(self.BODY, eases), chest_cm=self.BODY)
        self.assertEqual(r["recommended"], "T1")
        self.assertEqual(r["alternative"], "T0")
        self.assertEqual(r["alternative_direction"], "ajustado")

    def test_empate_entre_ideales_gana_el_mas_grande(self):
        eases = [self.center - 1, self.center + 1]
        r = rec(sizes=sizes_from_eases(self.BODY, eases), chest_cm=self.BODY)
        self.assertEqual(r["recommended"], "T1")
        self.assertEqual(r["alternative"], "T0")

    # Caso 6
    def test_entre_talles_gana_el_mas_cercano_al_rango(self):
        # T0 queda justo por 1 cm; T1 queda suelto por 2 cm.
        eases = [self.lo - 1, self.hi + 2]
        r = rec(sizes=sizes_from_eases(self.BODY, eases), chest_cm=self.BODY)
        self.assertEqual(r["reason"], "entre_talles")
        self.assertEqual(r["recommended"], "T0")
        self.assertEqual(r["alternative"], "T1")
        self.assertEqual(r["alternative_direction"], "suelto")

    def test_entre_talles_al_reves(self):
        # T0 queda justo por 3 cm; T1 queda suelto por 1 cm.
        eases = [self.lo - 3, self.hi + 1]
        r = rec(sizes=sizes_from_eases(self.BODY, eases), chest_cm=self.BODY)
        self.assertEqual(r["reason"], "entre_talles")
        self.assertEqual(r["recommended"], "T1")
        self.assertEqual(r["alternative"], "T0")
        self.assertEqual(r["alternative_direction"], "ajustado")

    def test_entre_talles_empate_gana_el_mas_grande(self):
        eases = [self.lo - 1, self.hi + 1]
        r = rec(sizes=sizes_from_eases(self.BODY, eases), chest_cm=self.BODY)
        self.assertEqual(r["recommended"], "T1")
        self.assertEqual(r["alternative"], "T0")

    # Caso 7
    def test_cuerpo_mayor_que_todos(self):
        r = rec(chest_cm=140)
        self.assertTrue(all(row["verdict"] == "justo" for row in r["comparison"]))
        self.assertIsNone(r["recommended"])
        self.assertIsNone(r["alternative"])
        self.assertIsNone(r["alternative_direction"])
        self.assertEqual(r["reason"], "cuerpo_mayor")

    # Caso 8
    def test_cuerpo_menor_que_todos(self):
        r = rec(chest_cm=80)
        self.assertTrue(all(row["verdict"] == "suelto" for row in r["comparison"]))
        self.assertIsNone(r["recommended"])
        self.assertIsNone(r["alternative"])
        self.assertEqual(r["reason"], "cuerpo_menor")


class ChestSourceTests(SimpleTestCase):
    """De dónde sale el pecho: cinta o estimación."""

    # Caso 9
    def test_solo_basico_confianza_media(self):
        r = rec()
        self.assertEqual(r["confidence"], "media")
        self.assertFalse(r["measurements_mismatch"])

    def test_estimacion_en_el_punto_de_referencia(self):
        # El diseño dice que 175 cm, 75 kg, medio da 98.
        self.assertEqual(estimate_chest_cm(175, 75, "medio"), 98)
        self.assertEqual(estimate_chest_cm(175, 75, "medio"), CHEST_BASE_CM)

    def test_estimacion_usa_peso_y_altura(self):
        expected = CHEST_BASE_CM + 10 * CHEST_PER_KG + 10 * CHEST_PER_CM_HEIGHT
        self.assertAlmostEqual(estimate_chest_cm(185, 85, "medio"), expected)

    def test_basico_usa_la_estimacion(self):
        r = rec()
        estimate = estimate_chest_cm(175, 75, "medio")
        self.assertAlmostEqual(by_name(r, "M")["ease_cm"], contour(DEFAULT_SIZES[1]) - estimate)

    # Caso 10
    def test_cada_silueta_corre_la_estimacion(self):
        for build, adjust in BUILD_CHEST_ADJUST_CM.items():
            with self.subTest(build=build):
                self.assertAlmostEqual(estimate_chest_cm(175, 75, build), CHEST_BASE_CM + adjust)

    # Caso 11
    def test_cinta_manda_sobre_la_estimacion(self):
        r = rec(chest_cm=106)
        self.assertEqual(r["confidence"], "alta")
        self.assertAlmostEqual(by_name(r, "M")["ease_cm"], contour(DEFAULT_SIZES[1]) - 106)

    def test_solo_cintura_sigue_siendo_confianza_media(self):
        self.assertEqual(rec(waist_cm=80)["confidence"], "media")

    # Caso 12
    def test_cinta_muy_distinta_avisa_pero_recomienda_con_la_cinta(self):
        tape = estimate_chest_cm(175, 75, "medio") + MISMATCH_CM + 1
        r = rec(chest_cm=tape)
        self.assertTrue(r["measurements_mismatch"])
        self.assertAlmostEqual(by_name(r, "M")["ease_cm"], contour(DEFAULT_SIZES[1]) - tape)

    def test_diferencia_justo_en_el_limite_no_avisa(self):
        # "Supera" MISMATCH_CM: igual al límite no cuenta.
        tape = estimate_chest_cm(175, 75, "medio") + MISMATCH_CM
        self.assertFalse(rec(chest_cm=tape)["measurements_mismatch"])


class AbdomenTests(SimpleTestCase):
    """Cuando la cintura es mayor que el pecho, manda el abdomen."""

    CHEST = 100
    WAIST = 104

    def setUp(self):
        self.assertGreater(ABDOMEN_EXTRA_EASE_CM, 0)
        self.lo, self.hi = FIT_EASE_CM["remera"]["regular"]

    # Caso 13
    def test_compara_contra_el_ruedo_y_suma_holgura_extra(self):
        sizes = [
            # Ruedo con holgura = mínimo del rango: sin el extra sería ideal, con el extra es justo.
            {"size_name": "A", "chest_cm": 75, "hem_cm": (self.WAIST + self.lo) / 2},
            # Ruedo con holgura = máximo + medio extra: sin el extra sería suelto, con el extra es ideal.
            {"size_name": "B", "chest_cm": 76,
             "hem_cm": (self.WAIST + self.hi + ABDOMEN_EXTRA_EASE_CM / 2) / 2},
        ]
        r = rec(sizes=sizes, chest_cm=self.CHEST, waist_cm=self.WAIST)
        self.assertAlmostEqual(by_name(r, "A")["ease_cm"], self.lo)
        self.assertEqual(by_name(r, "A")["verdict"], "justo")
        self.assertEqual(by_name(r, "B")["verdict"], "ideal")
        self.assertEqual(r["recommended"], "B")

    # Caso 14
    def test_sin_ruedo_usa_el_contorno_de_pecho(self):
        r = rec(chest_cm=self.CHEST, waist_cm=self.WAIST)
        self.assertAlmostEqual(by_name(r, "M")["ease_cm"], contour(DEFAULT_SIZES[1]) - self.WAIST)

    # Caso 15
    def test_cintura_menor_que_pecho_no_cambia_nada(self):
        self.assertEqual(rec(chest_cm=self.CHEST, waist_cm=90), rec(chest_cm=self.CHEST))

    def test_cintura_igual_al_pecho_no_cambia_nada(self):
        self.assertEqual(rec(chest_cm=self.CHEST, waist_cm=self.CHEST), rec(chest_cm=self.CHEST))


class StretchAndGarmentTests(SimpleTestCase):
    # Caso 16
    def test_elasticidad_alta_baja_el_minimo(self):
        lo, _ = FIT_EASE_CM["remera"]["regular"]
        self.assertLess(STRETCH_MIN_ADJUST_CM["high"], 0)
        # Pecho elegido para que S quede 1 cm por debajo del mínimo.
        body = contour(DEFAULT_SIZES[0]) - (lo - 1)
        self.assertEqual(by_name(rec(chest_cm=body), "S")["verdict"], "justo")
        self.assertEqual(
            by_name(rec(chest_cm=body, stretch_level="high"), "S")["verdict"], "ideal"
        )

    def test_elasticidad_no_cambia_el_maximo(self):
        _, hi = FIT_EASE_CM["remera"]["regular"]
        # Pecho elegido para que L quede justo en el máximo (eso es suelto).
        body = contour(DEFAULT_SIZES[2]) - hi
        r = rec(chest_cm=body, stretch_level="high")
        self.assertEqual(by_name(r, "L")["verdict"], "suelto")

    # Caso 17
    def test_buzo_usa_sus_propios_rangos(self):
        remera = rec(chest_cm=100)
        buzo = rec(chest_cm=100, garment_type="buzo")
        self.assertEqual(remera["recommended"], "M")
        self.assertEqual(buzo["recommended"], "L")
        # Misma holgura en M (12 cm) para los dos, pero el buzo pide más.
        self.assertEqual(by_name(buzo, "M")["ease_cm"], by_name(remera, "M")["ease_cm"])
        self.assertEqual(by_name(remera, "M")["verdict"], "ideal")
        self.assertEqual(by_name(buzo, "M")["verdict"], "justo")

    def test_musculosa_usa_los_rangos_de_remera(self):
        self.assertEqual(
            rec(chest_cm=100, garment_type="musculosa")["comparison"],
            rec(chest_cm=100)["comparison"],
        )


class ValidationTests(SimpleTestCase):
    # Caso 18
    def test_calce_no_permitido_para_el_corte(self):
        with self.assertRaises(ValueError):
            rec(fit_style="oversize", fit="ajustado")

    # Caso 19
    def test_falta_un_dato_del_basico(self):
        for field in ["height_cm", "weight_kg", "build", "fit"]:
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    rec(**{field: None})

    def test_valores_fuera_de_rango(self):
        for field, (lo, hi) in sizing.VALID_RANGES.items():
            for bad in (lo - 1, hi + 1):
                with self.subTest(field=field, value=bad):
                    with self.assertRaises(ValueError):
                        rec(**{field: bad})

    def test_valores_en_el_borde_del_rango_se_aceptan(self):
        for field, (lo, hi) in sizing.VALID_RANGES.items():
            for ok in (lo, hi):
                with self.subTest(field=field, value=ok):
                    rec(**{field: ok})  # no tiene que lanzar error

    def test_valores_que_no_son_numeros(self):
        for bad in ("175", True, float("nan")):
            with self.subTest(value=bad):
                with self.assertRaises(ValueError):
                    rec(height_cm=bad)

    def test_silueta_inexistente(self):
        with self.assertRaises(ValueError):
            rec(build="gigante")

    def test_calce_inexistente(self):
        with self.assertRaises(ValueError):
            rec(fit="extra")

    def test_tipo_de_prenda_inexistente(self):
        with self.assertRaises(ValueError):
            rec(garment_type="pantalon")

    def test_corte_inexistente(self):
        with self.assertRaises(ValueError):
            rec(fit_style="raro")

    def test_elasticidad_inexistente(self):
        with self.assertRaises(ValueError):
            rec(stretch_level="mucha")

    def test_lista_de_talles_vacia(self):
        with self.assertRaises(ValueError):
            rec(sizes=[])

    def test_el_error_dice_que_campo_esta_mal(self):
        with self.assertRaises(sizing.SizingError) as ctx:
            rec(height_cm=None)
        self.assertEqual(ctx.exception.field, "height_cm")

    def test_estimate_valida_la_silueta(self):
        with self.assertRaises(ValueError):
            estimate_chest_cm(175, 75, "gigante")


class AllowedFitsTests(SimpleTestCase):
    # Caso 20
    def test_tabla_de_cortes(self):
        self.assertEqual(allowed_fits("slim"), (["ajustado", "regular"], "regular"))
        self.assertEqual(allowed_fits("regular"), (["ajustado", "regular", "holgado"], "regular"))
        self.assertEqual(allowed_fits("oversize"), (["regular", "holgado"], "regular"))
        self.assertEqual(allowed_fits("boxy"), (["regular", "holgado"], "regular"))

    def test_el_preseleccionado_siempre_esta_entre_los_permitidos(self):
        for fit_style in sizing.FIT_STYLE_OPTIONS:
            with self.subTest(fit_style=fit_style):
                fits, default = allowed_fits(fit_style)
                self.assertIn(default, fits)

    def test_corte_inexistente(self):
        with self.assertRaises(ValueError):
            allowed_fits("raro")

    def test_no_se_puede_romper_la_tabla_desde_afuera(self):
        fits, _ = allowed_fits("slim")
        fits.append("holgado")
        self.assertEqual(allowed_fits("slim"), (["ajustado", "regular"], "regular"))


# =============================================================================
# Vista (caso 21). Usan TestCase porque crean datos en una base de prueba
# temporal (Django la crea y la borra sola; no toca tu db.sqlite3).
# =============================================================================

# Datos de cuerpo inventados.
VALID_POST = {"height_cm": "173", "weight_kg": "71", "build": "medio", "fit": "regular"}


class CaptureLogs(logging.Handler):
    """Junta todos los mensajes de log que se escriban mientras está activo."""

    def __init__(self):
        super().__init__(level=logging.DEBUG)
        self.messages = []

    def emit(self, record):
        self.messages.append(record.getMessage())

    def __enter__(self):
        root = logging.getLogger()
        self._old_level = root.level
        root.addHandler(self)
        root.setLevel(logging.DEBUG)
        return self

    def __exit__(self, *exc):
        root = logging.getLogger()
        root.removeHandler(self)
        root.setLevel(self._old_level)


def sell(product, *names):
    """Marca que la prenda vende estos talles (los del selector)."""
    for name in names:
        size = Size.objects.filter(name=name).first() or Size.objects.create(name=name)
        product.sizes.add(size)


ALL_DEFAULT_NAMES = [s["size_name"] for s in sizing.DEFAULT_SIZES]


def count_all_rows():
    """Cantidad de filas de cada tabla del proyecto."""
    return {model._meta.label: model.objects.count() for model in apps.get_models()}


class RecommendViewTests(TestCase):
    def setUp(self):
        self.remeras = Category.objects.create(name="Remeras", slug="remeras")
        self.product = Product.objects.create(
            category=self.remeras, name="Remera prueba", slug="remera-prueba", price=1000
        )
        sell(self.product, *ALL_DEFAULT_NAMES)
        self.url = reverse("products:recommend_size", args=[self.product.slug])

    def post(self, data, url=None):
        return self.client.post(url or self.url, data)

    def test_post_valido_devuelve_la_recomendacion(self):
        response = self.post(VALID_POST)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Sin medidas cargadas: usa DEFAULT_SIZES con corte oversize y sin elasticidad.
        expected = sizing.recommend_size(
            sizes=sizing.DEFAULT_SIZES, garment_type="remera",
            fit_style=sizing.DEFAULT_FIT_STYLE, stretch_level="none",
            height_cm=173, weight_kg=71, build="medio", fit="regular",
        )
        self.assertTrue(data["ok"])
        for key in ["recommended", "alternative", "alternative_direction", "reason",
                    "confidence", "measurements_mismatch", "calibrated"]:
            self.assertEqual(data[key], expected[key], key)
        self.assertEqual(
            [row["size_name"] for row in data["comparison"]],
            [s["size_name"] for s in sizing.DEFAULT_SIZES],
        )

    def test_la_respuesta_no_trae_centimetros(self):
        data = self.post({**VALID_POST, "chest_cm": "100"}).json()
        for row in data["comparison"]:
            self.assertEqual(set(row), {"size_name", "verdict"})

    def test_campos_opcionales_vacios_son_sin_dato(self):
        data = self.post({**VALID_POST, "chest_cm": "", "waist_cm": "   "}).json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["confidence"], "media")

    def test_cinta_de_pecho_sube_la_confianza(self):
        data = self.post({**VALID_POST, "chest_cm": "100"}).json()
        self.assertEqual(data["confidence"], "alta")

    def test_acepta_coma_decimal(self):
        data = self.post({**VALID_POST, "weight_kg": "71,5"}).json()
        self.assertTrue(data["ok"])

    def test_campo_obligatorio_vacio_es_error_json(self):
        for field in ["height_cm", "weight_kg", "build", "fit"]:
            with self.subTest(field=field):
                response = self.post({**VALID_POST, field: ""})
                self.assertEqual(response.status_code, 400)
                data = response.json()
                self.assertFalse(data["ok"])
                self.assertEqual(data["field"], field)
                self.assertTrue(data["error"])

    def test_campo_que_falta_del_todo_es_error_json(self):
        data = {k: v for k, v in VALID_POST.items() if k != "height_cm"}
        response = self.post(data)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["field"], "height_cm")

    def test_datos_invalidos_devuelven_error_json_no_500(self):
        cases = [
            ("weight_kg", "abc"),
            ("height_cm", "999"),
            ("chest_cm", "10"),
            ("build", "gigante"),
            ("fit", "ajustado"),  # no permitido en oversize (corte de DEFAULT_SIZES)
        ]
        for field, value in cases:
            with self.subTest(field=field, value=value):
                response = self.post({**VALID_POST, field: value})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["field"], field)

    def test_get_no_esta_permitido(self):
        response = self.client.get(self.url, VALID_POST)
        self.assertEqual(response.status_code, 405)

    def test_exige_csrf(self):
        strict = Client(enforce_csrf_checks=True)
        response = strict.post(self.url, VALID_POST)
        self.assertEqual(response.status_code, 403)

    def test_producto_inexistente_o_no_disponible(self):
        hidden = Product.objects.create(
            category=self.remeras, name="Oculta", slug="oculta", price=1000, available=False
        )
        for slug in ["no-existe", hidden.slug]:
            with self.subTest(slug=slug):
                url = reverse("products:recommend_size", args=[slug])
                response = self.post(VALID_POST, url=url)
                self.assertEqual(response.status_code, 404)
                self.assertFalse(response.json()["ok"])

    def test_categoria_sin_tipo_de_prenda_es_error_json(self):
        gorras = Category.objects.create(name="Gorras", slug="gorras")
        gorra = Product.objects.create(category=gorras, name="Gorra", slug="gorra", price=1000)
        sell(gorra, "M")
        url = reverse("products:recommend_size", args=[gorra.slug])
        response = self.post(VALID_POST, url=url)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json()["ok"])

    def test_tipo_de_prenda_sale_de_la_categoria(self):
        buzos = Category.objects.create(name="Buzos", slug="buzos")
        buzo = Product.objects.create(category=buzos, name="Buzo", slug="buzo", price=1000)
        sell(buzo, *ALL_DEFAULT_NAMES)
        url = reverse("products:recommend_size", args=[buzo.slug])
        body = {**VALID_POST, "chest_cm": "100"}
        remera_data = self.post(body).json()
        buzo_data = self.post(body, url=url).json()
        self.assertNotEqual(remera_data["comparison"], buzo_data["comparison"])

    def test_no_guarda_nada(self):
        before = count_all_rows()
        self.post({**VALID_POST, "chest_cm": "100", "waist_cm": "90"})
        self.assertEqual(count_all_rows(), before)
        self.assertEqual(dict(self.client.session), {})

    def test_no_registra_los_datos_en_los_logs(self):
        # Valores raros a propósito, para buscarlos en los mensajes.
        secret = {"height_cm": "173.7", "weight_kg": "71.3", "chest_cm": "99.1", "waist_cm": "88.9"}
        with CaptureLogs() as logs:
            self.post({**VALID_POST, **secret})
            self.post({**VALID_POST, **secret, "fit": "ajustado"})  # también en un error
        for message in logs.messages:
            for value in secret.values():
                self.assertNotIn(value, message)


class RecommendViewWithMeasurementsTests(TestCase):
    """De dónde salen los talles, el corte y la elasticidad."""

    def setUp(self):
        remeras = Category.objects.create(name="Remeras", slug="remeras")
        self.product = Product.objects.create(
            category=remeras, name="Remera medida", slug="remera-medida", price=1000
        )
        self.url = reverse("products:recommend_size", args=[self.product.slug])
        self.s = Size.objects.create(name="S")
        self.m = Size.objects.create(name="M")
        self.product.sizes.add(self.s, self.m)

    def add_measure(self, size, chest, fit_style="regular", stretch_level="none"):
        ProductMeasurementDetail.objects.create(
            product=self.product, size=size, chest_width_cm=chest, total_length_cm=70,
            shoulder_width_cm=50, fit_style=fit_style, stretch_level=stretch_level,
        )

    def test_usa_las_medidas_propias_de_la_prenda(self):
        self.add_measure(self.s, 50)
        self.add_measure(self.m, 53)
        data = self.client.post(self.url, {**VALID_POST, "chest_cm": "100"}).json()
        self.assertTrue(data["ok"])
        self.assertEqual([row["size_name"] for row in data["comparison"]], ["S", "M"])

    def test_corte_sale_del_primer_talle_con_medidas(self):
        # Corte regular: "ajustado" está permitido (en oversize no lo estaría).
        self.add_measure(self.s, 50, fit_style="regular")
        response = self.client.post(self.url, {**VALID_POST, "fit": "ajustado"})
        self.assertEqual(response.status_code, 200)

    def test_la_plantilla_manda_sobre_las_medidas_propias(self):
        template = SizeTemplate.objects.create(name="Plantilla slim", fit_style="slim", stretch_level="none")
        SizeTemplateItem.objects.create(
            template=template, size=self.m, chest_width_cm=53, total_length_cm=70, shoulder_width_cm=50
        )
        self.product.size_template = template
        self.product.save()
        self.add_measure(self.s, 50, fit_style="oversize")
        # Si mandara la medida propia (oversize), "holgado" estaría permitido. En slim, no.
        response = self.client.post(self.url, {**VALID_POST, "fit": "holgado"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["field"], "fit")


class SoldSizesTests(TestCase):
    """Solo se comparan los talles que la prenda vende (los del selector)."""

    def setUp(self):
        self.remeras = Category.objects.create(name="Remeras", slug="remeras")

    def make(self, slug, *sold):
        product = Product.objects.create(category=self.remeras, name=slug, slug=slug, price=1000)
        sell(product, *sold)
        return product

    def post(self, product, data):
        return self.client.post(reverse("products:recommend_size", args=[product.slug]), data)

    def widget(self, product):
        return self.client.get(reverse("products:detail", args=[product.slug])).context["size_widget"]

    def test_solo_compara_los_talles_que_vende_sin_distinguir_mayusculas(self):
        # Nombres en minúscula y con espacios a propósito.
        partial = self.make("vende-s-y-m", "s", " m ")
        data = self.post(partial, {**VALID_POST, "chest_cm": "100"}).json()
        self.assertEqual([row["size_name"] for row in data["comparison"]], ["S", "M"])

    def test_no_recomienda_un_talle_que_no_vende(self):
        # Con todos los talles a la venta, este cuerpo y calce dan L.
        body = {**VALID_POST, "chest_cm": "100", "fit": "holgado"}
        full = self.make("vende-todo", *ALL_DEFAULT_NAMES)
        self.assertEqual(self.post(full, body).json()["recommended"], "L")
        # Si la prenda solo vende S y M, no se fuerza otro talle.
        partial = self.make("vende-s-y-m", "S", "M")
        data = self.post(partial, body).json()
        self.assertIsNone(data["recommended"])
        self.assertEqual(data["reason"], "cuerpo_mayor")

    def test_filtra_tambien_las_medidas_propias(self):
        product = self.make("medida-propia", "M")
        for name, chest in [("S", 50), ("M", 53)]:
            ProductMeasurementDetail.objects.create(
                product=product, size=Size.objects.get_or_create(name=name)[0],
                chest_width_cm=chest, total_length_cm=70, shoulder_width_cm=50,
            )
        data = self.post(product, VALID_POST).json()
        self.assertEqual([row["size_name"] for row in data["comparison"]], ["M"])

    def test_prenda_que_no_vende_ningun_talle_no_muestra_el_bloque(self):
        product = self.make("sin-talles")
        self.assertIsNone(self.widget(product))
        response = self.post(product, VALID_POST)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json()["ok"])

    def test_ningun_talle_a_la_venta_tiene_medidas_no_muestra_el_bloque(self):
        # Medida cargada solo para S, pero la prenda vende solo M.
        product = self.make("medida-de-otro-talle", "M")
        ProductMeasurementDetail.objects.create(
            product=product, size=Size.objects.get_or_create(name="S")[0],
            chest_width_cm=52, total_length_cm=70, shoulder_width_cm=50,
        )
        self.assertIsNone(self.widget(product))
        self.assertEqual(self.post(product, VALID_POST).status_code, 400)


class DetailSizeWidgetTests(TestCase):
    """Qué recibe la página de la prenda para dibujar el bloque "Tu talle"."""

    def make_product(self, slug, sold=tuple(ALL_DEFAULT_NAMES)):
        category = Category.objects.create(name=slug, slug=slug)
        product = Product.objects.create(category=category, name="P", slug=f"p-{slug}", price=1000)
        sell(product, *sold)
        return product

    def get_widget(self, product):
        response = self.client.get(reverse("products:detail", args=[product.slug]))
        self.assertEqual(response.status_code, 200)
        return response.context["size_widget"]

    def test_categoria_sin_tipo_no_muestra_el_bloque(self):
        self.assertIsNone(self.get_widget(self.make_product("gorras")))

    def test_categoria_con_tipo_ofrece_los_calces_del_corte(self):
        widget = self.get_widget(self.make_product("remeras"))
        fits, default = allowed_fits(sizing.DEFAULT_FIT_STYLE)
        self.assertEqual(widget["fits"], fits)
        self.assertEqual(widget["default_fit"], default)
        self.assertFalse(widget["calibrated"])


class DetailSizeFinderHtmlTests(TestCase):
    """El HTML del bloque "Tu talle" en la página de la prenda."""

    BLOCK = 'id="size-finder"'
    SCRIPT = "js/size-finder.js"

    def page(self, category_slug="remeras", sold=tuple(ALL_DEFAULT_NAMES)):
        category = Category.objects.create(name=category_slug, slug=category_slug)
        product = Product.objects.create(category=category, name="P", slug="p", price=1000)
        sell(product, *sold)
        return self.client.get(reverse("products:detail", args=[product.slug]))

    def test_categoria_sin_tipo_no_muestra_el_bloque(self):
        response = self.page("gorras")
        self.assertNotContains(response, self.BLOCK)
        self.assertNotContains(response, self.SCRIPT)

    def test_prenda_sin_talles_no_muestra_el_bloque(self):
        response = self.page(sold=())
        self.assertNotContains(response, self.BLOCK)

    def test_muestra_el_bloque_con_token_csrf_y_script(self):
        response = self.page()
        self.assertContains(response, self.BLOCK)
        self.assertContains(response, "csrfmiddlewaretoken")
        self.assertContains(response, self.SCRIPT)
        self.assertContains(response, reverse("products:recommend_size", args=["p"]))

    def test_solo_ofrece_los_calces_del_corte_con_el_preseleccionado(self):
        response = self.page()
        fits, default = allowed_fits(sizing.DEFAULT_FIT_STYLE)
        for fit in ["ajustado", "regular", "holgado"]:
            with self.subTest(fit=fit):
                if fit in fits:
                    self.assertContains(response, f'name="fit" id="sfFit-{fit}"')
                else:
                    self.assertNotContains(response, f'id="sfFit-{fit}"')
        html = response.content.decode()
        start = html.index(f'id="sfFit-{default}"')
        self.assertIn("checked", html[start:html.index(">", start)])

    def test_las_cuatro_siluetas(self):
        response = self.page()
        for build in BUILD_CHEST_ADJUST_CM:
            with self.subTest(build=build):
                self.assertContains(response, f'name="build" id="sfBuild{build.capitalize()}" value="{build}"')

    def test_aviso_de_etapa_de_prueba_segun_calibrated(self):
        self.assertContains(self.page(), 'id="sfTrialNote"')

    def test_sin_aviso_de_prueba_si_esta_calibrado(self):
        with patch.dict(sizing.CALIBRATED, {"remera": True}):
            self.assertNotContains(self.page(), 'id="sfTrialNote"')
