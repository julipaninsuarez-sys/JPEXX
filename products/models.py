from django.db import models


class Color(models.Model):
    name = models.CharField(max_length=50, verbose_name="Nombre del Color")
    hex_code = models.CharField(max_length=7, default="#000000", help_text="Ej: #000000 para negro.")

    class Meta:
        verbose_name = "Color"
        verbose_name_plural = "Colores"

    def __str__(self):
        return self.name


class Size(models.Model):
    name = models.CharField(max_length=10, verbose_name="Talle", help_text="Ej: S, M, L, XL")

    class Meta:
        verbose_name = "Talle"
        verbose_name_plural = "Talles"

    def __str__(self):
        return self.name


class Category(models.Model):
    name = models.CharField(max_length=100, verbose_name="Nombre")
    slug = models.SlugField(unique=True, verbose_name="Slug")

    class Meta:
        verbose_name = "Categoría"
        verbose_name_plural = "Categorías"

    def __str__(self):
        return self.name


class Product(models.Model):
    category = models.ForeignKey(Category, related_name='products', on_delete=models.CASCADE, verbose_name="Categoría")
    name = models.CharField(max_length=200, verbose_name="Nombre del Producto")
    slug = models.SlugField(unique=True, verbose_name="Slug")
    description = models.TextField(blank=True, verbose_name="Descripción")
    price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Precio")
    image = models.ImageField(upload_to='products/', blank=True, null=True, verbose_name="Imagen Principal")

    # Campo requerido por products/views.py para mostrar prendas activas en el inicio y catálogo
    available = models.BooleanField(default=True, verbose_name="Disponible")

    # Relación muchos a muchos para filtros y selectores
    colors = models.ManyToManyField(Color, blank=True, verbose_name="Colores Disponibles")
    sizes = models.ManyToManyField(Size, blank=True, verbose_name="Talles Disponibles")

    # Mantenemos el campo color viejo por compatibilidad con tus productos ya cargados
    color = models.CharField(max_length=50, blank=True, verbose_name="Color (Viejo)")

    class Meta:
        verbose_name = "Producto"
        verbose_name_plural = "Productos"

    def __str__(self):
        return self.name


class ProductMeasurementDetail(models.Model):
    """
    Ficha técnica exhaustiva por prenda y por talle.
    Guarda las medidas reales en cm y las propiedades de caída de tela para JPEX LAB.
    """
    FABRIC_CHOICES = [
        ('cotton_heavy', 'Algodón Pesado (Rígido 20/1 o 24/1)'),
        ('cotton_light', 'Algodón Peinado (Ligero 30/1)'),
        ('french_terry', 'Frisa / Rústico (Buzos)'),
        ('polyester', 'Poliéster / Deportivo'),
        ('denim', 'Jean / Denim'),
    ]

    FIT_CHOICES = [
        ('slim', 'Slim Fit (Al cuerpo)'),
        ('regular', 'Regular Fit (Clásico)'),
        ('oversize', 'Oversize (Hombros caídos)'),
        ('boxy', 'Boxy Fit (Ancho y corto)'),
    ]

    STRETCH_CHOICES = [
        ('none', 'Rígido (No cede)'),
        ('low', 'Elasticidad leve (Cede 1-2 cm)'),
        ('high', 'Elastizado (Con lycra/spandex)'),
    ]

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='detailed_measurements')
    size = models.ForeignKey(Size, on_delete=models.CASCADE, verbose_name="Talle")

    # Medidas Biométricas en CM
    chest_width_cm = models.DecimalField(max_digits=5, decimal_places=2, verbose_name="Ancho Pecho (cm)", help_text="De axila a axila")
    total_length_cm = models.DecimalField(max_digits=5, decimal_places=2, verbose_name="Largo Total (cm)", help_text="Desde hombro a ruedo")
    shoulder_width_cm = models.DecimalField(max_digits=5, decimal_places=2, verbose_name="Ancho Hombros (cm)", help_text="De costura a costura")
    sleeve_length_cm = models.DecimalField(max_digits=5, decimal_places=2, verbose_name="Largo Manga (cm)", blank=True, null=True)
    hem_width_cm = models.DecimalField(max_digits=5, decimal_places=2, verbose_name="Ancho Ruedo/Cadera (cm)", blank=True, null=True)

    # Atributos físicos y morfológicos para el prompt de la IA
    fabric_type = models.CharField(max_length=20, choices=FABRIC_CHOICES, default='cotton_heavy', verbose_name="Tipo de Tela")
    fit_style = models.CharField(max_length=20, choices=FIT_CHOICES, default='oversize', verbose_name="Corte/Moldería")
    stretch_level = models.CharField(max_length=10, choices=STRETCH_CHOICES, default='low', verbose_name="Elasticidad")

    # Indicaciones extra para el renderizado de la IA
    ai_extra_prompt = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Prompt extra para IA",
        help_text="Ej: 'heavyweight cotton, dropped shoulder seam, wide rib neck'"
    )

    class Meta:
        verbose_name = "Detalle de Medida"
        verbose_name_plural = "Detalles de Medidas"
        unique_together = ('product', 'size')

    def __str__(self):
        return f"{self.product.name} - Talle {self.size.name} ({self.chest_width_cm}x{self.total_length_cm} cm)"