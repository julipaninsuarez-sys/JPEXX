import os
import shutil
import urllib.request
import json
from PIL import Image, ImageOps
from django.conf import settings
from django.db.models.fields.files import FileField
from gradio_client import Client, handle_file

# ==============================================================================
# CONFIGURACIÓN DE PROVEEDORES DE IA (GRATIS HOY + LISTO PARA API PAGA MAÑANA)
# ==============================================================================
# 1. Token gratuito de Hugging Face (opcional, amplía tu cuota diaria ZeroGPU gratis)
HF_TOKEN = os.environ.get("HF_TOKEN", getattr(settings, "HF_TOKEN", None))

# 2. Proveedor activo:
#    - "free_multi" (Por defecto): Usa los mejores motores gratuitos en cascada
#      (1° yisol/IDM-VTON -> 2° Nymbo/Virtual-Try-On -> 3° levihsu/OOTDiffusion)
#    - "fashn_commercial": Listo para cuando vendas tu ropa real y actives FASHN AI API
TRYON_PROVIDER = os.environ.get("TRYON_PROVIDER", getattr(settings, "TRYON_PROVIDER", "free_multi"))
FASHN_API_KEY = os.environ.get("FASHN_API_KEY", getattr(settings, "FASHN_API_KEY", None))


def _detect_garment_morphology(product, sleeve_length_cm=None):
    """
    Detecta automáticamente si la prenda es una musculosa (sin mangas),
    una remera manga corta o un buzo/campera manga larga según su nombre,
    categoría y medida de manga.
    ¡Esto corrige el problema de que la IA le dibuje mangas a una musculosa!
    """
    text_to_check = f"{product.name} {getattr(product.category, 'name', '')}".lower()

    if any(word in text_to_check for word in ['musculosa', 'tank', 'sin manga', 'sleeveless', 'chaleco']):
        return (
            "sleeveless tank top shirt, bare arms, wide armholes, no sleeves",
            "Musculosa (Sin mangas)"
        )

    if any(word in text_to_check for word in ['buzo', 'hoodie', 'canguro', 'crewneck', 'campera', 'sweater', 'frisa']):
        return (
            "long sleeve heavyweight streetwear sweatshirt, ribbed cuffs, thick torso drape",
            "Buzo / Manga Larga"
        )

    if sleeve_length_cm and float(sleeve_length_cm) >= 50:
        return (
            "long sleeve streetwear upper garment",
            "Prenda Manga Larga"
        )

    return (
        "short sleeve graphic streetwear t-shirt, crew neck",
        "Remera Manga Corta"
    )


def _translate_fabric_and_fit(detail_obj, fallback_fit='oversize'):
    """
    Traduce los nuevos campos técnicos del Admin (ProductMeasurementDetail)
    a instrucciones precisas en inglés para el motor de difusión IDM-VTON.
    """
    fabric_map = {
        'cotton_heavy': ('heavyweight 24/1 structured rigid cotton fabric, structured drape', 'Algodón Pesado 20/1 - 24/1'),
        'cotton_light': ('soft lightweight combed cotton 30/1 fabric, fluid natural drape', 'Algodón Peinado 30/1'),
        'french_terry': ('thick heavyweight french terry fleece fabric, structured volume', 'Frisa / Rústico Pesado'),
        'polyester': ('smooth athletic technical jersey fabric', 'Poliéster / Deportivo'),
        'denim': ('rigid heavy denim workwear texture', 'Jean / Denim'),
    }

    fit_map = {
        'slim': ('slim fitted silhouette, close to torso and chest', 'Slim Fit (Al cuerpo)'),
        'regular': ('classic regular streetwear fit, straight comfortable cut', 'Regular Fit (Clásico)'),
        'oversize': ('oversized streetwear fit, dropped shoulder seams, wide relaxed chest', 'Oversize (Hombros caídos)'),
        'boxy': ('boxy cropped streetwear cut, wide chest and structured squared hem', 'Boxy Fit (Ancho y recto)'),
    }

    stretch_map = {
        'none': 'Rígido (No cede)',
        'low': 'Elasticidad leve (Cede 1-2 cm)',
        'high': 'Elastizado',
    }

    if detail_obj and hasattr(detail_obj, 'fabric_type'):
        fabric_en, fabric_es = fabric_map.get(detail_obj.fabric_type, fabric_map['cotton_heavy'])
        fit_en, fit_es = fit_map.get(detail_obj.fit_style, fit_map['oversize'])
        stretch_es = stretch_map.get(detail_obj.stretch_level, 'Elasticidad leve')
        extra_prompt = (detail_obj.ai_extra_prompt or '').strip()
        return fabric_en, fabric_es, fit_en, fit_es, stretch_es, extra_prompt

    # Respaldo si usa la tabla vieja
    fit_en, fit_es = fit_map.get(fallback_fit, fit_map['oversize'])
    return (
        'heavyweight structured streetwear cotton fabric',
        'Algodón Urbano JPEX',
        fit_en,
        fit_es,
        'Estándar',
        ''
    )


