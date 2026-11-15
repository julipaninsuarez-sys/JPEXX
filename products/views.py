from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404
from django.views.decorators.http import require_POST

from . import sizing
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
        'size_widget': _size_widget(product),
    }
    return render(request, 'products/detail.html', context)


# ==============================================================================
# Recomendador de talles
# ==============================================================================

def _sizing_setup(product):
    """
    Junta lo que el recomendador necesita saber de la prenda.
    Devuelve None (y el bloque "Tu talle" no se muestra) si:
      - la categoría no tiene recomendador (ej. una categoría nueva),
      - la prenda no vende ningún talle,
      - ninguno de los talles que vende tiene medidas.
    """
    garment_type = sizing.CATEGORY_TO_GARMENT.get(product.category.slug)
    if garment_type is None:
        return None

    # Solo se comparan los talles que la prenda vende (los del selector),
    # para no recomendar algo que no se puede comprar.
    sold = _sold_size_names(product)
    all_sizes = product.get_size_specs() or sizing.DEFAULT_SIZES
    sizes = [s for s in all_sizes if _normalize_size(s['size_name']) in sold]
    if not sizes:
        return None

    # De dónde sale el corte y la elasticidad: la plantilla si hay,
    # si no el primer talle con medidas propias, si no la tabla de respaldo.
    detail = product.size_template or sizes[0].get('detail_obj')
    if detail is not None:
        fit_style, stretch_level = detail.fit_style, detail.stretch_level
    else:
        fit_style, stretch_level = sizing.DEFAULT_FIT_STYLE, 'none'

    return {
        'garment_type': garment_type,
        'sizes': sizes,
        'fit_style': fit_style,
        'stretch_level': stretch_level,
    }


def _normalize_size(name):
    """'  m ' y 'M' son el mismo talle: sin espacios y en mayúsculas."""
    return name.strip().upper()


def _sold_size_names(product):
    """Talles que la prenda vende (los del selector), normalizados."""
    return {_normalize_size(size.name) for size in product.sizes.all()}


def _size_widget(product):
    """Lo que la página necesita para dibujar el bloque "Tu talle" (o None para no mostrarlo)."""
    setup = _sizing_setup(product)
    if setup is None:
        return None
    fits, default_fit = sizing.allowed_fits(setup['fit_style'])
    return {
        'fits': fits,
        'default_fit': default_fit,
        'calibrated': sizing.CALIBRATED[setup['garment_type']],
    }


def _form_text(post, field):
    """Texto del formulario; vacío o solo espacios -> None ("sin dato")."""
    value = post.get(field, '').strip()
    return value or None


def _form_number(post, field):
    """
    Número del formulario. Vacío -> None ("sin dato").
    Acepta coma decimal ("75,5"), porque en Argentina se escribe así.
    """
    value = _form_text(post, field)
    if value is None:
        return None
    try:
        return float(value.replace(',', '.'))
    except ValueError:
        raise sizing.SizingError(
            f"Revisá {sizing.FIELD_LABELS[field]}: tiene que ser un número.", field=field
        )


def _json_error(message, status, field=None):
    return JsonResponse({'ok': False, 'error': message, 'field': field}, status=status)


@require_POST
def recommend_size(request, slug):
    """
    Recibe los datos del usuario por POST y devuelve la recomendación en JSON.

    PRIVACIDAD: los datos del cuerpo se usan para calcular y se descartan.
    No se guardan en la base, ni en la sesión, ni se imprimen o registran.
    """
    product = Product.objects.filter(slug=slug, available=True).select_related(
        'category', 'size_template'
    ).first()
    if product is None:
        return _json_error("No encontramos esta prenda.", status=404)

    setup = _sizing_setup(product)
    if setup is None:
        # Categoría sin recomendador, o prenda sin talles a la venta con medidas.
        return _json_error("Esta prenda no tiene recomendador de talles.", status=400)

    try:
        result = sizing.recommend_size(
            sizes=setup['sizes'],
            garment_type=setup['garment_type'],
            fit_style=setup['fit_style'],
            stretch_level=setup['stretch_level'],
            height_cm=_form_number(request.POST, 'height_cm'),
            weight_kg=_form_number(request.POST, 'weight_kg'),
            build=_form_text(request.POST, 'build'),
            fit=_form_text(request.POST, 'fit'),
            chest_cm=_form_number(request.POST, 'chest_cm'),
            waist_cm=_form_number(request.POST, 'waist_cm'),
        )
    except ValueError as error:
        return _json_error(str(error), status=400, field=getattr(error, 'field', None))

    # La pantalla no muestra centímetros, y la holgura permitiría reconstruir
    # la medida del cuerpo: la sacamos antes de responder.
    result['comparison'] = [
        {'size_name': row['size_name'], 'verdict': row['verdict']}
        for row in result['comparison']
    ]
    return JsonResponse({'ok': True, **result})