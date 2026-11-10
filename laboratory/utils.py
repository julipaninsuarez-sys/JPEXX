import os
import shutil
from PIL import Image
from django.conf import settings
from django.db.models.fields.files import FileField
from gradio_client import Client, handle_file

# Opcional: Si Hugging Face te pide cuota ZeroGPU, podés pegar acá tu token gratuito (hf_...)
# Crealo gratis (sin tarjeta) en: https://huggingface.co/settings/tokens
HF_TOKEN = os.environ.get("HF_TOKEN", None)


def calculate_size_and_prompt(product, height_cm, weight_kg, preferred_fit):
    """
    1. Estima el ancho de pecho plano del cliente según su altura y peso.
    2. Busca en las medidas cargadas del producto (o usa una tabla estándar de respaldo).
    3. Devuelve (recommended_size, fit_explanation, ai_prompt).
    """
    base_chest_cm = 38 + (weight_kg * 0.16) + ((height_cm - 170) * 0.05)

    if preferred_fit == 'ajustado':
        desired_ease_cm = 3
        fit_style_en = "slim fitted cut, snug around chest and shoulders"
    elif preferred_fit == 'regular':
        desired_ease_cm = 6
        fit_style_en = "regular classic fit, natural drape on torso"
    else:
        desired_ease_cm = 10
        fit_style_en = "oversized boxy streetwear fit, dropped shoulders, loose wide sleeves"

    target_garment_width = round(base_chest_cm + desired_ease_cm)

    measurements = list(product.measurements.all().order_by('chest_cm'))

    if measurements:
        best_match = min(measurements, key=lambda m: abs(m.chest_cm - target_garment_width))
        recommended_size = best_match.size
        garment_width = best_match.chest_cm
        garment_length = best_match.length_cm
        garment_fit_type = best_match.get_fit_type_display()
    else:
        default_table = [
            ('S', 52, 69),
            ('M', 55, 71),
            ('L', 58, 74),
            ('XL', 61, 76),
        ]
        best_match = min(default_table, key=lambda item: abs(item[1] - target_garment_width))
        recommended_size = best_match[0]
        garment_width = best_match[1]
        garment_length = best_match[2]
        garment_fit_type = "Oversize Estándar JPEX"

    real_diff = round(garment_width - base_chest_cm)

    if real_diff <= 4:
        sensacion_calce = "al cuerpo en el pecho y hombros"
    elif real_diff <= 7:
        sensacion_calce = "cómodo y de caída clásica"
    else:
        sensacion_calce = "bien holgado, con hombros caídos y estética urbana"

    fit_explanation = (
        f"Para tu contextura ({height_cm} cm y {weight_kg} kg) buscando un calce {preferred_fit}, "
        f"tu talle ideal es el {recommended_size}. Esta prenda mide {garment_width} cm de axila a axila "
        f"y {garment_length} cm de largo ({garment_fit_type}), por lo que te quedará {sensacion_calce}."
    )

    ai_prompt = (
        f"{product.name}, graphic urban streetwear upper garment, {fit_style_en}, "
        f"realistic cotton fabric folds, garment width {garment_width}cm on {height_cm}cm person"
    )

    return recommended_size, fit_explanation, ai_prompt


def get_product_image_info(product):
    """
    Busca automáticamente cualquier campo de imagen dentro del producto
    (sin importar cómo se llame en products/models.py) y devuelve (path_absoluto, url_publica).
    """
    if not product:
        return None, None

    # 1. Revisamos nombres comunes primero (priorizando la imagen original antes del cutout transparente)
    priority_fields = ['image', 'imagen', 'photo', 'foto', 'front_image', 'cutout', 'cutout_image']
    for field_name in priority_fields:
        field = getattr(product, field_name, None)
        if field and hasattr(field, 'path') and hasattr(field, 'url'):
            try:
                if os.path.exists(field.path):
                    return field.path, field.url
            except Exception:
                continue

    # 2. Si tiene otro nombre en el modelo Product, inspeccionamos todos los FileField/ImageField
    for model_field in product._meta.fields:
        if isinstance(model_field, FileField):
            val = getattr(product, model_field.name, None)
            if val and hasattr(val, 'path') and hasattr(val, 'url'):
                try:
                    if os.path.exists(val.path):
                        return val.path, val.url
                except Exception:
                    continue

    return None, None


def prepare_rgb_jpg_for_ai(img_path, temp_name):
    """
    Convierte imágenes .webp o PNG con transparencia a un archivo .jpg RGB con fondo blanco.
    Esto evita que IDM-VTON falle al recibir prendas recortadas (.webp) o fotos pesadas.
    """
    temp_dir = os.path.join(settings.MEDIA_ROOT, 'laboratory', 'temp')
    os.makedirs(temp_dir, exist_ok=True)
    out_path = os.path.join(temp_dir, f"{temp_name}.jpg")

    with Image.open(img_path) as img:
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            rgba_img = img.convert('RGBA')
            white_bg = Image.new('RGB', rgba_img.size, (255, 255, 255))
            white_bg.paste(rgba_img, mask=rgba_img.split()[3])
            rgb_img = white_bg
        else:
            rgb_img = img.convert('RGB')

        # Redimensionamos si es gigante para que suba rápido desde localhost
        rgb_img.thumbnail((1024, 1024))
        rgb_img.save(out_path, 'JPEG', quality=92)

    return out_path


def generate_tryon_image(session_id, user_img_path, garment_img_path, ai_prompt):
    """
    Convierte las fotos a JPG limpio y se conecta a Hugging Face (yisol/IDM-VTON).
    Devuelve (ruta_relativa_resultado, mensaje_error).
    """
    try:
        clean_user_jpg = prepare_rgb_jpg_for_ai(user_img_path, f"user_{session_id}")
        clean_garment_jpg = prepare_rgb_jpg_for_ai(garment_img_path, f"garment_{session_id}")

        print(f"[JPEX LAB] Conectando con IDM-VTON para sesión #{session_id}...")
        if HF_TOKEN:
            client = Client("yisol/IDM-VTON", hf_token=HF_TOKEN)
        else:
            client = Client("yisol/IDM-VTON")

        result = client.predict(
            dict={"background": handle_file(clean_user_jpg), "layers": [], "composite": None},
            garm_img=handle_file(clean_garment_jpg),
            garment_des=ai_prompt,
            is_checked=True,
            is_checked_crop=False,
            denoise_steps=30,
            seed=42,
            api_name="/tryon"
        )

        generated_temp_path = result[0] if isinstance(result, (list, tuple)) else result

        if generated_temp_path and os.path.exists(generated_temp_path):
            results_dir = os.path.join(settings.MEDIA_ROOT, 'laboratory', 'results')
            os.makedirs(results_dir, exist_ok=True)

            filename = f"tryon_session_{session_id}.png"
            final_abs_path = os.path.join(results_dir, filename)
            shutil.copy(generated_temp_path, final_abs_path)

            print(f"[JPEX LAB] ¡Imagen generada con éxito!: {final_abs_path}")
            return f"laboratory/results/{filename}", None

    except Exception as error:
        error_msg = str(error)
        print(f"[JPEX LAB] Error detallado de Gradio IA: {error_msg}")
        return None, error_msg

    return None, "No se recibió imagen del servidor."