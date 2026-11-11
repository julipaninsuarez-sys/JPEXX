from django.urls import path
from . import views

app_name = 'laboratory'

urlpatterns = [
    path('', views.lab_view, name='lab_home'),
    # Página interna (fuera del menú) para probar variantes de las animaciones del fondo.
    path('bocetos/', views.lab_sketches, name='lab_sketches'),
    path('<int:product_id>/', views.lab_view, name='lab_product'),
    path('<int:product_id>/', views.lab_view, name='lab_product'),
]