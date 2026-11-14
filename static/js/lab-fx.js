/* Lab: efectos animados sobre el escenario (.jpx-lab__stage).
 *
 * Cada efecto es un módulo independiente que se prende con una variante ('a', 'b', 'c')
 * o se apaga con null:
 *
 *     JPEXLabFX.init(document.querySelector('.jpx-lab__stage'));
 *     JPEXLabFX.set('tubos', 'b');
 *     JPEXLabFX.set('ojos', null);
 *
 * Todas las posiciones están en porcentajes del escenario (ilustración de 1672×941),
 * así cada capa queda pegada a su objeto de la imagen en cualquier pantalla.
 *
 * Reglas de rendimiento: solo se anima transform y opacity; los bucles con
 * requestAnimationFrame y los temporizadores se frenan con la pestaña oculta y
 * cuando el efecto está apagado. Con "reducir movimiento" todo queda quieto.
 */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- Utilidades ---------- */

    function rand(min, max) { return min + Math.random() * (max - min); }
    function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
    function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

    function el(tag, className, parent) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (parent) parent.appendChild(node);
        return node;
    }

    // Ubica un elemento en porcentajes del escenario: {x, y, w, h}.
    function place(node, box) {
        node.style.left = box.x + '%';
        node.style.top = box.y + '%';
        if (box.w != null) node.style.width = box.w + '%';
        if (box.h != null) node.style.height = box.h + '%';
        return node;
    }

    // Temporizadores de un efecto. clear() cancela todo lo pendiente de una vez.
    // Si la pestaña está oculta cuando toca ejecutar algo, se espera a que vuelva.
    var waitingVisible = [];
    function Clock() {
        this.gen = 0;
        this.ids = [];
    }
    Clock.prototype.later = function (fn, ms) {
        var self = this;
        var gen = this.gen;
        var id = setTimeout(function () {
            var i = self.ids.indexOf(id);
            if (i > -1) self.ids.splice(i, 1);
            if (gen !== self.gen) return;
            if (document.hidden) {
                waitingVisible.push(function () { if (gen === self.gen) fn(); });
                return;
            }
            fn();
        }, ms);
        this.ids.push(id);
    };
    // Ejecuta una lista de pasos [estado, duración] llamando a apply(estado) en cada uno.
    Clock.prototype.steps = function (list, apply, done) {
        var self = this;
        var i = 0;
        function next() {
            if (i >= list.length) {
                if (done) done();
                return;
            }
            var step = list[i++];
            apply(step[0]);
            self.later(next, step[1]);
        }
        next();
    };
    Clock.prototype.clear = function () {
        this.gen++;
        this.ids.forEach(clearTimeout);
        this.ids = [];
    };

    // Bucle con requestAnimationFrame, opcionalmente limitado a ciertos cuadros por segundo.
    var loops = [];
    function Loop(fn, fps) {
        this.fn = fn;
        this.interval = fps ? 1000 / fps : 0;
        this.on = false;
        this.raf = 0;
        this.last = 0;
        var self = this;
        this.tick = function (t) {
            self.raf = 0;
            if (!self.on || document.hidden) return; // Se retoma al volver a la pestaña.
            if (t - self.last >= self.interval) {
                self.last = t;
                self.fn(t);
            }
            self.raf = requestAnimationFrame(self.tick);
        };
        loops.push(this);
    }
    Loop.prototype.start = function () {
        this.on = true;
        if (!this.raf && !document.hidden) this.raf = requestAnimationFrame(this.tick);
    };
    Loop.prototype.stop = function () {
        this.on = false;
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
    };

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) return;
        loops.forEach(function (loop) { if (loop.on) loop.start(); });
        var pending = waitingVisible;
        waitingVisible = [];
        pending.forEach(function (fn) { setTimeout(fn, rand(200, 900)); });
    });

    // Animación con Web Animations (solo transform/opacity). Devuelve la animación o null.
    function animate(node, frames, options) {
        if (!node.animate) return null;
        return node.animate(frames, options);
    }

    /* ---------- Registro de efectos ---------- */

    var stage = null;
    var fxRoot = null;
    var effects = {};
    var order = [];

    // Orden de las capas (no depende de cuándo se prende cada efecto).
    // La niebla va arriba de los tubos y las enredaderas; las chispas, arriba de todo.
    var LAYER_Z = { traje: 1, tubos: 2, venas: 2, circulo: 2, lampara: 3, camara: 3, estatica: 3, ojos: 4, bicho: 5, niebla: 6, chispas: 7 };

    function define(id, def) {
        def.id = id;
        def.current = null;
        def.clock = new Clock();
        def.layer = null;
        effects[id] = def;
        order.push(id);
    }

    function resetEffect(def) {
        def.clock.clear();
        if (def.stop) def.stop();
        if (def.layer) {
            def.layer.remove();
            def.layer = null;
        }
    }

    /* ---------- 1. Luces de los tubos ---------- */

    // Partes de cada tubo, medidas sobre la ilustración (en % del escenario):
    // body = vidrio completo, cap = tapa/lámpara roja de arriba, base = luces rojas
    // del pie, refl = reflejo rojo en el piso. Cada parte es una caja de bordes difusos.
    var TUBES = [
        { // grande izquierdo
            body: { x: 15.2, y: 16.5, w: 9.8, h: 36.5 },
            cap: { x: 15.4, y: 14.8, w: 9.4, h: 7.0 },
            base: { x: 20.4, y: 52.4, w: 6.0, h: 4.2 },
            refl: [{ x: 15.2, y: 88.5, w: 5.0, h: 11.5 }]
        },
        { // mediano izquierdo
            body: { x: 27.4, y: 30.5, w: 6.4, h: 25.5 },
            cap: { x: 27.4, y: 29.4, w: 6.2, h: 5.0 },
            base: { x: 27.2, y: 55.0, w: 7.0, h: 3.8 },
            refl: [{ x: 30.4, y: 64.5, w: 3.8, h: 27.5 }]
        },
        { // chico izquierdo
            body: { x: 33.8, y: 37.2, w: 4.4, h: 18.8 },
            cap: { x: 33.8, y: 36.4, w: 4.4, h: 4.0 },
            base: { x: 33.3, y: 55.0, w: 5.4, h: 3.6 },
            refl: [{ x: 33.9, y: 64.5, w: 3.2, h: 21.0 }]
        },
        { // chico derecho
            body: { x: 61.0, y: 37.2, w: 4.6, h: 18.8 },
            cap: { x: 61.0, y: 36.4, w: 4.6, h: 4.0 },
            base: { x: 59.8, y: 55.0, w: 7.0, h: 3.6 },
            refl: [{ x: 59.9, y: 64.5, w: 3.8, h: 30.5 }]
        },
        { // mediano derecho
            body: { x: 66.0, y: 30.8, w: 6.2, h: 25.2 },
            cap: { x: 66.0, y: 29.8, w: 6.2, h: 5.0 },
            base: { x: 65.3, y: 55.0, w: 7.2, h: 3.8 },
            refl: [{ x: 68.1, y: 69.5, w: 3.2, h: 30.5 }]
        },
        { // grande roto
            body: { x: 75.8, y: 15.0, w: 8.8, h: 40.0 },
            cap: { x: 75.8, y: 13.4, w: 8.8, h: 7.6 },
            base: { x: 74.2, y: 53.2, w: 8.6, h: 6.6 },
            refl: [{ x: 75.6, y: 68.0, w: 6.8, h: 32.0 }]
        }
    ];
    // Pedazo "apagado" de cada tubo (static/img/lab/tubo-off-N.webp), en % del escenario.
    // Lo genera laboratory/assets/build_lab_images.py: si cambian las cajas allá, copiarlas acá.
    var TUBE_SPRITES = [
        { x: 14.10, y: 13.90, w: 13.60, h: 86.10 },
        { x: 26.10, y: 28.30, w: 9.20, h: 66.10 },
        { x: 32.20, y: 35.30, w: 7.60, h: 52.10 },
        { x: 58.70, y: 35.30, w: 9.20, h: 61.10 },
        { x: 64.20, y: 28.70, w: 9.40, h: 71.30 },
        { x: 73.50, y: 12.50, w: 12.00, h: 87.50 }
    ];
    var TUBE_SPRITES_VERSION = 1;
    // Cómo se dibuja cada parte del resplandor: forma, color (r g b), opacidad y difuminado (fx/fy en %).
    var TUBE_GLOW = {
        body: { c: '255 38 28', a: 0.27, fx: 28, fy: 12 },
        cap: { round: true, c: '255 80 60', a: 0.75 },
        base: { round: true, c: '255 60 40', a: 0.55 },
        refl: { round: true, c: '255 45 35', a: 0.36 }
    };
    // Niveles de luz: brillo extra (glow) y oscurecido de todo el contenedor (dim).
    var TUBE_LEVEL = {
        on: [0.55, 0],
        surge: [1, 0],
        low: [0, 0.6],
        off: [0, 1]
    };

    // Caja de bordes difusos (o elipse si round) en % del escenario.
    function softBox(parent, box, style) {
        var node = place(el('div', style.round ? 'fx-soft fx-soft--round' : 'fx-soft', parent), box);
        node.style.setProperty('--c', style.c);
        node.style.setProperty('--a', style.a);
        if (!style.round) {
            node.style.setProperty('--fx', style.fx + '%');
            node.style.setProperty('--fy', style.fy + '%');
        }
        return node;
    }

    function tubeParts(parent, tube, styles) {
        ['body', 'base', 'cap'].forEach(function (k) { softBox(parent, tube[k], styles[k]); });
        tube.refl.forEach(function (r) { softBox(parent, r, styles.refl); });
    }

    define('tubos', {
        label: 'Tubos',
        variants: { a: 'Respiración', b: 'Falla', c: 'Apagones' },
        start: function (v, layer, clock) {
            // Las imágenes apagadas están en la misma carpeta que el fondo.
            var bg = stage.querySelector('.jpx-lab__bg');
            var folder = (bg.currentSrc || bg.src).replace(/[^\/]*$/, '');
            var tubes = TUBES.map(function (parts, i) {
                var tube = el('div', 'fx-tube', layer);
                var dim = place(el('img', 'fx-tube__dim', tube), TUBE_SPRITES[i]);
                dim.alt = '';
                dim.decoding = 'async';
                dim.src = folder + 'tubo-off-' + (i + 1) + '.webp?v=' + TUBE_SPRITES_VERSION;
                var glow = el('div', 'fx-tube__glow', tube);
                tubeParts(glow, parts, TUBE_GLOW);
                return { node: tube, dim: dim, glow: glow };
            });

            // fade: milisegundos de transición (0 = cambio seco, como un chispazo).
            // Al apagarse, la luz se muere en un instante; al volver, tarda en calentar.
            function setLevel(t, name, fade) {
                var level = TUBE_LEVEL[name];
                var transition = fade ? 'opacity ' + fade + 'ms cubic-bezier(.2, .6, .3, 1)' : 'none';
                t.glow.style.transition = transition;
                t.dim.style.transition = transition;
                t.glow.style.opacity = level[0];
                t.dim.style.opacity = level[1];
            }
            // Pasos [[estado, fade], duración] para clock.steps.
            function run(t, list, done) {
                clock.steps(list, function (step) { setLevel(t, step[0], step[1]); }, done);
            }

            if (reduceMotion) {
                tubes.forEach(function (t) { setLevel(t, 'on', 0); });
                return;
            }

            if (v === 'a') {
                // Respiración: cada tubo con su propio ritmo (CSS), desfasados entre sí.
                tubes.forEach(function (t) {
                    t.node.style.setProperty('--fx-dur', rand(4, 7).toFixed(2) + 's');
                    t.node.style.setProperty('--fx-delay', (-rand(0, 7)).toFixed(2) + 's');
                });
                return;
            }

            tubes.forEach(function (t) { setLevel(t, 'on', 0); });

            if (v === 'b') {
                // Falla eléctrica: casi fijo, con titileos rápidos al azar.
                tubes.forEach(function (t) {
                    (function flickerLater(first) {
                        clock.later(function () {
                            var list = [];
                            var n = randInt(1, 3);
                            for (var i = 0; i < n; i++) {
                                list.push([[Math.random() < 0.55 ? 'off' : 'low', 0], rand(40, 120)]);
                                list.push([[Math.random() < 0.3 ? 'surge' : 'on', 0], rand(40, 140)]);
                            }
                            // A veces el corte dura un poco más: la luz se muere y vuelve de golpe.
                            if (Math.random() < 0.3) list.push([['off', 140], rand(450, 900)], [['surge', 0], rand(60, 120)]);
                            list.push([['on', 220], 0]);
                            run(t, list, function () { flickerLater(false); });
                        }, first ? rand(300, 3000) : rand(1500, 6500));
                    })(true);
                });
                return;
            }

            if (v === 'c') {
                // Apagones: cada tanto un tubo se apaga 1–2 s y vuelve tartamudeando.
                var busy = [];
                (function outageLater(first) {
                    clock.later(function () {
                        var free = tubes.filter(function (t) { return busy.indexOf(t) < 0; });
                        if (free.length) {
                            var t = pick(free);
                            busy.push(t);
                            // 1) Avisa con dos o tres titileos secos. 2) Se muere con un fundido
                            // corto. 3) Queda a oscuras. 4) Intenta arrancar a chispazos.
                            // 5) Calienta despacio hasta su luz normal.
                            var list = [];
                            var warn = randInt(2, 3);
                            for (var i = 0; i < warn; i++) {
                                list.push([['low', 0], rand(40, 90)], [['on', 0], rand(60, 220)]);
                            }
                            list.push([['off', rand(350, 600)], rand(1400, 2800)]);
                            var tries = randInt(2, 4);
                            for (var j = 0; j < tries; j++) {
                                list.push([[Math.random() < 0.5 ? 'surge' : 'low', 0], rand(35, 90)]);
                                list.push([['off', 60], rand(120, 380)]);
                            }
                            list.push([['low', 0], rand(120, 220)], [['on', rand(700, 1100)], 1100]);
                            run(t, list, function () { busy.splice(busy.indexOf(t), 1); });
                        }
                        outageLater(false);
                    }, first ? rand(800, 1800) : rand(2500, 6000));
                })(true);
            }
        }
    });

    /* ---------- 2. Lámpara ámbar sobre la puerta ---------- */

    define('lampara', {
        label: 'Lámpara',
        variants: { a: 'Pulso', b: 'Baliza', c: 'Falla' },
        start: function (v, layer, clock) {
            // Luz principal (barra sobre la puerta) y las dos lucecitas a los lados.
            var wash = place(el('div', 'fx-lamp__wash', layer), { x: 38, y: 33.5, w: 24, h: 30 });
            var halo = place(el('div', 'fx-lamp__halo', layer), { x: 40, y: 26.5, w: 20, h: 15.5 });
            var cover = place(el('div', 'fx-lamp__cover', layer), { x: 48.1, y: 32.9, w: 3.8, h: 2.4 });
            var sides = [
                { halo: { x: 37.7, y: 41.8, w: 5.0, h: 8.8 }, cover: { x: 39.65, y: 45.3, w: 1.1, h: 1.8 } },
                { halo: { x: 56.6, y: 42.5, w: 5.0, h: 8.8 }, cover: { x: 58.55, y: 46.0, w: 1.1, h: 1.8 } }
            ].map(function (s, i) {
                return {
                    halo: place(el('div', 'fx-lamp__side fx-lamp__side--' + i, layer), s.halo),
                    cover: place(el('div', 'fx-lamp__sidecover fx-lamp__sidecover--' + i, layer), s.cover)
                };
            });

            if (reduceMotion || v !== 'c') return; // A y B son solo CSS.

            // C: titileo con falla, programado al azar.
            function setMain(level) {
                halo.style.opacity = level;
                wash.style.opacity = level * 0.8;
                cover.style.opacity = level < 0.2 ? 0.85 : 0;
            }
            setMain(0.75);
            sides.forEach(function (s) { s.halo.style.opacity = 0.55; s.cover.style.opacity = 0; });

            (function failLater() {
                clock.later(function () {
                    var list = [];
                    if (Math.random() < 0.55) {
                        // Zumbido: muchos cortes cortitos.
                        var n = randInt(5, 12);
                        for (var i = 0; i < n; i++) {
                            list.push([rand(0, 0.15), rand(25, 70)]);
                            list.push([rand(0.5, 0.9), rand(25, 80)]);
                        }
                    } else {
                        // Caída: se apaga un rato y vuelve con dos tirones.
                        list.push([0, rand(300, 900)]);
                        list.push([0.6, rand(50, 90)]);
                        list.push([0, rand(80, 200)]);
                        list.push([0.9, rand(40, 80)]);
                        list.push([0.1, rand(60, 120)]);
                    }
                    list.push([0.75, 0]);
                    clock.steps(list, setMain, failLater);

                    // Las lucecitas de los costados a veces acompañan con un titileo.
                    if (Math.random() < 0.4) {
                        var side = pick(sides);
                        clock.steps([[0, rand(60, 160)], [0.55, 0]], function (o) {
                            side.halo.style.opacity = o;
                            side.cover.style.opacity = o ? 0 : 0.8;
                        });
                    }
                }, rand(1200, 6000));
            })();
        }
    });

    /* ---------- 3. Luz de la cámara de seguridad ---------- */

    define('camara', {
        label: 'Cámara',
        variants: { a: 'Regular', b: 'Doble' },
        start: function (v, layer) {
            // LED pintado en ≈ (91.5%, 10.9%). Halo rojo grande (radio ≈ 2.3% del ancho),
            // destello breve al encender y tapa para el LED apagado. El parpadeo es solo CSS.
            place(el('div', 'fx-cam__halo', layer), { x: 89.2, y: 6.8, w: 4.6, h: 8.2 });
            place(el('div', 'fx-cam__flash', layer), { x: 90.1, y: 8.4, w: 2.8, h: 5.0 });
            place(el('div', 'fx-cam__cover', layer), { x: 90.9, y: 9.9, w: 1.2, h: 2.0 });
        }
    });

    /* ---------- 4. Estática de los monitores ---------- */

    // Caja y forma (clip-path) de cada pantalla, en % del escenario y de la caja.
    var SCREENS = [
        { box: { x: 1.6, y: 41.9, w: 4.4, h: 8.4 }, clip: 'polygon(2.3% 0%, 100% 10.7%, 97.7% 100%, 0% 91.7%)' },
        { box: { x: 94.3, y: 41.4, w: 3.3, h: 8.2 }, clip: 'polygon(3% 11%, 100% 0%, 97% 90%, 0% 100%)' }
    ];

    // Textura de ruido gris generada una sola vez (para la variante CSS).
    var noiseUrl = null;
    function noiseTexture() {
        if (noiseUrl) return noiseUrl;
        var c = document.createElement('canvas');
        c.width = c.height = 64;
        var ctx = c.getContext('2d');
        var img = ctx.createImageData(64, 64);
        for (var i = 0; i < img.data.length; i += 4) {
            var g = Math.random() * 255;
            img.data[i] = g;
            img.data[i + 1] = g * 0.94;
            img.data[i + 2] = g * 0.9;
            img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        noiseUrl = c.toDataURL('image/png');
        return noiseUrl;
    }

    define('estatica', {
        label: 'Estática',
        variants: { a: 'Canvas', b: 'CSS' },
        start: function (v, layer) {
            var self = this;
            // Resplandor frío que la pantalla tira alrededor (titila con CSS).
            SCREENS.forEach(function (s, i) {
                var b = s.box;
                var spill = place(el('div', 'fx-mon__spill', layer), { x: b.x - b.w * 0.9, y: b.y - b.h * 0.7, w: b.w * 2.8, h: b.h * 2.4 });
                spill.style.animationDelay = (-i * 0.37) + 's';
            });
            var screens = SCREENS.map(function (s) {
                var box = place(el('div', 'fx-mon', layer), s.box);
                box.style.clipPath = s.clip;
                box.style.webkitClipPath = s.clip;
                return box;
            });

            if (v === 'b') {
                var url = 'url(' + noiseTexture() + ')';
                screens.forEach(function (box, i) {
                    var noise = el('div', 'fx-mon__noise', box);
                    noise.style.backgroundImage = url;
                    noise.style.animationDelay = (-i * 0.23) + 's';
                    var band = el('div', 'fx-mon__band', box);
                    band.style.animationDelay = (-rand(0, 3)).toFixed(2) + 's';
                });
                return;
            }

            // A: canvas chico (48×36) escalado, a ~12 cuadros por segundo.
            var W = 48, H = 36;
            var canvases = screens.map(function (box) {
                var c = el('canvas', 'fx-mon__canvas', box);
                c.width = W;
                c.height = H;
                var ctx = c.getContext('2d');
                return { ctx: ctx, img: ctx.createImageData(W, H), roll: Math.random() * H };
            });

            function draw() {
                canvases.forEach(function (s) {
                    var d = s.img.data;
                    s.roll = (s.roll + 1.3) % H;     // Banda clara que baja.
                    var tear = Math.random() < 0.08 ? randInt(0, H - 1) : -1; // Línea cortada.
                    for (var y = 0; y < H; y++) {
                        var band = Math.abs(y - s.roll) < 3 ? 90 : 0;
                        var lineDark = y === tear ? 0.2 : 1;
                        for (var x = 0; x < W; x++) {
                            var g = (Math.random() * 230 + 25 + band) * lineDark;
                            var i = (y * W + x) * 4;
                            d[i] = g;
                            d[i + 1] = g * 0.94;
                            d[i + 2] = g * 0.9;
                            d[i + 3] = 255;
                        }
                    }
                    s.ctx.putImageData(s.img, 0, 0);
                });
            }

            draw();
            if (reduceMotion) return;
            self.loop = new Loop(draw, 12);
            self.loop.start();
        },
        stop: function () {
            if (this.loop) this.loop.stop();
            this.loop = null;
        }
    });

    /* ---------- 5. Niebla baja ---------- */

    // Textura de humo que se repite a lo ancho (ruido de valor fractal), generada una vez.
    var smokeUrl = null;
    function smokeTexture() {
        if (smokeUrl) return smokeUrl;
        var W = 512, H = 128;
        var octaves = [
            { cells: 4, amp: 0.5 },
            { cells: 8, amp: 0.27 },
            { cells: 16, amp: 0.15 },
            { cells: 32, amp: 0.08 }
        ].map(function (o) {
            var cx = o.cells;
            var cy = Math.max(2, Math.round(o.cells * H / W)) + 1;
            var grid = [];
            for (var i = 0; i < cx * cy; i++) grid.push(Math.random());
            return { cx: cx, cy: cy, amp: o.amp, grid: grid };
        });
        function fade(t) { return t * t * (3 - 2 * t); }
        function sample(o, x, y) {
            var gx = x / W * o.cx;              // Se repite en x: la última celda une con la primera.
            var gy = y / H * (o.cy - 1);
            var x0 = Math.floor(gx), y0 = Math.floor(gy);
            var tx = fade(gx - x0), ty = fade(gy - y0);
            var x1 = (x0 + 1) % o.cx;
            var y1 = Math.min(y0 + 1, o.cy - 1);
            x0 = x0 % o.cx;
            var a = o.grid[y0 * o.cx + x0], b = o.grid[y0 * o.cx + x1];
            var c = o.grid[y1 * o.cx + x0], d = o.grid[y1 * o.cx + x1];
            return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
        }
        var canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        var ctx = canvas.getContext('2d');
        var img = ctx.createImageData(W, H);
        for (var y = 0; y < H; y++) {
            var vertical = Math.min(1, y / (H * 0.55));  // Más denso abajo.
            for (var x = 0; x < W; x++) {
                var v = 0;
                for (var k = 0; k < octaves.length; k++) v += octaves[k].amp * sample(octaves[k], x, y);
                var t = Math.max(0, Math.min(1, (v - 0.36) / 0.5));
                var a = t * t * (3 - 2 * t) * vertical;
                var i = (y * W + x) * 4;
                // Gris frío con un tinte rojizo: se suma (screen) y contrasta con el piso negro.
                img.data[i] = 196;
                img.data[i + 1] = 182;
                img.data[i + 2] = 192;
                img.data[i + 3] = a * 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        smokeUrl = canvas.toDataURL('image/png');
        return smokeUrl;
    }

    define('niebla', {
        label: 'Niebla',
        variants: { a: 'Manchas', b: 'Humo', c: 'Densa' },
        start: function (v, layer) {
            // Caja de la niebla: piso (y > 56%). Dos máscaras quietas: arriba se esfuma
            // y el círculo del centro queda despejado.
            layer.classList.add('fx-fog', 'fx-fog--' + v);
            var hole = el('div', 'fx-fog__hole', layer);
            if (v === 'c') {
                el('div', 'fx-fog__ground', hole);
            }
            var url = v === 'a' ? null : 'url(' + smokeTexture() + ')';
            var layers = ['fx-fog__layer fx-fog__layer--1', 'fx-fog__layer fx-fog__layer--2'];
            if (v === 'c') layers.push('fx-fog__layer fx-fog__layer--3');
            layers.forEach(function (cls) {
                var l = el('div', cls, hole);
                if (url) l.style.backgroundImage = url;
            });
        }
    });

    /* ---------- 6. Chispas y gotas del tubo roto ---------- */

    var SPARK_POINTS = [[76.6, 23.0], [84.2, 33.0], [77.2, 44.5]];
    // Punto de goteo y altura del piso donde cae, en % del escenario.
    var DRIP_POINTS = [[76.4, 47.0, 66.4], [85.3, 44.5, 67.4], [80.6, 59.6, 66.8]];

    define('chispas', {
        label: 'Chispas',
        variants: { a: 'Chispas', b: 'Gotas', c: 'Ambas' },
        start: function (v, layer, clock) {
            if (reduceMotion) return;

            function burst() {
                var p = pick(SPARK_POINTS);
                var W = stage.offsetWidth;
                var flash = place(el('div', 'fx-spark-flash', layer), { x: p[0], y: p[1] });
                var fa = animate(flash, [
                    { opacity: 0, transform: 'translate(-50%, -50%) scale(.4)' },
                    { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.15 },
                    { opacity: 0, transform: 'translate(-50%, -50%) scale(.7)' }
                ], { duration: rand(260, 420), easing: 'ease-out' });
                if (fa) fa.onfinish = function () { flash.remove(); };
                else flash.remove();

                var n = randInt(14, 24);
                for (var i = 0; i < n; i++) {
                    var spark = place(el('div', 'fx-spark', layer), { x: p[0], y: p[1] });
                    var vx = rand(-1, 1) * W * 0.045;
                    var vy = rand(-0.03, 0.004) * W;
                    var g = W * rand(0.07, 0.11);
                    var frames = [];
                    for (var k = 0; k <= 8; k++) {
                        var t = k / 8;
                        frames.push({
                            transform: 'translate(' + (vx * t).toFixed(1) + 'px,' + (vy * t + g * t * t).toFixed(1) + 'px) scale(' + (1 - t * 0.6).toFixed(2) + ')',
                            opacity: k === 8 ? 0 : (k > 4 && Math.random() < 0.3 ? 0.3 : 1)
                        });
                    }
                    var a = animate(spark, frames, { duration: rand(600, 1400), easing: 'linear', delay: rand(0, 90) });
                    (function (s) {
                        if (a) a.onfinish = function () { s.remove(); };
                        else s.remove();
                    })(spark);
                }
            }

            function burstLater(first) {
                clock.later(function () {
                    burst();
                    if (Math.random() < 0.45) clock.later(burst, rand(120, 300)); // A veces doble.
                    burstLater(false);
                }, first ? rand(700, 1500) : rand(2500, 6000));
            }

            function drip(p) {
                var H = stage.offsetHeight;
                var drop = place(el('div', 'fx-drop', layer), { x: p[0], y: p[1] });
                var fall = (p[2] - p[1]) / 100 * H;
                var swell = animate(drop, [
                    { transform: 'translate(-50%, 0) scale(.2)', opacity: 0 },
                    { transform: 'translate(-50%, 0) scale(1)', opacity: 0.9 }
                ], { duration: rand(500, 900), easing: 'ease-out', fill: 'forwards' });
                function doFall() {
                    var f = animate(drop, [
                        { transform: 'translate(-50%, 0) scale(1)', opacity: 0.9 },
                        { transform: 'translate(-50%, ' + fall.toFixed(1) + 'px) scale(.8, 1.4)', opacity: 0.9 }
                    ], { duration: 260 + fall * 1.6, easing: 'cubic-bezier(.55, 0, 1, .45)', fill: 'forwards' });
                    if (!f) return drop.remove();
                    f.onfinish = function () {
                        drop.remove();
                        ripple(p[0], p[2], 0);
                        ripple(p[0], p[2], 140);
                    };
                }
                if (swell) swell.onfinish = function () { clock.later(doFall, rand(100, 500)); };
                else drop.remove();
            }

            function ripple(x, y, delay) {
                var r = place(el('div', 'fx-ripple', layer), { x: x, y: y });
                var a = animate(r, [
                    { transform: 'translate(-50%, -50%) scale(.15)', opacity: delay ? 0.6 : 1 },
                    { transform: 'translate(-50%, -50%) scale(1.5)', opacity: 0 }
                ], { duration: 900, delay: delay, easing: 'ease-out', fill: 'backwards' });
                if (a) a.onfinish = function () { r.remove(); };
                else r.remove();
            }

            if (v === 'a' || v === 'c') burstLater(true);
            if (v === 'b' || v === 'c') {
                DRIP_POINTS.forEach(function (p, i) {
                    (function dripLater(first) {
                        clock.later(function () {
                            drip(p);
                            dripLater(false);
                        }, first ? 300 + i * rand(400, 700) : rand(1200, 3200));
                    })(true);
                });
            }
        }
    });

    /* ---------- 7. Ojos en la oscuridad ---------- */

    // Lugares muy oscuros donde pueden aparecer, en % del escenario.
    var EYE_ZONES = [
        // En la pasarela de atrás, sobre la puerta: asomados por encima de la baranda.
        [[41, 18], [45, 19.5], [49, 17.5], [53, 19], [57, 18], [60.5, 19.5]],
        // Entre los barrotes de la pasarela.
        [[44, 23], [50, 22.8], [56, 23]],
        // Detrás de los tubos de la izquierda: en los huecos oscuros entre columnas.
        [[25.8, 26.5], [26.2, 32], [39.2, 31.5], [39.4, 37.5]],
        // Detrás de los tubos de la derecha.
        [[60.2, 31], [60.4, 37], [73.6, 28.5], [73.8, 34.5]]
    ];

    var EYE_DEFS = '<svg class="fx-eye-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +
        '<radialGradient id="jpxEyeIris"><stop offset="0" stop-color="#ffe08a"/><stop offset=".3" stop-color="#ff7a26"/><stop offset=".7" stop-color="#d8240e"/><stop offset="1" stop-color="#4a0805"/></radialGradient>' +
        '<radialGradient id="jpxEyeHalo"><stop offset="0" stop-color="#ff3214" stop-opacity=".7"/><stop offset=".45" stop-color="#d81e0a" stop-opacity=".28"/><stop offset="1" stop-color="#b01408" stop-opacity="0"/></radialGradient>' +
        '<radialGradient id="jpxEyeWhite"><stop offset="0" stop-color="#5a120a"/><stop offset="1" stop-color="#1e0403"/></radialGradient>' +
        '<clipPath id="jpxEyeClip" clipPathUnits="userSpaceOnUse"><path d="M3 10 Q20 0 37 10 Q20 20 3 10Z"/></clipPath>' +
        '</defs></svg>';
    // Ojo con brillo propio: halo suave (sale del recuadro), párpado oscuro e iris encendido.
    var EYE_SVG = '<svg viewBox="0 0 40 20" aria-hidden="true" focusable="false">' +
        '<ellipse cx="20" cy="10" rx="28" ry="17" fill="url(#jpxEyeHalo)"/>' +
        '<path d="M3 10 Q20 0 37 10 Q20 20 3 10Z" fill="url(#jpxEyeWhite)"/>' +
        '<g clip-path="url(#jpxEyeClip)"><g class="fx-eye__look">' +
        '<circle cx="20" cy="10" r="6.2" fill="url(#jpxEyeIris)"/>' +
        '<ellipse cx="20" cy="10" rx="1.2" ry="4.8" fill="#080000"/>' +
        '</g></g></svg>';

    var OPEN_FRAMES = [
        { transform: 'scaleY(.02)', opacity: 0 },
        { transform: 'scaleY(.18)', opacity: 0.5, offset: 0.45 },
        { transform: 'scaleY(1)', opacity: 1 }
    ];
    var CLOSE_FRAMES = [
        { transform: 'scaleY(1)', opacity: 1 },
        { transform: 'scaleY(.02)', opacity: 0 }
    ];
    var BLINK_FRAMES = [
        { transform: 'scaleY(1)' },
        { transform: 'scaleY(.06)', offset: 0.45 },
        { transform: 'scaleY(1)' }
    ];

    define('ojos', {
        label: 'Ojos',
        variants: { a: 'Par', b: 'Racimo', c: 'Mirada' },
        // Opciones: first y every = [mín, máx] en ms para la primera aparición y las
        // siguientes; zone = índice de EYE_ZONES para forzar una zona (pruebas).
        start: function (v, layer, clock, opts) {
            if (reduceMotion) return;
            var self = this;
            opts = opts || {};
            var first = opts.first || [2500, 4000];
            var every = opts.every || [12000, 25000];
            layer.insertAdjacentHTML('beforeend', EYE_DEFS);

            // ¿Se ve este punto del escenario en la pantalla actual? (en celular se recorta mucho)
            function visible(p) {
                var s = stage.getBoundingClientRect();
                var r = stage.parentNode.getBoundingClientRect();
                var x = s.left + p[0] / 100 * s.width;
                var y = s.top + p[1] / 100 * s.height;
                var m = Math.min(r.width, r.height) * 0.03;
                return x > r.left + m && x < r.right - m && y > r.top + m && y < r.bottom - m;
            }

            function makeEye(x, y, size, tilt) {
                var wrap = place(el('div', 'fx-eye', layer), { x: x, y: y, w: size });
                wrap.style.transform = 'translate(-50%, -50%) rotate(' + tilt.toFixed(1) + 'deg)';
                wrap.innerHTML = EYE_SVG;
                var svg = wrap.firstChild;
                svg.style.opacity = 0;
                return { wrap: wrap, svg: svg, look: svg.querySelector('.fx-eye__look'), lx: 0, ly: 0 };
            }

            function play(eye, frames, duration, easing) {
                return animate(eye.svg, frames, { duration: duration, easing: easing || 'ease-in-out', fill: 'forwards' });
            }

            function blink(eye) { play(eye, BLINK_FRAMES, rand(170, 240)); }

            var shown = [];  // Ojos abiertos ahora (para seguir al mouse en la variante C).

            function remove(eyes) {
                eyes.forEach(function (e) {
                    e.wrap.remove();
                    var i = shown.indexOf(e);
                    if (i > -1) shown.splice(i, 1);
                });
                if (!shown.length && self.loop) self.loop.stop();
            }

            function pair(spot) {
                var size = rand(2.4, 3.0);
                var gap = size * 1.4;
                var tilt = rand(-6, 6);
                var eyes = [makeEye(spot[0] - gap / 2, spot[1], size, tilt), makeEye(spot[0] + gap / 2, spot[1], size, tilt)];
                eyes.forEach(function (e, i) {
                    clock.later(function () { play(e, OPEN_FRAMES, 1600, 'ease-out'); }, i * 60);
                    shown.push(e);
                });
                if (v === 'c' && self.loop) self.loop.start();
                // Se quedan abiertos un buen rato, con dos o tres parpadeos.
                var t = 1600 + rand(2000, 3000);
                clock.later(function () { eyes.forEach(blink); }, t);
                t += rand(1800, 2800);
                clock.later(function () { eyes.forEach(blink); }, t);
                t += rand(1200, 2200);
                if (Math.random() < 0.5) {
                    clock.later(function () { eyes.forEach(blink); }, t);
                    t += rand(1000, 1800);
                }
                clock.later(function () { eyes.forEach(function (e) { play(e, CLOSE_FRAMES, 1100, 'ease-in'); }); }, t);
                return { eyes: eyes, duration: t + 1200 };
            }

            function cluster(spot) {
                var n = randInt(8, 14);
                var eyes = [];
                var tries = 0;
                while (eyes.length < n && tries++ < 160) {
                    var size = rand(0.9, 2.6);
                    var x = spot[0] + rand(-5.5, 5.5);
                    var y = spot[1] + rand(-7, 7);
                    var free = eyes.every(function (e) {
                        var dx = (e.x - x) * 1.78, dy = e.y - y;  // Compensa la proporción del escenario.
                        return Math.sqrt(dx * dx + dy * dy) > (e.size + size) * 0.95;
                    });
                    if (free && visible([x, y])) {
                        var eye = makeEye(x, y, size, rand(-12, 12));
                        eye.x = x; eye.y = y; eye.size = size;
                        eyes.push(eye);
                    }
                }
                var t = 0;
                eyes.forEach(function (e) {
                    clock.later(function () { play(e, OPEN_FRAMES, 900, 'ease-out'); }, t);
                    t += rand(220, 480);
                });
                t += 900 + rand(4500, 6500);
                eyes.forEach(function (e) {
                    if (Math.random() < 0.6) clock.later(function () { blink(e); }, t - rand(400, 2000));
                });
                eyes.slice().reverse().forEach(function (e) {
                    clock.later(function () { play(e, CLOSE_FRAMES, 700, 'ease-in'); }, t);
                    t += rand(150, 260);
                });
                shown = shown.concat(eyes);
                return { eyes: eyes, duration: t + 800 };
            }

            function appear() {
                var source = opts.zone != null ? [EYE_ZONES[opts.zone]] : EYE_ZONES;
                var zones = source.map(function (z) { return z.filter(visible); })
                    .filter(function (z) { return z.length; });
                var wait = 3000;
                if (zones.length) {
                    var spot = pick(pick(zones));
                    spot = [spot[0] + rand(-1, 1), spot[1] + rand(-1, 1)];
                    var shot = v === 'b' ? cluster(spot) : pair(spot);
                    wait = shot.duration;
                    clock.later(function () { remove(shot.eyes); }, wait);
                }
                clock.later(appear, wait + rand(every[0], every[1]));
            }

            if (v === 'c') {
                // La pupila sigue levemente al mouse.
                var mouse = null;
                self.onMouse = function (e) { mouse = { x: e.clientX, y: e.clientY }; };
                window.addEventListener('mousemove', self.onMouse, { passive: true });
                self.loop = new Loop(function () {
                    shown.forEach(function (e) {
                        var tx = 0, ty = 0;
                        if (mouse) {
                            var r = e.wrap.getBoundingClientRect();
                            var dx = mouse.x - (r.left + r.width / 2);
                            var dy = mouse.y - (r.top + r.height / 2);
                            var dist = Math.sqrt(dx * dx + dy * dy) || 1;
                            var k = Math.min(1, dist / 350);
                            tx = dx / dist * k * 4;
                            ty = dy / dist * k * 1.6;
                        }
                        e.lx += (tx - e.lx) * 0.08;
                        e.ly += (ty - e.ly) * 0.08;
                        e.look.style.transform = 'translate(' + e.lx.toFixed(2) + 'px,' + e.ly.toFixed(2) + 'px)';
                    });
                }, 30);
            }

            clock.later(appear, rand(first[0], first[1]));  // La primera aparición, enseguida.
        },
        stop: function () {
            if (this.loop) this.loop.stop();
            this.loop = null;
            if (this.onMouse) window.removeEventListener('mousemove', this.onMouse);
            this.onMouse = null;
        }
    });

    /* ---------- 8. Traje naranja (oscurecer) ---------- */

    define('traje', {
        label: 'Traje',
        variants: { a: 'Suave', b: 'Fuerte' },
        start: function (v, layer) {
            place(el('div', 'fx-suit', layer), { x: -3, y: 69, w: 31, h: 27 });
        }
    });

    /* ---------- 9 y 10. Enredaderas y círculo: la propia imagen, iluminada ---------- */

    // Una ventana del escenario que muestra la misma ilustración (realzada con un filtro
    // estático). Se suma con "screen" y solo se anima su opacidad: así lo que brilla
    // sigue exactamente la forma de las venas o de las líneas del círculo.
    function imageCopy(parent, box, className) {
        var win = place(el('div', 'fx-copy ' + (className || ''), parent), box);
        var img = el('div', 'fx-copy__img', win);
        var bg = stage.querySelector('.jpx-lab__bg');
        img.style.backgroundImage = 'url("' + (bg.currentSrc || bg.src) + '")';
        img.style.left = (-box.x / box.w * 100) + '%';
        img.style.top = (-box.y / box.h * 100) + '%';
        img.style.width = (100 / box.w * 100) + '%';
        img.style.height = (100 / box.h * 100) + '%';
        return win;
    }

    define('venas', {
        label: 'Enredaderas',
        variants: { a: 'Pulso', b: 'Latido' },
        start: function (v, layer) {
            // Venas de la izquierda (de la esquina hasta el piso) y las del tubo roto.
            imageCopy(layer, { x: 0, y: 0, w: 30, h: 68 }, 'fx-veins fx-veins--left');
            var right = imageCopy(layer, { x: 81, y: 36, w: 19, h: 34 }, 'fx-veins fx-veins--right');
            right.style.animationDelay = '-.35s';
        }
    });

    define('circulo', {
        label: 'Círculo',
        variants: { a: 'Respiración', b: 'Barrido' },
        start: function (v, layer) {
            // Círculo de símbolos del piso (≈ x 31–70%, y 70–84%).
            var box = { x: 29, y: 68, w: 42, h: 18 };
            imageCopy(layer, box, 'fx-circle');
            if (v === 'b') {
                // Un haz de luz roja con estela que gira sobre el círculo (en perspectiva).
                // Es solo luz que se suma: nada oscuro, así no deja sombras sobre el piso.
                var sweep = place(el('div', 'fx-sweep', layer), box);
                var wrap = el('div', 'fx-circle__wrap', sweep);
                el('div', 'fx-circle__rotor', wrap);
            }
        }
    });

    /* ---------- 11. Bicho: ciempiés o larva que pasa de vez en cuando ---------- */

    // Los recorridos están en % del escenario. Los ciempiés esquivan el círculo del centro
    // (ahí va el maniquí) y no bajan de y ≈ 94%, que con el zoom del mouse queda fuera de cuadro.
    var BUG_PATHS = {
        // A: entra por la derecha y cruza todo el piso cerca del borde de abajo.
        a: [[103, 90], [96, 91.2], [89, 93], [80, 93.6], [70, 92.2], [60, 93.2], [50, 91.6],
            [40, 92.6], [30, 91.4], [22, 93], [13, 95], [3, 97], [-4, 98]],
        // B: chiquito y lejos, por el borde de las bases de los tubos de la derecha.
        b: [[73.5, 60.8], [70.5, 60.4], [67, 60.9], [63.5, 60.3], [60.5, 60.8], [58.2, 60.1], [56.8, 59.4]],
        // C: asoma por la rejilla, sale un poco, mira y se vuelve a meter.
        c: [[83.5, 91], [81.6, 89.6], [79.6, 87.4], [77.9, 85.9], [76.7, 85.5], [76.2, 86.4],
            [77.2, 87.7], [79.2, 89.5], [81.2, 91.1], [82.6, 92]],
        // D: larva que sale de una grieta del tubo roto y trepa por el vidrio.
        d: [[80.9, 48], [80.6, 45.5], [80, 42.5], [79.5, 39.5], [79.3, 36.5], [79.6, 34]]
    };
    var BUG_KIND = {
        a: 'centi', b: 'centi', c: 'centi', d: 'larva'
    };
    var BUG_SPEC = {
        // segs: segmentos; gap: separación (en % del ancho); speed: % del ancho por segundo.
        centi: { segs: 22, gap: 0.27, speed: 6.5 },
        larva: { segs: 11, gap: 0.42, speed: 0.75 }
    };
    var ASPECT = 941 / 1672;  // Alto / ancho del escenario: para medir distancias parejas en x e y.

    // Suaviza el recorrido (Catmull-Rom) y lo deja listo para ubicar puntos por distancia.
    function bugPath(points) {
        var p = points.map(function (q) { return [q[0], q[1] * ASPECT]; });
        var dense = [];
        for (var i = 0; i < p.length - 1; i++) {
            var p0 = p[Math.max(i - 1, 0)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(i + 2, p.length - 1)];
            for (var s = 0; s < 12; s++) {
                var t = s / 12, t2 = t * t, t3 = t2 * t;
                dense.push([0, 1].map(function (k) {
                    return 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t +
                        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
                        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
                }));
            }
        }
        dense.push(p[p.length - 1]);
        var cum = [0];
        for (var j = 1; j < dense.length; j++) {
            var dx = dense[j][0] - dense[j - 1][0], dy = dense[j][1] - dense[j - 1][1];
            cum.push(cum[j - 1] + Math.sqrt(dx * dx + dy * dy));
        }
        return { pts: dense, cum: cum, len: cum[cum.length - 1] };
    }
    // Punto del recorrido a una distancia d: {x, y} en % del escenario y ángulo en grados.
    function bugAt(path, d) {
        var cum = path.cum, pts = path.pts;
        d = Math.max(0, Math.min(path.len, d));
        var lo = 0, hi = cum.length - 1;
        while (hi - lo > 1) {
            var mid = (lo + hi) >> 1;
            if (cum[mid] <= d) lo = mid; else hi = mid;
        }
        var a = pts[lo], b = pts[hi];
        var t = (d - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
        return {
            x: a[0] + (b[0] - a[0]) * t,
            y: (a[1] + (b[1] - a[1]) * t) / ASPECT,
            angle: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI
        };
    }

    define('bicho', {
        label: 'Bicho',
        variants: { a: 'Piso', b: 'Tubos', c: 'Rejilla', d: 'Larva' },
        // Opciones: first y every = [mín, máx] en ms para la primera pasada y las siguientes.
        start: function (v, layer, clock, opts) {
            if (reduceMotion) return;
            var self = this;
            var first = opts.first || [4000, 9000];
            var every = opts.every || [40000, 90000];
            var kind = BUG_KIND[v];
            var spec = BUG_SPEC[kind];
            var path = bugPath(BUG_PATHS[v]);
            // Al salir de la rejilla o de la grieta, los segmentos aparecen y desaparecen de a poco.
            var hiddenEnds = v === 'c' || v === 'd';
            var bug = null;

            function spawn() {
                var node = el('div', 'fx-bug fx-bug--' + kind, layer);
                var segs = [];
                for (var i = 0; i < spec.segs; i++) {
                    var seg = el('div', 'fx-bug__seg' + (i === 0 ? ' fx-bug__seg--head' : ''), node);
                    seg.style.setProperty('--i', i);
                    seg.style.zIndex = spec.segs - i;
                    segs.push(seg);
                }
                bug = {
                    node: node, segs: segs, d: 0, speed: 0, target: spec.speed,
                    phase: 'move', phaseLeft: rand(0.6, 1.6), looked: false, last: 0, time: 0
                };
            }

            function frame(now) {
                if (!bug) return;
                var dt = bug.last ? Math.min((now - bug.last) / 1000, 0.05) : 0.016;
                bug.last = now;
                bug.time += dt;

                if (kind === 'centi') {
                    // Corre, frena de golpe, se queda quieto un instante y sigue.
                    bug.phaseLeft -= dt;
                    if (v === 'c' && !bug.looked && bug.d > path.len * 0.42) {
                        bug.looked = true;  // En la rejilla, se asoma y se queda mirando.
                        bug.phase = 'still';
                        bug.phaseLeft = rand(1.1, 1.8);
                    } else if (bug.phaseLeft <= 0) {
                        var still = bug.phase === 'move' && Math.random() < 0.45;
                        bug.phase = still ? 'still' : 'move';
                        bug.phaseLeft = still ? rand(0.2, 0.8) : rand(0.5, 1.6);
                    }
                    bug.target = bug.phase === 'move' ? spec.speed * rand(0.92, 1.08) : 0;
                    bug.node.classList.toggle('is-still', bug.phase === 'still');
                    bug.speed += (bug.target - bug.speed) * Math.min(1, dt * 14);
                } else {
                    // La larva avanza a empujones: se estira y se contrae.
                    bug.speed = spec.speed * (0.35 + 0.65 * Math.max(0, Math.sin(bug.time * 3.2)));
                }
                bug.d += bug.speed * dt;

                var W = layer.clientWidth, H = layer.clientHeight;
                var dist = bug.d;
                for (var i = 0; i < bug.segs.length; i++) {
                    var gap = spec.gap;
                    if (kind === 'larva') gap *= 1 + 0.25 * Math.sin(bug.time * 3.2 - i * 0.7);
                    if (i > 0) dist -= gap;
                    var seg = bug.segs[i];
                    if (dist < 0 || dist > path.len) {
                        seg.style.opacity = 0;
                        continue;
                    }
                    var p = bugAt(path, dist);
                    // Más lejos (más arriba en el piso) se ve más chico.
                    var depth = kind === 'larva' ? 0.85 : 0.5 + 0.65 * Math.max(0, Math.min(1, (p.y - 55) / 40));
                    var taper = i < 3 ? 1 : 1 - Math.pow(i / bug.segs.length, 2) * 0.5;
                    var fade = 1;
                    if (hiddenEnds) fade = Math.max(0, Math.min(1, dist / 1.4, (path.len - dist) / 1.4));
                    seg.style.opacity = fade;
                    seg.style.transform = 'translate(' + (p.x / 100 * W).toFixed(1) + 'px,' + (p.y / 100 * H).toFixed(1) +
                        'px) translate(-50%, -50%) rotate(' + p.angle.toFixed(1) + 'deg) scale(' + (depth * taper).toFixed(3) + ')';
                }

                // Terminó cuando hasta la cola pasó el final.
                if (bug.d - spec.gap * (spec.segs - 1) * 1.4 > path.len) {
                    bug.node.remove();
                    bug = null;
                    self.loop.stop();
                    clock.later(appear, rand(every[0], every[1]));
                }
            }

            function appear() {
                spawn();
                self.loop.start();
            }

            self.loop = new Loop(frame);
            clock.later(appear, rand(first[0], first[1]));
        },
        stop: function () {
            if (this.loop) this.loop.stop();
            this.loop = null;
        }
    });

    /* ---------- API pública ---------- */

    window.JPEXLabFX = {
        reduceMotion: reduceMotion,

        init: function (stageNode) {
            stage = stageNode;
            fxRoot = el('div', 'jpx-fx', stage);
            fxRoot.setAttribute('aria-hidden', 'true');
        },

        // Prende un efecto con una variante ('a', 'b', 'c') o lo apaga (null).
        // opts: ajustes propios de cada efecto (por ejemplo, el ritmo de los ojos).
        set: function (id, variant, opts) {
            var def = effects[id];
            if (!def || !fxRoot) return;
            if (variant && !def.variants[variant]) variant = null;
            resetEffect(def);
            def.current = variant || null;
            if (!variant) return;
            def.layer = el('div', 'fx-layer fx-' + id + ' fx-' + id + '--' + variant, fxRoot);
            def.layer.style.zIndex = LAYER_Z[id] || 3;
            def.start(variant, def.layer, def.clock, opts || {});
        },

        get: function (id) {
            return effects[id] ? effects[id].current : null;
        },

        // Lista de efectos y variantes (para armar un panel de control).
        list: function () {
            return order.map(function (id) {
                var def = effects[id];
                return { id: id, label: def.label, variants: def.variants };
            });
        }
    };
})();
