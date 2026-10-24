# Construir los ejecutables de Linux

Plan e instrucciones para generar Branchly como **AppImage** (un único
ejecutable para cualquier distribución) y como paquetes **.deb** y **.rpm**,
integrados en el menú de aplicaciones y la barra de tareas. Para instalarlos y
usarlos, consulta [EJECUCION.md](EJECUCION.md).

> **Estado:** este documento es el plan. Ya está verificado el build nativo en
> Fedora 44: produce `.deb` y `.rpm` de 4,1 MB que instalan
> `/usr/bin/branchly`, un `.desktop` e iconos. Los pasos del contenedor, el
> AppImage y la publicación automática están pendientes de ejecutar; la lista
> de verificación final indica qué comprobar.

## Por qué no basta con compilar en tu máquina

Un binario de Tauri enlaza dos cosas del sistema donde se compila:

1. **glibc**: el ejecutable exige una glibc igual o más nueva que la usada al
   compilar. Fedora 44 trae glibc 2.43, así que un binario compilado ahí no
   arranca en Ubuntu 22.04 (glibc 2.35).
2. **WebKitGTK 4.1**: los `.deb` y `.rpm` lo toman del sistema como
   dependencia; el AppImage lo lleva dentro.

La solución estándar es **compilar dentro de un contenedor con una distribución
antigua y estable**. Ubuntu 22.04 es la base que usa el propio Tauri en sus
plantillas de CI.

<a id="compatibilidad"></a>

| Formato | Compilado en Ubuntu 22.04: funciona en | Necesita en el sistema |
|---|---|---|
| AppImage | Ubuntu 22.04+, Debian 12+, Fedora 36+, Mint 21+, Pop!_OS 22.04+, Arch, Manjaro, openSUSE Tumbleweed | glibc ≥ 2.35, Git y FUSE 2 (o `--appimage-extract-and-run`) |
| .deb | Ubuntu 22.04+, Debian 12+, Mint 21+, Pop!_OS 22.04+ | `libwebkit2gtk-4.1-0` (apt la instala) |
| .rpm | Fedora 36+, RHEL/Alma/Rocky 9+, openSUSE Tumbleweed | `webkit2gtk4.1` (dnf/zypper la instalan) |

Para distribuciones más antiguas (Ubuntu 20.04, Debian 11, openSUSE Leap 15)
no hay WebKitGTK 4.1 en los repositorios: haría falta un Flatpak con el runtime
de GNOME (ver la fase 5).

## Plan

| Fase | Objetivo | Resultado |
|---|---|---|
| 1 | Build nativo para tu propia máquina | `.deb` / `.rpm` locales (**ya verificado**) |
| 2 | Corregir la integración con el escritorio | Icono correcto en el menú y la barra en X11 y Wayland |
| 3 | Build portable en contenedor Ubuntu 22.04 | AppImage + `.deb` + `.rpm` para cualquier distribución |
| 4 | Publicación automática en GitHub | Ejecutables adjuntos a cada versión (`v0.2.0`…) |
| 5 | Opcional: Flatpak / Flathub | Instalación desde las tiendas de software |

### Fase 1: build nativo (para tu equipo)

