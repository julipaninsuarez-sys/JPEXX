/* Fondo del hero: las imágenes se funden una sobre otra cada cierto tiempo. */
(function () {
    var root = document.querySelector('.jpx-hero__slides');
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var slides = Array.prototype.slice.call(root.querySelectorAll('.jpx-hero__slide'));
    if (slides.length < 2) return;

    var interval = Number(root.dataset.interval);
    var fade = Number(root.dataset.fade);
    var current = 0;
    var timer = null;

    root.style.setProperty('--hero-fade', fade + 'ms');

    function prepare(slide) {
        // Primero los recortes de celu y tablet (<source> del <picture>), después la foto entera.
        if (slide.parentNode && slide.parentNode.tagName === 'PICTURE') {
            Array.prototype.forEach.call(slide.parentNode.querySelectorAll('source[data-srcset]'), function (source) {
                source.srcset = source.dataset.srcset;
                delete source.dataset.srcset;
            });
        }
        if (slide.dataset.src) {
            slide.src = slide.dataset.src;
            delete slide.dataset.src;
        }
        return slide.decode();
    }

    function schedule() {
        timer = setTimeout(advance, interval);
    }

    function advance() {
        var next = (current + 1) % slides.length;

        prepare(slides[next]).then(function () {
            var previous = slides[current];
            var incoming = slides[next];

            incoming.classList.add('is-entering');
            timer = setTimeout(function () {
                previous.classList.remove('is-active');
                incoming.classList.add('is-active');
                incoming.classList.remove('is-entering');
                current = next;
                prepare(slides[(next + 1) % slides.length]).catch(function () {});
                schedule();
            }, fade);
        }).catch(function () {
            // Si una imagen no carga, se saltea y sigue con la próxima.
            current = next;
            schedule();
        });
    }

    document.addEventListener('visibilitychange', function () {
        clearTimeout(timer);
        if (!document.hidden) schedule();
    });

    // La segunda foto se baja recién cuando terminó de cargar la página, para no competir
    // con la primera (en el celu con datos eran 321 KB más de entrada).
    function preloadNext() { prepare(slides[1]).catch(function () {}); }
    if (document.readyState === 'complete') preloadNext();
    else window.addEventListener('load', preloadNext, { once: true });
    schedule();
})();