def get_product_sizes_data(product):
    """
    Unifica las medidas cargadas en el nuevo ProductMeasurementDetail (products/models.py)
    o en el anterior ProductMeasurement (laboratory/models.py), devolviendo una lista
    ordenada de diccionarios con todas las especificaciones por talle.
    """
    sizes_list = []

    # 1. Prioridad máxima: Nuevo modelo detallado ProductMeasurementDetail (Etapa 2)
    if hasattr(product, 'detailed_measurements'):
        detailed_qs = product.detailed_measurements.select_related('size').all()
        if detailed_qs.exists():
            for dm in detailed_qs:
                sizes_list.append({
                    'size_name': dm.size.name,
                    'chest_cm': float(dm.chest_width_cm),
                    'length_cm': float(dm.total_length_cm),
                    'shoulder_cm': float(dm.shoulder_width_cm) if dm.shoulder_width_cm else None,
                    'sleeve_cm': float(dm.sleeve_length_cm) if dm.sleeve_length_cm else None,
                    'hem_cm': float(dm.hem_width_cm) if dm.hem_width_cm else None,
                    'detail_obj': dm,
                    'source': 'detailed',
                })
            sizes_list.sort(key=lambda x: x['chest_cm'])
            return sizes_list

    # 2. Segunda prioridad: Modelo ProductMeasurement de laboratory
    if hasattr(product, 'measurements'):
        legacy_qs = product.measurements.all().order_by('chest_cm')
        if legacy_qs.exists():
            for lm in legacy_qs:
                sizes_list.append({
                    'size_name': lm.size,
                    'chest_cm': float(lm.chest_cm),
                    'length_cm': float(lm.length_cm),
                    'shoulder_cm': round(float(lm.chest_cm) * 0.92, 1),
                    'sleeve_cm': None,
                    'hem_cm': None,
                    'detail_obj': None,
                    'fallback_fit': lm.fit_type,
                    'source': 'legacy',
                })
            return sizes_list

    # 3. Respaldo automático si el administrador aún no cargó medidas para esta prenda
    default_table = [
        ('S', 53.0, 70.0, 49.0),
        ('M', 56.0, 72.0, 52.0),
        ('L', 59.0, 75.0, 55.0),
        ('XL', 62.0, 77.0, 58.0),
    ]
    for s_name, chest, length, shoulder in default_table:
        sizes_list.append({
            'size_name': s_name,
            'chest_cm': chest,
            'length_cm': length,
            'shoulder_cm': shoulder,
            'sleeve_cm': None,
            'hem_cm': None,
            'detail_obj': None,
            'fallback_fit': 'oversize',
            'source': 'default',
        })
    return sizes_list


