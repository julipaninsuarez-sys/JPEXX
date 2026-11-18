"""Copias de las fotos de producto sin el fondo blanco.

El dibujo de fondo de .jpx-stage tiene que verse alrededor de la prenda, pero no
a través de lo blanco de los estampados. Por eso solo se borra el blanco conectado
con los bordes de la foto. Los archivos originales no se modifican.
"""
import io
import logging
import os

from django.core.files.base import ContentFile
from PIL import Image, ImageChops, ImageDraw, ImageFilter

logger = logging.getLogger(__name__)

CUTOUT_DIR = 'products/cutouts'
SMALL_DIR = f'{CUTOUT_DIR}/chicas'
MAX_SIDE = 1600
# Tarjetas, abanico y portadas muestran la foto a ~180 px (×3 en el iPhone): con 540 de ancho alcanza.
SMALL_WIDTH = 540
WHITE_THRESHOLD = 40
SENTINEL = (255, 0, 255)


def _remove_white_background(source):
    rgba = source.convert('RGBA')
    if rgba.getchannel('A').getextrema()[0] < 255:
        return rgba  # La foto ya viene con transparencia.

    image = rgba.convert('RGB')
    width, height = image.size
    corners = ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1))
    if any(min(image.getpixel(corner)) < 255 - WHITE_THRESHOLD for corner in corners):
        return rgba  # El fondo no es blanco: se deja la foto como está.

    filled = image.copy()
    for corner in corners:
        ImageDraw.floodfill(filled, corner, SENTINEL, thresh=WHITE_THRESHOLD)

    difference = ImageChops.difference(filled, Image.new('RGB', filled.size, SENTINEL)).convert('L')
    outside = difference.point(lambda value: 255 if value == 0 else 0)
    # Se agranda apenas la zona borrada para no dejar un halo blanco en el contorno.
    outside = outside.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1))

    image.putalpha(ImageChops.invert(outside))
    return image


def cutout_url(image_field):
    """Devuelve la URL de la copia recortada y la genera si todavía no existe."""
    storage = image_field.storage
    name = f'{CUTOUT_DIR}/{os.path.basename(image_field.name)}.webp'

    if not storage.exists(name):
        try:
            with image_field.storage.open(image_field.name, 'rb') as original:
                source = Image.open(original)
                source.load()
            source.thumbnail((MAX_SIDE, MAX_SIDE))
            buffer = io.BytesIO()
            _remove_white_background(source).save(buffer, 'WEBP', quality=84, method=4)
        except OSError:
            logger.exception('No se pudo recortar %s', image_field.name)
            return image_field.url
        storage.save(name, ContentFile(buffer.getvalue()))

    return storage.url(name)


def small_url(image_field, cutout=True):
    """Copia chica (SMALL_WIDTH de ancho) para tarjetas y miniaturas, así el celu no baja
    la foto de 1024 px para mostrarla chiquita. Con cutout=True parte de la foto sin fondo
    (cutout_url); con cutout=False, de la original. Se genera la primera vez que se pide.
    Si algo falla, devuelve la foto grande de siempre."""
    storage = image_field.storage
    base = os.path.basename(image_field.name)
    kind = 'sinfondo' if cutout else 'original'
    name = f'{SMALL_DIR}/{base}.{kind}-{SMALL_WIDTH}.webp'

    if not storage.exists(name):
        if cutout:
            fallback = cutout_url(image_field)   # además deja hecha la foto sin fondo grande
            source_name = f'{CUTOUT_DIR}/{base}.webp'
        else:
            fallback = image_field.url
            source_name = image_field.name
        try:
            with storage.open(source_name, 'rb') as original:
                source = Image.open(original)
                source.load()
            if source.width > SMALL_WIDTH:
                height = round(source.height * SMALL_WIDTH / source.width)
                source = source.resize((SMALL_WIDTH, height), Image.LANCZOS)
            buffer = io.BytesIO()
            source.save(buffer, 'WEBP', quality=82, method=4)
        except OSError:
            logger.exception('No se pudo achicar %s', source_name)
            return fallback
        storage.save(name, ContentFile(buffer.getvalue()))

    return storage.url(name)
