from django.db import models

from .cutouts import cutout_url


class Category(models.Model):
    name = models.CharField(max_length=100, verbose_name="Nombre")
    slug = models.SlugField(max_length=100, unique=True, verbose_name="Slug (URL)")
    description = models.TextField(blank=True, verbose_name="Descripción")

    class Meta:
        verbose_name = "Categoría"
        verbose_name_plural = "Categorías"
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def cover_product(self):
        return self.products.filter(available=True).first()


class Product(models.Model):
    GARMENT_TYPES = [
        ('upper_body', 'Parte superior (remeras, buzos, camisas, camperas)'),
        ('lower_body', 'Parte inferior (pantalones, jeans, shorts, bermudas)'),
        ('full_body', 'Cuerpo completo (disfrazes)'),
        ('other', 'Otro / Accesorio'),
    ]

    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name='products',
        verbose_name="Categoría"
    )
    name = models.CharField(max_length=150, verbose_name="Nombre de la prenda")
    slug = models.SlugField(max_length=150, unique=True, verbose_name="Slug (URL)")
    description = models.TextField(blank=True, verbose_name="Descripción")
    price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Precio")
    main_image = models.ImageField(upload_to='products/', verbose_name="Imagen principal")
    garment_type = models.CharField(
        max_length=20,
        choices=GARMENT_TYPES,
        default='upper_body',
        verbose_name="Tipo de prenda"
    )
    color = models.CharField(max_length=50, verbose_name="Color principal")
    sizes = models.CharField(
        max_length=100,
        default="S, M, L, XL",
        blank=True,
        verbose_name="Talles disponibles"
    )
    available = models.BooleanField(default=True, verbose_name="Disponible")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Fecha de creación")

    class Meta:
        verbose_name = "Producto"
        verbose_name_plural = "Productos"
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    @property
    def stage_image_url(self):
        return cutout_url(self.main_image)

    @property
    def size_list(self):
        return self.sizes.replace(',', ' ').split()