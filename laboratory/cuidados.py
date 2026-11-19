"""Cuidados de la sala de revelado: privacidad de las fotos y límite de pruebas.

- Fotos: las de cada prueba (la de la persona, la que se prepara para la IA y el resultado)
  se borran a los JPEX_LAB_DIAS_FOTOS días (7 por defecto). La fila de la prueba queda (talle,
  medidas, prenda), así no se pierden los datos para ver qué talles se piden.
  Se borran solas mientras la página se usa (como mucho una vez cada 6 horas) cuando el sitio
  está publicado (DEBUG = False). En la compu no se borra nada solo, para no perder las pruebas
  de ejemplo; se puede correr a mano: python manage.py borrar_fotos_lab --probar
- Límite: cada conexión puede hacer JPEX_LAB_PRUEBAS_POR_HORA pruebas por hora (10 por
  defecto), para que nadie gaste la IA de pago tocando "Revelar" sin parar. El aviso va de a
  poco: al principio no se ve nada (la idea es que la gente se pruebe), pasada la mitad aparece
  una línea tranquila, con 3 o menos se pone en amarillo y sin pruebas se apaga "Revelar".

Los tres valores se pueden cambiar en config/settings.py; si no están, se usan estos.
"""
import math
import time
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from .models import TryOnSession


def dias_fotos():
    return getattr(settings, 'JPEX_LAB_DIAS_FOTOS', 7)


def pruebas_por_hora():
    return getattr(settings, 'JPEX_LAB_PRUEBAS_POR_HORA', 10)


# ------------------------------------------------------------------ fotos viejas

def borrar_fotos_viejas(dias=None, probar=False):
    """Borra las fotos de las pruebas de hace más de `dias` días. Con probar=True no borra:
    solo cuenta. Devuelve (pruebas, archivos)."""
    dias = dias if dias is not None else dias_fotos()
    hasta = timezone.now() - timedelta(days=dias)
    temp = Path(settings.MEDIA_ROOT) / 'laboratory' / 'temp'
    pruebas = archivos = 0
    viejas = TryOnSession.objects.filter(created_at__lt=hasta).exclude(user_image='')
    for prueba in viejas:
        pruebas += 1
        sueltos = [temp / f'user_{prueba.id}.jpg', temp / f'garment_{prueba.id}.jpg']
        archivos += bool(prueba.user_image) + bool(prueba.result_image) + sum(f.exists() for f in sueltos)
        if probar:
            continue
        if prueba.user_image:
            prueba.user_image.delete(save=False)
        if prueba.result_image:
            prueba.result_image.delete(save=False)
        for f in sueltos:
            f.unlink(missing_ok=True)
        prueba.user_image = ''
        prueba.result_image = None
        prueba.save(update_fields=['user_image', 'result_image'])
    return pruebas, archivos


def limpiar_si_toca():
    """Se llama en cada prueba: borra las fotos viejas como mucho una vez cada 6 horas, y solo
    con el sitio publicado (o si JPEX_LAB_BORRAR_FOTOS = True)."""
    if not getattr(settings, 'JPEX_LAB_BORRAR_FOTOS', not settings.DEBUG):
        return
    if cache.add('jpex_lab_limpieza', 1, 6 * 3600):    # add: solo si no se limpió hace poco
        try:
            borrar_fotos_viejas()
        except Exception:   # que una foto trabada no corte la prueba de la persona
            pass


# ------------------------------------------------------------------ límite de pruebas

def _clave(request):
    return 'jpex_lab_pruebas:' + request.META.get('REMOTE_ADDR', '')


def _recientes(request):
    ahora = time.time()
    return sorted(t for t in cache.get(_clave(request), []) if ahora - t < 3600)


def cupo(request):
    """Cuántas pruebas le quedan a esta conexión en la última hora y, si no le quedan, en cuántos
    minutos se libera una."""
    limite = pruebas_por_hora()
    recientes = _recientes(request)
    quedan = max(0, limite - len(recientes))
    espera_min = 0
    if not quedan:
        libre = recientes[len(recientes) - limite] + 3600
        espera_min = max(1, math.ceil((libre - time.time()) / 60))
    return con_texto({'limite': limite, 'quedan': quedan, 'espera_min': espera_min})


def con_texto(c):
    """Suma al cupo el aviso que ve la persona ('texto') y su tono ('nivel')."""
    quedan, limite, minutos = c['quedan'], c['limite'], c['espera_min']
    if quedan <= 0:
        nivel = 'agotado'
        texto = (f"Llegaste al límite de {limite} pruebas por hora. Las pruebas con IA son limitadas "
                 f"para que todos puedan usarlas: volvé en {minutos} minuto{'s' if minutos != 1 else ''}.")
    elif quedan == 1:
        nivel, texto = 'pocas', 'Te queda 1 prueba en esta hora.'
    elif quedan <= 3:
        nivel, texto = 'pocas', f'Te quedan pocas: {quedan} pruebas en esta hora.'
    elif quedan <= limite // 2:
        nivel, texto = 'aviso', f'Te quedan {quedan} pruebas en esta hora.'
    else:
        nivel, texto = '', ''
    return {**c, 'nivel': nivel, 'texto': texto}


def anotar_prueba(request):
    recientes = _recientes(request)
    recientes.append(time.time())
    cache.set(_clave(request), recientes, 3600)
