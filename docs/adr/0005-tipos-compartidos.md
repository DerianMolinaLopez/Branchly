# ADR 0005: Tipos compartidos con tauri-specta

- Estado: aceptada
- Fecha: 2026-10-24

## Decisión

Usamos **tauri-specta `=2.0.0-rc.21`** con `specta =2.0.0-rc.22` y
`specta-typescript =0.0.9`. Esa combinación es compatible con Tauri 2 (las
versiones posteriores avanzan hacia Tauri 3). Las versiones van fijadas con `=`
porque son release candidates.

`src/api/bindings.ts` se genera a partir de los comandos y tipos de Rust:

- al arrancar la app en modo debug, y
- con `npm run bindings` (un test del crate `branchly`), útil en CI.

Incluye las funciones tipadas de cada comando (con `Result<T, ErrorPayload>`),
los `Channel<Progress>` para el progreso y los eventos (`repoChanged`).

Los enteros de 64 bits (marcas de tiempo) se exportan como `number`
(`BigIntExportBehavior::Number`): los segundos desde la época caben de sobra en
un `double`.

## Por qué no ts-rs

ts-rs genera los tipos pero no las funciones de los comandos: tendríamos que
mantener a mano los nombres y argumentos de cada `invoke`, que es justo lo que
queremos evitar.

## Consecuencias

- Los componentes nunca llaman a `invoke`: usan `src/api/*`, que desenvuelve los
  `Result` en un `GitError` tipado. Una regla de ESLint prohíbe importar
  `invoke` directamente.
- Cambiar un tipo en Rust rompe la compilación de TypeScript donde haga falta.
