"""python manage.py borrar_fotos_lab [--dias 7] [--probar]

Borra las fotos de las pruebas del Lab de hace más de N días (ver laboratory/cuidados.py).
Con --probar solo cuenta lo que borraría. Sirve para correrlo a mano o programado en el hosting.
"""
from django.core.management.base import BaseCommand

from laboratory.cuidados import borrar_fotos_viejas, dias_fotos


class Command(BaseCommand):
    help = 'Borra las fotos de las pruebas del Lab de hace más de N días (la fila de la prueba queda).'

    def add_arguments(self, parser):
        parser.add_argument('--dias', type=int, default=None, help='Días que se guardan las fotos (por defecto JPEX_LAB_DIAS_FOTOS, 7).')
        parser.add_argument('--probar', action='store_true', help='No borra nada: solo muestra cuánto borraría.')

    def handle(self, *args, **opts):
        dias = opts['dias'] if opts['dias'] is not None else dias_fotos()
        pruebas, archivos = borrar_fotos_viejas(dias, probar=opts['probar'])
        verbo = 'Se borrarían' if opts['probar'] else 'Se borraron'
        self.stdout.write(f'{verbo} {archivos} archivos de {pruebas} pruebas de hace más de {dias} días.')
