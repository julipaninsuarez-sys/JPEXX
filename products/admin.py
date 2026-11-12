from django.contrib import admin
from .models import Category, Product, Color, Size, ProductMeasurementDetail

admin.site.register(Category)
admin.site.register(Color)
admin.site.register(Size)


class ProductMeasurementInline(admin.TabularInline):
    model = ProductMeasurementDetail
    extra = 1
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
    list_display = ('name', 'category', 'price', 'available')
    list_filter = ('available', 'category')
    list_editable = ('price', 'available')
    prepopulated_fields = {'slug': ('name',)}
    filter_horizontal = ('colors', 'sizes')
    inlines = [ProductMeasurementInline]