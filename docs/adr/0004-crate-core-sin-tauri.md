# ADR 0004: `branchly-core` separado del shell de Tauri

- Estado: aceptada
- Fecha: 2026-10-24

## Contexto

El enunciado pide un backend en capas (`commands/`, `services/`, `git/`,
`domain/`) con pruebas de servicios sobre repositorios temporales.

## Decisión

El backend es un workspace de Cargo con dos crates:

- `crates/branchly-core`: `domain/`, `git/`, `services/`, `graph`, errores,
  sesión, repositorios recientes y clasificación de eventos del sistema de
  archivos. **No depende de Tauri.**
- `src-tauri` (`branchly`): `commands/` (adaptadores delgados), estado de la
  app, eventos y el watcher.

## Consecuencias

- Las pruebas del núcleo compilan y corren sin WebView, también en CI sin
  pantalla ni paquetes de WebKitGTK.
- La frontera de capas la impone el compilador: un servicio no puede usar
  tipos de Tauri por accidente.
- Los tipos de dominio derivan `specta::Type` en el núcleo para poder exportarse
  a TypeScript (ver ADR 0005).
