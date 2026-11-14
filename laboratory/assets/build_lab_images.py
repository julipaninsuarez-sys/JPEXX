"""Genera las imágenes del fondo del Lab a partir de la ilustración original.

Uso (desde la raíz del repo, con el Python del venv):
    ..\\.venv\\Scripts\\python.exe laboratory\\assets\\build_lab_images.py

Qué hace:
1. Corrige la ilustración: borra el mango de más de la taza de la izquierda.
2. Exporta el fondo en tres tamaños (static/img/lab/fondo-lab-*.webp).
3. Arma una versión "con las luces apagadas" (sin el resplandor rojo, pero con los
   vidrios y brillos blancos) y recorta un pedazo por tubo, con bordes difusos
   (static/img/lab/tubo-off-*.webp). lab-fx.js los muestra encima cuando un tubo se apaga.
   Las cajas de TUBES tienen que coincidir con TUBE_SPRITES en static/js/lab-fx.js.
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).with_name('fondo-lab-original.png')
OUT = ROOT / 'static' / 'img' / 'lab'
SHARPEN = ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=2)

# Partes de cada tubo en % del escenario (x, y, ancho, alto): vidrio, tapa, base y reflejo.
TUBES = [
    [(15.2, 14.8, 9.8, 38.2), (20.0, 52.0, 6.8, 5.2), (15.0, 86.0, 5.6, 14.0)],   # grande izquierdo
    [(27.4, 29.2, 6.4, 26.8), (27.0, 54.6, 7.4, 4.4), (30.0, 63.5, 4.4, 30.0)],   # mediano izquierdo
    [(33.8, 36.2, 4.4, 19.8), (33.1, 54.6, 5.8, 4.2), (33.6, 63.5, 3.8, 23.0)],   # chico izquierdo
    [(61.0, 36.2, 4.6, 19.8), (59.6, 54.6, 7.4, 4.2), (59.6, 63.5, 4.4, 32.0)],   # chico derecho
    [(66.0, 29.6, 6.2, 26.4), (65.1, 54.6, 7.6, 4.4), (67.8, 68.5, 3.8, 31.5)],   # mediano derecho
    # Roto: solo la columna de vidrio; las ventanas rojas de la derecha (x > 85%) no se tocan.
    [(75.8, 13.4, 8.8, 41.8), (74.4, 53.0, 8.4, 7.0), (75.4, 67.0, 7.2, 33.0)],
]
FEATHER = 0.9  # Difuminado de los bordes, en % del ancho del escenario.


def fix_mug(im):
    """Borra el mango izquierdo de la taza (x 129–143, y 526–552 en la imagen de 1672)."""
    px = im.load()
    x0, y0, x1, y1 = 128, 525, 143, 552
    mask = set()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if y >= 546 and x <= 132:   # Borde del teclado: se deja.
                continue
            if max(px[x, y]) > 26:
                mask.add((x, y))
    # Un píxel más alrededor, para no dejar el borde suavizado del mango.
    grown = set(mask)
    for x, y in mask:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if x0 <= nx <= x1 and y0 <= ny <= y1 and not (ny >= 546 and nx <= 132):
                    grown.add((nx, ny))
    mask = grown
    # Relleno por difusión desde los píxeles vecinos que no son mango.
    pending = set(mask)
    while pending:
        done = {}
        for x, y in pending:
            near = [px[x + dx, y + dy] for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                    if (dx or dy) and (x + dx, y + dy) not in pending]
            if near:
                done[(x, y)] = tuple(sum(c[i] for c in near) // len(near) for i in range(3))
        if not done:
            break
        for (x, y), color in done.items():
            px[x, y] = color
        pending -= set(done)
    return im


def lights_off(im, max_shade=110):
    """Saca el resplandor rojo: lo que es rojo puro se apaga, lo blanco (vidrios) queda.
    max_shade: cuánto se oscurece como máximo lo que estaba iluminado (0–255)."""
    r, g, b = im.split()
    gb = ImageChops.lighter(g, b)
    # Cuánto "rojo de luz" tiene cada píxel. Se compara contra 1,4 veces el verde o azul
    # para no tocar los naranjas (el traje) ni los rosados claros (los vidrios).
    excess = ImageChops.subtract(r, gb.point(lambda v: min(255, int(v * 1.4))))
    r_off = ImageChops.subtract(r, excess)
    off = Image.merge('RGB', (r_off, g, b))
    # Sin la luz, las superficies que iluminaba también quedan más oscuras.
    shade = excess.point(lambda v: 255 - min(int(v * 0.9), max_shade))
    return _shade(off, shade)


def _shade(img, shade):
    """Multiplica la imagen por la máscara de sombra (255 = igual, menos = más oscuro)."""
    return ImageChops.multiply(img, Image.merge('RGB', (shade, shade, shade)))


def tube_sprite(off, parts, width, height):
    """Recorta el pedazo apagado de un tubo con bordes difusos. Devuelve (imagen, caja en %)."""
    left = min(p[0] for p in parts) - FEATHER
    top = min(p[1] for p in parts) - FEATHER
    right = max(p[0] + p[2] for p in parts) + FEATHER
    bottom = min(100.0, max(p[1] + p[3] for p in parts) + FEATHER)
    left, top = max(0.0, left), max(0.0, top)
    to_px = lambda v, size: int(round(v / 100 * size))
    box = (to_px(left, width), to_px(top, height), to_px(right, width), to_px(bottom, height))
    mask = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(mask)
    for x, y, w, h in parts:
        draw.rectangle([to_px(x, width), to_px(y, height), to_px(x + w, width), to_px(y + h, height)], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(FEATHER / 100 * width / 2))
    sprite = off.crop(box).convert('RGBA')
    sprite.putalpha(mask.crop(box))
    pct = (left, top, right - left, bottom - top)
    return sprite, pct


CAPSULE_SRC = Path(__file__).with_name('capsula-original.png')
# Las dos cápsulas vienen en una sola imagen: cerrada a la izquierda y abierta a la derecha.
# Misma caja para las dos (la abierta está 641 px más a la derecha) para que queden alineadas.
CAPSULE_BOXES = {'cerrada': 10, 'abierta': 651}
CAPSULE_SIZE = (612, 1175)


def leds_off(lit, off):
    """Apaga las barritas de luz: su centro es casi blanco rosado y lights_off no lo toca.
    Lo que era muy brillante y rojizo queda oscuro, con un pequeño fundido en el borde."""
    r, g, b = lit.split()
    gb = ImageChops.lighter(g, b)
    hot = ImageChops.multiply(r.point(lambda v: 255 if v > 190 else 0),
                              ImageChops.subtract(r, gb).point(lambda v: 255 if v > 25 else 0))
    hot = hot.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1))
    dark = off.point(lambda v: v * 0.2)
    return Image.composite(dark, off, hot)


def capsule_images():
    """Exporta las cápsulas y su versión "luz apagada" (sin el resplandor rojo, con su transparencia)."""
    src = Image.open(CAPSULE_SRC).convert('RGBA')
    for name, x in CAPSULE_BOXES.items():
        crop = src.crop((x, 11, x + CAPSULE_SIZE[0], 11 + CAPSULE_SIZE[1]))
        crop.save(OUT / f'capsula-{name}.webp', 'WEBP', quality=88, method=6)
        rgb, alpha = crop.convert('RGB'), crop.getchannel('A')
        off = leds_off(rgb, lights_off(rgb, max_shade=150)).convert('RGBA')
        off.putalpha(alpha)
        off.save(OUT / f'capsula-{name}-off.webp', 'WEBP', quality=88, method=6)
        print(f'cápsula {name}: {crop.size}')


def main():
    capsule_images()
    base = fix_mug(Image.open(SRC).convert('RGB'))
    w0, h0 = base.size

    base.save(OUT / 'fondo-lab-1672.webp', 'WEBP', quality=86, method=6)
    for width in (2560, 3344):
        big = base.resize((width, round(h0 * width / w0)), Image.LANCZOS).filter(SHARPEN)
        big.save(OUT / f'fondo-lab-{width}.webp', 'WEBP', quality=86, method=6)

    # Los pedazos apagados salen de la versión de 2560 (alcanza para todas las pantallas).
    big = base.resize((2560, round(h0 * 2560 / w0)), Image.LANCZOS).filter(SHARPEN)
    off = lights_off(big)
    for i, parts in enumerate(TUBES, start=1):
        sprite, pct = tube_sprite(off, parts, *big.size)
        sprite.save(OUT / f'tubo-off-{i}.webp', 'WEBP', quality=82, method=6)
        print(f'tubo {i}: x {pct[0]:.2f} y {pct[1]:.2f} w {pct[2]:.2f} h {pct[3]:.2f}  ({sprite.size[0]}x{sprite.size[1]})')


if __name__ == '__main__':
    main()
