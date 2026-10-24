# Construir los ejecutables de Linux

Cómo generar Branchly como **AppImage** (un único ejecutable para cualquier
distribución) y como paquetes **.deb** y **.rpm**, integrados en el menú de
aplicaciones y la barra de tareas. Para instalarlos y usarlos, consulta
[EJECUCION.md](EJECUCION.md).

```bash
scripts/build-linux.sh            # AppImage + .deb + .rpm portables en dist-linux/
packaging/linux/test-appimage.sh  # prueba el AppImage en 6 distribuciones
```

## Por qué se compila en un contenedor

Un binario de Tauri enlaza dos cosas del sistema donde se compila:

1. **glibc**: el ejecutable exige una glibc igual o más nueva que la usada al
   compilar. Compilado en Fedora 44 (glibc 2.43) no arrancaría en Ubuntu
   22.04 (glibc 2.35).
2. **WebKitGTK 4.1**: los `.deb` y `.rpm` lo toman del sistema como
   dependencia; el AppImage lo lleva dentro.

Por eso `scripts/build-linux.sh` compila en un contenedor **Ubuntu 22.04**. El
binario resultante solo exige **glibc 2.34**.

<a id="compatibilidad"></a>

## Compatibilidad verificada

El AppImage se probó en contenedores limpios de cada distribución, sobre la
pantalla del escritorio: arranca, muestra la ventana y abre un repositorio de
prueba con su gráfica, ramas, stash y cambios. Los paquetes nativos se
instalaron con el gestor de cada sistema, que resolvió las dependencias sin
que faltara ninguna biblioteca.

| Distribución | glibc | AppImage | .deb | .rpm |
|---|---|---|---|---|
| Ubuntu 22.04 LTS | 2.35 | ✔ | ✔ | — |
| Debian 12 | 2.36 | ✔ | ✔ | — |
| Ubuntu 24.04 LTS | 2.39 | ✔ | — | — |
| Fedora 40 | 2.39 | ✔ | — | ✔ |
| Arch Linux | 2.44 | ✔ | — | — |
| openSUSE Tumbleweed | 2.44 | ✔ | — | — |

Por compartir base también deberían funcionar Linux Mint 21+, Pop!_OS 22.04+,
elementary OS 7+, Zorin 17+, Manjaro y EndeavourOS (sin probar). No sirven las
distribuciones sin WebKitGTK 4.1 ni glibc ≥ 2.34, como Ubuntu 20.04, Debian 11
u openSUSE Leap 15.

| Formato | Tamaño | Necesita en el sistema |
|---|---|---|
| AppImage | 79 MB (incluye WebKitGTK) | Git, FUSE 2 (o `--appimage-extract-and-run`) y las bibliotecas gráficas de cualquier escritorio |
| .deb | 4,1 MB | Nada: `apt` instala `libwebkit2gtk-4.1-0` y `git` |
| .rpm | 4,1 MB | Nada: `dnf` / `zypper` instalan `webkit2gtk4.1` y `git` |

## Fases

| Fase | Qué | Estado |
|---|---|---|
| 1 | Build nativo para tu propia máquina | ✔ |
| 2 | Integración con el menú y la barra de tareas | ✔ |
| 3 | Build portable en contenedor (AppImage + .deb + .rpm) | ✔ |
| 4 | Publicación automática en GitHub | ✔ Workflow listo (se activa al publicar una etiqueta) |

### 1. Build nativo

