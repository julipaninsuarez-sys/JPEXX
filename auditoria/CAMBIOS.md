# Cambios de la auditoría del inicio (2026-11-17)

Revisamos a fondo la página de inicio y arreglamos lo que más afectaba a los clientes, sobre todo en el celular.
- El informe completo, con las mediciones, está en [INFORME-2026-11-16.md](INFORME-2026-11-16.md).
- El mapa de la página está en [MAPA.md](MAPA.md).

## Juli: lo que toca tus archivos

Intentamos no tocar tu lógica. Solo se sumó esto:

- **`laboratory/views.py`, en `live_search_api`:**
  - **Qué cambió:** cada resultado tiene un campo más, `'detail_url': f"/producto/{prod.slug}/"`, escrito igual que `lab_url`.
  - **Qué no cambió:** la búsqueda y los otros campos.
  - **Para qué:** el buscador de arriba ahora lleva a la página de la prenda. "Probar IA" sigue yendo al Lab.
- **`products/models.py`:** no se tocó. No hay migraciones.
- **`products/views.py`, en `home`:**
  - **Qué cambió:** las categorías ahora traen cuántas prendas disponibles tienen (`available_count`).
  - **Para qué:** las que todavía no tienen prendas (Buzos, Musculosas) se muestran con "Próximamente" y sin link. Antes llevaban a una página con "0 prendas disponibles".

## Qué mejoró para el cliente

| Antes | Ahora |
|---|---|
| El buscador solo llevaba al Lab. | Tocar la foto o el nombre abre la prenda, y "Probar IA" lleva al Lab. |
| Si el buscador fallaba, quedaba el resultado viejo. Si alguien escribía HTML en el buscador, se ejecutaba. | Avisa "No pudimos buscar…" y todo se muestra como texto. Si escribís de nuevo, cancela la búsqueda anterior. |
| Buzos y Musculosas llevaban a una página vacía. | Dicen "Próximamente" y no llevan a ningún lado. Cuando se cargue la primera prenda, se activan solas. |
| En el celular, la remera de la categoría tapaba "Ver prendas". | Está corrida, entre el nombre y "Ver prendas". |
| Una dirección inexistente mostraba el error de Django. No había ícono en la pestaña. El link compartido no tenía vista previa. | Hay una página 404 propia (`templates/404.html`, se ve con `DEBUG = False`), un favicon y una descripción con imagen para WhatsApp e Instagram. |
| El inicio pesaba 1.267 KB en el celular, y con datos móviles el fondo tardaba 16,8 s en aparecer. | Pesa 638 KB y el fondo aparece en 6,9 s, medido con 3G simulado. |
| El inicio hacía 13 consultas a la base, porque los talles se pedían dos veces por tarjeta. | Hace 7: los talles se cargan juntos con `prefetch_related('sizes')` en el inicio, el catálogo y las relacionadas. |
| El número de WhatsApp estaba escrito a mano en el pie, el carrito y el detalle. | Está en un solo lugar: `JPEX_WHATSAPP` y `JPEX_WHATSAPP_TEXTO` en `config/settings.py`, que llegan a todas las plantillas por `products/context_processors.py`. |
| Si no había prendas, un cliente veía "Cargá tu primera prenda desde /admin/". | Ve "Muy pronto, nuevas prendas. Mientras tanto, escribinos por WhatsApp." |
| En el buscador, el precio era gris claro sobre fondo claro y casi no se leía. | El precio está en negro y en semi-negrita, y el texto secundario tiene un contraste de 5,8:1. |
| El mismo precio salía "$31" en la tarjeta y "$31.00" en el buscador. Con precios reales hubiera sido "$24000" en la tarjeta y "$24.000" en el carrito. | Tarjetas, abanico, detalle, buscador y carrito usan el mismo formato: **$24.000**, sin decimales y con punto de miles. |

## Archivos

