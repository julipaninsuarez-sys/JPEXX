import os
from django.db import models
from django.conf import settings
from django.db.models.fields.files import FileField


# ==============================================================================
# 1. CLASES ABSTRACTAS (FILOSOFÍA DRY DE DJANGO: CERO CÓDIGO REPETIDO)
# ==============================================================================

class AbstractGarmentPhysics(models.Model):
    """
    Clase base abstracta que define las propiedades físicas de la tela y moldería.
    Se reutiliza tanto en las Plantillas de Moldería (SizeTemplate) como en las
    medidas individuales por prenda (ProductMeasurementDetail) sin repetir código.
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

    fabric_type = models.CharField(
        max_length=20,
        choices=FABRIC_CHOICES,
        default='cotton_heavy',
        verbose_name="Tipo de Tela"
    )
    fit_style = models.CharField(
        max_length=20,
        choices=FIT_CHOICES,
        default='oversize',
        verbose_name="Corte / Moldería"
    )
    stretch_level = models.CharField(
        max_length=10,
        choices=STRETCH_CHOICES,
        default='low',
        verbose_name="Elasticidad"
    )
    ai_extra_prompt = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Prompt extra para IA",
        help_text="Ej: 'heavyweight cotton, dropped shoulder seam, wide rib neck'"
    )

    class Meta:
        abstract = True


class AbstractSizeDimensions(models.Model):
    """
    Clase base abstracta para las dimensiones exactas en centímetros de cada talle.
    """
    chest_width_cm = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        verbose_name="Ancho Pecho (cm)",
        help_text="De axila a axila"
    )
    total_length_cm = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        verbose_name="Largo Total (cm)",
        help_text="Desde hombro a ruedo"
    )
    shoulder_width_cm = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        verbose_name="Ancho Hombros (cm)",
        help_text="De costura a costura"
    )
    sleeve_length_cm = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        blank=True,
        null=True,
        verbose_name="Largo Manga (cm)"
    )
    hem_width_cm = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        blank=True,
        null=True,
        verbose_name="Ancho Ruedo/Cadera (cm)"
    )

    class Meta:
        abstract = True


# ==============================================================================
# 2. CATÁLOGO BASE Y SISTEMA DE PLANTILLAS DE TALLES REUTILIZABLES
# ==============================================================================

class Color(models.Model):
    name = models.CharField(max_length=50, verbose_name="Nombre del Color")
    hex_code = models.CharField(max_length=7, default="#000000", help_text="Ej: #000000 para negro.")

    class Meta:
        verbose_name = "Color"
        verbose_name_plural = "Colores"

    def __str__(self):
        return self.name


class Size(models.Model):
    name = models.CharField(max_length=10, verbose_name="Sigla de Talle", help_text="Ej: S, M, L, XL")

    class Meta:
        verbose_name = "Sigla de Talle"
        verbose_name_plural = "Siglas de Talles"

    def __str__(self):
        return self.name


class SizeTemplate(AbstractGarmentPhysics):
    """
    PLANTILLA REUTILIZABLE DE TALLES Y MOLDERÍA:
    Permite precargar una curva completa de talles (S, M, L, XL con sus medidas exactas,
    marca/proveedor, tela y corte) una sola vez. Luego, al crear una remera o buzo nuevo,
    simplemente elegís esta plantilla y la prenda hereda todo automáticamente.
    """
    name = models.CharField(
        max_length=120,
        unique=True,
        verbose_name="Nombre de la Plantilla / Tipo de Prenda",
        help_text="Ej: 'Remera Oversize 24/1 - Taller Sur' o 'Buzo Boxy Frisa Pesada'"
    )
    brand_or_supplier = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Marca / Proveedor / Referencia",
        help_text="Opcional. Ej: 'Moldería Propia JPEX 2026' o 'Proveedor Textil X'"
    )

    class Meta:
        verbose_name = "Plantilla de Talles y Moldería"
        verbose_name_plural = "Plantillas de Talles y Moldería"
        ordering = ['name']

    def __str__(self):
        extra = f" ({self.brand_or_supplier})" if self.brand_or_supplier else ""
        return f"{self.name}{extra} — {self.get_fit_style_display()} / {self.get_fabric_type_display()}"


class SizeTemplateItem(AbstractSizeDimensions):
    """
    Representa cada talle (S, M, L, XL) con sus medidas exactas dentro de una SizeTemplate.
    """
    template = models.ForeignKey(
        SizeTemplate,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name="Plantilla"
    )
    size = models.ForeignKey(
        Size,
        on_delete=models.CASCADE,
        verbose_name="Talle"
    )

    class Meta:
        verbose_name = "Talle de la Plantilla"
        verbose_name_plural = "Curva de Talles de la Plantilla"
        unique_together = ('template', 'size')
        ordering = ['chest_width_cm']

    def __str__(self):
        return f"{self.template.name} - Talle {self.size.name} ({self.chest_width_cm}x{self.total_length_cm} cm)"


class Category(models.Model):
    name = models.CharField(max_length=100, verbose_name="Nombre")
    slug = models.SlugField(unique=True, verbose_name="Slug")

    class Meta:
        verbose_name = "Categoría"
        verbose_name_plural = "Categorías"

    def __str__(self):
        return self.name


# ==============================================================================
# 3. MODELO PRODUCT CON RESOLUCIÓN AUTÓNOMA (BAJO ACOPLAMIENTO)
# ==============================================================================

class Product(models.Model):
    category = models.ForeignKey(
        Category,
        related_name='products',
        on_delete=models.CASCADE,
        verbose_name="Categoría"
    )
    name = models.CharField(max_length=200, verbose_name="Nombre del Producto")
    slug = models.SlugField(unique=True, verbose_name="Slug")
    description = models.TextField(blank=True, verbose_name="Descripción")
    price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Precio")
    image = models.ImageField(upload_to='products/', blank=True, null=True, verbose_name="Imagen Principal")
    available = models.BooleanField(default=True, verbose_name="Disponible")

    # NUEVO: Selector de Plantilla de Talles Reutilizable (Opcional)
    size_template = models.ForeignKey(
        SizeTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='products',
        verbose_name="Plantilla de Talles Predefinida (Opcional)",
        help_text=(
            "Elegí una plantilla ya cargada (ej: Remera Oversize 24/1) para aplicar todos sus talles "
            "y medidas automáticamente sin escribirlos de nuevo. Si es una prenda única especial, "
            "podés dejar esto vacío y cargar sus medidas abajo."
        )
    )

    colors = models.ManyToManyField(Color, blank=True, verbose_name="Colores Disponibles")
    sizes = models.ManyToManyField(Size, blank=True, verbose_name="Talles Disponibles")

    # Mantenido por retrocompatibilidad con tu base de datos actual
    color = models.CharField(max_length=50, blank=True, verbose_name="Color (Texto alternativo)")

    class Meta:
        verbose_name = "Producto"
        verbose_name_plural = "Productos"

    def __str__(self):
        return self.name

    # --------------------------------------------------------------------------
    # MÉTODOS DE DOMINIO (Encapsulamiento: Product resuelve sus propios datos)
    # --------------------------------------------------------------------------

    def get_image_info(self):
        """
        Devuelve (path_absoluto, url_publica) de la imagen de la prenda.
        Al estar en Product, la app 'laboratory' no necesita acoplarse a la estructura
        interna de archivos de 'products'.
        """
        priority_fields = ['image', 'imagen', 'photo', 'foto', 'front_image', 'cutout', 'cutout_image']
        for field_name in priority_fields:
            field = getattr(self, field_name, None)
            if field and getattr(field, 'name', None):
                try:
                    img_url = field.url
                except Exception:
                    img_url = f"{settings.MEDIA_URL}{field.name}"

                img_path = None
                try:
                    if hasattr(field, 'path') and os.path.exists(field.path):
                        img_path = field.path
                    else:
                        candidate = os.path.join(settings.MEDIA_ROOT, str(field.name))
                        if os.path.exists(candidate):
                            img_path = candidate
                except Exception:
                    pass
                return img_path, img_url

        for model_field in self._meta.fields:
            if isinstance(model_field, FileField):
                val = getattr(self, model_field.name, None)
                if val and getattr(val, 'name', None):
                    try:
                        img_url = val.url
                    except Exception:
                        img_url = f"{settings.MEDIA_URL}{val.name}"
                    img_path = val.path if hasattr(val, 'path') and os.path.exists(val.path) else None
                    return img_path, img_url

        try:
            from products.cutouts import get_cutout_for_product
            cutout_rel = get_cutout_for_product(self)
            if cutout_rel:
                static_url = settings.STATIC_URL if settings.STATIC_URL.endswith('/') else f"{settings.STATIC_URL}/"
                img_url = cutout_rel if cutout_rel.startswith('/') else f"{static_url}{cutout_rel.lstrip('/')}"
                search_dirs = list(getattr(settings, 'STATICFILES_DIRS', []))
                search_dirs.append(os.path.join(settings.BASE_DIR, 'static'))
                for s_dir in search_dirs:
                    candidate = os.path.join(s_dir, cutout_rel.replace('/static/', '').lstrip('/'))
                    if os.path.exists(candidate):
                        return candidate, img_url
                return None, img_url
        except Exception:
            pass

        return None, None

    def get_size_specs(self):
        """
        Unifica y devuelve las especificaciones técnicas de talles para esta prenda:
        1. Si la prenda tiene una Plantilla asignada (`size_template`), carga todos los talles
           y la física de tela de esa plantilla automáticamente.
        2. Si la prenda tiene medidas específicas en `detailed_measurements` (prenda única sin plantilla,
           o bien un talle puntual sobrescrito manualmente), las aplica con prioridad.
        """
        specs_by_size = {}

        # 1. Cargar base desde la Plantilla Reutilizable (si tiene una asignada)
        if self.size_template_id and self.size_template:
            for item in self.size_template.items.select_related('size').all():
                s_name = item.size.name.upper()
                specs_by_size[s_name] = {
                    'size_name': item.size.name,
                    'chest_cm': float(item.chest_width_cm),
                    'length_cm': float(item.total_length_cm),
                    'shoulder_cm': float(item.shoulder_width_cm) if item.shoulder_width_cm else None,
                    'sleeve_cm': float(item.sleeve_length_cm) if item.sleeve_length_cm else None,
                    'hem_cm': float(item.hem_width_cm) if item.hem_width_cm else None,
                    'detail_obj': self.size_template,  # Provee fabric_type, fit_style, stretch_level, ai_extra_prompt
                    'source': 'template',
                }

        # 2. Cargar o sobrescribir con medidas específicas de la prenda (si se cargaron manualmente)
        for dm in self.detailed_measurements.select_related('size').all():
            s_name = dm.size.name.upper()
            specs_by_size[s_name] = {
                'size_name': dm.size.name,
                'chest_cm': float(dm.chest_width_cm),
                'length_cm': float(dm.total_length_cm),
                'shoulder_cm': float(dm.shoulder_width_cm) if dm.shoulder_width_cm else None,
                'sleeve_cm': float(dm.sleeve_length_cm) if dm.sleeve_length_cm else None,
                'hem_cm': float(dm.hem_width_cm) if dm.hem_width_cm else None,
                'detail_obj': dm,
                'source': 'custom_product',
            }

        if specs_by_size:
            result = list(specs_by_size.values())
            result.sort(key=lambda x: x['chest_cm'])
            return result

        return []


class ProductMeasurementDetail(AbstractGarmentPhysics, AbstractSizeDimensions):
    """
    Ficha técnica específica para una prenda individual.
    Hereda todos sus campos de AbstractGarmentPhysics y AbstractSizeDimensions (DRY).
    Es 100% opcional si el producto ya usa un SizeTemplate, pero permite crear prendas
    únicas sin plantilla o sobrescribir un talle puntual.
    """
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='detailed_measurements',
        verbose_name="Producto"
    )
    size = models.ForeignKey(Size, on_delete=models.CASCADE, verbose_name="Talle")

    class Meta:
        verbose_name = "Medida Específica de Prenda"
        verbose_name_plural = "Medidas Específicas (Opcional si usás Plantilla)"
        unique_together = ('product', 'size')
        ordering = ['chest_width_cm']

    def __str__(self):
        return f"{self.product.name} - Talle {self.size.name} ({self.chest_width_cm}x{self.total_length_cm} cm)"