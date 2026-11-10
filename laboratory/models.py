from django.db import models
from products.models import Product


class ProductMeasurement(models.Model):
    """
    Guarda las medidas reales en centímetros de cada talle para una prenda.
    Lo mantenemos dentro de 'laboratory' para no romper ni ensuciar products/models.py.
    """
    SIZE_CHOICES = [
        ('S', 'Talle S'),
        ('M', 'Talle M'),
        ('L', 'Talle L'),
        ('XL', 'Talle XL'),
        ('XXL', 'Talle XXL'),
    ]

    FIT_TYPE_CHOICES = [
        ('slim', 'Slim / Al cuerpo'),
        ('regular', 'Regular / Clásico'),
        ('boxy', 'Boxy / Cuadrado'),
        ('oversize', 'Oversize / Holgado'),
    ]

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='measurements',
        verbose_name='Prenda'
    )
    size = models.CharField(max_length=10, choices=SIZE_CHOICES, verbose_name='Talle')
    chest_cm = models.PositiveIntegerField(
        help_text='Ancho de axila a axila en centímetros (ej: 56)',
        verbose_name='Ancho de pecho (cm)'
    )
    length_cm = models.PositiveIntegerField(
        help_text='Largo total desde el hombro hasta el ruedo en cm (ej: 72)',
        verbose_name='Largo total (cm)'
    )
    fit_type = models.CharField(
        max_length=20,
        choices=FIT_TYPE_CHOICES,
        default='oversize',
        verbose_name='Moldería de la prenda'
    )

    class Meta:
        verbose_name = 'Medida de Prenda'
        verbose_name_plural = 'Medidas de Prendas'
        ordering = ['product', 'chest_cm']

    def __str__(self):
        return f"{self.product.name} - Talle {self.size} ({self.chest_cm}x{self.length_cm} cm)"


class TryOnSession(models.Model):
    """
    Guarda cada prueba realizada en JPEX LAB sin requerir inicio de sesión.
    """
    PREFERRED_FIT_CHOICES = [
        ('ajustado', 'Al cuerpo / Ajustado'),
        ('regular', 'Clásico / Regular'),
        ('oversize', 'Suelto / Oversize'),
    ]

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='tryon_sessions',
        verbose_name='Prenda probada'
    )
    user_image = models.ImageField(
        upload_to='laboratory/users/',
        verbose_name='Foto del cliente'
    )
    height_cm = models.PositiveIntegerField(verbose_name='Altura (cm)')
    weight_kg = models.PositiveIntegerField(verbose_name='Peso (kg)')
    preferred_fit = models.CharField(
        max_length=20,
        choices=PREFERRED_FIT_CHOICES,
        default='oversize',
        verbose_name='Calce preferido'
    )

    # Resultados calculados por nuestro motor en utils.py
    recommended_size = models.CharField(max_length=10, blank=True, verbose_name='Talle recomendado')
    fit_explanation = models.TextField(blank=True, verbose_name='Diagnóstico de calce')
    ai_prompt = models.TextField(blank=True, verbose_name='Prompt enviado a la IA')

    # Imagen devuelta por IDM-VTON (puede quedar vacía si la fila gratuita de HF está saturada)
    result_image = models.ImageField(
        upload_to='laboratory/results/',
        null=True,
        blank=True,
        verbose_name='Resultado IA'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Fecha de prueba')

    class Meta:
        verbose_name = 'Sesión de Prueba (JPEX LAB)'
        verbose_name_plural = 'Sesiones de Prueba (JPEX LAB)'
        ordering = ['-created_at']

    def __str__(self):
        return f"Prueba #{self.id} - {self.product.name} (Talle {self.recommended_size})"