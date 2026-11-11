/* Lab: el escenario (fondo + efectos) se desplaza un poco cuando el mouse se acerca a los bordes.
 *
 * El escenario se muestra un poco más grande que la pantalla (ZOOM) y ese sobrante
 * es lo que se descubre al moverlo. En el medio de la pantalla no se mueve nada.
 *
 * Arranca solo. La página de bocetos lo prende y apaga con window.JPEXLabPan.
 */
(function () {
    var root = document.querySelector('.jpx-lab');
    var stage = root && root.querySelector('.jpx-lab__stage');
    if (!stage) return;

    // Solo con mouse de verdad y si la persona no pidió reducir el movimiento.
    var hasMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var available = hasMouse && !reduceMotion;

    var ZOOM = 1.1;        // 10% más grande: un 5% de sobra en cada borde.
    var DEAD_ZONE = 0.5;   // La mitad central (de cada eje) queda quieta.
    var EASE = 0.03;       // Suavidad: más chico = más lento y suave.
    var CENTER = 'translate(-50%, -50%) ';  // Centrado del escenario (ver jpex.css).

    var target = { x: 0, y: 0 };
    var current = { x: 0, y: 0 };
    var running = false;
    var enabled = false;

    // Convierte la posición del mouse (de -1 a 1) en cuánto mover (de -1 a 1).
    function edgeStrength(n) {
        var distance = Math.abs(n);
        if (distance <= DEAD_ZONE) return 0;
        var t = Math.min((distance - DEAD_ZONE) / (1 - DEAD_ZONE), 1);
        var smooth = t * t * (3 - 2 * t); // Arranca y termina suave.
        return n > 0 ? smooth : -smooth;
    }

    function render() {
        if (!enabled) {
            running = false;
            return;
        }
        current.x += (target.x - current.x) * EASE;
        current.y += (target.y - current.y) * EASE;

        var rect = root.getBoundingClientRect();
        // Cuánto se puede mover sin que se vea el borde del escenario. Se calcula sobre
        // el contenedor (no sobre el escenario, que puede ser más grande por el recorte)
        // para que el recorrido sea el mismo de siempre.
        var maxX = rect.width * (ZOOM - 1) / 2 - 1;
        var maxY = rect.height * (ZOOM - 1) / 2 - 1;

        // Mouse a la derecha: se ve más de la derecha (el escenario va hacia la izquierda).
        var tx = -current.x * maxX;
        var ty = -current.y * maxY;
        stage.style.transform = CENTER + 'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) scale(' + ZOOM + ')';

        var settled = Math.abs(target.x - current.x) < 0.001 && Math.abs(target.y - current.y) < 0.001;
        if (settled) {
            running = false;
            return;
        }
        requestAnimationFrame(render);
    }

    function start() {
        if (enabled && !running) {
            running = true;
            requestAnimationFrame(render);
        }
    }

    function onMove(event) {
        var rect = root.getBoundingClientRect();
        var nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        var ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
        target.x = edgeStrength(nx);
        target.y = edgeStrength(ny);
        start();
    }

    // Si el mouse sale de la imagen (por ejemplo, a la barra de arriba), vuelve al centro.
    function onLeave() {
        target.x = 0;
        target.y = 0;
        start();
    }

    function enable() {
        if (!available || enabled) return;
        enabled = true;
        root.classList.add('is-live');
        root.addEventListener('mousemove', onMove);
        root.addEventListener('mouseleave', onLeave);
        window.addEventListener('resize', start);
        start();
    }

    function disable() {
        if (!enabled) return;
        enabled = false;
        root.removeEventListener('mousemove', onMove);
        root.removeEventListener('mouseleave', onLeave);
        window.removeEventListener('resize', start);
        target.x = target.y = current.x = current.y = 0;
        root.classList.remove('is-live');
        stage.style.transform = '';
    }

    window.JPEXLabPan = {
        available: available,
        enable: enable,
        disable: disable,
        isEnabled: function () { return enabled; }
    };

    enable();
})();
