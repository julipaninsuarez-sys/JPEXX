from urllib.parse import quote
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from products.models import Product
from .models import TryOnSession
from . import cuidados
from django.conf import settings
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

    matched_products = (
        Product.objects
        .filter(available=True, name__icontains=query)
        .select_related('category')[:6]
    )

    results = []
    for prod in matched_products:
        _, img_url = get_product_image_info(prod)
        results.append({
            'id': prod.id,
            'name': prod.name,
            'price': str(getattr(prod, 'price', '')),
            'image_url': img_url or '',
            'lab_url': f"/lab/revelado/{prod.id}/",
            'detail_url': f"/producto/{prod.slug}/",
        })

    return JsonResponse({'results': results})


def lab_view(request, product_id=None):
    """
    Vista principal de JPEX LAB V2 optimizada con select_related y prefetch_related
    para soportar tanto Plantillas de Talles Reutilizables (SizeTemplate) como
    medidas específicas por prenda (ProductMeasurementDetail) sin consultas N+1.
    """
    product_qs = (
        Product.objects
        .select_related('category', 'size_template')
        .prefetch_related(
            'size_template__items__size',
            'detailed_measurements__size',
            'measurements',
        )
    )
    all_products = list(product_qs.all())

    products_with_img = []
    for prod in all_products:
        _, img_url = get_product_image_info(prod)
        prod.resolved_image_url = img_url
        products_with_img.append(prod)

    selected_product = None
    if product_id:
        selected_product = get_object_or_404(product_qs, id=product_id)
    elif products_with_img:
        products_valid = [p for p in products_with_img if p.resolved_image_url]
        selected_product = products_valid[0] if products_valid else products_with_img[0]

    selected_garment_path, selected_garment_url = get_product_image_info(selected_product)

    product_sizes_data = get_product_sizes_data(selected_product) if selected_product else []
    available_size_names = [item['size_name'] for item in product_sizes_data]

    requested_size = request.GET.get('size', 'auto')

    session_result = None
    diagnostics = None
    whatsapp_url = None
    ai_error_detail = None

    if request.method == 'POST':
        posted_product_id = request.POST.get('product_id') or product_id
        selected_product = get_object_or_404(product_qs, id=posted_product_id)
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
                f"(Tipo :  {preferred_fit}). RESPONDAN RAPIDO! Gracias."
            )
            numero_whatsapp = "5492213146934"
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
        # El probador se muestra abierto si se llega desde un producto o al enviar el
        # formulario. En /lab/ a secas se ve primero el laboratorio.
        'panel_open': bool(product_id) or request.method == 'POST',
    }
    return render(request, 'laboratory/lab.html', context)


def lab_sketches(request):
    """Página interna (fuera del menú) para probar variantes de las animaciones del fondo."""
    return render(request, 'laboratory/lab_bocetos.html')


def _ultima_prueba_local():
    """Busca la última prueba de IA guardada en esta compu (foto, prenda y resultado de la
    misma sesión) para la demo de la sala de revelado (?demo=...)."""
    from django.conf import settings
    media = settings.MEDIA_ROOT
    results = media / 'laboratory' / 'results'
    if not results.is_dir():
        return {}
    sesiones = []
    for f in results.glob('tryon_session_*.png'):
        n = f.stem.rsplit('_', 1)[-1]
        if n.isdigit():
            sesiones.append(int(n))
    for n in sorted(sesiones, reverse=True):
        user = media / 'laboratory' / 'temp' / f'user_{n}.jpg'
        garment = media / 'laboratory' / 'temp' / f'garment_{n}.jpg'
        if user.is_file() and garment.is_file():
            base = settings.MEDIA_URL + 'laboratory/'
            return {
                'foto': f'{base}temp/user_{n}.jpg',
                'prenda': f'{base}temp/garment_{n}.jpg',
                'resultado': f'{base}results/tryon_session_{n}.png',
                'numero': n,
            }
    return {}


def _prendas_para_probar():
    """Las mismas consultas que usa lab_view para traer las prendas con sus talles."""
    return (
        Product.objects
        .select_related('category', 'size_template')
        .prefetch_related(
            'size_template__items__size',
            'detailed_measurements__size',
            'measurements',
        )
    )


