# ADR 0006: Deshacer basado en acciones con precondiciones

- Estado: aceptada
- Fecha: 2026-10-24

## Contexto

El enunciado pide deshacer la última operación local "cuando sea seguro".
Reutilizar el reflog no basta: no cubre ramas o etiquetas eliminadas ni stashes
descartados, y no sabe si el estado cambió desde fuera.

## Decisión

Cada servicio que hace una operación reversible devuelve un `UndoAction` que
describe cómo revertirla **y el estado que espera encontrar**:

| Operación | Deshacer | Precondición |
|---|---|---|
| Commit, amend, reset soft/mixed | `reset --soft` al HEAD anterior | HEAD sigue en el commit creado |
| Merge / fast-forward | `reset --hard` al HEAD anterior | HEAD sin cambios y árbol limpio |
| Crear rama o etiqueta | eliminar la referencia | sigue apuntando al mismo objeto y no es la rama actual |
| Eliminar rama o etiqueta | recrear la referencia (y el upstream) | — |
| Renombrar rama | renombrar de vuelta | — |
| Checkout | volver a la rama o commit anterior | HEAD no se movió |
| Eliminar stash | `git stash store` del mismo commit | — |
| Crear rama y cambiar a ella | secuencia: volver + eliminar | ambas |

La sesión guarda solo la **última** acción con un identificador. El frontend
recibe un `UndoHandle` (id y descripción) para el toast "Deshacer" y para
Ctrl/Cmd+Z. Un handle antiguo o ya usado se rechaza.

No se puede deshacer un reset `hard` (los cambios descartados no son
recuperables) ni las operaciones de red.

## Consecuencias

- Si alguien hace commit desde la terminal entre medias, el deshacer se
  rechaza con un mensaje claro en lugar de destruir trabajo.
- Las precondiciones están cubiertas por pruebas de integración.
