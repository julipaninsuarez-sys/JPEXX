/* Variantes de diseño de la tienda, y el panel para probar otras.
 *
 * Siempre: aplica las variantes elegidas (ver "state" más abajo) como data-sk-<grupo> en <html>
 * y les da su comportamiento (carrito "Tu cápsula", la prenda que vuela, cinta de anuncios,
 * botón fijo en el celu, galería con lupa).
 * Con ?bocetos en la dirección (por ejemplo /?bocetos): además abre un panel para probar otras
 * variantes. Lo que se elige ahí se guarda solo en ese navegador; "Salir" vuelve a lo de todos.
 *   - Estilos de buscador, cápsula y detalle: jpex.css.
 *   - Estilos de las demás ideas: tienda-bocetos.css.
 *
 * Va en el <head> sin defer, para aplicar las variantes antes de que se dibuje la página.
 * Para sumar una variante nueva: agregarla en GROUPS, darle estilos y, si hace falta, comportamiento.
 */
(function () {
    'use strict';

    var ON_KEY = 'jpex-tienda-bocetos-on';
    var STATE_KEY = 'jpex-tienda-bocetos-v1';
    var root = document.documentElement;
    var script = document.currentScript;

    var params = new URLSearchParams(window.location.search);
    var on = params.has('bocetos');
    try {
        if (params.has('bocetos')) sessionStorage.setItem(ON_KEY, '1');
        on = sessionStorage.getItem(ON_KEY) === '1';
    } catch (e) { /* Sin almacenamiento: solo funciona con ?bocetos en la dirección. */ }

    var OFF = 'x';   // Valor de "como está / sin la idea".
    var GROUPS = [
        { section: 'Ya armados' },
        { id: 'buscador', label: 'Buscador', options: [['a', 'A', 'Integrado'], ['b', 'B', 'Lupa'], ['c', 'C', 'Afiche']] },
        { id: 'capsula', label: 'Cápsula (carrito)', options: [['a', 'A', 'Tubo'], ['b', 'B', 'Se llena'], ['c', 'C', 'Píldora'], ['d', 'D', 'Con remera']] },
        { id: 'detalle', label: 'Detalle de prenda', options: [['a', 'A', 'Afiche'], ['b', 'B', 'Escenario'], ['c', 'C', 'Lab oscuro']] },
        { section: 'Ideas nuevas' },
        { id: 'carrito', label: 'El carrito por dentro', hint: 'Tocá la cápsula de arriba para verlo.',
          options: [[OFF, '—', 'Como está'], ['a', 'A', 'Afiche'], ['b', 'B', 'Lab oscuro']] },
        { id: 'agregar', label: 'Al agregar una prenda', hint: 'Probalo en una prenda: elegí talle y "Agregar a la cápsula".',
          options: [[OFF, '—', 'Sin animación'], ['a', 'A', 'Vuela a la cápsula'], ['b', 'B', 'Teletransporte']] },
        { id: 'abrir', label: 'Después de agregar…',
          options: [['si', 'Sí', 'se abre el carrito'], ['no', 'No', 'solo salta la cápsula']] },
        { id: 'anuncios', label: 'Barra de anuncios (arriba de todo)',
          options: [[OFF, '—', 'Como está'], ['a', 'A', 'Cinta oscura'], ['b', 'B', 'Cinta mostaza']] },
        { id: 'fijo', label: 'Botón fijo en el celu (detalle)', hint: 'Solo en el celu: aparece cuando el botón grande "Agregar a la cápsula" no está a la vista.',
          options: [[OFF, '—', 'No'], ['a', 'A', 'Barra con precio'], ['b', 'B', 'Botón flotante']] },
        { id: 'galeria', label: 'Galería de fotos (detalle)', hint: 'Ejemplo con la única foto que hay: frente, foto original y estampa de cerca. Cuando haya fotos de espalda, van ahí.',
          options: [[OFF, '—', 'No'], ['a', 'A', 'Abajo + lupa'], ['b', 'B', 'Al costado + lupa']] },
        { id: 'brillo', label: 'Brillo en el nombre (inicio y pie)', hint: 'Un brillo rojo que barre "JPEX Store" arriba en el inicio y la marca JPEX de abajo de todo.',
          options: [[OFF, '—', 'Sin brillo'], ['a', 'A', 'Continuo (como el ejemplo)'], ['b', 'B', 'Con pausa']] },
        { section: 'Probar' },
        { id: 'prueba', label: 'La cápsula con… (solo el número, no toca el carrito)', options: [['0', '0', ''], ['1', '1', ''], ['3', '3', ''], ['6', '6', 'prendas']] }
    ];
    var STYLE_IDS = ['buscador', 'capsula', 'detalle', 'carrito', 'agregar', 'abrir', 'anuncios', 'fijo', 'galeria', 'brillo'];

    // Variantes elegidas por Francisco y el equipo (2026-11-15): es lo que ve todo el mundo.
    // Con ?bocetos se puede probar otra cosa en este navegador, sin cambiar lo que ven los demás.
    var state = {
        buscador: 'a', capsula: 'b', detalle: 'a',
        carrito: 'a', agregar: 'a', abrir: 'si', anuncios: 'a', fijo: 'b', galeria: 'b',
        brillo: 'a',   // 2026-11-16: Francisco trajo el efecto (Shiny Pill) para el nombre
        prueba: null, abierto: true
    };
    if (on) {
        try {
            var saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
            Object.keys(state).forEach(function (k) { if (saved[k] !== undefined) state[k] = saved[k]; });
        } catch (e) { /* Se usan las variantes elegidas. */ }
    }
    state.prueba = null;   // La prueba de cantidad no se recuerda.

    function save() {
        try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* nada */ }
    }
    function applyAttrs() {
        STYLE_IDS.forEach(function (id) {
            if (state[id] && state[id] !== OFF) root.setAttribute('data-sk-' + id, state[id]);
            else root.removeAttribute('data-sk-' + id);
        });
    }
    applyAttrs();

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ======================================================================
       Ideas nuevas: comportamiento
       ====================================================================== */

    /* ---------- 1. El carrito por dentro: "Tu cápsula" ---------- */
    var texts = {};
    function applyCarrito() {
        var swaps = [
            ['jpexCartDrawerLabel', 'Tu cápsula'],
            ['jpexClearCartBtn', 'Vaciar la cápsula']
        ];
        swaps.forEach(function (s) {
            var el = document.getElementById(s[0]);
            if (!el) return;
            if (texts[s[0]] === undefined) texts[s[0]] = el.textContent;
            el.textContent = state.carrito === OFF ? texts[s[0]] : s[1];
        });
    }

    /* ---------- 2. Al agregar: la prenda viaja a la cápsula ---------- */
    function rectOf(el) {
        var r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    }

    function flyImage(src, from, to, done) {
        var size = Math.min(from.w, from.h, 260);
        var img = document.createElement('img');
        img.className = 'jpx-fly';
        img.src = src;
        img.alt = '';
        img.style.cssText = 'left:' + (from.x - size / 2) + 'px;top:' + (from.y - size / 2) + 'px;width:' + size + 'px;height:' + size + 'px';
        document.body.appendChild(img);
        var dx = to.x - from.x, dy = to.y - from.y;
        var anim = img.animate([
            { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
            { transform: 'translate(' + dx * 0.45 + 'px,' + (dy * 0.45 - 140) + 'px) scale(.5) rotate(-10deg)', opacity: 1, offset: 0.45 },
            { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.06) rotate(12deg)', opacity: 0.7 }
        ], { duration: 850, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'forwards' });
        var finished = false;
        var finish = function () {
            if (finished) return;
            finished = true;
            img.remove();
            done();
        };
        anim.onfinish = finish;
        setTimeout(finish, 900);   // Respaldo por si el navegador no avisa.
    }

    function teleport(src, from, to, done) {
        var size = Math.min(from.w, from.h, 260);
        var img = document.createElement('img');
        img.className = 'jpx-fly';
        img.src = src;
        img.alt = '';
        img.style.cssText = 'left:' + (from.x - size / 2) + 'px;top:' + (from.y - size / 2) + 'px;width:' + size + 'px;height:' + size + 'px';
        document.body.appendChild(img);
        img.animate([
            { filter: 'none', transform: 'scale(1)', opacity: 1 },
            { filter: 'brightness(1.6) sepia(1) hue-rotate(-40deg) saturate(6) drop-shadow(0 0 18px #d42a14)', transform: 'scale(1.04)', opacity: 1, offset: 0.4 },
            { filter: 'brightness(3) saturate(6) drop-shadow(0 0 30px #d42a14)', transform: 'scaleX(.05) scaleY(1.1)', opacity: 0 }
        ], { duration: 520, easing: 'ease-in', fill: 'forwards' });
        setTimeout(function () { img.remove(); }, 560);

        var count = 16, sparks = [];
        // Termina a tiempo fijo (no depende de que cada chispa avise que terminó).
        setTimeout(function () {
            sparks.forEach(function (p) { p.remove(); });
            done();
        }, 260 + count * 22 + 950);
        for (var i = 0; i < count; i++) {
            (function (i) {
                var p = document.createElement('span');
                p.className = 'jpx-spark';
                var sx = from.x + (Math.random() - 0.5) * size * 0.7;
                var sy = from.y + (Math.random() - 0.5) * size * 0.8;
                p.style.left = sx + 'px';
                p.style.top = sy + 'px';
                document.body.appendChild(p);
                sparks.push(p);
                var dx = to.x - sx, dy = to.y - sy;
                var bend = (Math.random() - 0.5) * 160;
                p.animate([
                    { transform: 'translate(0,0) scale(.4)', opacity: 0 },
                    { transform: 'translate(0,0) scale(1.2)', opacity: 1, offset: 0.12 },
                    { transform: 'translate(' + (dx * 0.5 + bend) + 'px,' + (dy * 0.5 - 60) + 'px) scale(1)', opacity: 1, offset: 0.55 },
                    { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.3)', opacity: 0.2 }
                ], { duration: 650 + Math.random() * 250, delay: 260 + i * 22, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'both' });
            })(i);
        }
    }

    function setupAddToCart() {
        var cart = window.jpexCart;
        var drawer = document.getElementById('jpexCartDrawer');
        if (!cart || cart.__bocetos) return;
        var original = cart.addItem;
        var holdDrawer = false;
        if (drawer) {
            drawer.addEventListener('show.bs.offcanvas', function (e) { if (holdDrawer) e.preventDefault(); });
        }
        var commit = function (item) {
            holdDrawer = state.abrir === 'no';
            try { original(item); } finally { holdDrawer = false; }
        };
        cart.addItem = function (item) {
            var target = document.getElementById('jpexCartButton');
            var mode = state.agregar;
            if (mode === OFF || reduceMotion || !target || !item || !item.image) { commit(item); return; }
            // Desde dónde sale: la foto de la prenda en el detalle, o el botón que se tocó.
            var source = document.querySelector('.jpx-detail__stage img') || document.activeElement || document.body;
            // Siempre la foto sin fondo: vuela solo la remera.
            var stageEl = source.closest ? source.closest('.jpx-detail__stage') : null;
            var srcImg = (stageEl && stageEl.dataset.cutout) || (source.tagName === 'IMG' ? source.currentSrc || source.src : item.image);
            var from = rectOf(source);
            if (!from.w || !from.h) from = { x: window.innerWidth / 2, y: window.innerHeight / 2, w: 200, h: 200 };
            var to = rectOf(target);
            (mode === 'b' ? teleport : flyImage)(srcImg, from, to, function () { commit(item); });
        };
        cart.__bocetos = true;
    }

    /* ---------- 3. Barra de anuncios como cinta corrida ---------- */
    var announce = { el: null, html: null };
    var EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;
    function applyAnuncios() {
        if (!announce.el) {
            announce.el = document.querySelector('body > .bg-dark.text-center');
            if (!announce.el) return;
            announce.html = announce.el.innerHTML;
        }
        var bar = announce.el;
        bar.classList.remove('jpx-announce', 'jpx-announce--a', 'jpx-announce--b');
        bar.innerHTML = announce.html;
        if (state.anuncios === OFF) return;

        // Toma los avisos (sin las barritas "|") y los arma en una cinta que corre sin cortes.
        var probe = document.createElement('div');
        probe.innerHTML = announce.html;
        var items = [];
        Array.prototype.forEach.call(probe.children, function (child) {
            if (child.textContent.trim() === '|') return;
            var clone = child.cloneNode(true);
            clone.className = '';
            clone.innerHTML = clone.innerHTML.replace(EMOJI, '').trim();
            items.push(clone);
        });
        if (!items.length) return;
        var group = document.createElement('div');
        group.className = 'jpx-announce__group';
        for (var r = 0; r < 3; r++) {
            items.forEach(function (it) {
                var span = document.createElement('span');
                span.className = 'jpx-announce__item';
                span.appendChild(it.cloneNode(true));
                group.appendChild(span);
                var star = document.createElement('span');
                star.className = 'jpx-announce__star';
                star.setAttribute('aria-hidden', 'true');
                star.textContent = '✦';
                group.appendChild(star);
            });
        }
        var track = document.createElement('div');
        track.className = 'jpx-announce__track';
        track.appendChild(group);
        var copy = group.cloneNode(true);
        copy.setAttribute('aria-hidden', 'true');
        Array.prototype.forEach.call(copy.querySelectorAll('a'), function (a) { a.tabIndex = -1; });
        track.appendChild(copy);
        bar.innerHTML = '';
        bar.appendChild(track);
        bar.classList.add('jpx-announce', 'jpx-announce--' + state.anuncios);
    }

    /* ---------- 4. Botón fijo abajo en el celu (detalle) ---------- */
    var sticky = { host: null, node: null, visible: false };
    var CAPSULE_SVG = '<svg viewBox="0 0 28 44" aria-hidden="true"><rect x="8" y="1.5" width="12" height="3" rx="1"/><rect x="4" y="4.5" width="20" height="5" rx="1.5"/><rect x="6" y="9.5" width="16" height="23" opacity=".55"/><rect x="4" y="32.5" width="20" height="5" rx="1.5"/><rect x="2" y="37.5" width="24" height="5" rx="1.5"/></svg>';
    function stickyAdd() {
        if (typeof window.handleAddToCart !== 'function') return;
        window.handleAddToCart();
        var alertBox = document.getElementById('cartValidationAlert');
        if (alertBox && !alertBox.classList.contains('d-none')) {
            // Falta el talle: lleva a la parte de los talles.
            var sizes = document.querySelector('.jpx-size');
            (sizes ? sizes.closest('.jpx-detail__group') : alertBox).scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    function applyFijo() {
        var mainBtn = document.getElementById('addToCartBtn');
        if (!mainBtn) return;
        if (!sticky.host) {
            sticky.host = document.createElement('div');
            document.body.appendChild(sticky.host);
            // Aparece cuando el botón grande no se ve (todavía más abajo, o ya pasó para arriba).
            new IntersectionObserver(function (entries) {
                sticky.visible = !entries[0].isIntersecting;
                if (sticky.node) sticky.node.classList.toggle('is-on', sticky.visible);
            }).observe(mainBtn);
        }
        document.body.classList.remove('has-stickybuy-a', 'has-stickybuy-b');
        sticky.host.innerHTML = '';
        sticky.node = null;
        if (state.fijo === OFF) return;

        var name = (document.querySelector('.jpx-detail__title') || {}).textContent || '';
        var price = (document.querySelector('.jpx-detail__price') || {}).textContent || '';
        var node;
        if (state.fijo === 'a') {
            node = document.createElement('div');
            node.innerHTML = '<div class="jpx-stickybuy__info"><span class="jpx-stickybuy__name"></span>' +
                '<span class="jpx-stickybuy__price"></span></div>' +
                '<button type="button" class="jpx-stickybuy__btn">' + CAPSULE_SVG + 'Agregar</button>';
            node.querySelector('.jpx-stickybuy__name').textContent = name.trim();
            node.querySelector('.jpx-stickybuy__price').textContent = price.trim();
            node.querySelector('button').addEventListener('click', stickyAdd);
        } else {
            node = document.createElement('button');
            node.type = 'button';
            node.setAttribute('aria-label', 'Agregar a la cápsula');
            node.innerHTML = CAPSULE_SVG + '<span class="jpx-stickybuy__plus" aria-hidden="true">+</span>';
            node.addEventListener('click', stickyAdd);
        }
        node.className = 'jpx-stickybuy jpx-stickybuy--' + state.fijo + (sticky.visible ? ' is-on' : '');
        sticky.host.appendChild(node);
        sticky.node = node;
        document.body.classList.add('has-stickybuy-' + state.fijo);
    }

    /* ---------- 5. Galería de fotos (detalle) ---------- */
    var gallery = { built: false };
    function buildGallery() {
        var media = document.querySelector('.jpx-detail__media');
        var stage = document.querySelector('.jpx-detail__stage');
        var main = stage && stage.querySelector('img');
        if (!media || !main || gallery.built) return;
        gallery.built = true;
        var wrap = document.createElement('div');
        wrap.className = 'jpx-gal-wrap';
        media.parentNode.insertBefore(wrap, media);
        wrap.appendChild(media);

        var cutout = main.getAttribute('src');
        stage.dataset.cutout = cutout;
        var photo = stage.getAttribute('data-photo') || cutout;
        var VIEWS = [
            { key: 'front', label: 'Frente', src: cutout, cls: '' },
            { key: 'photo', label: 'Foto', src: photo, cls: 'jpx-gal__thumb--photo' },
            { key: 'zoom', label: 'Estampa', src: cutout, cls: 'jpx-gal__thumb--zoom' }
        ];
        var bar = document.createElement('div');
        bar.className = 'jpx-gal';
        bar.setAttribute('role', 'group');
        bar.setAttribute('aria-label', 'Fotos de la prenda');
        var thumbs = [];
        VIEWS.forEach(function (v, i) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'jpx-gal__thumb ' + v.cls;
            b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
            b.innerHTML = '<img alt="" src="' + v.src + '"><span class="jpx-gal__caption">' + v.label + '</span>';
            b.addEventListener('click', function () {
                thumbs.forEach(function (t) { t.setAttribute('aria-pressed', t === b ? 'true' : 'false'); });
                main.src = v.src;
                main.style.transform = '';
                main.style.transformOrigin = '';   // si no, la estampa quedaba corrida por la lupa
                stage.classList.toggle('is-photo', v.key === 'photo');
                stage.classList.toggle('is-zoom', v.key === 'zoom');
            });
            bar.appendChild(b);
            thumbs.push(b);
        });
        if (on) {   // El lugar "Espalda · pronto" es solo un ejemplo para los bocetos.
            var soon = document.createElement('div');
            soon.className = 'jpx-gal__thumb jpx-gal__thumb--soon';
            soon.textContent = 'Espalda · pronto';
            bar.appendChild(soon);
        }
        wrap.insertBefore(bar, media.nextSibling);

        // Lupa. Con mouse: se agranda donde está el puntero. Con el dedo: un toque agranda donde
        // tocaste, arrastrando se recorre, y otro toque vuelve a la normalidad.
        var hasHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        function lensAt(x, y) {
            var r = stage.getBoundingClientRect();
            var px = Math.min(100, Math.max(0, (x - r.left) / r.width * 100));
            var py = Math.min(100, Math.max(0, (y - r.top) / r.height * 100));
            main.style.transformOrigin = px + '% ' + py + '%';
            main.style.transform = 'scale(1.9)';
            stage.classList.add('is-lens');
        }
        function lensOff() {
            main.style.transform = '';
            main.style.transformOrigin = '';
            stage.classList.remove('is-lens');
            stage.style.touchAction = '';
        }
        function lensAllowed() {
            return state.galeria !== OFF && !stage.classList.contains('is-zoom');
        }
        stage.addEventListener('mousemove', function (e) {
            if (hasHover && lensAllowed()) lensAt(e.clientX, e.clientY);
        });
        stage.addEventListener('mouseleave', function () {
            if (hasHover) lensOff();
        });
        var touch = null;
        stage.addEventListener('pointerdown', function (e) {
            if (e.pointerType === 'mouse' || !lensAllowed()) return;
            touch = { x: e.clientX, y: e.clientY, moved: false };
        });
        stage.addEventListener('pointermove', function (e) {
            if (e.pointerType === 'mouse' || !touch) return;
            if (Math.abs(e.clientX - touch.x) + Math.abs(e.clientY - touch.y) > 8) touch.moved = true;
            // Solo con la lupa prendida el dedo la mueve (si no, la página se desliza normal).
            if (stage.classList.contains('is-lens')) lensAt(e.clientX, e.clientY);
        });
        stage.addEventListener('pointerup', function (e) {
            if (e.pointerType === 'mouse' || !touch) return;
            var wasTap = !touch.moved;
            touch = null;
            if (!wasTap) return;
            if (stage.classList.contains('is-lens')) {
                lensOff();
            } else {
                lensAt(e.clientX, e.clientY);
                stage.style.touchAction = 'none';   // mientras está agrandada, arrastrar recorre la foto
            }
        });
        stage.addEventListener('pointercancel', function () { touch = null; });
        // Al cambiar de foto en las miniaturas, la lupa se apaga.
        bar.addEventListener('click', lensOff);
    }

    function applyIdeas() {
        applyCarrito();
        applyAnuncios();
        applyFijo();
        buildGallery();
    }

    /* ======================================================================
       Panel
       ====================================================================== */

    function optionName(id) {
        var g = GROUPS.filter(function (x) { return x.id === id; })[0];
        var o = g.options.filter(function (x) { return x[0] === state[id]; })[0];
        if (!o) return g.label + ' ?';
        return g.label + ': ' + (o[1] === '—' ? o[2].toLowerCase() : o[1] + ' (' + o[2] + ')');
    }
    function summary() {
        return STYLE_IDS.map(optionName).join(' · ');
    }

    function build() {
        if (!on) {            // Visita normal: variantes elegidas, sin panel.
            applyIdeas();
            setupAddToCart();
            return;
        }
        var css = document.createElement('style');
        css.textContent =
            '.jpx-skt{position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:3000;width:min(340px,calc(100vw - 24px));' +
            'color:#fff;background:#121013;border:2px solid #f2b01e;box-shadow:0 10px 30px rgba(0,0,0,.45);font:500 13px/1.3 Barlow,system-ui,sans-serif;transition:bottom .3s}' +
            '.jpx-skt__head{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#1d1a1f}' +
            '.jpx-skt__title{flex:1;font:700 14px/1 "Barlow Condensed",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#f2b01e}' +
            '.jpx-skt button{font:inherit;cursor:pointer}' +
            '.jpx-skt__mini{padding:4px 8px;color:#fff;background:transparent;border:1px solid rgba(255,255,255,.3)}' +
            '.jpx-skt__body{padding:8px 10px 10px;max-height:62vh;overflow:auto}' +
            '.jpx-skt.is-closed .jpx-skt__body{display:none}' +
            '.jpx-skt__section{margin:12px 0 6px;padding-top:8px;border-top:1px solid rgba(255,255,255,.15);font:700 12px/1 "Barlow Condensed",sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#d42a14}' +
            '.jpx-skt__section:first-child{margin-top:0;padding-top:0;border:0}' +
            '.jpx-skt__group{margin-bottom:9px}' +
            '.jpx-skt__label{margin-bottom:4px;font:700 12px/1.1 "Barlow Condensed",sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#d8d2c8}' +
            '.jpx-skt__hint{margin:-1px 0 5px;color:#b5aea3;font-size:11.5px}' +
            '.jpx-skt__opts{display:flex;flex-wrap:wrap;gap:4px}' +
            '.jpx-skt__opt{padding:6px 8px;color:#fff;background:#2a262c;border:1px solid transparent}' +
            '.jpx-skt__opt b{margin-right:4px}' +
            '.jpx-skt__opt[aria-pressed=true]{color:#121013;background:#f2b01e}' +
            '.jpx-skt__sum{display:flex;gap:6px;margin-top:8px}' +
            '.jpx-skt__sum textarea{flex:1;min-height:70px;padding:6px;color:#fff;background:#0b090c;border:1px solid rgba(255,255,255,.2);font:12px/1.35 Barlow,sans-serif;resize:none}' +
            '.jpx-skt__copy{padding:0 10px;color:#121013;background:#f2b01e;border:0;font-weight:700}';
        document.head.appendChild(css);

        var panel = document.createElement('aside');
        panel.className = 'jpx-skt' + (state.abierto ? '' : ' is-closed');
        panel.setAttribute('aria-label', 'Bocetos de la tienda');
        panel.innerHTML =
            '<div class="jpx-skt__head"><span class="jpx-skt__title">Bocetos tienda</span>' +
            '<button type="button" class="jpx-skt__mini" data-act="toggle"></button>' +
            '<button type="button" class="jpx-skt__mini" data-act="exit" title="Apaga el panel en esta pestaña">Salir</button></div>' +
            '<div class="jpx-skt__body"></div>';
        var body = panel.querySelector('.jpx-skt__body');
        var buttons = {};

        GROUPS.forEach(function (g) {
            if (g.section) {
                var sec = document.createElement('div');
                sec.className = 'jpx-skt__section';
                sec.textContent = g.section;
                body.appendChild(sec);
                return;
            }
            var wrap = document.createElement('div');
            wrap.className = 'jpx-skt__group';
            var label = document.createElement('div');
            label.className = 'jpx-skt__label';
            label.textContent = g.label;
            wrap.appendChild(label);
            if (g.hint) {
                var hint = document.createElement('div');
                hint.className = 'jpx-skt__hint';
                hint.textContent = g.hint;
                wrap.appendChild(hint);
            }
            var row = document.createElement('div');
            row.className = 'jpx-skt__opts';
            buttons[g.id] = [];
            g.options.forEach(function (o) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'jpx-skt__opt';
                b.dataset.value = o[0];
                b.innerHTML = '<b>' + o[1] + '</b>' + o[2];
                b.addEventListener('click', function () {
                    state[g.id] = o[0];
                    if (g.id === 'prueba') {
                        var badge = document.getElementById('jpexCartCountBadge');
                        if (badge) badge.textContent = o[0];
                    } else {
                        applyAttrs();
                        applyIdeas();
                        save();
                    }
                    refresh();
                });
                row.appendChild(b);
                buttons[g.id].push(b);
            });
            wrap.appendChild(row);
            body.appendChild(wrap);
        });

        var sum = document.createElement('div');
        sum.className = 'jpx-skt__sum';
        sum.innerHTML = '<textarea readonly aria-label="Selección"></textarea><button type="button" class="jpx-skt__copy">Copiar</button>';
        body.appendChild(sum);
        var text = sum.querySelector('textarea');

        function refresh() {
            Object.keys(buttons).forEach(function (id) {
                buttons[id].forEach(function (b) {
                    b.setAttribute('aria-pressed', b.dataset.value === state[id] ? 'true' : 'false');
                });
            });
            panel.querySelector('[data-act=toggle]').textContent = state.abierto ? 'Achicar' : 'Abrir';
            text.value = summary();
        }

        panel.querySelector('[data-act=toggle]').addEventListener('click', function () {
            state.abierto = !state.abierto;
            panel.classList.toggle('is-closed', !state.abierto);
            save();
            refresh();
        });
        panel.querySelector('[data-act=exit]').addEventListener('click', function () {
            try { sessionStorage.removeItem(ON_KEY); } catch (e) { /* nada */ }
            // Recargar deja la página exactamente como la ve todo el mundo.
            var url = new URL(window.location.href);
            url.searchParams.delete('bocetos');
            window.location.replace(url.toString());
        });
        sum.querySelector('.jpx-skt__copy').addEventListener('click', function (e) {
            var btn = e.currentTarget;
            var done = function () { btn.textContent = 'Copiado'; setTimeout(function () { btn.textContent = 'Copiar'; }, 1400); };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text.value).then(done, function () { text.select(); });
            } else {
                text.select();
            }
        });

        refresh();
        document.body.appendChild(panel);
        applyIdeas();
        setupAddToCart();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else build();
})();
