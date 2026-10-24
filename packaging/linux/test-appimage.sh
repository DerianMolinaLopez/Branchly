#!/usr/bin/env bash
# Smoke-tests dist-linux/*.AppImage on clean containers of several
# distributions, using the host's X11 display: for each one it installs the
# libraries any desktop provides, opens a playground repository as a normal
# user and checks that the window appears and the repository is opened.
# Screenshots are saved next to the report.
#
# Usage: packaging/linux/test-appimage.sh [image ...]
#   default images: ubuntu:22.04 debian:12 ubuntu:24.04 fedora:40
#                   archlinux:latest opensuse/tumbleweed:latest
# Requires Docker (or CONTAINER_ENGINE=podman), xprop and ImageMagick.
set -uo pipefail
cd "$(dirname "$0")/../.."

ENGINE="${CONTAINER_ENGINE:-docker}"
APPIMAGE=$(ls dist-linux/*.AppImage 2>/dev/null | head -1)
[ -n "$APPIMAGE" ] || { echo "No hay AppImage en dist-linux/: ejecuta scripts/build-linux.sh" >&2; exit 1; }
[ -n "${DISPLAY:-}" ] || { echo "Se necesita una sesión gráfica (DISPLAY)" >&2; exit 1; }
IMAGES=("$@")
[ ${#IMAGES[@]} -gt 0 ] || IMAGES=(ubuntu:22.04 debian:12 ubuntu:24.04 fedora:40 archlinux:latest opensuse/tumbleweed:latest)

WORK=$(mktemp -d -t branchly-appimage-test.XXXX)
scripts/playground.sh "$WORK/playground" >/dev/null
echo "Resultados y capturas en $WORK"

# Libraries the AppImage format deliberately leaves to the host (X11, GL,
# fonts, Wayland…); every desktop installation has them, container images don't.
desktop_libs() {
  case $1 in
    ubuntu*|debian*) echo "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git libegl1 libgl1 libgles2 libx11-xcb1 libx11-6 libdrm2 libexpat1 libfontconfig1 libfreetype6 libfribidi0 libgbm1 libharfbuzz0b libwayland-client0 libxcb1 fonts-dejavu-core" ;;
    fedora*) echo "dnf -q -y install git mesa-libEGL mesa-libGL mesa-libGLES libX11-xcb libX11 libdrm expat fontconfig freetype fribidi mesa-libgbm harfbuzz libwayland-client libxcb libcom_err dejavu-sans-fonts util-linux" ;;
    archlinux*) echo "pacman -Sy --noconfirm --needed git mesa libx11 libxcb fontconfig freetype2 fribidi harfbuzz wayland expat libdrm ttf-dejavu" ;;
    opensuse*) echo "zypper -q -n install git Mesa-libEGL1 Mesa-libGL1 Mesa-libGLESv2-2 libX11-xcb1 libX11-6 libdrm2 libexpat1 fontconfig libfreetype6 libfribidi0 libgbm1 libharfbuzz0 libwayland-client0 libxcb1 libcom_err2 dejavu-fonts" ;;
    *) echo "true" ;;
  esac
}

branchly_window() {
  for w in $(xprop -root _NET_CLIENT_LIST | grep -o '0x[0-9a-f]*'); do
    xprop -id "$w" WM_CLASS 2>/dev/null | grep -q '"Branchly"' && { echo "$w"; return; }
  done
}

status=0
printf "%-28s %-32s %-7s %-6s %s\n" IMAGEN SISTEMA GLIBC REPO VENTANA
for image in "${IMAGES[@]}"; do
  name="branchly-test-$(echo "$image" | tr ':/.' '---')"
  out="$WORK/$name"
  mkdir -p "$out" && cp -a "$WORK/playground/repo" "$out/repo"
  "$ENGINE" rm -f "$name" >/dev/null 2>&1
  "$ENGINE" run -d --name "$name" --security-opt label=disable \
    -e DISPLAY="$DISPLAY" -e XAUTHORITY=/tmp/xauth -e XDG_DATA_HOME=/out/data -e APPIMAGE_EXTRACT_AND_RUN=1 \
    -v "${XAUTHORITY:-$HOME/.Xauthority}":/tmp/xauth:ro -v /tmp/.X11-unix:/tmp/.X11-unix \
    -v "$PWD/dist-linux":/dist:ro -v "$out":/out \
    "$image" bash -c "$(desktop_libs "$image") >/dev/null 2>&1;
      grep ^PRETTY_NAME /etc/os-release | cut -d'\"' -f2 > /out/os; ldd --version | head -1 | awk '{print \$NF}' > /out/glibc;
      chown -R $(id -u):$(id -g) /out; cd /tmp;
      HOME=/tmp setpriv --reuid=$(id -u) --regid=$(id -g) --clear-groups /dist/$(basename "$APPIMAGE") /out/repo > /out/app.log 2>&1" >/dev/null

  opened=no
  for _ in $(seq 1 300); do
    [ -f "$out/data/app.branchly.desktop/recent.json" ] && { opened=sí; break; }
    sleep 1
  done
  sleep 5
  window=$(branchly_window)
  [ -n "$window" ] && import -window "$window" "$out.png" 2>/dev/null
  printf "%-28s %-32s %-7s %-6s %s\n" "$image" "$(cat "$out/os" 2>/dev/null)" "$(cat "$out/glibc" 2>/dev/null)" "$opened" "$([ -n "$window" ] && echo sí || echo no)"
  if [ "$opened" != sí ] || [ -z "$window" ]; then
    status=1
    grep -E "error while loading|cannot open shared|panicked" "$out/app.log" | head -3
  fi
  "$ENGINE" rm -f "$name" >/dev/null 2>&1
done
exit $status
