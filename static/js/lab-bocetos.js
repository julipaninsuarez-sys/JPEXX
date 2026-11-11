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
    // Arranca con la variante A de todo, salvo los ojos (apagados), y el mouse encendido.
    var defaults = { mouse: 'on' };
    effects.forEach(function (fx) { defaults[fx.id] = fx.id === 'ojos' ? null : 'a'; });

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

    /* ---------- Aplicar y mostrar ---------- */

    function apply(id) {
        if (id === 'mouse') {
            if (!Pan) return;
            if (state.mouse === 'on') Pan.enable();
            else Pan.disable();
            return;
        }
        FX.set(id, state[id]);
    }

    function summaryText() {
        var parts = effects.map(function (fx) {
            return fx.label + ' ' + (state[fx.id] ? state[fx.id].toUpperCase() : 'apagado');
        });
        parts.push('Mouse ' + (state.mouse === 'on' ? 'encendido' : 'apagado'));
        return parts.join(' · ');
    }

    function refresh() {
        Object.keys(buttons).forEach(function (id) {
            var current = state[id] === null || state[id] === undefined ? '' : state[id];
            buttons[id].forEach(function (btn) {
                btn.setAttribute('aria-pressed', btn.dataset.value === current ? 'true' : 'false');
            });
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

    panel.querySelector('.jpx-sketch-panel__off').addEventListener('click', function () {
        Object.keys(state).forEach(function (id) {
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
