from django.urls import path
from . import views

urlpatterns = [
    path('', views.lab_view, name='lab'),
    # Página interna (fuera del menú) para probar variantes de las animaciones del fondo.
    path('bocetos/', views.lab_sketches, name='lab_sketches'),
    # Sala de revelado: a donde lleva "Lab" en el menú (el probador con la IA, animado).
    path('revelado/', views.lab_revelado, name='lab_revelado'),
    path('revelado/<int:product_id>/', views.lab_revelado, name='lab_revelado_product'),
    # Recibe el formulario de la sala y devuelve el resultado de la IA en JSON.
    path('revelado/probar/', views.lab_revelado_probar, name='lab_revelado_probar'),
    path('<int:product_id>/', views.lab_view, name='lab_product'),
    path('api/search/', views.live_search_api, name='live_search_api'),
]