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
MAX_SIDE = 1600
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
