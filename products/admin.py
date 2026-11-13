from django.contrib import admin, messages
from .models import (
    Category,
    Product,
    Color,
    Size,
    SizeTemplate,
    SizeTemplateItem,
    ProductMeasurementDetail,
)

admin.site.register(Category)
admin.site.register(Color)
admin.site.register(Size)


class SizeTemplateItemInline(admin.TabularInline):
    """
    Permite cargar la curva completa (S, M, L, XL) con sus centímetros exactos
    dentro de una Plantilla Reutilizable.
    """
    model = SizeTemplateItem
    extra = 4
    fields = (
        'size',
        'chest_width_cm',
        'total_length_cm',
        'shoulder_width_cm',
        'sleeve_length_cm',
        'hem_width_cm',
    )


@admin.register(SizeTemplate)
class SizeTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'brand_or_supplier', 'fit_style', 'fabric_type', 'stretch_level', 'get_sizes_summary')
    list_filter = ('fit_style', 'fabric_type', 'stretch_level')
    search_fields = ('name', 'brand_or_supplier')
    inlines = [SizeTemplateItemInline]

    fieldsets = (
        ('Identificación de la Plantilla', {
            'fields': ('name', 'brand_or_supplier')
        }),
        ('Física de la Tela y Moldería (Para Diagnóstico y Prompt IA)', {
            'fields': ('fabric_type', 'fit_style', 'stretch_level', 'ai_extra_prompt')
        }),
    )

    @admin.display(description="Curva de Talles Cargada")
    def get_sizes_summary(self, obj):
        items = obj.items.select_related('size').all()
        if not items:
            return "Sin talles cargados"
        return " | ".join([f"{i.size.name} ({int(i.chest_width_cm)}x{int(i.total_length_cm)})" for i in items])


class ProductMeasurementInline(admin.TabularInline):
    """
    Tabla opcional dentro de cada producto por si querés crear una prenda única
    sin plantilla, o sobrescribir algún talle puntual.
    """
    model = ProductMeasurementDetail
    extra = 0
    fields = (
        'size',
        'chest_width_cm',
        'total_length_cm',
        'shoulder_width_cm',
        'sleeve_length_cm',
        'hem_width_cm',
        'fabric_type',
        'fit_style',
        'stretch_level',
        'ai_extra_prompt',
    )


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'price', 'size_template', 'available')
    list_filter = ('available', 'category', 'size_template')
    list_editable = ('price', 'available', 'size_template')
    search_fields = ('name', 'description')
    prepopulated_fields = {'slug': ('name',)}
    filter_horizontal = ('colors', 'sizes')
    inlines = [ProductMeasurementInline]
    actions = ['copy_template_to_custom_measurements']

    fieldsets = (
        ('Información Principal de la Prenda', {
            'fields': ('category', 'name', 'slug', 'description', 'price', 'image', 'available')
        }),
        ('Moldería Rápida (Plantilla de Talles Reutilizable)', {
            'description': (
                '💡 <strong>Carga Rápida:</strong> Si elegís una <em>Plantilla de Talles Predefinida</em> acá '
                '(o creás una nueva con el botón <strong>+</strong>), al guardar el producto se asignarán '
                'automáticamente todos sus talles (S, M, L, XL) y medidas sin que tengas que cargar nada más abajo.'
            ),
            'fields': ('size_template',)
        }),
        ('Variantes Visibles en Tienda', {
            'fields': ('colors', 'sizes', 'color')
        }),
    )

    def save_related(self, request, form, formsets, change):
        """
        Automatización estilo Django:
        1. Si el administrador seleccionó una `size_template` en el producto, sincroniza
           automáticamente los talles (`S, M, L, XL`) de esa plantilla en `product.sizes`
           para que aparezcan los botones de talle en la tienda sin tener que marcarlos a mano.
        2. Si en cambio cargó medidas personalizadas en el inline `ProductMeasurementDetail`,
           también asegura que esos talles estén marcados en `product.sizes`.
        """
        super().save_related(request, form, formsets, change)
        product = form.instance

        sizes_to_sync = set()
        if product.size_template:
            template_sizes = product.size_template.items.values_list('size_id', flat=True)
            sizes_to_sync.update(template_sizes)

        custom_sizes = product.detailed_measurements.values_list('size_id', flat=True)
        sizes_to_sync.update(custom_sizes)

        if sizes_to_sync:
            product.sizes.add(*sizes_to_sync)

    @admin.action(description="📋 Copiar medidas de la Plantilla a filas individuales de esta prenda")
    def copy_template_to_custom_measurements(self, request, queryset):
        """
        Acción opcional por si en algún producto que usa plantilla querés "desacoplar" o
        copiar sus medidas a la tabla individual de la prenda para editar un solo talle.
        """
        copied_count = 0
        for product in queryset.select_related('size_template'):
            if not product.size_template:
                continue
            tpl = product.size_template
            for item in tpl.items.all():
                ProductMeasurementDetail.objects.update_or_create(
                    product=product,
                    size=item.size,
                    defaults={
                        'chest_width_cm': item.chest_width_cm,
                        'total_length_cm': item.total_length_cm,
                        'shoulder_width_cm': item.shoulder_width_cm,
                        'sleeve_length_cm': item.sleeve_length_cm,
                        'hem_width_cm': item.hem_width_cm,
                        'fabric_type': tpl.fabric_type,
                        'fit_style': tpl.fit_style,
                        'stretch_level': tpl.stretch_level,
                        'ai_extra_prompt': tpl.ai_extra_prompt,
                    }
                )
            copied_count += 1

        self.message_user(
            request,
            f"Se copiaron las medidas de la plantilla en {copied_count} producto(s).",
            messages.SUCCESS
        )