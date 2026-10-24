# ADR 0007: Refresco automático por eventos del sistema de archivos

- Estado: aceptada
- Fecha: 2026-10-24

## Decisión

- Un watcher por repositorio abierto (`notify` + `notify-debouncer-full`,
  300 ms de debounce) observa el árbol de trabajo y `.git`.
- `branchly_core::watch::ChangeClassifier` clasifica cada ruta:
  - archivos del árbol de trabajo no ignorados por `.gitignore` → `workdir`;
  - `.git/index` → `index`;
  - `HEAD`, `refs/`, `packed-refs`, `MERGE_HEAD`, `rebase-*`… → `refs`;
  - objetos, logs, archivos `.lock` y rutas ignoradas → se descartan.
- Se emite un único evento `repoChanged { repoId, changes }` por ráfaga, y el
  frontend invalida solo las consultas afectadas: el estado para `workdir` e
  `index`, y la gráfica, ramas, historial y blame para `refs`.
- Tras cada mutación hecha desde la app se invalida todo el repositorio, porque
  es barato: TanStack Query solo vuelve a pedir las consultas visibles.
- `refetchOnWindowFocus` recupera lo que se pierda con la ventana en segundo
  plano.

## Consecuencias

- Un `git checkout` que toca miles de archivos produce un solo refresco.
- Directorios ignorados enormes (`node_modules`, `target`) siguen consumiendo
  watches de inotify; el límite del sistema puede necesitar ajuste en
  monorepos muy grandes. Si el watcher no puede iniciarse, la app sigue
  funcionando sin refresco automático.