Con los requisitos del [README](../README.md#requisitos):

```bash
npm ci
npm run app:build -- --bundles deb,rpm
```

Deja los paquetes en `target/release/bundle/`. Solo sirven para tu
distribución y versiones más nuevas; para distribuir, usa la fase 3.

<a id="integracion-con-el-escritorio"></a>

### 2. Integración con el menú y la barra de tareas

Para que la barra de tareas muestre el icono de Branchly y agrupe la ventana
con el lanzador fijado, tienen que coincidir tres nombres:

| Qué | Valor | Dónde se define |
|---|---|---|
| Identidad de la ventana (app_id de Wayland y `WM_CLASS` de X11) | `Branchly` | `glib::set_prgname` en `src-tauri/src/lib.rs` |
| Archivo del lanzador | `Branchly.desktop` | Nombre del producto en `tauri.conf.json` |
| `StartupWMClass` del lanzador | `Branchly` | `src-tauri/linux/branchly.desktop` |

Verificado en X11: la ventana se anuncia como `WM_CLASS = "Branchly",
"Branchly"` y `desktop-file-validate` acepta el lanzador. En Wayland, GTK usa el
mismo nombre de programa como app_id.

La plantilla `src-tauri/linux/branchly.desktop` se usa en el `.deb`, el `.rpm`
y el AppImage. Añade la categoría de control de versiones, palabras clave de
búsqueda y `%F` para abrir carpetas.

Los paquetes instalan el icono en los tamaños estándar de
`/usr/share/icons/hicolor` (32, 48, 64, 128, 256 y 512 px), que se generan
desde `src-tauri/icons/logo.svg` (ver [Icono y logo](#icono-y-logo)).

### 3. Build portable en contenedor

Necesita **Docker** o **Podman** (`CONTAINER_ENGINE=podman` para forzarlo):

```bash
scripts/build-linux.sh
```

Qué hace:

1. Construye la imagen `branchly-linux-builder` desde
   [`packaging/linux/Dockerfile`](../packaging/linux/Dockerfile): Ubuntu
   22.04 con WebKitGTK, Node 22 y Rust.
2. Ejecuta [`packaging/linux/build-in-container.sh`](../packaging/linux/build-in-container.sh),
   que instala las dependencias de npm, compila y empaqueta el AppImage, el
   `.deb` y el `.rpm`.
3. Copia los resultados y `SHA256SUMS` a `dist-linux/` e informa de la glibc
   mínima que exige el binario.

Detalles:

- `node_modules`, el registro de Cargo, la carpeta de compilación y las
  herramientas del AppImage viven en **volúmenes de Docker** propios
  (`branchly-*`), separados de los de tu sistema: compilar en el contenedor no
  interfiere con `npm run app:dev`.
- Los archivos generados se devuelven a tu usuario: no quedan como propiedad
  de root.
- La primera ejecución tarda unos 10 minutos (descarga de la imagen y
  compilación completa); las siguientes, 2–3.
- Para liberar espacio después:
  `docker volume rm branchly-node-modules branchly-cargo-registry branchly-target branchly-tauri-cache`
  y `docker image rm branchly-linux-builder`.

#### Probar el AppImage en varias distribuciones

```bash
packaging/linux/test-appimage.sh                        # las 6 de la tabla
packaging/linux/test-appimage.sh ubuntu:22.04 fedora:40  # o solo algunas
```

Para cada distribución, el script:

- arranca un contenedor limpio e instala las bibliotecas gráficas que trae
  cualquier escritorio (el formato AppImage las deja al sistema a propósito);
- abre un repositorio de prueba con tu usuario;
- comprueba que la ventana aparece y que el repositorio se abrió;
- guarda una captura de cada distribución.

Necesita una sesión gráfica, `xprop` e ImageMagick.

### 4. Publicación automática

[`.github/workflows/release.yml`](../.github/workflows/release.yml) ejecuta el
mismo `scripts/build-linux.sh` en GitHub Actions, así que los artefactos de la
CI son idénticos a los locales. Se activa al subir una etiqueta de versión:

1. Sube la versión en `package.json`, `Cargo.toml` (`[workspace.package]`) y
   `src-tauri/tauri.conf.json`, y haz commit.
2. `git tag v0.2.0 && git push origin v0.2.0`.
3. El workflow compila, adjunta el AppImage, el `.deb`, el `.rpm` y
   `SHA256SUMS` a un **borrador de Release** con notas generadas, y también
   los deja como artefacto de la ejecución.
4. Revisa el borrador en GitHub y publícalo.

También puede lanzarse a mano desde la pestaña Actions («Run workflow»); en
ese caso solo se guardan los artefactos, sin crear Release.

## Lista de verificación antes de publicar

- [ ] `packaging/linux/test-appimage.sh` pasa en todas las distribuciones.
- [ ] La salida de `scripts/build-linux.sh` indica glibc ≤ 2.35.
- [ ] En tu escritorio: instalar el `.deb` o el `.rpm`, fijar Branchly en la
      barra y comprobar que la ventana abierta se agrupa con el icono fijado
      (GNOME Wayland, GNOME X11 y KDE si es posible).
- [ ] Clonar, fetch y push funcionan con HTTPS (credential helper) y SSH
      (`ssh-agent`).
- [ ] `sha256sum -c SHA256SUMS` dentro de `dist-linux/`.

<a id="icono-y-logo"></a>

## Icono y logo

Todo parte de `src-tauri/icons/logo.svg`: una «b» formada por una rama de Git
que sale del tronco (cian) y se fusiona de vuelta (violeta), sobre el
degradado azul marino-teal de la app. Tras modificarlo:

```bash
npx tauri icon src-tauri/icons/logo.svg -o src-tauri/icons
npx tauri icon src-tauri/icons/logo.svg -o /tmp/icons-extra -p 48 -p 256 -p 512
cp /tmp/icons-extra/{48x48,256x256,512x512}.png src-tauri/icons/
rm -rf src-tauri/icons/android src-tauri/icons/ios
cp src-tauri/icons/logo.svg public/logo.svg   # logo de la propia interfaz
```

## Fuera de alcance: Flatpak

Un Flatpak permitiría publicar en Flathub y funcionar en distribuciones sin
WebKitGTK 4.1, pero necesita un manifiesto propio, permisos de sandbox para
acceder a las carpetas y al `ssh-agent`, e invocar el `git` del anfitrión con
`flatpak-spawn --host`. Se ha dejado fuera por ahora.