def calculate_size_and_prompt(product, height_cm, weight_kg, preferred_fit, requested_size=None):
    """
    Motor Biométrico V2:
    1. Calcula el ancho de torso plano estimado y ancho de hombros del usuario.
    2. Evalúa las fichas técnicas detalladas (ProductMeasurementDetail).
    3. Determina el talle ideal recomendado Y permite simular un talle específico
       si el usuario eligió probarse p.ej. un S o un XL a propósito.
    4. Construye un prompt morfológico ultra específico para la IA.
    Devuelve: (selected_size, fit_explanation, ai_prompt, extra_diagnostics_dict)
    """
    # Estimación antropométrica de ancho de pecho plano y hombros del cliente
    base_chest_cm = 38.0 + (weight_kg * 0.16) + ((height_cm - 170) * 0.05)
    base_shoulder_cm = 39.0 + (weight_kg * 0.09) + ((height_cm - 170) * 0.04)

    if preferred_fit == 'ajustado':
        desired_ease_cm = 3.0
        user_fit_intent_en = "fitted closer to body"
    elif preferred_fit == 'regular':
        desired_ease_cm = 6.5
        user_fit_intent_en = "classic regular fit on torso"
    else:
        desired_ease_cm = 10.5
        user_fit_intent_en = "relaxed oversized streetwear fit with dropped shoulders"

    target_garment_width = round(base_chest_cm + desired_ease_cm, 1)
    sizes_data = get_product_sizes_data(product)

    # Talle ideal según el algoritmo
    ideal_entry = min(sizes_data, key=lambda item: abs(item['chest_cm'] - target_garment_width))
    ideal_size_name = ideal_entry['size_name']

    # Si el usuario pidió probar un talle puntual (ej: "XL"), buscamos ese talle
    chosen_entry = ideal_entry
    user_forced_size = False
    if requested_size and requested_size != 'auto':
        for item in sizes_data:
            if item['size_name'].upper() == requested_size.upper():
                chosen_entry = item
                user_forced_size = True
                break

    final_size = chosen_entry['size_name']
    garment_width = round(chosen_entry['chest_cm'])
    garment_length = round(chosen_entry['length_cm'])
    garment_shoulder = round(chosen_entry['shoulder_cm']) if chosen_entry['shoulder_cm'] else None
    garment_sleeve = round(chosen_entry['sleeve_cm']) if chosen_entry['sleeve_cm'] else None

    # Diferencia real (holgura/ease) entre la prenda elegida y el torso del cliente
    real_diff = round(chosen_entry['chest_cm'] - base_chest_cm, 1)

    if real_diff < 2:
        sensacion_calce = "muy ajustado al cuerpo (al límite de tu contorno de torso)"
        visual_drape_en = "tight skin-tight fit stretched across chest"
        calce_badge = "Muy Ajustado"
    elif real_diff <= 4.5:
        sensacion_calce = "al cuerpo en pecho y hombros (calce Slim)"
        visual_drape_en = "slim fitted cut, snug around chest and shoulders"
        calce_badge = "Al Cuerpo / Slim"
    elif real_diff <= 8.0:
        sensacion_calce = "cómodo, de caída recta y clásica (calce Regular)"
        visual_drape_en = "regular classic fit, natural straight drape on torso"
        calce_badge = "Clásico / Regular"
    elif real_diff <= 12.5:
        sensacion_calce = "holgado, con caída de hombros y estética urbana (Oversize)"
        visual_drape_en = "oversized boxy streetwear fit, dropped shoulders, relaxed wide drape"
        calce_badge = "Oversize Urbano"
    else:
        sensacion_calce = "extra holgado / Mega Oversize con bastante amplitud en torso"
        visual_drape_en = "extra baggy mega-oversized streetwear fit, very wide chest and low dropped shoulders"
        calce_badge = "Extra Holgado"

    # Obtenemos datos morfológicos y de tela
    garment_type_en, garment_type_es = _detect_garment_morphology(product, garment_sleeve)
    fabric_en, fabric_es, fit_en, fit_es, stretch_es, extra_prompt = _translate_fabric_and_fit(
        chosen_entry.get('detail_obj'),
        chosen_entry.get('fallback_fit', 'oversize')
    )

    # Armamos la tabla comparativa de todos los talles para mostrar en pantalla
    size_comparison = []
    for item in sizes_data:
        diff_item = round(item['chest_cm'] - base_chest_cm, 1)
        if diff_item < 2:
            tag = "Muy chico / Ajustado"
        elif diff_item <= 4.5:
            tag = "Al cuerpo (Slim)"
        elif diff_item <= 8.0:
            tag = "Clásico (Regular)"
        elif diff_item <= 12.5:
            tag = "Holgado (Oversize)"
        else:
            tag = "Extra Holgado"

        size_comparison.append({
            'size': item['size_name'],
            'chest_cm': round(item['chest_cm']),
            'length_cm': round(item['length_cm']),
            'shoulder_cm': round(item['shoulder_cm']) if item['shoulder_cm'] else '-',
            'diff_cm': f"+{round(diff_item)}" if diff_item >= 0 else str(round(diff_item)),
            'fit_tag': tag,
            'is_ideal': item['size_name'] == ideal_size_name,
            'is_selected': item['size_name'] == final_size,
        })

    # Explicación detallada para el cliente
    shoulder_text = f", {garment_shoulder} cm de hombros" if garment_shoulder else ""
    if user_forced_size and final_size != ideal_size_name:
        fit_explanation = (
            f"Elegiste probar manualmente el Talle {final_size} ({garment_width} cm de axila a axila, "
            f"{garment_length} cm de largo{shoulder_text}). Para tu contextura ({height_cm} cm y {weight_kg} kg), "
            f"este talle te quedará {sensacion_calce}. "
            f"💡 Nota: Para el calce {preferred_fit} que indicaste, tu talle ideal recomendado por JPEX es el {ideal_size_name}."
        )
    else:
        fit_explanation = (
            f"Para tu contextura ({height_cm} cm y {weight_kg} kg) buscando un calce {preferred_fit}, "
            f"tu talle ideal es el {final_size}. Esta prenda en talle {final_size} mide {garment_width} cm de axila a axila, "
            f"{garment_length} cm de largo{shoulder_text} ({fit_es} en {fabric_es}), por lo que te quedará {sensacion_calce}."
        )

    # Prompt enriquecido para IDM-VTON / OOTDiffusion
    prompt_parts = [
        f"{product.name}",
        garment_type_en,
        fabric_en,
        visual_drape_en,
        "high resolution centered chest graphic print preserved accurately",
        f"garment chest width {garment_width}cm on {height_cm}cm person",
    ]
    if extra_prompt:
        prompt_parts.append(extra_prompt)

    ai_prompt = ", ".join(prompt_parts)

    diagnostics = {
        'ideal_size': ideal_size_name,
        'selected_size': final_size,
        'user_forced_size': user_forced_size,
        'garment_type_es': garment_type_es,
        'fabric_es': fabric_es,
        'fit_es': fit_es,
        'stretch_es': stretch_es,
        'calce_badge': calce_badge,
        'garment_width': garment_width,
        'garment_length': garment_length,
        'garment_shoulder': garment_shoulder,
        'size_comparison': size_comparison,
    }

    return final_size, fit_explanation, ai_prompt, diagnostics


