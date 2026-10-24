# Diseño de Branchly

Estética de "terminal moderna": oscura, limpia, con acentos cian. Este
documento recoge los tokens de diseño y las reglas que los componentes deben
seguir. La fuente de verdad es [`src/styles/tokens.css`](src/styles/tokens.css).

## Principios

1. **La gráfica es la protagonista.** Es el único elemento con color intenso y
   brillo: carriles vivos y nodo de HEAD con anillo cian. Todo lo demás es
   sobrio: superficies planas, bordes de 1px y texto atenuado.
2. **La estética de terminal se usa como información, no como adorno.**
   - El prefijo `>` en cian marca títulos de sección (barra lateral, paneles,
     paleta).
   - JetBrains Mono se reserva para identificadores de Git: hashes, ramas,
     rutas y diffs.
   - El cursor `_` parpadeante aparece solo en estados vacíos y en la pantalla
     de inicio. Como en las terminales, deja de parpadear tras 8 s sin
     actividad, así una ventana inactiva no consume CPU (WebKitGTK ejecuta
     las animaciones CSS infinitas a frecuencia de refresco completa).
3. **El texto en minúsculas iniciales y sin adornos.** Nada de etiquetas en
   mayúsculas con tracking, ni de flechas añadidas a los botones. Los botones
   dicen exactamente lo que hacen ("Preparar bloque", "Eliminar rama") y el
   toast resultante usa el mismo verbo.
4. **Movimiento que responde a acciones.** Animaciones de 150–250 ms al abrir
   paneles, cambiar de commit y mostrar toasts. Hay un único momento
   orquestado: el nombre que se escribe en la pantalla de inicio. Se respeta
   `prefers-reduced-motion`.
5. **Nunca colores sueltos.** Los componentes solo usan tokens. La paleta por
   defecto de Tailwind está desactivada (`--color-*: initial`), así que un
   color fuera del sistema ni siquiera compila a una clase.

## Color

### Fondos

| Token | Valor | Uso |
|---|---|---|
| `canvas` | `#071821` | Fondo profundo: ventana, campos de texto |
| `mid` | `#0B2530` | Fondo medio: pestaña activa, vistas superpuestas |
| `teal` | `#0F3A45` | Fondo teal: cabeceras de bloque, skeletons |
| `surface` | `#0C2A36` | Paneles laterales |
| `raised` | `#10323F` | Superficies elevadas: menús, diálogos, toasts |
| `raised-hover` | `#15404F` | Hover sobre superficies elevadas |
| `line` | `rgb(72 176 192 / .16)` | Bordes de 1px en teal translúcido |
| `line-strong` | `rgb(72 176 192 / .32)` | Bordes de diálogos y hover |

La ventana usa un degradado de azul marino a teal, más brillante en la esquina
superior izquierda (`globals.css`). La pantalla de inicio añade un halo teal.

### Acento

| Token | Valor | Uso |
|---|---|---|
| `accent` | `#22E0F0` | Acento principal, foco, botón primario |
| `accent-hover` | `#5CEAF6` | Hover del primario |
| `accent-active` | `#10C2D1` | Pulsado |
| `accent-soft` | `rgb(34 224 240 / .14)` | Selección |
| `accent-faint` | `rgb(34 224 240 / .07)` | Hover de filas, halo de foco |
| `accent-fg` | `#03161C` | Texto sobre el acento |

### Texto

| Token | Valor | Contraste sobre `mid` / `raised` | Uso |
|---|---|---|---|
| `fg` | `#FFFFFF` | 15.9:1 / 13.5:1 | Títulos, elemento seleccionado |
| `fg-secondary` | `#D6E2E8` | 12.0:1 / 10.3:1 | Texto principal |
| `fg-muted` | `#8BA5B1` | 6.1:1 / 5.2:1 | Texto secundario, metadatos |
| `fg-subtle` | `#5E7C89` | 3.6:1 / 3.0:1 | Placeholders y texto auxiliar; nunca contenido esencial |

El acento cian sobre `mid` alcanza 9.8:1 y el texto `accent-fg` sobre el
acento 11.4:1.

### Semánticos

| Token | Valor | Uso |
|---|---|---|
| `success` | `#3DDC97` | Confirmaciones, archivos añadidos |
| `warning` | `#FFC857` | Archivos modificados, operaciones en curso, coincidencias de búsqueda |
| `danger` | `#FF6B81` | Errores, acciones destructivas, conflictos |
| `diff-add` / `diff-add-bg` | `#4BE3A0` / verde al 9 % | Líneas añadidas |
| `diff-del` / `diff-del-bg` | `#FF7A8F` / rojo al 9 % | Líneas eliminadas |

Cada semántico tiene una variante `-soft` (14 %) para fondos.

### Carriles de la gráfica

Ocho colores vivos, ordenados para que los carriles vecinos contrasten:

