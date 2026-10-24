# Instalar y ejecutar Branchly en Linux

Guía para usar Branchly sin compilarlo. Si quieres generar los ejecutables,
consulta [CONSTRUCCION.md](CONSTRUCCION.md).

## Qué descargar

| Tu distribución | Archivo recomendado | Aparece en el menú y la barra de tareas |
|---|---|---|
| Cualquiera (Ubuntu, Debian, Fedora, Arch, openSUSE, Mint…) | `Branchly_x.y.z_amd64.AppImage` | Tras integrarlo (ver más abajo) |
| Ubuntu, Debian, Linux Mint, Pop!_OS | `Branchly_x.y.z_amd64.deb` | Sí, automáticamente |
| Fedora, RHEL, openSUSE | `Branchly-x.y.z-1.x86_64.rpm` | Sí, automáticamente |

Los ejecutables se generan en Ubuntu 22.04 y se han probado en Ubuntu 22.04
y 24.04, Debian 12, Fedora 40, Arch y openSUSE Tumbleweed. También deberían
funcionar en las derivadas (Linux Mint 21+, Pop!_OS, Manjaro…); ver la
[tabla de compatibilidad](CONSTRUCCION.md#compatibilidad).

**Requisito en todos los casos:** tener **Git** instalado (`git --version`).
Branchly usa tu Git para clonar, hacer fetch, pull, push y commits, con tus
credenciales y tu `ssh-agent`.

## AppImage (cualquier distribución)

Un único archivo que incluye todo lo necesario; no hace falta instalar nada.

```bash
chmod +x Branchly_*_amd64.AppImage
./Branchly_*_amd64.AppImage
```

Si no arranca y menciona **FUSE**, instala la biblioteca o ábrelo sin ella:

```bash
sudo apt install libfuse2t64        # Ubuntu 24.04 o superior
sudo apt install libfuse2           # Ubuntu 22.04 / Debian
./Branchly_*_amd64.AppImage --appimage-extract-and-run   # sin instalar nada
```

### Añadirlo al menú de aplicaciones y a la barra de tareas

Un AppImage no se integra solo en el escritorio. Elige una opción:

- **Gear Lever** (Flathub): arrastra el AppImage a la ventana de Gear Lever y
  pulsa «Desbloquear» y «Mover a las aplicaciones». También gestiona las
  actualizaciones y la desinstalación.
- **AppImageLauncher**: al abrir el AppImage por primera vez pregunta si
  quieres integrarlo.
- **A mano**:

  ```bash
  mkdir -p ~/Applications ~/.local/share/applications ~/.local/share/icons/hicolor/256x256/apps
  mv Branchly_*_amd64.AppImage ~/Applications/Branchly.AppImage
  chmod +x ~/Applications/Branchly.AppImage

  # El icono va dentro del AppImage
  ICON=usr/share/icons/hicolor/256x256/apps/branchly.png
  cd /tmp && ~/Applications/Branchly.AppImage --appimage-extract "$ICON" >/dev/null
  cp "/tmp/squashfs-root/$ICON" ~/.local/share/icons/hicolor/256x256/apps/branchly.png
  rm -rf /tmp/squashfs-root

  # El nombre del archivo y StartupWMClass deben ser «Branchly» para que la
  # barra de tareas agrupe la ventana con el icono fijado.
  cat > ~/.local/share/applications/Branchly.desktop <<EOF
  [Desktop Entry]
  Type=Application
  Name=Branchly
  Comment=Cliente Git ligero y moderno
  Exec=$HOME/Applications/Branchly.AppImage %F
  Icon=branchly
  Categories=Development;RevisionControl;
  StartupWMClass=Branchly
  Terminal=false
  EOF
  update-desktop-database ~/.local/share/applications 2>/dev/null || true
  ```

Después busca «Branchly» en el menú de aplicaciones y fíjalo:

| Escritorio | Cómo fijarlo en la barra |
|---|---|
| GNOME (Ubuntu, Fedora) | Clic derecho en el icono del dash → «Añadir a favoritos» / «Fijar al tablero» |
| KDE Plasma | Clic derecho en la ventana abierta → «Fijar en el gestor de tareas» |
| Cinnamon (Mint) | Clic derecho en el icono del panel → «Fijar en el panel» |
| XFCE | Clic derecho en el panel → «Panel» → «Añadir nuevos elementos» → «Lanzador» |

## Paquete .deb (Ubuntu, Debian, Mint, Pop!_OS)

```bash
sudo apt install ./Branchly_*_amd64.deb
```

`apt` instala también las dependencias (WebKitGTK y Git). Branchly aparece en
el menú de aplicaciones; desde ahí puedes fijarlo en la barra.

Desinstalar: `sudo apt remove branchly`.

## Paquete .rpm (Fedora, RHEL, openSUSE)

```bash
sudo dnf install ./Branchly-*.x86_64.rpm      # Fedora / RHEL
sudo zypper install ./Branchly-*.x86_64.rpm   # openSUSE
```

Desinstalar: `sudo dnf remove branchly` o `sudo zypper remove branchly`.

## Uso desde la terminal

```bash
branchly                       # pantalla de inicio (o las pestañas de la última vez)
branchly ~/code/mi-proyecto    # abre ese repositorio
branchly .                     # abre el repositorio de la carpeta actual
```

Con el AppImage, usa la ruta del archivo (por ejemplo,
`~/Applications/Branchly.AppImage .`) o crea un alias en tu `~/.bashrc`:
`alias branchly="$HOME/Applications/Branchly.AppImage"`.

## Primeros pasos

1. En la pantalla de inicio: **Abrir** (Ctrl+O), **Clonar** (Ctrl+Shift+O) o
   **Crear** un repositorio.
2. En el centro está la gráfica de commits. Haz clic en un commit para ver su
   detalle; los cambios sin confirmar aparecen en la primera fila.
3. **Ctrl+K** abre la paleta con todas las acciones y sus atajos.

La lista completa de atajos está en el [README](../README.md#atajos-de-teclado).
Para practicar sin tocar tus proyectos, `scripts/playground.sh` crea un
repositorio de prueba con ramas, un stash, un remoto y un conflicto preparado.

## Dónde guarda sus datos

| Qué | Dónde |
|---|---|
| Repositorios recientes | `~/.local/share/app.branchly.desktop/recent.json` |
| Ajustes y pestañas abiertas | `~/.local/share/app.branchly.desktop/` (almacenamiento del WebView) |

Branchly no guarda credenciales. Para empezar de cero, borra esa carpeta.

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| Ventana en blanco o parpadeos (tarjetas NVIDIA, algunas sesiones Wayland) | Abre Branchly con `WEBKIT_DISABLE_DMABUF_RENDERER=1 branchly`. Si funciona, añade esa variable a `Exec=` en el `.desktop` |
| Push o fetch fallan pidiendo credenciales | Branchly no muestra prompts: configura un credential helper (`git config --global credential.helper libsecret`) o usa SSH con `ssh-agent`. Lo que funcione con `git push` en tu terminal funciona en Branchly |
| «Tu identidad de Git no está configurada» | `git config --global user.name "Tu nombre"` y `git config --global user.email tu@correo` |
| Icono genérico en la barra de tareas (AppImage integrado a mano) | El lanzador debe llamarse `Branchly.desktop` y tener `StartupWMClass=Branchly`, y el icono tiene que estar en `~/.local/share/icons/hicolor/` (ver [CONSTRUCCION.md](CONSTRUCCION.md#integracion-con-el-escritorio)) |
| No se refrescan los cambios hechos fuera en repositorios enormes | `sudo sysctl fs.inotify.max_user_watches=524288` |
