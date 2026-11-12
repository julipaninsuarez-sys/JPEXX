from django.urls import path
from . import views

urlpatterns = [
    path('', views.lab_view, name='lab'),
    path('', views.lab_view, name='lab_home'),
    path('<int:product_id>/', views.lab_view, name='lab_product'),
    path('api/search/', views.live_search_api, name='live_search_api'),
]