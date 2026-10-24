#!/usr/bin/env bash
# Crea un repositorio de prueba para explorar Branchly: ramas (una con
# conflicto preparado), merge, etiqueta, stash, remoto "origin" con commits
# por delante y por detrás, y cambios sin preparar, preparados y nuevos.
#
# Uso: scripts/playground.sh [carpeta]   (por defecto ~/branchly-playground)
set -euo pipefail

DIR="${1:-$HOME/branchly-playground}"
if [ -e "$DIR" ]; then
  echo "Ya existe $DIR; bórralo o elige otra carpeta." >&2
  exit 1
fi

g() { git -C "$DIR/repo" -c user.name="Ana García" -c user.email=ana@example.com -c commit.gpgsign=false "$@"; }
gb() { git -C "$DIR/repo" -c user.name="Bruno Díaz" -c user.email=bruno@example.com -c commit.gpgsign=false "$@"; }

mkdir -p "$DIR"
git init -q --bare -b main "$DIR/origin.git"
git init -q -b main "$DIR/repo"
cd "$DIR/repo"

cat > README.md <<'MD'
# Tienda

Una aplicación de ejemplo para probar Branchly.
MD
mkdir -p src
cat > src/app.ts <<'TS'
export function total(prices: number[]): number {
  return prices.reduce((sum, price) => sum + price, 0);
}

export function greet(name: string): string {
  return `Hola, ${name}`;
}
TS
g add -A && g commit -qm "Proyecto inicial"
g remote add origin "$DIR/origin.git"

for i in 1 2 3; do
  echo "// mejora $i" >> src/app.ts
  g commit -qam "Mejora $i del cálculo de totales"
done
g tag -a v1.0.0 -m "Primera versión"

# Rama de funcionalidad fusionada con un merge commit.
g checkout -qb feature/descuentos
cat >> src/app.ts <<'TS'

export function discount(total: number, percent: number): number {
  return total - (total * percent) / 100;
}
TS
gb commit -qam "Añade descuentos por porcentaje"
echo "- Descuentos por porcentaje" >> README.md
gb commit -qam "Documenta los descuentos"
g checkout -q main
g merge -q --no-ff --no-edit feature/descuentos

g push -q -u origin main
g push -q origin v1.0.0

# Rama que choca con main en el saludo: fusiónala para ver un conflicto.
g checkout -qb feature/saludo
sed -i 's/Hola, ${name}/Buenos días, ${name}/' src/app.ts
gb commit -qam "Saludo más formal"
g push -q -u origin feature/saludo
g checkout -q main
sed -i 's/Hola, ${name}/¡Hola, ${name}!/' src/app.ts
g commit -qam "Saludo con exclamación"

# Otro desarrollador publica en origin: main queda 1 por delante y 1 por detrás.
git clone -q "$DIR/origin.git" "$DIR/otro"
cd "$DIR/otro"
echo "- Envíos gratis desde 50 €" >> README.md
git -c user.name="Bruno Díaz" -c user.email=bruno@example.com -c commit.gpgsign=false commit -qam "Anuncia envíos gratis"
git push -q origin main
cd "$DIR/repo"
g fetch -q origin

# Rama local sin publicar.
g branch experimento/cache HEAD~2

# Un stash y cambios de todos los tipos.
echo "// idea a medias" >> src/app.ts
g stash push -q -m "Idea a medias para la caché"
sed -i 's/return prices.reduce/return prices.filter((p) => p > 0).reduce/' src/app.ts
echo "Notas sueltas" > NOTAS.md
echo "export const VERSION = '1.1.0';" > src/version.ts
g add src/version.ts

echo "Repositorio de prueba listo en $DIR/repo"
echo "Ábrelo con: npm run app:dev  y luego «Abrir» → $DIR/repo"
