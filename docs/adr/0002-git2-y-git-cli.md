# ADR 0002: Enfoque híbrido libgit2 + git CLI

- Estado: aceptada
- Fecha: 2026-10-24

## Contexto

Necesitamos leer el repositorio muy rápido (historial, diffs, estado) y a la vez
respetar la configuración del usuario: credenciales, `ssh-agent`, credential
helpers, hooks (`pre-commit`, `commit-msg`), firma de commits (`commit.gpgsign`)
y estrategias de merge.

## Decisión

El trait `GitRepository` tiene una implementación, `Git2Repository`, que
combina dos mecanismos:

| Operación | Mecanismo | Motivo |
|---|---|---|
| Historial, diffs, blame, estado, ramas, etiquetas, stash | libgit2 (`git2`) | En proceso, sin lanzar procesos, sin parsear texto |
| Stage/unstage por archivo y **por hunk**, descartar | libgit2 (`apply` con filtro de hunks) | Precisión sobre el índice, sin parches temporales |
| Crear/renombrar/eliminar ramas y etiquetas, checkout, reset | libgit2 | Operaciones locales atómicas |
| clone, fetch, pull, push | `git` CLI | Transportes, credenciales, ssh-agent y helpers del usuario |
| commit, merge, abortar/continuar (merge, rebase, cherry-pick) | `git` CLI | Hooks, firma, mensajes por defecto y el secuenciador de Git |

libgit2 se compila **sin transportes de red** (`default-features = false`): no
enlazamos OpenSSL ni libssh2, el binario es más pequeño y no existe un segundo
camino de autenticación que pueda comportarse distinto del `git` del usuario.

El adaptador `GitCli`:

- desactiva los prompts (`GIT_TERMINAL_PROMPT=0`, stdin cerrado) para que una
  credencial ausente falle en lugar de colgar la app;
- usa `GIT_EDITOR=true` para aceptar mensajes por defecto sin abrir editores;
- fuerza `LC_ALL=C` para poder interpretar la salida y el progreso;
- transmite el progreso de `--progress` y permite cancelar (mata el proceso).

Branchly **nunca almacena credenciales**.

## Consecuencias

- Requiere `git` instalado; la pantalla de inicio avisa si falta.
- Los errores del CLI llegan como texto en inglés; los casos conocidos
  (cambios que se sobrescribirían, identidad sin configurar…) se traducen a
  códigos de error tipados.
- Las pruebas de red se hacen contra repositorios bare locales, sin red.
