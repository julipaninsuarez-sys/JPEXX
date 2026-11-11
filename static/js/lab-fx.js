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

    // Caja de cada tubo (con margen para el halo), en % del escenario.
    var TUBES = [
        { x: 14.0, y: 15.0, w: 12.0, h: 39.0 },  // grande izquierdo
        { x: 27.0, y: 29.5, w: 7.2, h: 26.0 },   // mediano izquierdo
        { x: 33.4, y: 36.5, w: 5.0, h: 19.5 },   // chico izquierdo
        { x: 60.9, y: 36.5, w: 5.0, h: 19.5 },   // chico derecho
        { x: 65.6, y: 29.5, w: 7.2, h: 26.5 },   // mediano derecho
        { x: 74.2, y: 14.0, w: 12.0, h: 42.0 }   // grande roto
    ];
    // Niveles de luz: brillo extra (glow) y oscurecido de la luz pintada (dim).
    var TUBE_LEVEL = {
        on: [0.5, 0],
        surge: [0.85, 0],
        low: [0.05, 0.5],
        off: [0, 0.88]
    };

    define('tubos', {
        label: 'Tubos',
        variants: { a: 'Respiración', b: 'Falla', c: 'Apagones' },
        start: function (v, layer, clock) {
            var tubes = TUBES.map(function (box) {
                var tube = place(el('div', 'fx-tube', layer), box);
                var dim = el('div', 'fx-tube__dim', tube);
                var glow = el('div', 'fx-tube__glow', tube);
                return { node: tube, dim: dim, glow: glow };
            });

            function setLevel(t, name) {
                var level = TUBE_LEVEL[name];
                t.glow.style.opacity = level[0];
                t.dim.style.opacity = level[1];
            }

            if (reduceMotion) {
                tubes.forEach(function (t) { setLevel(t, 'on'); });
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

            tubes.forEach(function (t) { setLevel(t, 'on'); });

            if (v === 'b') {
                // Falla eléctrica: casi fijo, con titileos rápidos al azar.
                tubes.forEach(function (t) {
                    (function flickerLater(first) {
                        clock.later(function () {
                            var list = [];
                            var n = randInt(1, 3);
                            for (var i = 0; i < n; i++) {
                                list.push([Math.random() < 0.25 ? 'off' : 'low', rand(35, 110)]);
                                list.push([Math.random() < 0.2 ? 'surge' : 'on', rand(40, 140)]);
                            }
                            list.push(['on', 0]);
                            clock.steps(list, function (s) { setLevel(t, s); }, function () {
                                flickerLater(false);
                            });
                        }, first ? rand(300, 4000) : rand(2000, 9000));
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
                            var list = [['off', rand(1000, 2000)]];
                            var stutters = randInt(2, 4);
                            for (var i = 0; i < stutters; i++) {
                                list.push([Math.random() < 0.5 ? 'on' : 'low', rand(40, 110)]);
                                list.push(['off', rand(60, 240)]);
                            }
                            list.push(['on', 0]);
                            clock.steps(list, function (s) { setLevel(t, s); }, function () {
                                busy.splice(busy.indexOf(t), 1);
                            });
                        }
                        outageLater(false);
                    }, first ? rand(800, 1800) : rand(3500, 8000));
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
            var wash = place(el('div', 'fx-lamp__wash', layer), { x: 41, y: 33.5, w: 18, h: 24 });
            var halo = place(el('div', 'fx-lamp__halo', layer), { x: 43, y: 29, w: 14, h: 10.5 });
            var cover = place(el('div', 'fx-lamp__cover', layer), { x: 48.3, y: 33.1, w: 3.4, h: 2.0 });
            var sides = [
                { halo: { x: 38.7, y: 43.6, w: 3.0, h: 5.2 }, cover: { x: 39.75, y: 45.4, w: 0.9, h: 1.6 } },
                { halo: { x: 57.6, y: 44.3, w: 3.0, h: 5.2 }, cover: { x: 58.65, y: 46.1, w: 0.9, h: 1.6 } }
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
            // Halo y tapa del LED pintado (≈ 91.5%, 10.9%). El parpadeo es solo CSS.
            place(el('div', 'fx-cam__halo', layer), { x: 89.9, y: 8.1, w: 3.2, h: 5.6 });
            place(el('div', 'fx-cam__cover', layer), { x: 91.0, y: 10.0, w: 1.0, h: 1.8 });
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
                        var band = Math.abs(y - s.roll) < 3 ? 60 : 0;
                        var lineDark = y === tear ? 0.25 : 1;
                        for (var x = 0; x < W; x++) {
                            var g = (Math.random() * 200 + band) * lineDark;
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
                img.data[i] = 125;
                img.data[i + 1] = 78;
                img.data[i + 2] = 84;
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
            ['fx-fog__layer fx-fog__layer--1', 'fx-fog__layer fx-fog__layer--2'].forEach(function (cls) {
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
                ], { duration: rand(220, 380), easing: 'ease-out' });
                if (fa) fa.onfinish = function () { flash.remove(); };
                else flash.remove();

                var n = randInt(7, 14);
                for (var i = 0; i < n; i++) {
                    var spark = place(el('div', 'fx-spark', layer), { x: p[0], y: p[1] });
                    var vx = rand(-1, 1) * W * 0.03;
                    var vy = rand(-0.02, 0.004) * W;
                    var g = W * rand(0.05, 0.08);
                    var frames = [];
                    for (var k = 0; k <= 8; k++) {
                        var t = k / 8;
                        frames.push({
                            transform: 'translate(' + (vx * t).toFixed(1) + 'px,' + (vy * t + g * t * t).toFixed(1) + 'px) scale(' + (1 - t * 0.6).toFixed(2) + ')',
                            opacity: k === 8 ? 0 : (k > 4 && Math.random() < 0.3 ? 0.3 : 1)
                        });
                    }
                    var a = animate(spark, frames, { duration: rand(450, 1100), easing: 'linear', delay: rand(0, 90) });
                    (function (s) {
                        if (a) a.onfinish = function () { s.remove(); };
                        else s.remove();
                    })(spark);
                }
            }

            function burstLater(first) {
                clock.later(function () {
                    burst();
                    if (Math.random() < 0.35) clock.later(burst, rand(120, 300)); // A veces doble.
                    burstLater(false);
                }, first ? rand(900, 2000) : rand(4000, 9000));
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
                    { transform: 'translate(-50%, -50%) scale(.15)', opacity: delay ? 0.45 : 0.8 },
                    { transform: 'translate(-50%, -50%) scale(1.5)', opacity: 0 }
                ], { duration: 750, delay: delay, easing: 'ease-out', fill: 'backwards' });
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
                        }, first ? 400 + i * rand(500, 900) : rand(1800, 4500));
                    })(true);
                });
            }
        }
    });

    /* ---------- 7. Ojos en la oscuridad ---------- */

    // Lugares muy oscuros donde pueden aparecer, en % del escenario.
    var EYE_ZONES = [
        [[44, 8], [47, 13], [52, 10], [55, 15], [50, 5], [57, 6]],   // arriba al centro
        [[3, 4], [7, 6], [3.5, 9.5], [9, 2.5]],                      // esquina superior izquierda
        [[97.5, 67], [97, 73], [98, 79]]                             // detrás de las cajas, abajo a la derecha
    ];

    var EYE_DEFS = '<svg class="fx-eye-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +
        '<radialGradient id="jpxEyeIris"><stop offset="0" stop-color="#ffc061"/><stop offset=".45" stop-color="#e2401c"/><stop offset="1" stop-color="#3a0604"/></radialGradient>' +
        '<radialGradient id="jpxEyeHalo"><stop offset="0" stop-color="#c8200c" stop-opacity=".45"/><stop offset="1" stop-color="#c8200c" stop-opacity="0"/></radialGradient>' +
        '<clipPath id="jpxEyeClip" clipPathUnits="userSpaceOnUse"><path d="M3 10 Q20 0 37 10 Q20 20 3 10Z"/></clipPath>' +
        '</defs></svg>';
    var EYE_SVG = '<svg viewBox="0 0 40 20" aria-hidden="true" focusable="false">' +
        '<ellipse cx="20" cy="10" rx="20" ry="10" fill="url(#jpxEyeHalo)"/>' +
        '<path d="M3 10 Q20 0 37 10 Q20 20 3 10Z" fill="#2e0806"/>' +
        '<g clip-path="url(#jpxEyeClip)"><g class="fx-eye__look">' +
        '<circle cx="20" cy="10" r="5.8" fill="url(#jpxEyeIris)"/>' +
        '<ellipse cx="20" cy="10" rx="1.1" ry="4.6" fill="#060000"/>' +
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
        start: function (v, layer, clock) {
            if (reduceMotion) return;
            var self = this;
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
                var size = rand(1.2, 1.5);
                var gap = size * 1.45;
                var tilt = rand(-6, 6);
                var eyes = [makeEye(spot[0] - gap / 2, spot[1], size, tilt), makeEye(spot[0] + gap / 2, spot[1], size, tilt)];
                eyes.forEach(function (e, i) {
                    clock.later(function () { play(e, OPEN_FRAMES, 1800, 'ease-out'); }, i * 60);
                    shown.push(e);
                });
                if (v === 'c' && self.loop) self.loop.start();
                var t = 1800 + rand(1800, 3200);
                clock.later(function () { eyes.forEach(blink); }, t);
                t += rand(1200, 2500);
                if (Math.random() < 0.5) {
                    clock.later(function () { eyes.forEach(blink); }, t);
                    t += rand(900, 1800);
                }
                clock.later(function () { eyes.forEach(function (e) { play(e, CLOSE_FRAMES, 1100, 'ease-in'); }); }, t);
                return { eyes: eyes, duration: t + 1200 };
            }

            function cluster(spot) {
                var n = randInt(5, 8);
                var eyes = [];
                var tries = 0;
                while (eyes.length < n && tries++ < 60) {
                    var size = rand(0.55, 1.4);
                    var x = spot[0] + rand(-3, 3);
                    var y = spot[1] + rand(-4, 4);
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
                    t += rand(350, 700);
                });
                t += 900 + rand(2200, 3200);
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
                var zones = EYE_ZONES.map(function (z) { return z.filter(visible); })
                    .filter(function (z) { return z.length; });
                var wait = 3000;
                if (zones.length) {
                    var spot = pick(pick(zones));
                    spot = [spot[0] + rand(-1, 1), spot[1] + rand(-1, 1)];
                    var shot = v === 'b' ? cluster(spot) : pair(spot);
                    wait = shot.duration;
                    clock.later(function () { remove(shot.eyes); }, wait);
                }
                clock.later(appear, wait + rand(12000, 25000));
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

            clock.later(appear, rand(2500, 4000));  // La primera aparición, enseguida.
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

    /* ---------- API pública ---------- */

    window.JPEXLabFX = {
        reduceMotion: reduceMotion,

        init: function (stageNode) {
            stage = stageNode;
            fxRoot = el('div', 'jpx-fx', stage);
            fxRoot.setAttribute('aria-hidden', 'true');
        },

        // Prende un efecto con una variante ('a', 'b', 'c') o lo apaga (null).
        set: function (id, variant) {
            var def = effects[id];
            if (!def || !fxRoot) return;
            if (variant && !def.variants[variant]) variant = null;
            resetEffect(def);
            def.current = variant || null;
            if (!variant) return;
            def.layer = el('div', 'fx-layer fx-' + id + ' fx-' + id + '--' + variant, fxRoot);
            def.start(variant, def.layer, def.clock);
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
