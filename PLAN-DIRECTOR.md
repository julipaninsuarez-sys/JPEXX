# Plan del director — Lab de JPEX

Última actualización: 2026-11-10. Rama de trabajo: `lab-combinado`. Sin commits hasta que Francisco lo pida.

## Objetivo
Armar la pestaña "Lab": un laboratorio abandonado donde el cliente ve prendas y, más adelante, se las prueba en un maniquí.

## Estado actual
- Rama `lab-combinado` (sale de `main` con el Lab de Juli): el Lab de fondo animado y la app `laboratory` de Juli quedaron unidos.
- Todo el Lab vive en la app `laboratory`: vista única `lab_view` (probador: talle + prueba con IA) y `lab_sketches` (bocetos). Plantillas en `templates/laboratory/`.
- `/lab/` muestra el laboratorio con un cartel y el botón "Abrir el probador". `/lab/<id>/` (botón "Probar en JPEX LAB" del producto) abre el probador directo. `/lab/bocetos/` son los bocetos de animaciones.
- El probador necesita el paquete `gradio_client` (instalado en el `.venv`; no hay `requirements.txt`).
- Lo de Juli ya cubre una primera versión de las fases 7 (talle por altura y peso) y 9 (prueba con IA).
- **Esperando que Francisco pruebe los bocetos y dicte su selección** (el texto del panel).
- Sin verificar: animaciones en movimiento en un navegador real, el Lab en un celular real, y el envío del formulario del probador (usa un servicio externo de IA).
- La entrada al Lab (pantalla con la puerta y transición) queda para más adelante: primero hay que hacer el dibujo.

## Decisión de arquitectura (Fable)
Todo el Lab se arma sobre un "escenario" con proporción fija 16:9 que cubre la pantalla y se recorta desde el centro. La imagen, las luces, la niebla, los ojos y más adelante el armario y el maniquí van adentro, ubicados en porcentajes. Así cada efecto queda pegado a su lugar de la imagen en cualquier pantalla, y el movimiento con el mouse mueve todo junto.

## Etapas

| # | Tarea | Quién | Estado |
|---|---|---|---|
| 1.1 | Fondos en WebP, tres tamaños (el traje se oscurece con una capa, no en la imagen) | Opus | hecho |
| 1.2 | Página del Lab sobre el escenario 16:9 | Opus | hecho |
| 1.3 | Capturas en escritorio y celular, revisión | Opus + Fable | hecho |
| 2.0 | Página de bocetos con variantes de cada animación | Opus, diseño de Fable | hecho, esperando elección |
| 2.1 | Pasar a `/lab/` las variantes elegidas, de a grupos | Opus | pendiente |
| 2.2 | Giroscopio en celular (el mouse ya está) | Opus | pendiente |
| 2.3 | Prueba de rendimiento en celular y de "reducir movimiento" | Fable | pendiente |
| 3.1 | Pantalla de entrada y botón para entrar | Sonnet | pospuesta: falta el dibujo de la entrada |
| 3.2 | Transición con la puerta | Fable (diseño) + Opus | pospuesta |

## Fases futuras (planificadas, no se construyen todavía)

| Fase | Cómo conviene hacerla | Tiempo estimado | Costo en servicios |
|---|---|---|---|
| 4. Armario-cápsula | Ilustración en 2 o 3 capas (cerrado, puertas, interior) generada con IA de imágenes; apertura animada con CSS. Las prendas salen del catálogo (campo nuevo "disponible en el Lab"). | 1 a 2 sesiones | Créditos de la IA de imágenes |
| 5. Maniquí 2D | Maniquí hombre y mujer como imagen base. Cada prenda necesita una imagen "puesta" en la misma pose, con fondo transparente. | 1 sesión de código + trabajo de imagen por prenda | Créditos de imágenes por prenda |
| 6. Combinar prendas | Capas por zona (cabeza, torso, abrigo, piernas, pies) con orden fijo. Se guarda el conjunto elegido. | 1 sesión | Ninguno |
| 7. Calibración | Altura y peso → talle recomendado según tabla de medidas por prenda. El maniquí se escala a la vista. | 1 a 2 sesiones | Ninguno. Hace falta la tabla de talles real. |
| 8. Giro 3D | Opción barata: 8 a 12 vistas pre-dibujadas que se pasan al arrastrar. Opción completa: Three.js con modelos 3D de maniquí y de cada prenda. | Barata: 1 a 2 sesiones. Completa: varias semanas | Completa: modelado 3D de cada prenda (programa pago o encargo) |
| 9. Prueba con IA | El cliente sube una foto y un servicio externo devuelve la prenda puesta. La clave va en el servidor. Límite de usos por persona, consentimiento y borrado de fotos. | 2 a 3 sesiones | Pago por imagen (precio a verificar al elegir servicio) |

## Próximo paso
Con la selección de Francisco: ajustar lo que pida en los bocetos y pasar las variantes elegidas a `/lab/`, de a grupos. Después, prueba de rendimiento en celular.
