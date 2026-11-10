from django.urls import path
from . import views

app_name = 'laboratory'

urlpatterns = [
    path('', views.lab_view, name='lab_home'),
    path('<int:product_id>/', views.lab_view, name='lab_product'),
    path('<int:product_id>/', views.lab_view, name='lab_product'),
]