/*
 * Bloque "Tu talle" (recomendador de talles).
 *
 * - Manda los datos al servidor por POST (con el token CSRF del formulario)
 *   y muestra la respuesta.
 * - Guarda los datos del formulario en localStorage para no tener que
 *   cargarlos de nuevo en otra prenda. Nunca salen de este dispositivo salvo
 *   al calcular, y el servidor no los guarda.
 * - Todo texto que viene del servidor se pone con textContent (nunca innerHTML),
 *   para que no se pueda inyectar HTML.
 */
(function () {
    "use strict";

    const root = document.getElementById("size-finder");
    if (!root) return; // la prenda no tiene recomendador

    const STORAGE_KEY = "jpex.sizeFinder.v1";
    const FIELDS = ["height_cm", "weight_kg", "build", "fit", "chest_cm", "waist_cm"];

    const TEXT = {
        verdict: { justo: "Justo", ideal: "Ideal", suelto: "Suelto" },
        direction: { suelto: "más suelto", ajustado: "más ajustado" },
        confidence: {
            media: "Estimación a partir de tu altura, peso y contextura",
            alta: "Calculado con tus medidas",
        },
        noSize: "Esta prenda no tiene un talle que te quede bien. Escribinos por WhatsApp y te ayudamos.",
        mismatch: "Tus medidas no coinciden con tu altura y peso. Revisá que estén bien cargadas.",
        refine: "Para afinar tu talle, podés cargar tus medidas de pecho y cintura en Precisión máxima.",
        network: "No pudimos calcular tu talle. Probá de nuevo en un momento.",
    };

    const form = document.getElementById("sfForm");
    const url = root.dataset.url;
    const defaultFit = root.dataset.defaultFit;
    const el = {
        submit: document.getElementById("sfSubmit"),
        generalError: document.getElementById("sfGeneralError"),
        result: document.getElementById("sfResult"),
        headline: document.getElementById("sfHeadline"),
        alternative: document.getElementById("sfAlternative"),
        rows: document.getElementById("sfRows"),
        confidence: document.getElementById("sfConfidence"),
        extra: document.getElementById("sfExtra"),
        useSize: document.getElementById("sfUseSize"),
        clear: document.getElementById("sfClear"),
    };

    let hasResult = false;     // ¿ya hubo un cálculo exitoso? (para recalcular al cambiar el calce)
    let requestNumber = 0;     // para ignorar respuestas viejas si llegan desordenadas
    let recommendedSize = null;

    // ------------------------------------------------------------------
    // localStorage (puede fallar: navegación privada, bloqueado, etc.)
    // ------------------------------------------------------------------
    function loadSaved() {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function save() {
        const data = {};
        FIELDS.forEach(function (name) { data[name] = readField(name); });
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            // Sin localStorage el bloque igual funciona; solo no recuerda los datos.
        }
    }

    function clearSaved() {
        try {
            window.localStorage.removeItem(STORAGE_KEY);
        } catch (e) { /* nada que hacer */ }
    }

    // ------------------------------------------------------------------
    // Leer y escribir los campos del formulario
    // ------------------------------------------------------------------
    function readField(name) {
        const input = form.elements[name];
        if (!input) return "";
        return (input.value || "").trim();  // en radios, .value es el marcado ("" si ninguno)
    }

    function writeField(name, value) {
        const input = form.elements[name];
        if (!input || value === undefined || value === null) return;
        if (input instanceof RadioNodeList) {
            // Solo marcamos la opción si existe en esta prenda
            // (ej. "ajustado" guardado de otra prenda no existe en una oversize).
            const option = Array.from(input).find(function (r) { return r.value === value; });
            if (option) option.checked = true;
        } else {
            input.value = value;
        }
    }

    function openPrecision() {
        // Este archivo corre antes de que cargue Bootstrap (está al final de base.html),
        // así que abrimos la sección a mano: la clase "show" es lo que Bootstrap usa
        // para saber que está abierta, y el botón de abrir/cerrar sigue funcionando.
        const section = document.getElementById("sfPrecision");
        section.classList.add("show");
        const toggle = root.querySelector('[data-bs-target="#sfPrecision"]');
        if (toggle) {
            toggle.classList.remove("collapsed");
            toggle.setAttribute("aria-expanded", "true");
        }
    }

    function restore() {
        const saved = loadSaved();
        if (!saved) return;
        FIELDS.forEach(function (name) { writeField(name, saved[name]); });
        // Si se guardó algo de precisión máxima, abrimos esa sección para que se vea.
        if (saved.chest_cm || saved.waist_cm) openPrecision();
    }

    // ------------------------------------------------------------------
    // Errores
    // ------------------------------------------------------------------
    function clearErrors() {
        form.querySelectorAll(".is-invalid").forEach(function (i) { i.classList.remove("is-invalid"); });
        form.querySelectorAll("[data-error-for]").forEach(function (box) {
            box.textContent = "";
            if (box.classList.contains("text-danger")) box.classList.add("d-none");
        });
        el.generalError.textContent = "";
        el.generalError.classList.add("d-none");
    }

    function showError(field, message) {
        const box = field && form.querySelector('[data-error-for="' + field + '"]');
        if (!box) {
            el.generalError.textContent = message;
            el.generalError.classList.remove("d-none");
            return;
        }
        box.textContent = message;
        box.classList.remove("d-none");
        const input = form.elements[field];
        if (input && !(input instanceof RadioNodeList)) {
            input.classList.add("is-invalid");
            if (field === "chest_cm" || field === "waist_cm") {
                // Si el error está en la sección cerrada, la abrimos para que se vea.
                openPrecision();
            }
            input.focus();
        }
    }

    // ------------------------------------------------------------------
    // Mostrar el resultado
    // ------------------------------------------------------------------
    function hideResult() {
        hasResult = false;
        recommendedSize = null;
        el.result.classList.add("d-none");
    }

    function findSizeButton(sizeName) {
        if (!sizeName) return null;
        const wanted = sizeName.trim().toUpperCase();
        return Array.from(document.querySelectorAll(".size-btn")).find(function (b) {
            return (b.dataset.size || "").trim().toUpperCase() === wanted;
        }) || null;
    }

    function setBoldLine(p, before, bold, after) {
        p.textContent = "";
        p.append(before);
        const strong = document.createElement("strong");
        strong.textContent = bold;
        p.append(strong, after);
    }

    function showResult(data) {
        // 1. Talle recomendado y alternativa
        if (data.recommended) {
            setBoldLine(el.headline, "Te recomendamos ", data.recommended, "");
        } else {
            el.headline.textContent = "";
        }
        if (data.recommended && data.alternative) {
            setBoldLine(
                el.alternative,
                "También podría quedarte bien ",
                data.alternative,
                " si lo preferís " + TEXT.direction[data.alternative_direction] + "."
            );
        } else {
            el.alternative.textContent = "";
        }

        // 2. Una fila por talle, sin centímetros
        el.rows.textContent = "";
        data.comparison.forEach(function (row) {
            const li = document.createElement("li");
            const isRecommended = row.size_name === data.recommended;
            li.className = "border px-2 py-1 small " + (isRecommended ? "border-dark fw-bold" : "border-secondary");
            li.textContent = row.size_name + ": " + TEXT.verdict[row.verdict];
            el.rows.append(li);
        });

        // 3. Confianza en palabras
        el.confidence.textContent = TEXT.confidence[data.confidence] || "";

        // 4. Como máximo un mensaje extra, en orden de prioridad
        let extra = "";
        if (!data.recommended) extra = TEXT.noSize;
        else if (data.measurements_mismatch) extra = TEXT.mismatch;
        else if (data.confidence === "media") extra = TEXT.refine;
        el.extra.textContent = extra;

        // Botón "Usar este talle": solo si el talle está en el selector de la prenda
        recommendedSize = data.recommended;
        el.useSize.classList.toggle("d-none", !findSizeButton(recommendedSize));

        el.result.classList.remove("d-none");
        hasResult = true;
    }

    // ------------------------------------------------------------------
    // Pedirle la recomendación al servidor
    // ------------------------------------------------------------------
    async function calculate() {
        clearErrors();
        save();
        const myNumber = ++requestNumber;
        el.submit.disabled = true;

        let response, data;
        try {
            response = await fetch(url, {
                method: "POST",
                body: new FormData(form),  // incluye csrfmiddlewaretoken
                headers: { "X-Requested-With": "XMLHttpRequest" },
                credentials: "same-origin",
            });
            data = await response.json();
        } catch (e) {
            data = null; // sin conexión, o la respuesta no era JSON (ej. 403 por CSRF)
        } finally {
            if (myNumber === requestNumber) el.submit.disabled = false;
        }

        if (myNumber !== requestNumber) return; // llegó una respuesta más nueva

        if (!data) {
            hideResult();
            showError(null, TEXT.network);
            return;
        }
        if (!data.ok) {
            hideResult();
            showError(data.field, data.error || TEXT.network);
            return;
        }
        showResult(data);
    }

    // ------------------------------------------------------------------
    // Eventos
    // ------------------------------------------------------------------
    form.addEventListener("submit", function (event) {
        event.preventDefault();
        calculate();
    });

    // Guardar mientras escribe (sin calcular), y sacar el error del campo que corrige.
    form.addEventListener("input", function (event) {
        event.target.classList.remove("is-invalid");
        save();
    });

    form.addEventListener("change", function (event) {
        save();
        // Al cambiar el calce, recalcular al instante (solo si ya había un resultado).
        if (event.target.name === "fit" && hasResult) calculate();
    });

    el.useSize.addEventListener("click", function () {
        const btn = findSizeButton(recommendedSize);
        if (btn && typeof window.selectSize === "function") {
            window.selectSize(btn, btn.dataset.size);
            btn.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    });

    el.clear.addEventListener("click", function () {
        clearSaved();
        form.reset(); // vuelve el calce al preseleccionado del HTML
        writeField("fit", defaultFit);
        clearErrors();
        hideResult();
    });

    restore();
})();
