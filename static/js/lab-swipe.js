/* Lab: recorrer el laboratorio deslizando el dedo (celular y tablet).
 *
 * En el celu vertical la imagen del laboratorio es mucho más ancha que la pantalla
 * (se ve más o menos un tercio). Con el dedo se arrastra el escenario de costado;
 * al soltar puede seguir un poco con inercia y frena suave, sin pasarse del borde.
 * Todo lo que está dentro del escenario (efectos, cápsula) se mueve junto.
 *
 * Solo responde al dedo o al lápiz: con mouse no hace nada (para eso está lab-pan.js).
 *
 * Uso:
 *   JPEXLabSwipe.enable({ inertia: 1, hint: 'text' });
 *   JPEXLabSwipe.set({ hint: 'peek' });   // cambia opciones y vuelve a mostrar el aviso
 *   JPEXLabSwipe.disable();
 * Opciones:
 *   inertia: 0 = frena apenas soltás; 1 = sigue un poco con el impulso.
 *   hint: 'off' | 'text' (cartelito "Deslizá para recorrer") | 'peek' (paseo corto al entrar).
 */
(function () {
    'use strict';

    var root = document.querySelector('.jpx-lab');
    var stage = root && root.querySelector('.jpx-lab__stage');
    if (!stage) return;

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var touchScreen = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    var CENTER = 'translate(-50%, -50%) ';
    // Arrastrar sobre estas cosas no mueve el laboratorio (botones, cartel, probador).
    var IGNORE = 'button, a, input, select, textarea, label, .jpx-lab__hud, .jpx-lab__hud-pill, .jpx-lab-ui';
    var THROW_MS = 320;      // Con inercia: cuánto "sigue de largo" según la velocidad del dedo.
    var EASE = 0.12;         // Suavidad al frenar (por cuadro de 60 Hz).
    var HINT_MS = 4500;      // Cuánto queda el cartelito si no tocás nada.
    var PEEK = [[0, 0], [600, 0], [1500, -0.45], [2600, 0.45], [3500, 0]]; // ms, fracción del recorrido

    var opts = { inertia: 1, hint: 'text' };
    var enabled = false;
    var painted = false;
    var x = 0, y = 0;        // Desplazamiento actual, en px.
    var tx = 0, ty = 0;      // Hacia dónde va después de soltar.
    var maxX = 0, maxY = 0;  // Cuánto se puede mover hacia cada lado sin ver el borde.
    var drag = null;
    var raf = 0;
    var last = 0;
    var peekStart = 0;
    var hintEl = null;
    var hintTimer = 0;

    function measure() {
        maxX = Math.max(0, (stage.offsetWidth - root.clientWidth) / 2);
        maxY = Math.max(0, (stage.offsetHeight - root.clientHeight) / 2);
    }
    function clamp(v, max) { return Math.max(-max, Math.min(max, v)); }

    // En movimiento usa translate3d (fluido). Quieto, un corrimiento común en píxeles enteros:
    // así el celu dibuja el escenario a máxima nitidez (si no, la cápsula se ve borrosa).
    function paint(moving) {
        stage.style.transform = moving
            ? CENTER + 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)'
            : CENTER + 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
        painted = true;
    }

    function kick() {
        if (!raf) {
            last = 0;
            raf = requestAnimationFrame(loop);
        }
    }

    function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    function loop(now) {
        raf = 0;
        if (!enabled || drag) return;
        var dt = last ? Math.min(now - last, 64) : 16.7;
        last = now;

        if (peekStart) {
            // Paseo corto: va un poco a la derecha, otro poco a la izquierda y vuelve al centro.
            var t = now - peekStart;
            var end = PEEK[PEEK.length - 1][0];
            if (t >= end) {
                peekStart = 0;
                x = tx = 0;
            } else {
                for (var i = 1; i < PEEK.length; i++) {
                    if (t <= PEEK[i][0]) {
                        var a = PEEK[i - 1], b = PEEK[i];
                        var k = easeInOut((t - a[0]) / (b[0] - a[0]));
                        x = (a[1] + (b[1] - a[1]) * k) * maxX;
                        break;
                    }
                }
            }
            paint(!!peekStart);
            if (peekStart) raf = requestAnimationFrame(loop);
            return;
        }

        var f = 1 - Math.pow(1 - EASE, dt / 16.7);
        x += (tx - x) * f;
        y += (ty - y) * f;
        if (Math.abs(tx - x) < 0.3 && Math.abs(ty - y) < 0.3) {
            x = tx;
            y = ty;
            paint();
            return;
        }
        paint(true);
        raf = requestAnimationFrame(loop);
    }

    /* ---------- Dedo ---------- */

    function onDown(e) {
        if (drag || e.pointerType === 'mouse') return;
        if (root.classList.contains('is-panel-open')) return;
        if (e.target.closest && e.target.closest(IGNORE)) return;
        measure();
        if (!maxX && !maxY) return;
        peekStart = 0;
        hideHint();
        drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, bx: x, by: y, samples: [[e.timeStamp, e.clientX, e.clientY]] };
        tx = x;
        ty = y;
        root.classList.add('is-dragging');
        try { root.setPointerCapture(e.pointerId); } catch (err) { /* Sigue igual sin captura. */ }
    }

    function onMove(e) {
        if (!drag || e.pointerId !== drag.id) return;
        x = clamp(drag.bx + e.clientX - drag.sx, maxX);
        y = clamp(drag.by + e.clientY - drag.sy, maxY);
        drag.samples.push([e.timeStamp, e.clientX, e.clientY]);
        if (drag.samples.length > 8) drag.samples.shift();
        paint(true);
    }

    function onUp(e) {
        if (!drag || e.pointerId !== drag.id) return;
        // Velocidad del dedo en los últimos ~100 ms (si se quedó quieto antes de soltar, no hay impulso).
        var s = drag.samples;
        var end = s[s.length - 1];
        var start = end;
        for (var i = s.length - 1; i >= 0 && end[0] - s[i][0] <= 100; i--) start = s[i];
        var dt = end[0] - start[0];
        var vx = 0, vy = 0;
        if (dt > 0 && e.timeStamp - end[0] < 80) {
            vx = (end[1] - start[1]) / dt;
            vy = (end[2] - start[2]) / dt;
        }
        var throwMs = reduceMotion ? 0 : THROW_MS * opts.inertia;
        tx = clamp(x + vx * throwMs, maxX);
        ty = clamp(y + vy * throwMs, maxY);
        drag = null;
        root.classList.remove('is-dragging');
        kick();
    }

    function onResize() {
        measure();
        x = tx = clamp(x, maxX);
        y = ty = clamp(y, maxY);
        if (painted) paint();
    }

    /* ---------- Aviso al entrar ---------- */

    var hintToken = 0;       // Cancela una aparición pendiente si tocaste antes de que se muestre.

    function hideHint() {
        hintToken++;
        clearTimeout(hintTimer);
        if (hintEl) hintEl.classList.remove('is-on');
    }

    function showHint() {
        hideHint();
        peekStart = 0;
        measure();
        if (!touchScreen || maxX < 40 || opts.hint === 'off' || root.classList.contains('is-panel-open')) return;
        if (opts.hint === 'peek') {
            if (reduceMotion) return;
            peekStart = performance.now();
            kick();
            return;
        }
        if (!hintEl) {
            hintEl = document.createElement('div');
            hintEl.className = 'jpx-swipe-hint';
            hintEl.setAttribute('aria-hidden', 'true');
            hintEl.innerHTML = '<span class="jpx-swipe-hint__arrow jpx-swipe-hint__arrow--l">&larr;</span>' +
                '<span>Deslizá para recorrer</span>' +
                '<span class="jpx-swipe-hint__arrow">&rarr;</span>';
            root.appendChild(hintEl);
        }
        // Un cuadro de espera para que se vea la transición de entrada.
        var token = hintToken;
        requestAnimationFrame(function () {
            if (enabled && token === hintToken) hintEl.classList.add('is-on');
        });
        hintTimer = setTimeout(hideHint, HINT_MS);
    }

    /* ---------- Encender / apagar ---------- */

    function set(options) {
        if (options) {
            if (typeof options.inertia === 'number') opts.inertia = options.inertia;
            if (options.hint) opts.hint = options.hint;
        }
        if (enabled) showHint();
    }

    function enable(options) {
        if (options) {
            if (typeof options.inertia === 'number') opts.inertia = options.inertia;
            if (options.hint) opts.hint = options.hint;
        }
        if (enabled) { showHint(); return; }
        enabled = true;
        root.classList.add('is-swipe');
        root.addEventListener('pointerdown', onDown);
        root.addEventListener('pointermove', onMove);
        root.addEventListener('pointerup', onUp);
        root.addEventListener('pointercancel', onUp);
        window.addEventListener('resize', onResize);
        measure();
        showHint();
    }

    function disable() {
        if (!enabled) return;
        enabled = false;
        drag = null;
        peekStart = 0;
        hideHint();
        root.classList.remove('is-swipe', 'is-dragging');
        root.removeEventListener('pointerdown', onDown);
        root.removeEventListener('pointermove', onMove);
        root.removeEventListener('pointerup', onUp);
        root.removeEventListener('pointercancel', onUp);
        window.removeEventListener('resize', onResize);
        x = y = tx = ty = 0;
        if (painted) {
            stage.style.transform = '';
            painted = false;
        }
    }

    window.JPEXLabSwipe = {
        enable: enable,
        disable: disable,
        set: set,
        isEnabled: function () { return enabled; }
    };
})();
