# ADR 0003: Cálculo y dibujo de la gráfica de commits

- Estado: aceptada
- Fecha: 2026-10-24

## Contexto

La gráfica debe ser fluida con más de 50 000 commits. Calcular carriles en el
frontend obligaría a transferir todo el historial al WebView y bloquearía el
hilo de la UI.

## Decisión

1. **Recorrido en Rust**: `revwalk` desde HEAD, ramas locales, remotas y
   etiquetas, en orden topológico + fecha. Cada commit se guarda de forma
   compacta (`CommitRecord` con `Oid` binarios).
2. **Carriles en una sola pasada** (`graph::compute_layout`), una función pura
   sobre índices de padres:
   - un carril es una columna que "espera" a un commit;
   - los carriles que esperan al commit actual convergen en su nodo, que ocupa
     el de más a la izquierda;
   - el primer padre continúa en la misma columna;
   - cada padre adicional se une a un carril que ya lo espera o abre uno nuevo
     a la derecha;
   - las columnas nunca se desplazan (una rama larga mantiene posición y color)
     y las que quedan libres se reutilizan.

   Cada fila guarda sus **aristas entrantes** (de la fila anterior a la
   actual), así que dibujar las filas `a..b` solo necesita esas filas.
3. **Caché por fingerprint**: el resultado se guarda en la sesión con un hash de
   todas las referencias y de HEAD. Si alguna se mueve, se recalcula. El
   frontend incluye el fingerprint en la clave de cada página; si cambia
   durante una petición, el backend responde `STALE_GRAPH` y el frontend
   refresca en lugar de mezclar dos layouts.
4. **Paginación**: el frontend pide bloques de 200 filas según la ventana
   visible de una lista virtualizada (`@tanstack/react-virtual`).
5. **Dibujo en Canvas**: un único canvas cubre solo la ventana visible. Las
   aristas se agrupan por color (ocho trazos por frame, sin importar el
   tamaño) y los nodos se pintan encima con un halo del color del fondo.

## Medidas (repositorio `git/git`, 85 799 commits, build de release)

| Operación | Tiempo |
|---|---|
| Recorrido + carriles (primera vez) | 0,90 s |
| Comprobar la caché | 0,34 ms |
| Página de 200 filas | 0,44 ms |
| Búsqueda en mensajes | 7 ms |

## Consecuencias

- La memoria crece linealmente con el historial (unos 200 bytes por commit más
  las aristas).
- Historiales muy ramificados pueden necesitar cientos de carriles (`git/git`
  llega a 282). La columna se limita a 16 carriles visibles y el resto se
  recorta, como hacen otros clientes.