def get_product_image_info(product):
    """
    Busca automáticamente la imagen del producto y devuelve (path_absoluto, url_publica).
    Soporta:
    1. Fotos subidas desde el Panel Admin (product.image en carpeta media/).
    2. Imágenes preexistentes mapeadas en products/cutouts.py o carpeta static/.
    """
    if not product:
        return None, None

    # 1. Prioridad: Imagen subida por el usuario desde el Admin (ImageField / FileField)
    priority_fields = ['image', 'imagen', 'photo', 'foto', 'front_image', 'cutout', 'cutout_image']
    for field_name in priority_fields:
        field = getattr(product, field_name, None)
        if field and getattr(field, 'name', None):
            img_url = None
            img_path = None
            try:
                img_url = field.url
            except Exception:
                img_url = f"{settings.MEDIA_URL}{field.name}"

            try:
                if hasattr(field, 'path') and os.path.exists(field.path):
                    img_path = field.path
                else:
                    candidate_path = os.path.join(settings.MEDIA_ROOT, str(field.name))
                    if os.path.exists(candidate_path):
                        img_path = candidate_path
            except Exception:
                pass

            if img_url:
                return img_path, img_url

    # Revisión general por si el campo FileField tiene otro nombre en el modelo
    for model_field in product._meta.fields:
        if isinstance(model_field, FileField):
            val = getattr(product, model_field.name, None)
            if val and getattr(val, 'name', None):
                try:
                    img_url = val.url
                except Exception:
                    img_url = f"{settings.MEDIA_URL}{val.name}"
                img_path = None
                try:
                    if hasattr(val, 'path') and os.path.exists(val.path):
                        img_path = val.path
                except Exception:
                    pass
                return img_path, img_url

    # 2. Respaldo: Si es una prenda vieja que usa products/cutouts.py en static/
    try:
        from products.cutouts import get_cutout_for_product
        cutout_rel = get_cutout_for_product(product)
        if cutout_rel:
            static_url = settings.STATIC_URL if settings.STATIC_URL.endswith('/') else f"{settings.STATIC_URL}/"
            img_url = cutout_rel if cutout_rel.startswith('/') else f"{static_url}{cutout_rel.lstrip('/')}"
            # Buscar el archivo físico en STATICFILES_DIRS o static/ para pasarlo a la IA
            search_dirs = list(getattr(settings, 'STATICFILES_DIRS', []))
            search_dirs.append(os.path.join(settings.BASE_DIR, 'static'))
            for s_dir in search_dirs:
                candidate = os.path.join(s_dir, cutout_rel.replace('/static/', '').lstrip('/'))
                if os.path.exists(candidate):
                    return candidate, img_url
            return None, img_url
    except Exception:
        pass

    return None, None


