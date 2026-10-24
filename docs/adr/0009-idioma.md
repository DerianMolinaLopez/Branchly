# ADR 0009: Idioma de la interfaz y de los mensajes

- Estado: aceptada
- Fecha: 2026-10-24

## Decisión

- La interfaz, los mensajes de error del backend y la documentación están en
  **español**. El código, los identificadores y los comentarios del código
  están en inglés, como es habitual.
- Los errores llevan un **código estable** (`ErrorCode`) además del mensaje: el
  frontend decide su comportamiento por código (por ejemplo, ofrecer "Stash y
  cambiar" ante `WOULD_OVERWRITE_CHANGES`), nunca por el texto.
- Los textos de Git CLI se muestran tal cual en el detalle técnico.

## Consecuencias

Añadir otro idioma requiere extraer los textos a un catálogo (i18n); los
códigos de error ya permiten traducir sin tocar la lógica.
