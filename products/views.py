from django.shortcuts import render, get_object_or_404
from .models import Category, Product


def home(request):
    categories = Category.objects.all()
    available = Product.objects.filter(available=True).select_related('category')
    context = {
        'categories': categories,
        'featured_products': available[:4],
        # Para que el hero no repita los destacados cuando hay stock suficiente.
        'hero_products': available[4:7] or available[:3],
    }
    return render(request, 'products/home.html', context)


def catalog(request, category_slug=None):
    categories = Category.objects.all()
    products = Product.objects.filter(available=True).select_related('category')
    current_category = None

    if category_slug:
        current_category = get_object_or_404(Category, slug=category_slug)
        products = products.filter(category=current_category)

    context = {
        'categories': categories,
        'products': products,
        'current_category': current_category,
    }
    return render(request, 'products/catalog.html', context)


def product_detail(request, slug):
    product = get_object_or_404(Product, slug=slug, available=True)
    related_products = (
        Product.objects.filter(available=True, category=product.category)
        .exclude(pk=product.pk)
        .select_related('category')[:4]
    )
    context = {
        'product': product,
        'related_products': related_products,
    }
    return render(request, 'products/detail.html', context)