**Nuevos:**
- `products/templatetags/jpex_fotos.py`: filtros `foto_chica` y `foto_original_chica` para usar las fotos chicas en las plantillas.
- `products/templatetags/jpex_precios.py`: filtro `precio`, que pasa 24000.00 a 24.000. Lo usan `_card.html`, `home.html` y `detail.html`. El `data-price` del detalle, que lee el carrito, sigue siendo un número sin formato.
- `templates/404.html`
- `static/img/favicon.svg` y `static/img/og-jpex.jpg`: el ícono de la pestaña y la imagen de 1200×630 para compartir.
- `static/img/hero/*-540.webp` y `*-800.webp`: recortes del centro de cada fondo del hero, porque en el celular y la tablet solo se ve esa franja.
- `static/vendor/fonts/`: las fuentes Anton, Barlow y Barlow Condensed servidas desde el sitio, con su licencia OFL. Ya no se usa Google Fonts.
- `auditoria/`: el informe, el mapa, las capturas y este archivo.

**Modificados:**
- `products/cutouts.py`: suma `small_url()`, que guarda copias de 540 px en `media/products/cutouts/chicas/`. Se generan solas la primera vez que se piden, así que en otra compu se vuelven a crear.
- `templates/base.html`:
  - Descripción, Open Graph y favicon.
  - Las fuentes se cargan desde el sitio.
  - El buscador se reescribió con la misma lógica, pero arma todo como texto, avisa los errores y tiene el link a la prenda.
- `templates/products/home.html`:
  - Fondos del hero dentro de `<picture>`, con un recorte según la pantalla.
  - Abanico con prioridad baja y foto chica.
  - Categorías con "Próximamente".
- `templates/products/_card.html`: usa la foto chica.
- `static/js/hero-slides.js`: la segunda foto se baja después de que carga la página, y también carga los recortes de celular.
- `static/css/jpex.css`: posición de la remera de la categoría en el celular, y "Próximamente" sin efecto al pasar el mouse.

## Cosas para saber

- **Bootstrap sigue en el CDN.** Lo probamos desde el sitio y con `runserver` empeoró, porque no comprime los archivos. Cuando se publique en un hosting que comprima, conviene volver a probarlo.
- **Al agregar un archivo nuevo de `templatetags`,** `runserver` tiene que reiniciarse para reconocerlo. Si aparece *"'jpex_fotos' is not a registered tag library"*, hay que reiniciar el servidor.
- **Juli, cambios en `config/settings.py`:**
  - Se sumó el context processor `products.context_processors.contacto`.
  - Se sumaron las constantes `JPEX_WHATSAPP` y `JPEX_WHATSAPP_TEXTO`.
  - En `laboratory/views.py` el número sigue escrito a mano (`numero_whatsapp = "5492213146934"`). Si querés, podés usar `settings.JPEX_WHATSAPP`, así se cambia en un solo lugar.
- **Juli, un pedido:** en `templates/laboratory/lab.html` (el desplegable del probador) el precio sale como `${{ prod.price }}`, o sea "$31.00". Para que coincida con el resto, sería `{% load jpex_precios %}` y `${{ prod.price|precio }}`. No lo tocamos porque es parte del probador.
- **Los precios ($24, $31) y el nombre "megadeth 3" son de prueba.** Se cambian desde el admin al cargar los reales.
- **La página todavía no está publicada.** Antes de publicarla hay que pasar `SECRET_KEY`, `DEBUG` y `ALLOWED_HOSTS` a variables de entorno y sumar `requirements.txt` (S2 del informe).
- **Quedan pendientes de la auditoría:**
  - El Lab casi no aparece en el inicio (X3).
  - Partir `tienda-bocetos.js` (P3a).
  - Mover el código del buscador y del carrito a archivos propios (T1).
  - X4: con pocas prendas, la grilla de destacados deja un hueco. Se arregla solo con más prendas.
  - S2: la configuración de seguridad, para antes de publicar.
