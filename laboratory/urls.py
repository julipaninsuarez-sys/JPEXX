from django.urls import path
from . import views

urlpatterns = [
    path('', views.lab_view, name='lab'),
    # Página interna (fuera del menú) para probar variantes de las animaciones del fondo.
    path('bocetos/', views.lab_sketches, name='lab_sketches'),
    # Sala de revelado: a donde lleva "Lab" en el menú (por ahora simula la espera de la IA).
    path('revelado/', views.lab_revelado, name='lab_revelado'),
    path('<int:product_id>/', views.lab_view, name='lab_product'),
    path('api/search/', views.live_search_api, name='live_search_api'),
]