def lab_revelado(request, product_id=None):
    """Sala de revelado (a donde lleva "Lab" en el menú). Abajo a la izquierda está el formulario
    del probador (prenda, altura, peso, calce, talle y foto). Al enviarlo, las fotos entran a la
    máquina y la página espera a la IA (lab_revelado_probar) mientras anima; cuando responde, sale
    el sobre con la foto revelada. ?demo=... simula la IA con una prueba ya guardada."""
    prendas = []
    for prod in _prendas_para_probar():
        _, img_url = get_product_image_info(prod)
        if not img_url:
            continue    # sin foto de la prenda la IA no puede probarla
        prendas.append({
            'id': prod.id,
            'name': prod.name,
            'price': prod.price,
            'img': img_url,
            'talles': ','.join(t['size_name'] for t in get_product_sizes_data(prod)),
        })

    elegida = product_id
    if elegida and not any(p['id'] == elegida for p in prendas):
        get_object_or_404(Product, id=elegida)      # 404 si no existe; si existe pero no tiene foto, se elige otra
        elegida = None
    if not elegida and prendas:
        elegida = prendas[0]['id']

    cupo = cuidados.cupo(request)
    # Solo en la compu (DEBUG): ?ver=mitad, ?ver=pocas o ?ver=limite muestran cómo se ve el aviso.
    vista_previa = {'mitad': (5, 0), 'pocas': (2, 0), 'limite': (0, 23)}.get(request.GET.get('ver'))
    if settings.DEBUG and vista_previa:
        cupo = cuidados.con_texto({**cupo, 'quedan': vista_previa[0], 'espera_min': vista_previa[1]})

    return render(request, 'laboratory/lab_revelado.html', {
        'prendas': prendas,
        'elegida': elegida,
        'talle_pedido': request.GET.get('size', 'auto'),
        'ejemplo': _ultima_prueba_local() if request.GET.get('demo') else {},
        'cupo': cupo,
        'dias_fotos': cuidados.dias_fotos(),
    })


@require_POST
def lab_revelado_probar(request):
    """Recibe el formulario de la sala de revelado y hace la prueba: es lo mismo que el POST de
    lab_view (calcula el talle, guarda la TryOnSession y llama a generate_tryon_image), pero
    responde en JSON para que la página siga animando mientras la IA trabaja."""
    product = get_object_or_404(_prendas_para_probar(), id=request.POST.get('product_id'))
    user_image = request.FILES.get('user_image')
    if not user_image:
        return JsonResponse({'ok': False, 'error': 'Falta tu foto.'}, status=400)
    if not (user_image.content_type or '').startswith('image/') or user_image.size > 15 * 1024 * 1024:
        return JsonResponse({'ok': False, 'error': 'La foto tiene que ser una imagen de menos de 15 MB.'}, status=400)
    try:
        height_cm = int(request.POST.get('height_cm', 175))
        weight_kg = int(request.POST.get('weight_kg', 75))
    except ValueError:
        return JsonResponse({'ok': False, 'error': 'Revisá tu altura y tu peso.'}, status=400)
    if not (140 <= height_cm <= 220 and 40 <= weight_kg <= 180):
        return JsonResponse({'ok': False, 'error': 'Revisá tu altura (140 a 220 cm) y tu peso (40 a 180 kg).'}, status=400)
    preferred_fit = request.POST.get('preferred_fit', 'oversize')
    if preferred_fit not in dict(TryOnSession.PREFERRED_FIT_CHOICES):
        preferred_fit = 'oversize'
    requested_size = request.POST.get('requested_size', 'auto')

    # Límite de pruebas por hora (ver laboratory/cuidados.py). Cuenta antes de llamar a la IA,
    # así también cuentan las que fallan.
    cupo = cuidados.cupo(request)
    if not cupo['quedan']:
        return JsonResponse({'ok': False, 'limite': True, 'cupo': cupo, 'error': cupo['texto']}, status=429)
    cuidados.anotar_prueba(request)
    cuidados.limpiar_si_toca()

    rec_size, explanation, prompt, diagnostics = calculate_size_and_prompt(
        product=product,
        height_cm=height_cm,
        weight_kg=weight_kg,
        preferred_fit=preferred_fit,
        requested_size=requested_size
    )
    session = TryOnSession.objects.create(
        product=product,
        user_image=user_image,
        height_cm=height_cm,
        weight_kg=weight_kg,
        preferred_fit=preferred_fit,
        recommended_size=rec_size,
        fit_explanation=explanation,
        ai_prompt=prompt
    )

    garment_path, garment_url = get_product_image_info(product)
    resultado, error = None, None
    if garment_path:
        relative_result_path, error = generate_tryon_image(
            session_id=session.id,
            user_img_path=session.user_image.path,
            garment_img_path=garment_path,
            ai_prompt=prompt
        )
        if relative_result_path:
            session.result_image = relative_result_path
            session.save()
            resultado = session.result_image.url
    else:
        error = "Esta prenda todavía no tiene una imagen cargada en la base de datos."

    mensaje_wsp = (
        f"¡Hola JPEX! Probé la prenda *{product.name}* en JPEX LAB. "
        f"Mido {height_cm} cm, peso {weight_kg} kg y probé el *Talle {rec_size}* "
        f"(Tipo :  {preferred_fit}). RESPONDAN RAPIDO! Gracias."
    )
    diagnostics = diagnostics or {}
    return JsonResponse({
        'ok': bool(resultado),
        'numero': session.id,
        'resultado': resultado,
        'foto': session.user_image.url,
        'prenda': garment_url,
        'talle': rec_size,
        'explicacion': explanation,
        'calce': diagnostics.get('calce_badge', ''),
        'tela': diagnostics.get('fabric_es', ''),
        'whatsapp': f"https://wa.me/5492213146934?text={quote(mensaje_wsp)}",
        'producto': {
            'id': product.id,
            'name': product.name,
            'price': f'{product.price:.0f}',
            'image': garment_url or '',
        },
        'error': error,
        'cupo': cuidados.cupo(request),     # cómo queda el límite después de esta prueba
    })
