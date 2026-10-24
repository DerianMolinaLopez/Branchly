#!/usr/bin/env bash
# Runs inside the build container (see scripts/build-linux.sh).
set -euo pipefail

OUT=/src/dist-linux
BUNDLE="$CARGO_TARGET_DIR/release/bundle"

# Files written into the bind-mounted source tree belong to root inside the
# container; give them back to the host user, even if the build fails.
restore_ownership() {
  if [ -n "${HOST_UID:-}" ]; then
    chown -R "$HOST_UID:${HOST_GID:-$HOST_UID}" \
      "$OUT" /src/dist /src/src-tauri/gen 2>/dev/null || true
  fi
}
trap restore_ownership EXIT

echo "==> Dependencias de npm"
npm ci --no-audit --no-fund

echo "==> Compilando (AppImage, .deb y .rpm)"
npx tauri build --bundles appimage,deb,rpm

echo "==> Copiando a dist-linux/"
rm -rf "$OUT"
mkdir -p "$OUT"
cp "$BUNDLE"/appimage/*.AppImage "$BUNDLE"/deb/*.deb "$BUNDLE"/rpm/*.rpm "$OUT"/
(cd "$OUT" && sha256sum -- * > SHA256SUMS)

GLIBC=$(objdump -T "$CARGO_TARGET_DIR/release/branchly" | grep -o 'GLIBC_[0-9.]*' | sort -Vu | tail -1)
echo "==> glibc mínima requerida: ${GLIBC#GLIBC_}"
ls -lh "$OUT"
