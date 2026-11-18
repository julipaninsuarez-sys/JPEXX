"""Fotos chicas de las prendas para las tarjetas (ver products/cutouts.py).

Uso en una plantilla:
    {% load jpex_fotos %}
    <img src="{{ product|foto_chica }}">           foto sin fondo, 540 px de ancho
    <img src="{{ product|foto_original_chica }}">  foto original, 540 px de ancho

Están acá (y no en models.py) para no tocar el modelo Product.
"""
from django import template

from products.cutouts import small_url

register = template.Library()


@register.filter
def foto_chica(product):
    if not getattr(product, 'image', None):
        return ''
    return small_url(product.image, cutout=True)


@register.filter
def foto_original_chica(product):
    if not getattr(product, 'image', None):
        return ''
    return small_url(product.image, cutout=False)
