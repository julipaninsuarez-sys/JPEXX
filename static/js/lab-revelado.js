/* Sala de revelado (el probador del Lab).
 *
 * Recorrido: la persona completa el formulario (prenda, medidas y foto) y toca "Revelar" → su
 * foto y la prenda vuelan a las ranuras → la máquina se enciende → en la cámara de vidrio se arma
 * un holograma mientras la IA trabaja (se manda el formulario a lab_revelado_probar y se espera
 * la respuesta) → se aplasta, destello, sale un sobre por abajo → el sobre viene al frente → se
 * toca, se abre, sale la foto, el sobre se cae → la foto se revela de a poco → talle y botones.
 * Si la IA no pudo, la máquina se apaga y se puede volver a intentar.
 *
 * ?demo=trabajando|sobre|final simula la IA con una prueba ya guardada (data-foto/prenda/resultado).
 */
(function () {
    'use strict';

    var root = document.getElementById('jpx-rv');
    if (!root) return;

    function $(sel, el) { return (el || root).querySelector(sel); }
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var qs = new URLSearchParams(location.search);

    // Si no hay prueba guardada en la compu, imágenes de relleno para que el boceto igual ande.
    function relleno(texto, fondo) {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="100%" height="100%" fill="' + fondo +
            '"/><text x="50%" y="50%" fill="#ff8a78" font-family="sans-serif" font-size="22" text-anchor="middle">' + texto + '</text></svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }
    var demo = qs.get('demo');
    var SRC = {
        foto: qs.get('foto') || root.dataset.foto || relleno('tu foto', '#2a1416'),
        prenda: qs.get('prenda') || root.dataset.prenda || relleno('prenda', '#ffffff'),
        resultado: qs.get('resultado') || root.dataset.resultado || relleno('resultado', '#3a1a1c')
    };

    var scene = $('.jpx-rv__scene');
    var chamber = $('.jpx-rv__chamber');
    var reveal = $('.jpx-rv__reveal');
    var env = $('.jpx-env');
    var clip = $('.jpx-env__clip');
    var print = $('.jpx-rv__print');
    var photo = $('.jpx-rv__photo');
    var finalBox = $('.jpx-rv__final');
    var actions = $('.jpx-rv__actions');
    var msg = $('.jpx-rv__msg');
    var bar = $('.jpx-rv__bar i');
    var screenL = $('.jpx-rv__screen--l span');
    var screenR = $('.jpx-rv__screen--r span');
    var form = $('#rvForm');
    var goBtn = $('#rvForm .jpx-rv__go');
    var fileInput = $('.jpx-rv__file');
    var selPrenda = $('#rvPrenda');
    var selTalle = $('#rvTalle');
    var cardFoto = $('.jpx-rv__card[data-card="foto"]');
    var formError = $('.jpx-rv__form-error');
    var failBox = $('.jpx-rv__fail');

    // ------------------------------------------------------------------ 0) el formulario
    function ponerFoto(url) {
        $('.jpx-rv__card[data-card="foto"] img').src = url;
        $('.jpx-rv__holo--persona').src = url;
        $('.jpx-rv__before img').src = url;
        cardFoto.classList.toggle('has-foto', !!url);
    }
    function ponerPrendaImg(url) {
        $('.jpx-rv__card[data-card="prenda"] img').src = url;
        $('.jpx-rv__holo--prenda img').src = url;
    }
    // Al cambiar de prenda: su foto en la tarjeta y sus talles en "Talle".
    function elegirPrenda() {
        var op = selPrenda && selPrenda.options[selPrenda.selectedIndex];
        if (!op) return;
        ponerPrendaImg(op.dataset.img || '');
        var antes = selTalle.value !== 'auto' ? selTalle.value : (selTalle.dataset.pedido || 'auto');
        selTalle.dataset.pedido = '';
        selTalle.length = 1;
        (op.dataset.talles || '').split(',').filter(Boolean).forEach(function (t) {
            selTalle.add(new Option('Talle ' + t, t, false, t === antes));
        });
    }
    // La foto se achica en el celu antes de mandarla (una de 12 MP pasa de ~4 MB a ~400 KB): sube
    // mucho más rápido y la IA igual la usa a 1024 px. Dibujarla en un lienzo además la endereza.
    function achicarFoto(file, max) {
        return new Promise(function (ok) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () {
                var k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
                var c = document.createElement('canvas');
                c.width = Math.round(img.naturalWidth * k);
                c.height = Math.round(img.naturalHeight * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url);
                c.toBlob(function (b) { ok(b || file); }, 'image/jpeg', .9);
            };
            img.onerror = function () { URL.revokeObjectURL(url); ok(file); };   // si no la puede leer, va tal cual
            img.src = url;
        });
    }
    var fotoBlob = null, fotoURL = '';
    function avisarForm(texto) { formError.textContent = texto; formError.hidden = !texto; }

    if (demo) {
        ponerFoto(SRC.foto);
        ponerPrendaImg(SRC.prenda);
        fileInput.required = false;
    } else if (selPrenda) {
        elegirPrenda();
        selPrenda.addEventListener('change', elegirPrenda);
    }
    // Lee la foto elegida (devuelve una promesa). Si la persona la eligió antes de que cargara
    // esta página (conexión lenta), se lee igual al empezar o al tocar "Revelar".
    var leyendo = null;
    function leerFoto() {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return Promise.resolve(false);
        cardFoto.classList.remove('is-falta');
        avisarForm('');
        leyendo = achicarFoto(f, 1600).then(function (b) {
            fotoBlob = b;
            if (fotoURL) URL.revokeObjectURL(fotoURL);
            fotoURL = URL.createObjectURL(b);
            ponerFoto(fotoURL);
            return true;
        });
        return leyendo;
    }
    fileInput.addEventListener('change', leerFoto);
    if (!demo) leerFoto();

    var MENSAJES = [
        'Escaneando tu foto…',
        'Leyendo la prenda…',
        'Tomando medidas…',
        'Combinando la prenda con tu cuerpo…',
        'Ajustando pliegues y luz…',
        'Revelando…'
    ];

    var esperaIA = demo ? 12000 : 22000;   // lo que suele tardar la IA (en la demo, lo que se simula)
    var MIN_HOLO = 6000;                    // el holograma necesita ~6 s para armarse entero
    var respuesta = null;                   // promesa con lo que devuelve la IA
    var vuelta = 0;                         // cambia al reiniciar: respuestas viejas se ignoran
    var datos = null;                       // lo que devolvió la IA en esta vuelta
    var timers = [];
    var rafs = { prog: 0, sparks: 0 };
    var fase = 'inicio';

    function later(fn, ms) { var id = setTimeout(fn, reduce ? Math.min(ms, 250) : ms); timers.push(id); return id; }
    function every(fn, ms) { var id = setInterval(fn, ms); timers.push(id); return id; }
    function stopAll() {
        timers.forEach(function (id) { clearTimeout(id); clearInterval(id); });
        timers = [];
        cancelAnimationFrame(rafs.prog);
        cancelAnimationFrame(rafs.sparks);
        rafs.prog = rafs.sparks = 0;
    }
    function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

    // ------------------------------------------------------------------ 1) entrada a las ranuras
    function volar(img, slot, delay) {
        var a = img.getBoundingClientRect();
        var b = slot.getBoundingClientRect();
        var ca = center(a), cb = center(b);
        var fly = img.cloneNode();
        fly.className = 'jpx-rv-fly';
        fly.style.left = a.left + 'px';
        fly.style.top = a.top + 'px';
        fly.style.width = a.width + 'px';
        fly.style.height = a.height + 'px';
        if (img.closest('[data-card="prenda"]')) { fly.style.objectFit = 'contain'; fly.style.background = '#fff'; }
        document.body.appendChild(fly);
        var s = Math.max(.08, b.width / a.width * 1.05);
        var dx = cb.x - ca.x, dy = cb.y - ca.y;
        var anim = fly.animate([
            { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
            { transform: 'translate(' + dx * .55 + 'px,' + (dy * .55 - 60) + 'px) scale(' + (s * 2.2) + ') rotate(' + (dx > 0 ? 8 : -8) + 'deg)', opacity: 1, offset: .55 },
            { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ') rotate(0)', opacity: 1, offset: .85 },
            { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ',' + (s * .05) + ')', opacity: 0 }
        ], { duration: reduce ? 1 : 1100, delay: reduce ? 0 : delay, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'forwards' });
        later(function () { slot.classList.remove('is-eat'); void slot.offsetWidth; slot.classList.add('is-eat'); }, delay + 900);
        anim.onfinish = function () { fly.remove(); };
        timers.push(setTimeout(function () { fly.remove(); }, delay + 2500));   // respaldo
    }

    function arrancar() {
        if (fase !== 'inicio') return;
        fase = 'entrando';
        goBtn.disabled = true;
        root.classList.add('is-feeding');
        volar($('.jpx-rv__card[data-card="foto"] img'), $('.jpx-rv__slot--l'), 0);
        volar($('.jpx-rv__card[data-card="prenda"] img'), $('.jpx-rv__slot--r'), 180);
        later(despertar, 1300);
    }

    // ------------------------------------------------------------------ 2) la máquina trabaja
    function despertar() {
        fase = 'trabajando';
        root.classList.add('is-waking', 'is-lit');
        later(function () {
            root.classList.remove('is-waking');
            root.classList.add('is-on', 'is-processing');
            empezarProgreso();
            chispas();
            esperarIA();
        }, 1250);
    }

    // Manda el formulario y devuelve una promesa con la respuesta (nunca falla: los errores vuelven
    // como { ok: false, error }).
    function pedirIA() {
        var fd = new FormData(form);
        fd.set('user_image', fotoBlob, fotoBlob.name || 'foto.jpg');
        var ctrl = window.AbortController ? new AbortController() : null;
        var corte = setTimeout(function () { if (ctrl) ctrl.abort(); }, 180000);
        return fetch(form.action, {
            method: 'POST',
            body: fd,
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            signal: ctrl ? ctrl.signal : undefined
        }).then(function (r) {
            return r.json().catch(function () {
                return { ok: false, error: r.status >= 500 ? 'El servidor tuvo un problema. Probá de nuevo.' : 'No se pudo leer la respuesta.' };
            });
        }).catch(function (err) {
            return { ok: false, error: err && err.name === 'AbortError' ? 'La IA tardó demasiado. Probá de nuevo en un rato.' : 'No hay conexión con el servidor.' };
        }).then(function (r) { clearTimeout(corte); return r; });
    }
    function simularIA() {
        return new Promise(function (ok) {
            setTimeout(function () {
                ok({ ok: true, resultado: SRC.resultado, numero: +root.dataset.numero || 1, talle: 'M', calce: 'Oversize Urbano', tela: '' });
            }, esperaIA);
        });
    }
    function precargar(url) {
        return new Promise(function (ok) {
            var img = new Image();
            img.onload = img.onerror = function () { ok(); };
            setTimeout(ok, 8000);
            img.src = url;
        });
    }
    // Cuando la IA responde: si salió bien, se prepara la foto y sale el sobre (pero no antes de
    // que el holograma termine de armarse); si no, la máquina se apaga.
    function esperarIA() {
        var t0 = performance.now(), mia = vuelta;
        respuesta.then(function (r) {
            if (mia !== vuelta) return;
            if (!r || !r.ok) { later(function () { fallar(r || {}); }, 600); return; }
            datos = r;
            mostrarDatos(r);
            precargar(r.resultado).then(function () {
                if (mia !== vuelta) return;
                later(terminar, Math.max(0, MIN_HOLO - (performance.now() - t0)));
            });
        });
    }
    function mostrarDatos(r) {
        $('.jpx-rv__result').src = r.resultado;
        $('.jpx-rv__num').textContent = String(r.numero || 1).padStart(4, '0');
        $('.jpx-rv__talle').hidden = !r.talle;
        $('.jpx-rv__talle-n').textContent = r.talle || '';
        $('.jpx-rv__talle-det').textContent = [r.calce, r.tela].filter(Boolean).join(' · ');
        var wsp = $('.jpx-rv__wsp');
        wsp.hidden = !r.whatsapp;
        if (r.whatsapp) wsp.href = r.whatsapp;
        actions.querySelector('[data-act="carrito"]').textContent = r.talle ? 'Agregar al carrito · Talle ' + r.talle : 'Agregar al carrito';
    }
    function fallar(r) {
        fase = 'error';
        stopAll();
        limpiarHolograma();
        var cv = $('.jpx-rv__sparks');
        cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
        root.classList.remove('is-processing', 'is-on', 'is-lit', 'is-waking');
        if (r.error) console.warn('[Sala de revelado]', r.error);
        // Si la prueba llegó a guardarse (r.numero), el problema fue la IA: mensaje simple.
        var texto = r.numero || !r.error ? 'La IA está con mucha gente en este momento. Probá de nuevo en un ratito.' : r.error;
        if (r.talle) texto += ' Igual, tu talle recomendado es el ' + r.talle + '.';
        $('.jpx-rv__fail-text').textContent = texto;
        failBox.hidden = false;
        $('button', failBox).focus();
    }

    function empezarProgreso() {
        var t0 = performance.now(), i = 0, glifo = 0;
        var GLIFOS = ['REV', '▮▯▯', '▮▮▯', '▮▮▮'];
        decir(MENSAJES[0]);
        var avisoFila = false;
        every(function () {
            if (i < MENSAJES.length - 1) decir(MENSAJES[++i]);
            else if (!avisoFila && performance.now() - t0 > 35000) { avisoFila = true; decir('Hay fila en la IA, un poquito más…'); }
        }, Math.max(1800, esperaIA / MENSAJES.length));
        every(function () { screenR.textContent = GLIFOS[glifo++ % GLIFOS.length]; }, 420);
        (function paso(now) {
            now = Math.max(now, t0);
            // Avanza rápido al principio y cada vez más lento: nunca llega a 100 hasta que termina.
            var p = 1 - Math.exp(-(now - t0) / (esperaIA * .5));
            var v = Math.min(97, Math.floor(p * 100));
            screenL.textContent = v + '%';
            bar.style.transform = 'scaleX(' + (v / 100) + ')';
            holograma(now - t0);
            rafs.prog = requestAnimationFrame(paso);
        })(t0);
    }

    // ------------------------------------------------------------------ el holograma
    // Línea de tiempo (ms desde que arranca): el láser sube y la persona se materializa de abajo
    // hacia arriba (0–2,6 s); la prenda baja desde arriba como una nube de puntos que se va
    // juntando (1,9–4,5 s); al llegar se ciñe al cuerpo (3,3–4,6 s); el láser la recorre de arriba
    // abajo y queda sólida, con la luz del cuerpo (4,3–5,6 s). Después el láser sigue pasando
    // despacio mientras la IA termina.
    var build = $('.jpx-rv__build'), buildIn = $('.jpx-rv__build-in');
    var prenda = $('.jpx-rv__holo--prenda'), laser = $('.jpx-rv__laser');
    var imgPersona = $('.jpx-rv__holo--persona'), imgPrenda = $('.jpx-rv__holo--prenda img');
    var CAMARA_TOP = 29.4, CAMARA_ALTO = 28.6;          // como en el CSS (% de la escena)
    var laserY = 0, chispaY = 0;                        // 0 = abajo de la cámara, 1 = arriba
    var ultimoEstado = null;
    function suave(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
    function sale(t) { return 1 - Math.pow(1 - t, 3); }
    function c01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

    // Dónde cae la prenda dentro de la cámara (0..1, y desde abajo), según su proporción.
    function rectPrenda() {
        var r = imgPrenda.naturalWidth ? imgPrenda.naturalHeight / imgPrenda.naturalWidth : 1.2;
        var cam = chamber.clientWidth / Math.max(1, chamber.clientHeight) || .81;
        var w = .52, h = Math.min(.62, w * cam * r), top = .77;
        return { x: (1 - w) / 2, y: top - h, w: w, h: h };
    }

    function estado(t) {
        if (reduce) t = 6000;
        var e = {
            t: t / 1000,
            build: suave(c01(t / 2600)),
            merge: c01((t - 1900) / 2600),
            garY: .34 * (1 - sale(c01((t - 1900) / 2300))),
            wrap: suave(c01((t - 3300) / 1300)),
            scan: -1, collapse: 0, alpha: 1
        };
        var g = rectPrenda(), sc = (t - 4300) / 1300, objetivo, k = .09;
        if (sc >= 0 && sc <= 1) e.scan = 1 - suave(sc);
        if (t < 2600) { objetivo = e.build; k = 1; }
        else if (e.scan >= 0) { objetivo = g.y + g.h * e.scan; k = 1; }
        else if (t < 4300) objetivo = g.y + g.h;
        else objetivo = .5 - .46 * Math.cos((t - 5600) / 3000 * Math.PI);
        laserY += (objetivo - laserY) * k;
        e.laser = laserY;
        e.rect = g;
        return e;
    }

    var glHolo = crearHoloGL();
    function holograma(t) {
        var e = estado(t);
        ultimoEstado = e;
        chispaY = e.laser;
        laser.style.top = (CAMARA_TOP + CAMARA_ALTO - 1.2 - e.laser * CAMARA_ALTO) + '%';
        if (glHolo) { glHolo.dibujar(e); return; }
        // Respaldo sin WebGL: la figura se descubre a la altura del láser y la prenda se funde.
        var falta = (1 - e.build) * 100;
        build.style.transform = 'translateY(' + falta + '%)';
        buildIn.style.transform = 'translateY(' + (-falta) + '%)';
        prenda.style.opacity = .9 * suave(e.merge);
        prenda.style.transform = 'translateY(' + (-e.garY * 200) + '%) scale(' + (1.2 - .2 * e.wrap) + ',1)';
    }
    function limpiarHolograma() {
        [build, buildIn, prenda, laser].forEach(function (n) { n.style.transform = n.style.opacity = n.style.top = ''; });
        laserY = chispaY = 0;
        ultimoEstado = null;
        if (glHolo) glHolo.limpiar();
    }
    // Al terminar: la figura se aplasta contra el piso de la cámara, brillando más.
    function aplastarHolograma(ultimo) {
        if (!glHolo) return;
        var t0 = performance.now();
        (function paso(now) {
            var k = c01((now - t0) / 550);
            ultimo.collapse = Math.pow(k, 2.2);
            ultimo.alpha = 1 - c01((k - .75) / .25);
            glHolo.dibujar(ultimo);
            if (k < 1) rafs.prog = requestAnimationFrame(paso);
            else glHolo.limpiar();
        })(t0);
    }

    function crearHoloGL() {
        var cv = $('.jpx-rv__gl');
        var gl = null;
        try { gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, premultipliedAlpha: false }); } catch (err) { gl = null; }
        if (!gl) return null;
        var VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
        var FS = [
            'precision mediump float;',
            'varying vec2 v;',
            'uniform sampler2D uP,uG;',
            'uniform vec4 uPMap,uGRect;',
            'uniform vec2 uTexel;',
            'uniform float uT,uBuild,uMerge,uWrap,uScan,uLaser,uCollapse,uAlpha;',
            'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
            'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
            '  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}',
            'float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}',
            'float lp(vec2 uv){return lum(texture2D(uP,uv).rgb);}',
            // la prenda viene con fondo blanco: lo blanco se vuelve transparente
            'float ga(vec2 u){vec4 g=texture2D(uG,clamp(u,0.,1.));',
            '  float d=step(0.,u.x)*step(u.x,1.)*step(0.,u.y)*step(u.y,1.);',
            '  return (1.-smoothstep(.84,.96,lum(g.rgb)))*g.a*d;}',
            'void main(){',
            '  vec2 q=v;',
            // al terminar se aplasta contra el piso
            '  q.y/=max(1.-uCollapse*.985,.015);',
            '  if(q.y>1.){gl_FragColor=vec4(0.,0.,0.,1.);return;}',
            // interferencia: algunas franjas se corren un instante
            '  float fr=floor(uT*9.),band=floor(q.y*34.);',
            '  float jit=step(.955,hash(vec2(band,fr)))*(hash(vec2(band,fr+7.))-.5)*.07;',
            '  q.x+=jit;',
            // la persona: luminancia, separación de color y bordes
            '  vec2 pu=vec2(q.x,1.-q.y)*uPMap.xy+uPMap.zw;',
            '  float ca=.0035+abs(jit)*.4;',
            '  float lr=lp(pu+vec2(ca,0.)),lg=lp(pu),lb=lp(pu-vec2(ca,0.));',
            '  float e=abs(lp(pu+vec2(uTexel.x,0.))-lp(pu-vec2(uTexel.x,0.)))+abs(lp(pu+vec2(0.,uTexel.y))-lp(pu-vec2(0.,uTexel.y)));',
            '  e=smoothstep(.03,.22,e);',
            '  vec2 dv=(q-vec2(.5,.48))/vec2(.46,.58);',
            '  float vig=1.-smoothstep(.5,1.,length(dv));',
            // se materializa de abajo hacia arriba, con un frente desparejo y caliente
            '  float n=noise(q*vec2(18.,34.)+vec2(0.,uT*.7));',
            '  float front=uBuild*1.1-.05+(n-.5)*.07;',
            '  float built=smoothstep(front+.01,front-.01,q.y);',
            '  float hot=smoothstep(.04,0.,abs(q.y-front))*step(.001,uBuild)*(1.-step(.999,uBuild));',
            '  vec3 tint=vec3(1.,.26,.15);',
            '  float base=lg*.8+e*.75;',
            '  vec3 holo=vec3(lr,lg*.24,lb*.16)*1.25+tint*e*.55;',
            '  float scan=.8+.2*sin(q.y*300.-uT*16.);',
            '  float flick=.94+.06*sin(uT*47.)*sin(uT*6.1);',
            '  holo*=scan*flick;',
            '  float lz=smoothstep(.07,0.,abs(q.y-uLaser));',
            '  holo+=(tint*base*.6+vec3(1.,.8,.72)*e*.5)*lz;',
            '  vec3 col=holo*built*vig;',
            // la prenda: nube de puntos que se junta, se ciñe al torso y toma la luz del cuerpo
            '  vec2 gq=(q-uGRect.xy)/uGRect.zw;',
            '  float sx=(gq.x*2.-1.)/mix(1.25,1.,uWrap);',
            '  sx=sign(sx)*pow(abs(sx),mix(1.,.82,uWrap));',
            '  vec2 gu=vec2(sx*.5+.5,1.-gq.y);',
            '  float a=ga(gu);',
            '  float ge=abs(a-ga(gu+vec2(.014,0.)))+abs(a-ga(gu+vec2(0.,.011)));',
            '  float gl0=lum(texture2D(uG,clamp(gu,0.,1.)).rgb);',
            '  vec2 grid=vec2(46.,60.);',
            '  float h=hash(floor(gu*grid));',
            '  float pt=smoothstep(.45,.1,length(fract(gu*grid)-.5));',
            '  float on=smoothstep(h-.08,h+.08,uMerge*1.25-.12);',
            '  float solid=smoothstep(.6,1.,uMerge);',
            '  float gm=a*on*mix(pt,1.,solid);',
            '  vec3 gcol=tint*(.35+gl0*.9)*(.45+lg*.9)*1.3;',
            '  gcol+=vec3(1.,.55,.45)*ge*on*1.1;',
            '  gcol+=vec3(1.,.78,.7)*smoothstep(.06,0.,abs(gq.y-uScan))*step(0.,uScan)*1.3;',
            '  gcol+=vec3(1.,.6,.5)*pt*on*(1.-solid)*.8;',
            '  gcol*=scan*flick;',
            '  col=mix(col,gcol*mix(1.,vig,.5),gm*.92);',
            '  col+=vec3(1.,.6,.5)*ge*on*.5*(1.-gm);',
            '  col+=(tint*1.5+vec3(.5,.35,.3)*n)*hot*vig;',
            '  col*=uAlpha*(1.+uCollapse*2.5);',
            '  col+=(hash(v*517.+fract(uT)*13.)-.5)*.05*built*vig;',
            '  gl_FragColor=vec4(max(col,0.),1.);',
            '}'
        ].join('\n');
        function sh(tipo, src) {
            var o = gl.createShader(tipo);
            gl.shaderSource(o, src);
            gl.compileShader(o);
            if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(o)); return null; }
            return o;
        }
        var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
        if (!vs || !fs) return null;
        var pr = gl.createProgram();
        gl.attachShader(pr, vs);
        gl.attachShader(pr, fs);
        gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
        gl.useProgram(pr);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        var ap = gl.getAttribLocation(pr, 'p');
        gl.enableVertexAttribArray(ap);
        gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
        var U = {};
        ['uP', 'uG', 'uPMap', 'uGRect', 'uTexel', 'uT', 'uBuild', 'uMerge', 'uWrap', 'uScan', 'uLaser', 'uCollapse', 'uAlpha']
            .forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });

        // Para el holograma alcanza con 1024 px: una foto de celu entera ocuparía mucha memoria.
        function achicada(img) {
            var m = Math.max(img.naturalWidth, img.naturalHeight);
            if (m <= 1024) return img;
            var k = 1024 / m, c = document.createElement('canvas');
            c.width = Math.round(img.naturalWidth * k);
            c.height = Math.round(img.naturalHeight * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            return c;
        }
        function textura(unidad, img) {
            var t = gl.createTexture();
            gl.activeTexture(gl.TEXTURE0 + unidad);
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
            [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(function (w) { gl.texParameteri(gl.TEXTURE_2D, w, gl.CLAMP_TO_EDGE); });
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            function subir() {
                if (!img.naturalWidth) return;
                gl.activeTexture(gl.TEXTURE0 + unidad);
                gl.bindTexture(gl.TEXTURE_2D, t);
                try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, achicada(img)); } catch (err) { /* queda negra */ }
            }
            // Cada vez que cambia la foto (la persona elige otra, u otra prenda) se vuelve a subir.
            img.addEventListener('load', subir);
            if (img.complete) subir();
        }
        textura(0, imgPersona);
        textura(1, imgPrenda);
        gl.uniform1i(U.uP, 0);
        gl.uniform1i(U.uG, 1);

        function medir() {
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            var w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
            if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
            gl.viewport(0, 0, cv.width, cv.height);
        }
        function limpiar() { medir(); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
        root.classList.add('has-gl');
        limpiar();

        return {
            limpiar: limpiar,
            dibujar: function (e) {
                medir();
                // La foto cubre la cámara (como object-fit: cover), mostrando más la parte de arriba.
                var A = cv.width / cv.height;
                var I = imgPersona.naturalWidth ? imgPersona.naturalWidth / imgPersona.naturalHeight : .75;
                var sx = 1, sy = 1, ox = 0, oy = 0;
                if (I > A) { sx = A / I; ox = (1 - sx) * .5; } else { sy = I / A; oy = (1 - sy) * .22; }
                gl.uniform4f(U.uPMap, sx, sy, ox, oy);
                gl.uniform2f(U.uTexel, sx / cv.width * 1.5, sy / cv.height * 1.5);
                var g = e.rect;
                gl.uniform4f(U.uGRect, g.x, g.y + e.garY, g.w, g.h);
                gl.uniform1f(U.uT, e.t);
                gl.uniform1f(U.uBuild, e.build);
                gl.uniform1f(U.uMerge, e.merge);
                gl.uniform1f(U.uWrap, e.wrap);
                gl.uniform1f(U.uScan, e.scan);
                gl.uniform1f(U.uLaser, e.laser);
                gl.uniform1f(U.uCollapse, e.collapse);
                gl.uniform1f(U.uAlpha, e.alpha);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
        };
    }

    function decir(texto) {
        msg.textContent = texto;
        msg.classList.remove('is-new');
        void msg.offsetWidth;
        msg.classList.add('is-new');
    }

    // Chispas que suben dentro de la cámara (canvas chiquito, solo mientras trabaja).
    function chispas() {
        if (reduce) return;
        var cv = $('.jpx-rv__sparks');
        var ctx = cv.getContext('2d');
        var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        var w = cv.clientWidth, h = cv.clientHeight;
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var ps = [];
        function nueva() {
            // La mayoría nace en el anillo láser (donde se está "imprimiendo"); el resto, abajo.
            var y0 = Math.random() < .65 ? h * (1 - chispaY) + (Math.random() - .5) * h * .04 : h * (.9 + Math.random() * .1);
            return { x: w * (.15 + Math.random() * .7), y: y0, vy: -(.4 + Math.random() * 1.4) * h / 300,
                     vx: (Math.random() - .5) * .3, r: .6 + Math.random() * 1.6, life: 1 };
        }
        for (var k = 0; k < 34; k++) { var n = nueva(); n.y = Math.random() * h; ps.push(n); }
        (function frame() {
            ctx.clearRect(0, 0, w, h);
            ctx.globalCompositeOperation = 'lighter';
            for (var j = 0; j < ps.length; j++) {
                var p = ps[j];
                p.x += p.vx; p.y += p.vy; p.life -= .006;
                if (p.y < -4 || p.life <= 0) ps[j] = p = nueva();
                ctx.globalAlpha = Math.max(0, p.life) * .9;
                ctx.fillStyle = Math.random() < .15 ? '#fff' : '#ff6a50';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }
            rafs.sparks = requestAnimationFrame(frame);
        })();
    }

    // ------------------------------------------------------------------ 3) termina: sale el sobre
    function terminar() {
        fase = 'imprimiendo';
        cancelAnimationFrame(rafs.prog);
        screenL.textContent = '100%';
        screenR.textContent = 'OK';
        bar.style.transform = 'scaleX(1)';
        decir('¡Listo!');
        chamber.classList.add('is-collapse');
        if (ultimoEstado) aplastarHolograma(ultimoEstado);
        later(function () { chamber.classList.add('is-flash'); }, 500);
        later(function () {
            cancelAnimationFrame(rafs.sparks);
            var cv = $('.jpx-rv__sparks');
            cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
            root.classList.remove('is-processing');
            root.classList.add('is-printing');
        }, 1000);
        later(mostrarSobre, 2700);
    }

    function mostrarSobre() {
        fase = 'sobre';
        var mini = $('.jpx-rv__mini').getBoundingClientRect();
        reveal.hidden = false;
        root.classList.add('is-reveal');
        var big = env.getBoundingClientRect();
        var a = center(mini), b = center(big);
        env.animate([
            { transform: 'translate(' + (a.x - b.x) + 'px,' + (a.y - b.y) + 'px) scale(' + (mini.width / big.width) + ') rotateX(50deg)', filter: 'brightness(.6)' },
            { transform: 'translate(0,0) scale(1) rotateX(0)', filter: 'brightness(1)' }
        ], { duration: reduce ? 1 : 1000, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = function () {
            if (fase === 'sobre') reveal.classList.add('is-sealed');
        };
        later(function () { if (fase === 'sobre') reveal.classList.add('is-sealed'); }, 1100);   // respaldo
    }

    // ------------------------------------------------------------------ 4) abrir y revelar
    function abrir() {
        if (fase !== 'sobre') return;
        fase = 'abriendo';
        reveal.classList.remove('is-sealed');
        reveal.classList.add('is-open');
        later(function () { reveal.classList.add('is-out'); }, 650);
        later(sacarFoto, 1700);
    }

    function sacarFoto() {
        // FLIP: la foto pasa del sobre al centro de la pantalla sin saltos.
        var first = print.getBoundingClientRect();
        finalBox.insertBefore(print, actions);
        var last = print.getBoundingClientRect();
        var a = center(first), b = center(last);
        reveal.classList.add('is-drop');
        print.animate([
            { transform: 'translate(' + (a.x - b.x) + 'px,' + (a.y - b.y) + 'px) scale(' + (first.width / last.width) + ')' },
            { transform: 'none' }
        ], { duration: reduce ? 1 : 950, easing: 'cubic-bezier(.3,.7,.2,1)' });
        later(revelar, 700);
    }

    function revelar() {
        fase = 'revelando';
        photo.classList.add('is-developing');
        later(function () { fase = 'final'; reveal.classList.add('is-final'); }, 3500);
    }

    // ------------------------------------------------------------------ antes / después
    function setX(pct) { photo.style.setProperty('--x', Math.max(0, Math.min(100, pct)) + '%'); }
    function animarX(desde, hasta) {
        var t0 = performance.now();
        (function paso(now) {
            var t = Math.min(1, (now - t0) / 600), e = 1 - Math.pow(1 - t, 3);
            setX(desde + (hasta - desde) * e);
            if (t < 1) requestAnimationFrame(paso);
        })(t0);
    }
    var arrastre = false;
    photo.addEventListener('pointerdown', function (e) {
        if (!photo.classList.contains('is-compare')) return;
        arrastre = true;
        try { photo.setPointerCapture(e.pointerId); } catch (err) { /* sigue igual */ }
        mover(e);
    });
    photo.addEventListener('pointermove', function (e) { if (arrastre) mover(e); });
    photo.addEventListener('pointerup', function () { arrastre = false; });
    photo.addEventListener('pointercancel', function () { arrastre = false; });
    function mover(e) {
        var r = photo.getBoundingClientRect();
        setX((e.clientX - r.left) / r.width * 100);
    }

    function aviso(texto) {
        var t = document.createElement('div');
        t.className = 'jpx-rv__toast';
        t.textContent = texto;
        root.appendChild(t);
        setTimeout(function () { t.remove(); }, 2200);
    }

    // ------------------------------------------------------------------ volver a empezar
    function reiniciar() {
        stopAll();
        document.querySelectorAll('.jpx-rv-fly').forEach(function (n) { n.remove(); });
        fase = 'inicio';
        root.classList.remove('is-feeding', 'is-waking', 'is-lit', 'is-on', 'is-processing', 'is-printing', 'is-reveal');
        chamber.classList.remove('is-collapse', 'is-flash');
        limpiarHolograma();
        reveal.className = 'jpx-rv__reveal';
        reveal.hidden = true;
        clip.appendChild(print);
        photo.classList.remove('is-developing', 'is-compare');
        setX(0);
        screenL.textContent = screenR.textContent = '';
        bar.style.transform = 'scaleX(0)';
        msg.textContent = '';
        goBtn.disabled = false;
        failBox.hidden = true;
        vuelta++;
        datos = null;
        respuesta = null;
    }

    // ------------------------------------------------------------------ eventos
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (fase !== 'inicio') return;
        if (!demo && !fotoBlob) {
            if (!(fileInput.files && fileInput.files[0])) {
                cardFoto.classList.add('is-falta');
                avisarForm('Subí tu foto para empezar.');
                return;
            }
            // Hay foto elegida pero todavía no se leyó: se lee y se sigue.
            goBtn.disabled = true;
            (leyendo || leerFoto()).then(function () { goBtn.disabled = false; form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); });
            return;
        }
        if (!form.checkValidity()) { form.reportValidity(); return; }
        avisarForm('');
        respuesta = demo ? simularIA() : pedirIA();
        arrancar();
    });
    failBox.addEventListener('click', function (e) {
        if (e.target.closest('[data-act="reintentar"]')) { reiniciar(); goBtn.focus(); }
    });
    env.addEventListener('click', abrir);
    actions.addEventListener('click', function (e) {
        var b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'antes') {
            var on = photo.classList.toggle('is-compare');
            animarX(on ? 0 : 50, on ? 50 : 0);
        } else if (b.dataset.act === 'carrito') {
            var p = datos && datos.producto;
            if (p && window.jpexCart) {
                window.jpexCart.addItem({ id: String(p.id), name: p.name, price: p.price, size: datos.talle || 'Único', color: '', image: p.image, qty: 1 });
            } else {
                aviso(demo ? 'En la demo no se agrega al carrito' : 'No se pudo agregar al carrito');
            }
        } else if (b.dataset.act === 'otra') {
            reiniciar();
            aviso('Elegí otra prenda y tocá Revelar');
        }
    });
    // Los controles de prueba se ven solo con ?dev=1 (o en las demos).
    if (qs.get('dev') === '1' || qs.get('demo')) $('.jpx-rv__dev').hidden = false;
    $('.jpx-rv__dev').addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.ms) {
            esperaIA = +b.dataset.ms;
            root.querySelectorAll('.jpx-rv__dev [data-ms]').forEach(function (x) { x.classList.toggle('is-on', x === b); });
        } else if (b.dataset.act === 'repetir') {
            reiniciar();
        }
    });
    // Para revisar etapas sin tocar nada: ?demo=trabajando | sobre | final
    if (demo) {
        if (qs.get('ia')) esperaIA = +qs.get('ia');
        if (qs.get('debug') === '1') root.classList.add('is-debug');
        if (qs.get('debug') === 'medidas') {
            var out = document.createElement('pre');
            out.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;margin:0;color:#0f0;background:#000c;font:12px monospace';
            document.body.appendChild(out);
            setInterval(function () {
                var r = print.getBoundingClientRect(), e = env.getBoundingClientRect();
                out.textContent = 'fase ' + fase + ' | print ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' @' + Math.round(r.left) + ',' + Math.round(r.top) +
                    ' | env ' + Math.round(e.width) + ' | --P ' + getComputedStyle(print).width + ' | dev op ' + getComputedStyle($('.jpx-rv__devlayer')).opacity +
                    ' | acciones op ' + getComputedStyle(actions).opacity + ' | reveal ' + reveal.className;
            }, 100);
        }
        setTimeout(function () { respuesta = simularIA(); arrancar(); }, 300);
        if (demo === 'final') {
            var esperar = setInterval(function () { if (fase === 'sobre') { clearInterval(esperar); abrir(); } }, 200);
        }
    }

    document.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && fase === 'sobre' && document.activeElement === document.body) { e.preventDefault(); abrir(); }
    });
})();
