from django.contrib import admin
from .models import ProductMeasurement, TryOnSession


@admin.register(ProductMeasurement)
class ProductMeasurementAdmin(admin.ModelAdmin):
    list_display = ('product', 'size', 'chest_cm', 'length_cm', 'fit_type')
    list_filter = ('fit_type', 'size', 'product')
    search_fields = ('product__name',)


@admin.register(TryOnSession)
class TryOnSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'product', 'recommended_size', 'height_cm', 'weight_kg', 'preferred_fit', 'created_at')
    list_filter = ('preferred_fit', 'recommended_size', 'created_at')
    readonly_fields = ('created_at', 'ai_prompt')