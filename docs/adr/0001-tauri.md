# ADR 0001: Tauri 2 como plataforma de escritorio

- Estado: aceptada
- Fecha: 2026-10-24

## Contexto

Branchly tiene que arrancar en menos de un segundo, consumir poca memoria y
distribuirse con un instalador pequeño. A la vez queremos una interfaz web
moderna (React) y un núcleo con acceso eficiente a Git.

## Decisión

Usamos **Tauri 2**: backend en Rust y frontend en el WebView del sistema
(WebKitGTK en Linux, WebView2 en Windows, WKWebView en macOS).

## Alternativas consideradas

- **Electron**: ecosistema maduro, pero empaqueta Chromium y Node (instaladores
  de más de 80 MB y más de 150 MB de RAM en reposo). Además, el acceso a
  libgit2 desde Node necesita bindings nativos frágiles.
- **Interfaz nativa (GTK, Qt, egui)**: muy ligera, pero hace más lento
  conseguir el nivel de pulido visual del diseño y obliga a reimplementar
  componentes accesibles que Radix ya resuelve.

## Consecuencias

- Instalador de pocos MB y arranque rápido (ver README).
- El renderizado varía ligeramente entre motores de WebView: evitamos CSS
  experimental y probamos el diseño en Chromium (revisión visual) y en
  WebKitGTK (la app real).
- En Linux hacen falta los paquetes de desarrollo de WebKitGTK para compilar.
