from urllib.parse import quote
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from products.models import Product
from .models import TryOnSession
from .utils import (
    calculate_size_and_prompt,
    get_product_image_info,
    get_product_sizes_data,
    generate_tryon_image,
)


def live_search_api(request):
    """
    ETAPA 1 - Buscador Predictivo en Vivo (AJAX / JSON API):
    Recibe lo que el usuario escribe en la barra superior (?q=texto) y devuelve
    hasta 6 prendas coincidentes en formato JSON sin recargar la página.
    """
    query = request.GET.get('q', '').strip()

    if len(query) < 2:
        return JsonResponse({'results': []})

    matched_products = Product.objects.filter(name__icontains=query)[:6]

    results = []
    for prod in matched_products:
        _, img_url = get_product_image_info(prod)
        results.append({
            'id': prod.id,
            'name': prod.name,
            'price': str(getattr(prod, 'price', '')),
            'image_url': img_url or '',
            'lab_url': f"/lab/{prod.id}/",
        })

    return JsonResponse({'results': results})


def lab_view(request, product_id=None):
    """
    Vista principal de JPEX LAB V2:
    - Conecta con las fichas técnicas detalladas (ProductMeasurementDetail).
    - Permite cálculo automático del talle ideal O prueba de un talle específico (S, M, L, XL).
    - Genera una tabla comparativa de calce para todos los talles de esa prenda.
    - Ejecuta el Router Multi-Motor de IA con preprocesamiento de estudio 768x1024.
    """
    all_products = Product.objects.prefetch_related('detailed_measurements__size', 'measurements').all()

    products_with_img = []
    for prod in all_products:
        _, img_url = get_product_image_info(prod)
        prod.resolved_image_url = img_url
        products_with_img.append(prod)

    selected_product = None
    if product_id:
        selected_product = get_object_or_404(Product, id=product_id)
    elif products_with_img:
        products_valid = [p for p in products_with_img if p.resolved_image_url]
        selected_product = products_valid[0] if products_valid else products_with_img[0]

    selected_garment_path, selected_garment_url = get_product_image_info(selected_product)

    # Obtenemos los talles configurados para la prenda seleccionada
    product_sizes_data = get_product_sizes_data(selected_product) if selected_product else []
    available_size_names = [item['size_name'] for item in product_sizes_data]

    # Permite recibir ?size=L si viene desde la página de detalle del producto
    requested_size = request.GET.get('size', 'auto')

    session_result = None
    diagnostics = None
    whatsapp_url = None
    ai_error_detail = None

    if request.method == 'POST':
        posted_product_id = request.POST.get('product_id') or product_id
        selected_product = get_object_or_404(Product, id=posted_product_id)
        selected_garment_path, selected_garment_url = get_product_image_info(selected_product)

        product_sizes_data = get_product_sizes_data(selected_product)
        available_size_names = [item['size_name'] for item in product_sizes_data]

        height_cm = int(request.POST.get('height_cm', 175))
        weight_kg = int(request.POST.get('weight_kg', 75))
        preferred_fit = request.POST.get('preferred_fit', 'oversize')
        requested_size = request.POST.get('requested_size', 'auto')
        user_image = request.FILES.get('user_image')

        if user_image and selected_product:
            rec_size, explanation, prompt, diagnostics = calculate_size_and_prompt(
                product=selected_product,
                height_cm=height_cm,
                weight_kg=weight_kg,
                preferred_fit=preferred_fit,
                requested_size=requested_size
            )

            session_result = TryOnSession.objects.create(
                product=selected_product,
                user_image=user_image,
                height_cm=height_cm,
                weight_kg=weight_kg,
                preferred_fit=preferred_fit,
                recommended_size=rec_size,
                fit_explanation=explanation,
                ai_prompt=prompt
            )

            if selected_garment_path:
                relative_result_path, error_msg = generate_tryon_image(
                    session_id=session_result.id,
                    user_img_path=session_result.user_image.path,
                    garment_img_path=selected_garment_path,
                    ai_prompt=prompt
                )
                if relative_result_path:
                    session_result.result_image = relative_result_path
                    session_result.save()
                else:
                    ai_error_detail = error_msg
            else:
                ai_error_detail = "Esta prenda todavía no tiene una imagen cargada en la base de datos."

            mensaje_wsp = (
                f"¡Hola JPEX! Probé la prenda *{selected_product.name}* en JPEX LAB. "
                f"Mido {height_cm} cm, peso {weight_kg} kg y probé el *Talle {rec_size}* "
                f"(calce {preferred_fit}). ¿Tienen stock disponible?"
            )
            numero_whatsapp = "+5492213146934"
            whatsapp_url = f"https://wa.me/{numero_whatsapp}?text={quote(mensaje_wsp)}"

    context = {
        'products': products_with_img,
        'selected_product': selected_product,
        'selected_garment_url': selected_garment_url,
        'available_size_names': available_size_names,
        'requested_size': requested_size,
        'session_result': session_result,
        'diagnostics': diagnostics,
        'whatsapp_url': whatsapp_url,
        'ai_error_detail': ai_error_detail,
    }
    return render(request, 'laboratory/lab.html', context)