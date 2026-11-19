# Ideas de venta

Ideas de Francisco para más adelante. Todavía no están hechas.

## 1. Más pruebas de regalo para quien compra (2026-11-18)

Quien se probó una prenda en el Lab y después la compra recibe pruebas extra con la IA, para que pueda probarse otras prendas.

- **Por qué:** premia a quien usó la IA y compró. Además, lo invita a seguir probando y a volver a comprar.
- **Contexto:** hoy cada persona tiene un límite de pruebas por hora (`laboratory/cuidados.py`), porque la IA cuesta plata por prueba (FASHN cobra US$0,075 cada una). El regalo sería subirle ese límite a quien compró.
- **Qué haría falta:**
  - saber que la compra vino de una prueba del Lab, por ejemplo guardando el número de prueba en el pedido;
  - una forma de reconocer a esa persona cuando vuelve: un código de regalo o su cuenta.

## 2. Cambio con envío gratis si el talle recomendado no quedó bien (2026-11-18)

Si la persona se probó la prenda en el Lab, compró el talle que le recomendó, y al probársela no le quedó como prometía la recomendación, se la cambiamos y el envío lo paga JPEX.

- **Por qué:** da confianza para comprar ropa por internet sin probársela. Además, muestra que la recomendación de talle va en serio.
- **Qué haría falta:**
  - poder comprobar que compró justo el talle recomendado. La prueba ya guarda el talle, la altura, el peso y la prenda (`TryOnSession`); faltaría unirla con el pedido;
  - las condiciones escritas: plazo, prenda sin usar, etc.;
  - decir esto en la sala de revelado, junto al talle recomendado, y en el carrito.
