# Privacidad

Branchly es un programa local. Esta página explica qué hace y qué no hace con
tus datos, y cómo comprobarlo tú mismo en el código.

## En resumen

- **No recopila información**: ni uso, ni repositorios, ni rutas, ni
  identidad de Git, ni informes de errores.
- **No tiene telemetría ni analíticas**, ni servicio de actualizaciones
  automáticas que contacte con un servidor.
- **No guarda ni transmite tus credenciales.** Branchly nunca las ve: no pide
  contraseñas ni tokens.
- **No tiene cliente HTTP.** Ni el backend en Rust ni el frontend contienen
  código que abra conexiones de red por su cuenta.

## Cómo se tratan las credenciales

Las operaciones de red (clonar, fetch, pull y push) las ejecuta **tu binario
de `git`** como un proceso hijo, con `GIT_TERMINAL_PROMPT=0` para que nunca se
bloquee esperando una contraseña ([`cli.rs`](../crates/branchly-core/src/git/cli.rs)).
La autenticación la resuelve Git con lo que ya tienes configurado: un
*credential helper* (Git Credential Manager en Windows, `libsecret` en Linux,
`osxkeychain` en macOS) o `ssh-agent`. Branchly solo recibe el resultado y el
progreso. No hay en el código ninguna lectura, almacenamiento ni envío de
contraseñas o tokens.

Lo que Git envíe a tu servidor (GitHub, GitLab, tu propio servidor…) es lo que
enviaría ejecutando `git push` en la terminal, y está sujeto a las condiciones
de ese servidor.

## Qué se guarda en tu equipo

| Qué | Dónde |
|---|---|
| Lista de repositorios recientes (rutas) | `recent.json` en la carpeta de datos de la app |
| Ajustes y pestañas abiertas | Almacenamiento local del WebView |

Todo queda en tu máquina. Para borrarlo, elimina la carpeta de datos
(`~/.local/share/app.branchly.desktop/` en Linux,
`%APPDATA%\app.branchly.desktop` y `%LOCALAPPDATA%\app.branchly.desktop` en
Windows).

## Cómo comprobarlo

1. **Sin dependencias de red.** `cargo tree -p branchly` no incluye ningún
   cliente HTTP (`reqwest`, `hyper`, `ureq`…). `git2` se compila sin
   transportes HTTPS ni SSH ([ADR 0002](adr/0002-git2-y-git-cli.md)).
2. **CSP estricta** en `src-tauri/tauri.conf.json`: `connect-src` solo permite
   la IPC interna, e `img-src`, `font-src` y `script-src` solo recursos
   propios. El WebView no puede contactar con ningún servidor externo.
3. **Permisos mínimos** (`src-tauri/capabilities/main-window.json`): sin
   acceso al sistema de archivos, al shell ni a HTTP desde el frontend
   ([ADR 0008](adr/0008-permisos-y-seguridad.md)).
4. **Avatares locales**: son las iniciales del autor con un color derivado de
   su correo. No se consulta Gravatar ni ningún otro servicio.
5. **Fuentes incluidas** en la app (`@fontsource`): no se descargan de Google
   Fonts ni de ninguna CDN.
6. Observa el tráfico con tu herramienta favorita (Wireshark, `ss -tp`,
   Little Snitch…): al abrir un repositorio local, Branchly no genera ninguna
   conexión.

## Matices honestos

- **WebView del sistema.** Branchly usa WebKitGTK en Linux y Microsoft Edge
  WebView2 en Windows. Son componentes del sistema operativo con su propia
  política de privacidad; Branchly no los controla. Su contenido es solo la
  interfaz local de la aplicación.
- **Hooks y configuración de Git.** Como se usa tu `git`, se aplican tus hooks,
  tu configuración y tu firma de commits, igual que desde la terminal.
- **Modificaciones de terceros.** Esta garantía es sobre el código de este
  repositorio. Si usas un binario compilado por otra persona, verifica su
  procedencia con los `SHA256SUMS` de cada release o compílalo tú.

Si encuentras algo que contradiga esta página, abre un *issue*: es un fallo.