def prepare_rgb_jpg_for_ai(img_path, temp_name, is_garment=False):
    """
    Preprocesador de Estudio 3:4 (768x1024) para Modelos de Difusión Virtual Try-On:
    1. Aplica ImageOps.exif_transpose() para evitar que fotos sacadas con el celular
       entren rotadas 90 grados a la IA.
    2. Elimina transparencias (RGBA -> RGB sobre blanco puro).
    3. Si es una prenda (is_garment=True), la centra en un lienzo de estudio 768x1024 (ratio 3:4)
       con un pequeño margen blanco para que IDM-VTON no deforme las estampas ni el ancho.
    """
    temp_dir = os.path.join(settings.MEDIA_ROOT, 'laboratory', 'temp')
    os.makedirs(temp_dir, exist_ok=True)
    out_path = os.path.join(temp_dir, f"{temp_name}.jpg")

    target_size = (768, 1024)  # Proporción nativa 3:4 de IDM-VTON y OOTDiffusion

    with Image.open(img_path) as raw_img:
        # Corregir rotación EXIF de celulares (iPhone / Android)
        img = ImageOps.exif_transpose(raw_img)

        # Pasar cualquier transparencia a fondo blanco puro
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            rgba_img = img.convert('RGBA')
            white_bg = Image.new('RGB', rgba_img.size, (255, 255, 255))
            white_bg.paste(rgba_img, mask=rgba_img.split()[3])
            rgb_img = white_bg
        else:
            rgb_img = img.convert('RGB')

        if is_garment:
            # Centramos la prenda en un lienzo 768x1024 sin recortarla ni estirarla
            rgb_img.thumbnail((680, 900), Image.Resampling.LANCZOS)
            studio_canvas = Image.new('RGB', target_size, (255, 255, 255))
            offset_x = (target_size[0] - rgb_img.width) // 2
            offset_y = (target_size[1] - rgb_img.height) // 2
            studio_canvas.paste(rgb_img, (offset_x, offset_y))
            final_img = studio_canvas
        else:
            # Para la foto del usuario mantenemos buena resolución vertical sin deformar
            rgb_img.thumbnail((1024, 1365), Image.Resampling.LANCZOS)
            final_img = rgb_img

        final_img.save(out_path, 'JPEG', quality=95)

    return out_path


def _extract_gradio_result_path(result):
    """
    Extrae de forma segura la ruta del archivo de imagen devuelto por distintos
    Spaces de Gradio (ya sea tupla, lista de galería o diccionario).
    """
    if not result:
        return None

    if isinstance(result, str):
        return result

    if isinstance(result, dict):
        return result.get('image') or result.get('path') or result.get('url')

    if isinstance(result, (list, tuple)) and len(result) > 0:
        first_item = result[0]
        if isinstance(first_item, str):
            return first_item
        if isinstance(first_item, dict):
            return first_item.get('image') or first_item.get('path')
        if isinstance(first_item, (list, tuple)) and len(first_item) > 0:
            return _extract_gradio_result_path(first_item[0])

    return None


