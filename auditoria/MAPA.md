# Mapa: página de inicio

Alcance de esta auditoría: `/` (inicio) y todo lo que carga desde `base.html`, que comparten todas las páginas. Fecha: 2026-11-16.

## Ruta

| Ruta | Vista | Plantilla | CSS / JS que carga | Datos que usa | Qué hace la persona ahí |
|---|---|---|---|---|---|
| `/` | `products.views.home` ([views.py:5](../products/views.py#L5)) | `products/home.html`, que hereda de `base.html` e incluye `_card.html` y `_capsule_cart.html` | **CSS:** Google Fonts (Anton, Barlow Condensed, Barlow), Bootstrap 5.3.3 desde jsDelivr, `jpex.css`, `tienda-bocetos.css`. **JS:** `tienda-bocetos.js` (en `<head>`, sin `defer`), el buscador y el carrito escritos dentro de `base.html`, Bootstrap bundle desde jsDelivr, `jpex-tienda.js` (defer), `hero-slides.js` (defer). | Todas las `Category`, las `Product` con `available=True`: 4 destacadas y 3 para el abanico del hero. Una "portada" por categoría (`Category.cover_product`) y los talles de cada tarjeta. | Ver qué es JPEX, entrar al catálogo o a una categoría, abrir una prenda, buscar, abrir la cápsula (carrito), ir al Lab desde la barra de anuncios o el menú. |

**Lo que comparte con todas las páginas (`base.html`):**
- La barra de anuncios, que `tienda-bocetos.js` convierte en una cinta que corre.
- La barra de navegación con el logo, el buscador en vivo (que consulta `/lab/api/search/`), la cápsula y el menú.
- El carrito lateral, que se guarda en `localStorage` y manda el pedido por WhatsApp.
- El pie con el WhatsApp.
- La animación `reveal` al aparecer en pantalla.

**Datos de hoy en la base:** 3 categorías (Buzos, Remeras, Musculosas). Hay 3 prendas y las 3 son Remeras: "megadeth 3" a $24, "METALLICA" a $31 e "IRON MAIDEN" a $31. Buzos y Musculosas tienen 0.

## Recorrido típico

1. La persona entra desde el celular.
2. Ve la cinta de anuncios corriendo, el logo, el buscador abierto y el hero con "JPEX STORE" sobre un fondo ilustrado que cambia cada 8 s.
3. Abajo aparece el abanico con 3 remeras.
4. Bajando, la cinta amarilla de categorías, los tres bloques de categoría y los "Productos destacados" (las mismas 3 remeras del abanico).
5. Al final, el pie con el WhatsApp.
6. De ahí puede:
   - Tocar una remera, que lleva al detalle.
   - Tocar una categoría: Buzos y Musculosas llevan a una página vacía.
   - Buscar: el único botón del resultado lleva al **Lab**, no a la prenda.
   - Abrir la cápsula.

## Archivos que carga el inicio sin usarlos en esta página

Todo esto se usa en otras páginas, así que no sobra. Es peso que el inicio baja igual:

- **`tienda-bocetos.js` (29 KB):** el panel de bocetos, el botón fijo, la galería con lupa y la prenda que vuela solo actúan en el detalle o con `?bocetos`.
- **`tienda-bocetos.css` (13 KB):** estilos del detalle y del panel.
- **Bootstrap completo (227 KB de CSS sin comprimir y 79 KB de JS):** en el inicio solo se usan la grilla, algunas utilidades, el menú colapsable y el carrito lateral.

## Código sin conexión

- La rama `product.size_list` en [_card.html:20-21](../templates/products/_card.html#L20-L21): `Product` no tiene ese atributo y nunca se usa.
