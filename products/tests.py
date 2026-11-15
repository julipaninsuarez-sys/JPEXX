"""
Pruebas del recomendador de talles.

Todos los datos de cuerpo son INVENTADOS (no hay datos de personas reales).
Estas pruebas no validan que los números provisorios sean buenos: comprueban
que la lógica hace lo que dice el diseño. Por eso, cuando se puede, las cuentas
esperadas se arman con los parámetros de sizing.py en vez de números a mano.
"""
from unittest.mock import patch

from django.test import SimpleTestCase

from products import sizing
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
        self.assertEqual(allowed_fits("slim"), (["ajustado", "regular"], "ajustado"))
        self.assertEqual(allowed_fits("regular"), (["ajustado", "regular", "holgado"], "regular"))
        self.assertEqual(allowed_fits("oversize"), (["regular", "holgado"], "holgado"))
        self.assertEqual(allowed_fits("boxy"), (["regular", "holgado"], "holgado"))

    def test_corte_inexistente(self):
        with self.assertRaises(ValueError):
            allowed_fits("raro")

    def test_no_se_puede_romper_la_tabla_desde_afuera(self):
        fits, _ = allowed_fits("slim")
        fits.append("holgado")
        self.assertEqual(allowed_fits("slim"), (["ajustado", "regular"], "ajustado"))
