/* Lab · bocetos: panel para probar en vivo las variantes de cada efecto (lab-fx.js).
 * Guarda la selección en localStorage y la muestra como texto corto para dictarla. */
(function () {
    'use strict';

    var panel = document.getElementById('jpx-sketch-panel');
    var stage = document.querySelector('.jpx-lab__stage');
    var FX = window.JPEXLabFX;
    if (!panel || !stage || !FX) return;

    var Pan = window.JPEXLabPan;
    var STORAGE_KEY = 'jpex-lab-bocetos-v1';

    var effects = FX.list();
    // Arranca con la variante A de todo, salvo los ojos y los efectos nuevos
    // (enredaderas y círculo), que empiezan apagados. El mouse, encendido.
    var START_OFF = ['ojos', 'venas', 'circulo'];
    var defaults = {
        mouse: 'off', capsula: 'cerrada', capSize: null, capW: 17, capY: 79,
        capNiebla: 'b', capReflejo: 'a', capResplandor: 'a', capLuz: 'a', capColor: 'a', capParpadeo: 'a'
    };
    // Valores de la cápsula que no se apagan con "Todo apagado".
    var CAP_KEYS = ['capSize', 'capW', 'capY'];
    effects.forEach(function (fx) { defaults[fx.id] = START_OFF.indexOf(fx.id) > -1 ? null : 'a'; });

    // Ajustes propios de la página de bocetos: los ojos aparecen seguido para poder verlos.
    var FX_OPTIONS = {
        ojos: { first: [1500, 3000], every: [6000, 12000] },
        // El bicho pasa seguido para poder compararlo (en la página real, cada 40–90 s).
        bicho: { first: [1000, 2500], every: [5000, 9000] }
    };

    // Efectos que caen debajo del panel (arriba a la derecha del escenario).
    var UNDER_PANEL = ['camara', 'chispas', 'tubos', 'bicho'];
    var UNDER_PANEL_NOTE = 'Queda detrás del panel: escondelo para verlo.';
    var HIDE_MS = 8000;

    function load() {
        try {
            var saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
            return saved && typeof saved === 'object' ? saved : {};
        } catch (e) {
            return {};
        }
    }
    function save() {
        var data = { collapsed: collapsed };
        Object.keys(state).forEach(function (key) { data[key] = state[key]; });
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) { /* Sin almacenamiento: la selección no se recuerda, pero todo funciona. */ }
    }

    var saved = load();
    var state = {};
    Object.keys(defaults).forEach(function (key) {
        state[key] = Object.prototype.hasOwnProperty.call(saved, key) ? saved[key] : defaults[key];
    });
    // Panel plegado: lo recordado, o plegado de entrada en pantallas angostas.
    var collapsed = typeof saved.collapsed === 'boolean'
        ? saved.collapsed
        : window.matchMedia('(max-width: 767px)').matches;

    /* ---------- Armado del panel ---------- */

    var groups = panel.querySelector('.jpx-sketch-panel__groups');
    var summary = panel.querySelector('#jpx-sketch-summary');
    var note = panel.querySelector('.jpx-sketch-panel__note');
    var toggle = panel.querySelector('.jpx-sketch-panel__toggle');
    var buttons = {};

    function addGroup(id, label, options) {
        var group = document.createElement('div');
        group.className = 'jpx-sketch-group';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', label);

        var title = document.createElement('div');
        title.className = 'jpx-sketch-group__title';
        title.textContent = label;
        group.appendChild(title);

        if (UNDER_PANEL.indexOf(id) > -1) {
            var hint = document.createElement('p');
            hint.className = 'jpx-sketch-group__hint';
            hint.textContent = UNDER_PANEL_NOTE;
            group.appendChild(hint);
        }

        var row = document.createElement('div');
        row.className = 'jpx-sketch-group__options';
        buttons[id] = [];
        options.forEach(function (opt) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'jpx-sketch-opt';
            btn.dataset.value = opt.value === null ? '' : opt.value;
            var letter = document.createElement('b');
            letter.textContent = opt.letter;
            btn.appendChild(letter);
            if (opt.name) {
                var name = document.createElement('span');
                name.textContent = opt.name;
                btn.appendChild(name);
            }
            btn.addEventListener('click', function () {
                state[id] = opt.value;
                apply(id);
                refresh();
                save();
            });
            row.appendChild(btn);
            buttons[id].push(btn);
        });
        group.appendChild(row);
        groups.appendChild(group);
    }

    effects.forEach(function (fx) {
        var options = [{ value: null, letter: 'Apagado' }];
        Object.keys(fx.variants).forEach(function (key) {
            options.push({ value: key, letter: key.toUpperCase(), name: fx.variants[key] });
        });
        addGroup(fx.id, fx.label, options);
    });
    addGroup('mouse', 'Movimiento con el mouse', [
        { value: 'on', letter: 'Encendido' },
        { value: 'off', letter: 'Apagado' }
    ]);

    /* ---------- Cápsula: probar el tamaño sobre el círculo del piso ---------- */

    // Centro del círculo del piso, en % del escenario. La base de la cápsula se apoya ahí.
    var CAP_X = 50.4;
    var CAP_RATIO = 1175 / 612;          // alto / ancho de las imágenes de la cápsula
    var STAGE_RATIO = 1672 / 941;        // ancho / alto del escenario
    var CAP_SIZES = { a: 13, b: 16, c: 20 };

    var bgImg = stage.querySelector('.jpx-lab__bg');
    var imgFolder = (bgImg.currentSrc || bgImg.getAttribute('src') || '').replace(/[^\/]*$/, '');
    function div(className, parent) {
        var node = document.createElement('div');
        node.className = className;
        parent.appendChild(node);
        return node;
    }
    // Dos piezas con la misma caja:
    // - "piso" (debajo de la cápsula y de la niebla): resplandor rojo y reflejo en el piso mojado.
    //   Va aparte para poder sumarse a la luz del fondo (modo screen).
    // - la cápsula: sombra de apoyo, imagen, luz del lugar y niebla al ras del piso por delante.
    var capFloor = div('jpx-capsule-floor', stage);
    capFloor.setAttribute('aria-hidden', 'true');
    div('jpx-capsule-floor__glow', capFloor);
    var capRefl = document.createElement('img');
    capRefl.className = 'jpx-capsule-floor__refl';
    capRefl.alt = '';
    capFloor.appendChild(capRefl);

    var capsule = div('jpx-capsule', stage);
    capsule.setAttribute('aria-hidden', 'true');
    div('jpx-capsule__shadow', capsule);
    var capImg = document.createElement('img');
    capImg.className = 'jpx-capsule__img';
    capImg.alt = '';
    capsule.appendChild(capImg);
    // La misma cápsula con la luz de adentro apagada: en los bajones aparece encima
    // (así se apaga la luz, no la foto). La genera laboratory/assets/build_lab_images.py.
    var capOff = document.createElement('img');
    capOff.className = 'jpx-capsule__off';
    capOff.alt = '';
    capsule.appendChild(capOff);
    var capLight = div('jpx-capsule__light', capsule);
    var capMist = div('jpx-capsule__mist', capsule);
    div('jpx-capsule__mist-layer', capMist);
    div('jpx-capsule__mist-layer jpx-capsule__mist-layer--2', capMist);

    // Parpadeo: cada tanto la cápsula pierde fuerza un instante, como un bajón de corriente.
    var flickerTimer = 0;
    function flickerLater() {
        clearTimeout(flickerTimer);
        if (state.capParpadeo !== 'a' || !state.capsula || FX.reduceMotion) {
            stage.style.removeProperty('--cap-power');
            return;
        }
        flickerTimer = setTimeout(function () {
            // [potencia, duración]: 1 = luz normal, 0 = apagada del todo.
            var steps = [[0.35, 60], [1, 90], [0.15, 70], [1, 0]];
            if (Math.random() < 0.4) steps.splice(2, 0, [0.6, 110], [1, 80]);
            // A veces se apaga un rato y vuelve a los tirones.
            if (Math.random() < 0.3) {
                steps = [[0.4, 60], [1, 80], [0, 500 + Math.random() * 700],
                    [0.7, 50], [0.05, 140], [0.85, 60], [0.2, 90], [1, 0]];
            }
            (function next(i) {
                if (i >= steps.length) { flickerLater(); return; }
                stage.style.setProperty('--cap-power', steps[i][0]);
                flickerTimer = setTimeout(function () { next(i + 1); }, steps[i][1]);
            })(0);
        }, 5000 + Math.random() * 9000);
    }

    var capInputs = {};
    function addSlider(key, label, min, max) {
        var wrap = document.createElement('label');
        wrap.className = 'jpx-sketch-slider';
        var text = document.createElement('span');
        text.textContent = label;
        var value = document.createElement('b');
        var input = document.createElement('input');
        input.type = 'range';
        input.min = min;
        input.max = max;
        input.step = '0.5';
        input.addEventListener('input', function () {
            state[key] = parseFloat(input.value);
            applyCapsule();
            refresh();
            save();
        });
        wrap.appendChild(text);
        wrap.appendChild(value);
        wrap.appendChild(input);
        capInputs[key] = { input: input, value: value };
        return wrap;
    }

    addGroup('capsula', 'Cápsula', [
        { value: null, letter: 'Apagada' },
        { value: 'cerrada', letter: 'Cerrada' },
        { value: 'abierta', letter: 'Abierta' }
    ]);
    addGroup('capSize', 'Tamaño de la cápsula', [
        { value: 'a', letter: 'A', name: 'Chica' },
        { value: 'b', letter: 'B', name: 'Mediana' },
        { value: 'c', letter: 'C', name: 'Grande' }
    ]);
    var capGroup = groups.lastChild;
    addGroup('capNiebla', 'Cápsula · niebla', [
        { value: 'a', letter: 'A', name: 'Por delante' },
        { value: 'b', letter: 'B', name: 'Detrás + al ras' }
    ]);
    addGroup('capReflejo', 'Cápsula · reflejo en el piso', [
        { value: null, letter: 'Apagado' },
        { value: 'a', letter: 'A', name: 'Suave' },
        { value: 'b', letter: 'B', name: 'Marcado' }
    ]);
    addGroup('capResplandor', 'Cápsula · resplandor rojo', [
        { value: null, letter: 'Apagado' },
        { value: 'a', letter: 'A', name: 'Fijo' },
        { value: 'b', letter: 'B', name: 'Respira' }
    ]);
    addGroup('capLuz', 'Cápsula · luz del lugar', [
        { value: null, letter: 'Apagado' },
        { value: 'a', letter: 'A', name: 'Suave' },
        { value: 'b', letter: 'B', name: 'Fuerte' }
    ]);
    addGroup('capColor', 'Cápsula · color', [
        { value: null, letter: 'Original' },
        { value: 'a', letter: 'A', name: 'Integrado' },
        { value: 'b', letter: 'B', name: 'Más oscuro' }
    ]);
    addGroup('capParpadeo', 'Cápsula · parpadeo', [
        { value: null, letter: 'Apagado' },
        { value: 'a', letter: 'A', name: 'Bajones' }
    ]);
    // Grupo de tamaño al final de la cápsula, con los deslizadores.
    groups.appendChild(capGroup);
    capGroup.appendChild(addSlider('capW', 'Ancho', 8, 30));
    capGroup.appendChild(addSlider('capY', 'Altura de la base', 72, 95));
    var capHint = document.createElement('p');
    capHint.className = 'jpx-sketch-group__hint';
    capGroup.appendChild(capHint);

    function capTop() {
        return state.capY - state.capW * CAP_RATIO * STAGE_RATIO;
    }

    function applyCapsule() {
        var w = state.capW;
        capsule.hidden = capFloor.hidden = !state.capsula;
        if (state.capsula) {
            var src = imgFolder + 'capsula-' + state.capsula + '.webp?v=1';
            if (capImg.getAttribute('src') !== src) {
                capImg.src = capRefl.src = src;
                capOff.src = src.replace('.webp', '-off.webp');
                // La luz del lugar se recorta con la forma de la cápsula.
                capLight.style.webkitMaskImage = capLight.style.maskImage = 'url("' + src + '")';
            }
        }
        [capFloor, capsule].forEach(function (node) {
            node.style.left = (CAP_X - w / 2) + '%';
            node.style.width = w + '%';
            node.style.bottom = (100 - state.capY) + '%';
        });
        // Las opciones de integración se aplican como clases (ver lab-bocetos.css).
        var cls = ['jpx-capsule'];
        cls.push('cap-niebla-' + (state.capNiebla || 'a'));
        ['capReflejo', 'capResplandor', 'capLuz', 'capColor'].forEach(function (key) {
            if (state[key]) cls.push(key.replace('cap', 'cap-').toLowerCase() + '-' + state[key]);
        });
        capsule.className = cls.join(' ');
        capFloor.className = 'jpx-capsule-floor ' + cls.slice(1).join(' ');
        flickerLater();
        // Si el ancho coincide con un tamaño A/B/C, ese botón queda marcado.
        var match = null;
        Object.keys(CAP_SIZES).forEach(function (k) { if (CAP_SIZES[k] === w) match = k; });
        state.capSize = match;
        var top = capTop();
        capHint.textContent = top < 0
            ? 'La parte de arriba queda fuera de la imagen.'
            : 'Ocupa ' + (state.capY - top).toFixed(0) + '% del alto: arriba llega al ' + top.toFixed(0) + '%.';
    }

    /* ---------- Aplicar y mostrar ---------- */

    function apply(id) {
        if (id === 'mouse') {
            if (!Pan) return;
            if (state.mouse === 'on') Pan.enable();
            else Pan.disable();
            return;
        }
        if (id === 'capSize') {
            if (state.capSize) state.capW = CAP_SIZES[state.capSize];
            applyCapsule();
            return;
        }
        if (id.indexOf('cap') === 0) {
            applyCapsule();
            return;
        }
        FX.set(id, state[id], FX_OPTIONS[id]);
    }

    function summaryText() {
        var parts = effects.map(function (fx) {
            return fx.label + ' ' + (state[fx.id] ? state[fx.id].toUpperCase() : 'apagado');
        });
        parts.push('Mouse ' + (state.mouse === 'on' ? 'encendido' : 'apagado'));
        parts.push('Cápsula ' + (state.capsula || 'apagada') + ', ancho ' + state.capW +
            '%, base ' + state.capY + '% (arriba ' + capTop().toFixed(1) + '%)');
        var letter = function (v) { return v ? v.toUpperCase() : 'apagado'; };
        parts.push('Cápsula: niebla ' + letter(state.capNiebla || 'a') + ', reflejo ' + letter(state.capReflejo) +
            ', resplandor ' + letter(state.capResplandor) + ', luz ' + letter(state.capLuz) +
            ', color ' + (state.capColor ? state.capColor.toUpperCase() : 'original') +
            ', parpadeo ' + letter(state.capParpadeo));
        return parts.join(' · ');
    }

    function refresh() {
        Object.keys(buttons).forEach(function (id) {
            var current = state[id] === null || state[id] === undefined ? '' : state[id];
            buttons[id].forEach(function (btn) {
                btn.setAttribute('aria-pressed', btn.dataset.value === current ? 'true' : 'false');
            });
        });
        Object.keys(capInputs).forEach(function (key) {
            capInputs[key].input.value = state[key];
            capInputs[key].value.textContent = state[key] + '%';
        });
        summary.value = summaryText();
    }

    function setCollapsed(value) {
        collapsed = value;
        panel.classList.toggle('is-collapsed', collapsed);
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        save();
    }

    toggle.addEventListener('click', function () { setCollapsed(!collapsed); });

    // "Esconder panel 8 s": se oculta entero para ver lo que tapa y vuelve solo.
    var hideBtn = panel.querySelector('.jpx-sketch-panel__hide');
    var hideTimer = 0;
    function showPanel() {
        clearTimeout(hideTimer);
        panel.classList.remove('is-hidden');
        panel.removeAttribute('inert');
    }
    hideBtn.addEventListener('click', function () {
        panel.classList.add('is-hidden');
        panel.setAttribute('inert', '');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(showPanel, HIDE_MS);
    });
    // Escape lo trae de vuelta antes de tiempo.
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && panel.classList.contains('is-hidden')) showPanel();
    });

    panel.querySelector('.jpx-sketch-panel__off').addEventListener('click', function () {
        Object.keys(state).forEach(function (id) {
            if (CAP_KEYS.indexOf(id) > -1) return;
            state[id] = id === 'mouse' ? 'off' : null;
            apply(id);
        });
        refresh();
        save();
    });

    panel.querySelector('.jpx-sketch-panel__copy').addEventListener('click', function (event) {
        var btn = event.currentTarget;
        var text = summary.value;
        function done() {
            btn.textContent = 'Copiado';
            setTimeout(function () { btn.textContent = 'Copiar'; }, 1400);
        }
        function fallback() {
            summary.focus();
            summary.select();
            try { if (document.execCommand('copy')) done(); } catch (e) { /* Queda seleccionado para copiar a mano. */ }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, fallback);
        } else {
            fallback();
        }
    });
    summary.addEventListener('focus', function () { summary.select(); });

    // Avisos: sin mouse no hay desplazamiento; con "reducir movimiento" todo queda quieto.
    var notes = [];
    if (FX.reduceMotion) notes.push('Tu sistema pide reducir el movimiento: los efectos se ven quietos.');
    if (Pan && !Pan.available && !FX.reduceMotion) notes.push('Sin mouse, el desplazamiento del fondo no se activa.');
    if (notes.length) {
        note.textContent = notes.join(' ');
        note.hidden = false;
    }

    /* ---------- Arranque ---------- */

    FX.init(stage);
    Object.keys(state).forEach(apply);
    refresh();
    panel.classList.toggle('is-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
})();
