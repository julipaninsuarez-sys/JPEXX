/* JPEX Store: detalles de la barra de arriba.
 *
 * 1. La cápsula (carrito): esconde el número cuando está vacía, la llena de rojo según
 *    la cantidad (dibujo B) y la hace saltar cada vez que se guarda una prenda.
 *    El número lo escribe el carrito de base.html (renderCart); acá solo se lo escucha.
 * 2. La lupa del buscador (variante B): abre y cierra el campo.
 */
(function () {
    'use strict';

    /* ---------- Cápsula ---------- */
    var cartBtn = document.getElementById('jpexCartButton');
    var badge = document.getElementById('jpexCartCountBadge');
    if (cartBtn && badge) {
        var FULL_AT = 6;   // Con 6 prendas o más la cápsula se ve llena.
        var last = null;

        var update = function () {
            var n = parseInt(badge.textContent, 10) || 0;
            badge.classList.toggle('is-empty', n === 0);
            cartBtn.style.setProperty('--cap-lvl', n === 0 ? 0.06 : Math.min(1, 0.2 + 0.8 * (n - 1) / (FULL_AT - 1)).toFixed(3));
            cartBtn.setAttribute('aria-label', n === 0
                ? 'Abrir la cápsula (carrito vacío)'
                : 'Abrir la cápsula (' + n + (n === 1 ? ' prenda' : ' prendas') + ')');
            if (last !== null && n > last) {
                cartBtn.classList.remove('is-bump');
                void cartBtn.offsetWidth;   // Reinicia la animación si se agregan dos seguidas.
                cartBtn.classList.add('is-bump');
            }
            last = n;
        };
        cartBtn.addEventListener('animationend', function (e) {
            if (e.animationName === 'jpx-cap-bump') cartBtn.classList.remove('is-bump');
        });
        new MutationObserver(update).observe(badge, { childList: true, characterData: true, subtree: true });
        update();
    }

    /* ---------- Lupa del buscador ---------- */
    var toggle = document.getElementById('jpexSearchToggle');
    var field = document.getElementById('jpexSearchField');
    var input = document.getElementById('jpexLiveSearchInput');
    if (toggle && field && input) {
        var setOpen = function (open) {
            field.classList.toggle('is-open', open);
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) input.focus();
        };
        toggle.addEventListener('click', function () {
            setOpen(!field.classList.contains('is-open'));
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && field.classList.contains('is-open')) {
                setOpen(false);
                toggle.focus();
            }
        });
        // Tocar afuera lo cierra, salvo que haya algo escrito.
        document.addEventListener('click', function (e) {
            if (!field.classList.contains('is-open') || input.value.trim()) return;
            if (!field.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
        });
    }
})();