def _run_idm_vton_space(space_id, clean_user_jpg, clean_garment_jpg, ai_prompt):
    """
    Ejecuta inferencia en cualquier Space compatible con la arquitectura IDM-VTON
    (como 'yisol/IDM-VTON' o su espejo 'Nymbo/Virtual-Try-On').
    Usa is_checked_crop=True para que el modelo encuadre automáticamente en 3:4
    y 35 pasos de denoise para mayor fidelidad en estampas.
    """
    if HF_TOKEN:
        client = Client(space_id, hf_token=HF_TOKEN)
    else:
        client = Client(space_id)

    result = client.predict(
        dict={"background": handle_file(clean_user_jpg), "layers": [], "composite": None},
        garm_img=handle_file(clean_garment_jpg),
        garment_des=ai_prompt,
        is_checked=True,
        is_checked_crop=True,  # Auto-crop 3:4 activado para evitar distorsión de hombros/cuerpo
        denoise_steps=35,      # Mayor nitidez en logos y textura de algodón
        seed=42,
        api_name="/tryon"
    )
    return _extract_gradio_result_path(result)


def _run_ootdiffusion_space(clean_user_jpg, clean_garment_jpg):
    """
    Motor de respaldo gratuito #3: levihsu/OOTDiffusion (Modelo HD de medio cuerpo superior).
    Se activa automáticamente si los servidores de IDM-VTON están saturados.
    """
    if HF_TOKEN:
        client = Client("levihsu/OOTDiffusion", hf_token=HF_TOKEN)
    else:
        client = Client("levihsu/OOTDiffusion")

    result = client.predict(
        vton_img=handle_file(clean_user_jpg),
        garm_img=handle_file(clean_garment_jpg),
        n_samples=1,
        n_steps=25,
        image_scale=2.0,
        seed=42,
        api_name="/process_hd"
    )
    return _extract_gradio_result_path(result)


def generate_tryon_image(session_id, user_img_path, garment_img_path, ai_prompt):
    """
    Router Principal de Generación Virtual Try-On:
    1. Normaliza la foto del usuario (EXIF + RGB) y la foto de la prenda (Estudio 768x1024).
    2. Recorre una cascada de motores gratuitos de alta calidad (IDM-VTON Principal ->
       IDM-VTON Mirror -> OOTDiffusion HD) para máxima disponibilidad y calidad sin pagar.
    Devuelve: (ruta_relativa_resultado, mensaje_error)
    """
    try:
        clean_user_jpg = prepare_rgb_jpg_for_ai(user_img_path, f"user_{session_id}", is_garment=False)
        clean_garment_jpg = prepare_rgb_jpg_for_ai(garment_img_path, f"garment_{session_id}", is_garment=True)
    except Exception as prep_err:
        return None, f"Error al preprocesar las imágenes con Pillow: {prep_err}"

    # Lista de motores gratuitos en orden de calidad para estampas urbanas
    free_engines = [
        ("IDM-VTON Principal (yisol/IDM-VTON)", lambda: _run_idm_vton_space("yisol/IDM-VTON", clean_user_jpg, clean_garment_jpg, ai_prompt)),
        ("IDM-VTON Mirror (Nymbo/Virtual-Try-On)", lambda: _run_idm_vton_space("Nymbo/Virtual-Try-On", clean_user_jpg, clean_garment_jpg, ai_prompt)),
        ("OOTDiffusion HD (levihsu/OOTDiffusion)", lambda: _run_ootdiffusion_space(clean_user_jpg, clean_garment_jpg)),
    ]

    errors_log = []

    for engine_name, engine_runner in free_engines:
        try:
            print(f"[JPEX LAB] Probando generación con motor: {engine_name} (Sesión #{session_id})...")
            generated_temp_path = engine_runner()

            if generated_temp_path and os.path.exists(generated_temp_path):
                results_dir = os.path.join(settings.MEDIA_ROOT, 'laboratory', 'results')
                os.makedirs(results_dir, exist_ok=True)

                filename = f"tryon_session_{session_id}.png"
                final_abs_path = os.path.join(results_dir, filename)
                shutil.copy(generated_temp_path, final_abs_path)

                print(f"[JPEX LAB] ¡Éxito con {engine_name}! Guardado en: {final_abs_path}")
                return f"laboratory/results/{filename}", None

        except Exception as err:
            short_err = str(err)
            print(f"[JPEX LAB] Motor {engine_name} ocupado o con error: {short_err}")
            errors_log.append(f"{engine_name}: {short_err}")
            continue

    combined_errors = " | ".join(errors_log) if errors_log else "No se recibió imagen de los servidores gratuitos."
    return None, combined_errors