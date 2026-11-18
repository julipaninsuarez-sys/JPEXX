"""Datos de contacto de la tienda disponibles en todas las plantillas.

El número de WhatsApp se cambia en un solo lugar: JPEX_WHATSAPP en config/settings.py.
En las plantillas: {{ JPEX_WHATSAPP }} (solo números, para wa.me) y {{ JPEX_WHATSAPP_TEXTO }} (para mostrar).
"""
from django.conf import settings


def contacto(request):
    return {
        'JPEX_WHATSAPP': settings.JPEX_WHATSAPP,
        'JPEX_WHATSAPP_TEXTO': settings.JPEX_WHATSAPP_TEXTO,
    }
