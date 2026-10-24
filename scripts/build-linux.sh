#!/usr/bin/env bash
# Builds portable Linux executables (AppImage, .deb, .rpm) inside an
# Ubuntu 22.04 container, so they run on that release and any newer
# distribution. Results go to dist-linux/. Requires Docker or Podman.
#
# Usage: scripts/build-linux.sh
#   CONTAINER_ENGINE=podman scripts/build-linux.sh   # force an engine
set -euo pipefail
cd "$(dirname "$0")/.."

ENGINE="${CONTAINER_ENGINE:-}"
if [ -z "$ENGINE" ]; then
  if command -v docker >/dev/null; then ENGINE=docker
  elif command -v podman >/dev/null; then ENGINE=podman
  else
    echo "Se necesita Docker o Podman." >&2
    exit 1
  fi
fi
IMAGE=branchly-linux-builder

echo "==> Preparando la imagen de compilación ($ENGINE)"
"$ENGINE" build -t "$IMAGE" -f packaging/linux/Dockerfile packaging/linux

echo "==> Compilando dentro del contenedor"
# Named volumes keep node_modules, the Cargo registry, the build directory
# and Tauri's AppImage tools between runs, separate from the host's own
# (Fedora/Arch/...) node_modules and target/.
# `:z` relabels the bind mount for SELinux (Fedora, RHEL); harmless elsewhere.
"$ENGINE" run --rm \
  -v "$PWD":/src:z \
  -v branchly-node-modules:/src/node_modules \
  -v branchly-cargo-registry:/root/.cargo/registry \
  -v branchly-target:/build/target \
  -v branchly-tauri-cache:/root/.cache/tauri \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  "$IMAGE"

echo "==> Listo: ejecutables en dist-linux/"
