"""Pruebas de la sala de revelado: el formulario conectado a la IA, el límite de pruebas por hora
y el borrado de fotos viejas. La IA se reemplaza por una respuesta falsa (no sale nada a internet)
y todo corre en una base y una carpeta de fotos temporales.

    python manage.py test laboratory.tests_revelado
"""
import io
import shutil
import tempfile
from datetime import timedelta
from pathlib import Path
from unittest import mock

from django.core.cache import cache
from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image

from products.models import Category, Product
from laboratory import cuidados
from laboratory.models import TryOnSession

MEDIA_TEMP = tempfile.mkdtemp(prefix='jpex-test-media-')


def foto_falsa(nombre='prueba.jpg'):
    b = io.BytesIO()
    Image.new('RGB', (300, 400), (120, 80, 70)).save(b, 'JPEG')
    b.seek(0)
    b.name = nombre
    return b


@override_settings(MEDIA_ROOT=MEDIA_TEMP, JPEX_LAB_PRUEBAS_POR_HORA=2)
class SalaDeReveladoTests(TestCase):

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_TEMP, ignore_errors=True)

    def setUp(self):
        cache.clear()
        cat = Category.objects.create(name='Remeras', slug='remeras')
        self.prenda = Product.objects.create(
            category=cat, name='Remera de prueba', slug='remera-de-prueba', price=24000, available=True,
            image=ContentFile(foto_falsa().read(), 'remera.jpg'),
        )

    def probar(self, ip='10.0.0.9'):
        return self.client.post('/lab/revelado/probar/', {
            'product_id': self.prenda.id, 'height_cm': 180, 'weight_kg': 61, 'user_image': foto_falsa(),
        }, REMOTE_ADDR=ip)

    @mock.patch('laboratory.views.generate_tryon_image', return_value=(None, 'IA falsa'))
    def test_limite_de_pruebas_por_hora(self, _ia):
        r1, r2, r3 = self.probar(), self.probar(), self.probar()
        self.assertEqual([r1.status_code, r2.status_code, r3.status_code], [200, 200, 429])
        self.assertEqual([r1.json()['cupo']['quedan'], r2.json()['cupo']['quedan']], [1, 0])
        self.assertIn('Llegaste al límite de 2 pruebas por hora', r3.json()['error'])
        self.assertEqual(TryOnSession.objects.count(), 2)          # la tercera no llegó a la IA
        # La página muestra el aviso y apaga "Revelar" para esa conexión...
        html = self.client.get('/lab/revelado/', REMOTE_ADDR='10.0.0.9').content.decode()
        self.assertIn('disabled aria-describedby="rvCupo"', html)
        # ...pero otra persona puede seguir probando.
        html = self.client.get('/lab/revelado/', REMOTE_ADDR='10.0.0.10').content.decode()
        self.assertNotIn('disabled aria-describedby', html)

    @mock.patch('laboratory.views.generate_tryon_image', return_value=('laboratory/results/x.png', None))
    def test_respuesta_correcta(self, _ia):
        d = self.probar().json()
        self.assertTrue(d['ok'])
        self.assertEqual(d['producto']['price'], '24000')
        self.assertTrue(d['talle'])

    def test_borra_las_fotos_viejas_y_deja_la_prueba(self):
        vieja = TryOnSession.objects.create(product=self.prenda, user_image=ContentFile(foto_falsa().read(), 'vieja.jpg'),
                                            height_cm=180, weight_kg=61, recommended_size='M')
        nueva = TryOnSession.objects.create(product=self.prenda, user_image=ContentFile(foto_falsa().read(), 'nueva.jpg'),
                                            height_cm=170, weight_kg=70)
        TryOnSession.objects.filter(id=vieja.id).update(created_at=timezone.now() - timedelta(days=10))
        temp = Path(MEDIA_TEMP) / 'laboratory' / 'temp'
        temp.mkdir(parents=True, exist_ok=True)
        (temp / f'user_{vieja.id}.jpg').write_bytes(b'x')
        archivo_viejo, archivo_nuevo = Path(vieja.user_image.path), Path(nueva.user_image.path)

        self.assertEqual(cuidados.borrar_fotos_viejas(probar=True), (1, 2))     # probar no borra
        self.assertTrue(archivo_viejo.exists())

        with override_settings(JPEX_LAB_BORRAR_FOTOS=True):
            cuidados.limpiar_si_toca()
        vieja.refresh_from_db()
        self.assertFalse(archivo_viejo.exists())
        self.assertFalse((temp / f'user_{vieja.id}.jpg').exists())
        self.assertFalse(vieja.user_image)
        self.assertEqual(vieja.recommended_size, 'M')                    # la fila (talle, medidas) queda
        self.assertTrue(archivo_nuevo.exists())                          # la de hoy no se toca

    @override_settings(DEBUG=True)
    def test_en_la_compu_no_borra_solo(self):
        with mock.patch('laboratory.cuidados.borrar_fotos_viejas') as borrar:
            cuidados.limpiar_si_toca()
        borrar.assert_not_called()