| Token | Valor | Color |
|---|---|---|
| `lane-0` | `#22E0F0` | cian |
| `lane-1` | `#A78BFA` | violeta |
| `lane-2` | `#FBBF24` | ámbar |
| `lane-3` | `#34D399` | esmeralda |
| `lane-4` | `#F472B6` | rosa |
| `lane-5` | `#38BDF8` | azul cielo |
| `lane-6` | `#A3E635` | lima |
| `lane-7` | `#2DD4BF` | teal |

El canvas los lee en tiempo de ejecución con `getComputedStyle`, por eso los
tokens se declaran con `@theme static` (se emiten aunque ninguna clase los
use). Los avatares toman el color del carril derivado del correo del autor, de
modo que una persona conserva su color en toda la app.

### Resaltado de sintaxis

`syntax-keyword` (violeta), `syntax-string` (verde), `syntax-number`
(ámbar), `syntax-comment` (atenuado, cursiva), `syntax-function` (azul
cielo), `syntax-type` (cian), `syntax-attr` (rosa) y `syntax-meta`. Los mapea
`styles/highlight.css`.

## Tipografía

- **Inter Variable** para la interfaz.
- **JetBrains Mono Variable** para hashes, ramas, rutas, diffs, títulos de
  sección y atajos de la paleta.

Ambas van empaquetadas localmente (sin red), solo con los subconjuntos latin y
latin-ext.

| Token | Tamaño / interlineado | Uso |
|---|---|---|
| `text-2xs` | 10 / 14 | Contadores, insignias |
| `text-xs` | 11 / 16 | Hashes, metadatos de lista |
| `text-sm` | 12 / 18 | Texto secundario, ramas |
| `text-base` | 13 / 20 | Texto de la interfaz |
| `text-md` | 14 / 22 | Resumen de commit, entradas destacadas |
| `text-lg` | 16 / 24 | Títulos de diálogo |
| `text-xl` | 20 / 28 | — |
| `text-2xl` | 28 / 34 | — |
| `text-display` | 44 / 48 | Nombre en la pantalla de inicio |

## Forma, sombras y movimiento

| Token | Valor | Uso |
|---|---|---|
| `radius-chip` | 4px | Chips de ramas, teclas, filas de lista |
| `radius-control` | 6px | Botones, campos, menús |
| `radius-panel` | 10px | Diálogos, tarjetas, toasts |
| `shadow-overlay` | sombra profunda | Menús, diálogos, toasts |
| `duration-fast` / `base` / `slow` | 150 / 200 / 250 ms | Transiciones |
| `ease-out` | `cubic-bezier(.2,.8,.2,1)` | Entradas |

El radio crece con el tamaño del elemento: no se usa un único radio para todo.

Separadores destacados: `.accent-rule` (línea cian que se desvanece hacia ambos
lados) bajo la pestaña activa y en el borde superior de los diálogos, y
`.accent-rule-left` en la pantalla de inicio.

## Componentes base (`src/ui`)

| Componente | Notas |
|---|---|
| `Button` | Variantes `primary`, `secondary`, `ghost`, `danger`, `danger-ghost`; tamaños `sm`/`md`/`lg`; estado `loading` con `aria-busy` |
| `IconButton` | Siempre con `label` (nombre accesible y tooltip) y atajo opcional |
| `Input`, `Textarea`, `Field` | Foco cian con halo; `Field` asocia etiqueta, ayuda y error |
| `Checkbox` | `role="checkbox"` con etiqueta clicable |
| `Dialog` | Radix Dialog con título, descripción y pie de acciones |
| `ConfirmDialog` + `confirm()` | Confirmación basada en promesas. Enumera lo que se va a perder |
| `ContextMenu`, `DropdownMenu` | Radix; ítems con icono, atajo y variante peligrosa |
| `Tooltip` | Muestra el atajo de la acción |
| `Kbd` | Atajos adaptados a la plataforma (`Ctrl Shift P` / `⌘⇧P`) |
| `Toaster` + `toast` | Éxito, error, info y progreso (con barra y "Cancelar"); acción "Deshacer" |
| `EmptyState` | Prompt de terminal con cursor y una acción para salir del estado |
| `Skeleton`, `SkeletonRows`, `Spinner` | Estados de carga |
| `SectionTitle` | Título con prefijo `>` y contador |
| `SegmentedControl` | Grupo de opciones exclusivas (unificado / lado a lado) |
| `ResizeHandle` | Divisor de paneles, también ajustable con las flechas del teclado |
| `Avatar` | Iniciales sobre el color del carril del autor |

## Accesibilidad

- Navegación completa con teclado: la lista de commits es un `listbox` con
  flechas, `j`/`k`, Inicio/Fin y Re Pág/Av Pág. Los menús y diálogos son de
  Radix, y los paneles se redimensionan con las flechas.
- Foco visible en cian (`:focus-visible`) en todos los controles.
- Contraste AA para todo el texto de contenido (ver la tabla de texto).
- Notificaciones en una región `aria-live`; los errores se anuncian como
  `alert`.
- Botones de solo icono con nombre accesible; los spinners son decorativos
  salvo que se les dé una etiqueta.