Requisitos: los de desarrollo del [README](../README.md#requisitos).

```bash
npm ci
npm run app:build -- --bundles deb,rpm
```

Los paquetes quedan en `target/release/bundle/deb/` y `target/release/bundle/rpm/`.
Solo sirven para tu distribución y versiones más nuevas.

<a id="integracion-con-el-escritorio"></a>

### Fase 2: integración con el menú y la barra de tareas

Revisando el `.rpm` generado se ven dos puntos a corregir **antes** de
publicar:

1. **Nombre del lanzador frente al identificador de la ventana.** El paquete
   instala `Branchly.desktop`, pero la ventana se identifica como `branchly`.
   En X11 coinciden gracias a `StartupWMClass=branchly`. En Wayland (GNOME),
   la barra empareja la ventana con el lanzador por el nombre del archivo
   (`branchly.desktop`), así que podría mostrar un icono genérico y no agrupar
   la ventana con el icono fijado.

   Cambio propuesto en `src-tauri/tauri.conf.json`: usar una plantilla de
   lanzador propia para ambos paquetes y comprobar el resultado en GNOME
   Wayland y KDE:

   ```json
   "linux": {
     "deb": { "depends": ["git"], "desktopTemplate": "linux/branchly.desktop" },
     "rpm": { "depends": ["git"], "desktopTemplate": "linux/branchly.desktop" }
   }
   ```

   ```ini
   # src-tauri/linux/branchly.desktop
   [Desktop Entry]
   Type=Application
   Name=Branchly
   GenericName=Cliente Git
   Comment=Cliente Git ligero y moderno
   Exec=branchly %F
   Icon=branchly
   Terminal=false
   Categories=Development;RevisionControl;
   Keywords=git;branch;commit;merge;repositorio;
   StartupWMClass=branchly
   StartupNotify=true
   ```

   Si en Wayland siguiera sin emparejar, la alternativa es fijar el
   identificador de la aplicación al nombre del archivo (`Branchly`)
   llamando a `glib::set_prgname("Branchly")` al arrancar, y poner
   `StartupWMClass=Branchly` en la plantilla.

2. **Tamaños de icono.** Hoy se instalan 32, 128 y un 256 en una carpeta no
   estándar (`256x256@2`). Los paneles usan 48 y 64 px, y los lanzadores
   256 y 512. Hay que añadir esos PNG a `bundle.icon` (se generan con
   `npx tauri icon src-tauri/icons/logo.svg -o src-tauri/icons`) y, si el
   empaquetador no los coloca en su sitio, copiarlos en el paso de
   empaquetado a `/usr/share/icons/hicolor/<tamaño>/apps/branchly.png`.

### Fase 3: build portable en contenedor

Se necesita **Podman** o **Docker** (ya están instalados en este equipo). El
código se monta en el contenedor y los resultados quedan en `dist-linux/`.

**1. Imagen de compilación** (`packaging/linux/Containerfile`):

```dockerfile
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl wget file git ca-certificates pkg-config patchelf \
      libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
      libjavascriptcoregtk-4.1-dev librsvg2-dev libssl-dev xdg-utils rpm \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"
# linuxdeploy (que genera el AppImage) es a su vez un AppImage: sin FUSE en
# el contenedor, se extrae y se ejecuta. NO_STRIP evita errores de su `strip`
# antiguo con binarios recientes.
ENV APPIMAGE_EXTRACT_AND_RUN=1 NO_STRIP=1
WORKDIR /src
```

**2. Construir la imagen y compilar:**

```bash
podman build -t branchly-builder -f packaging/linux/Containerfile .

podman run --rm -v "$PWD":/src:Z -v branchly-cargo:/root/.cargo/registry \
  branchly-builder bash -c '
    npm ci &&
    npx tauri build --bundles appimage,deb,rpm &&
    mkdir -p dist-linux &&
    cp target/release/bundle/appimage/*.AppImage \
       target/release/bundle/deb/*.deb \
       target/release/bundle/rpm/*.rpm dist-linux/ &&
    cd dist-linux && sha256sum * > SHA256SUMS'
```

(Con Docker, cambia `podman` por `docker` y quita el `:Z`.) El volumen
`branchly-cargo` guarda las crates descargadas entre ejecuciones. La primera
compilación tarda unos 10–15 minutos; las siguientes, 2–3.

Precauciones:

- `node_modules` y `target` del anfitrión se comparten con el contenedor.
  Antes de compilar dentro, conviene borrarlos o montar volúmenes separados
  para ellos, para no mezclar binarios nativos de Fedora y de Ubuntu.
- Recomendable añadir `dist-linux/` a `.gitignore`.

**3. Comprobar la compatibilidad mínima del binario:**

```bash
objdump -T target/release/branchly | grep -o 'GLIBC_[0-9.]*' | sort -Vu | tail -1
# Debe ser GLIBC_2.35 o inferior.
```

Una vez probado, estos pasos se pueden reunir en un script
(`scripts/build-linux.sh`) que detecte Podman o Docker.

### Fase 4: publicación automática en GitHub

Un workflow que, al crear una etiqueta `v*`, compile en `ubuntu-22.04` y
adjunte los ejecutables a una Release (`.github/workflows/release.yml`):

```yaml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  linux:
    runs-on: ubuntu-22.04
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
            libjavascriptcoregtk-4.1-dev librsvg2-dev patchelf rpm
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NO_STRIP: 1
        with:
          tagName: ${{ github.ref_name }}
          releaseName: Branchly ${{ github.ref_name }}
          releaseDraft: true
          args: --bundles appimage,deb,rpm
```

Publicar una versión quedaría así: subir la versión en `package.json`,
`Cargo.toml` y `tauri.conf.json`, y ejecutar `git tag v0.2.0` y
`git push --tags`. La Release se crea como borrador para revisarla antes de
publicarla.

### Fase 5 (opcional): Flatpak

Un Flatpak funciona incluso en distribuciones sin WebKitGTK 4.1 (usa el
runtime `org.gnome.Platform`) y permite publicar en Flathub, que aparece en
GNOME Software y Discover. Requiere un manifiesto propio y permisos de sandbox
para acceder a las carpetas de los repositorios y al `ssh-agent`. Además,
Branchly necesita el `git` del anfitrión, que habría que invocar con
`flatpak-spawn --host`. Es el formato más trabajoso: se recomienda abordarlo
después del AppImage.

## Lista de verificación antes de publicar

Probar el AppImage al menos en Ubuntu 22.04, Fedora y Arch. Sirven máquinas
virtuales o `distrobox`, aunque la barra de tareas solo puede probarse en un
escritorio real.

- [ ] Arranca sin errores y abre un repositorio (`./Branchly.AppImage ~/repo`).
- [ ] `objdump` confirma GLIBC ≤ 2.35.
- [ ] Con el `.deb` o el `.rpm`, Branchly aparece en el menú con el icono nuevo.
- [ ] Al fijarlo en la barra (GNOME Wayland, GNOME X11, KDE) y abrirlo, la
      ventana se agrupa con el icono fijado y no aparece un icono genérico.
- [ ] Los pasos manuales de integración del AppImage de
      [EJECUCION.md](EJECUCION.md) funcionan; en particular, que el icono
      dentro del AppImage se llame `branchly.png`.
- [ ] Clonar, fetch y push funcionan con credenciales HTTPS (credential
      helper) y SSH (`ssh-agent`).
- [ ] `SHA256SUMS` coincide con los archivos publicados.

## Icono y logo

El icono parte de un único SVG, `src-tauri/icons/logo.svg`: una «b» formada
por una rama de Git que sale del tronco (cian) y vuelve a fusionarse
(violeta), sobre el degradado azul marino-teal de la app. Para regenerar todos
los tamaños (PNG, `.ico` y `.icns`) tras modificarlo:

```bash
npx tauri icon src-tauri/icons/logo.svg -o src-tauri/icons
rm -rf src-tauri/icons/android src-tauri/icons/ios
cp src-tauri/icons/logo.svg public/logo.svg   # el logo de la propia interfaz
```
