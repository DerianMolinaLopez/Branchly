# ADR 0008: Permisos de Tauri y seguridad

- Estado: aceptada
- Fecha: 2026-10-24

## Decisión

- **Capacidades mínimas** (`src-tauri/capabilities/main-window.json`): escuchar
  eventos, los controles de la ventana sin marco (minimizar, maximizar,
  cerrar, arrastrar) y el selector de carpetas. No se conceden `fs`, `shell`
  ni `opener` al frontend.
- Abrir archivos en el editor externo o mostrarlos en la carpeta se hace desde
  **comandos propios**, que validan que la ruta esté dentro del repositorio
  antes de usar el plugin `opener` desde Rust.
- **Toda ruta que llega del frontend se valida** (`services::validate_path`):
  nada absoluto, sin `..` ni rutas dentro de `.git`. Nombres de ramas,
  etiquetas, remotos y hashes también se validan; nada que empiece por `-`
  llega como argumento al CLI (sin inyección de opciones), y las URLs de
  clonado van detrás de `--`.
- **CSP estricta**: solo recursos propios; estilos inline permitidos para las
  animaciones; sin `eval`.
- Los comandos propios no se restringen con un *app manifest*: la ventana es
  única, no carga contenido remoto y la CSP impide inyectar scripts, así que
  restringirlos solo añadiría mantenimiento sin reducir la superficie de
  ataque.
