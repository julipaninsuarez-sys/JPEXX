"""Precio con el formato de la tienda: sin decimales y con punto de miles (24000.00 -> 24.000).

Uso en una plantilla:
    {% load jpex_precios %}
    ${{ product.price|precio }}

Es el mismo formato que el carrito (toLocaleString 'es-AR' en base.html) y el buscador.
"""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django import template

register = template.Library()


@register.filter
def precio(value):
    try:
        number = Decimal(str(value)).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        return value
    return f'{int(number):,}'.replace(',', '.')
