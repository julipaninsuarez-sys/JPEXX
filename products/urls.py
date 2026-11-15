from django.urls import path
from . import views

app_name = 'products'

urlpatterns = [
    path('', views.home, name='home'),
    path('catalogo/', views.catalog, name='catalog'),
    path('catalogo/<slug:category_slug>/', views.catalog, name='catalog_by_category'),
    path('producto/<slug:slug>/', views.product_detail, name='detail'),
    path('producto/<slug:slug>/talle/', views.recommend_size, name='recommend_size'),
]