import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { graphApi, keys, type SearchField } from '@/api';
import { SHORTCUTS } from '@/lib/shortcuts';
import { useWorkspace } from '@/stores/workspace';
import { IconButton, Kbd } from '@/ui';

const FIELDS: { value: SearchField; label: string; placeholder: string }[] = [
  { value: 'all', label: 'Todo', placeholder: 'Buscar por mensaje, autor o hash' },
  { value: 'message', label: 'Mensaje', placeholder: 'Buscar en los mensajes' },
  { value: 'author', label: 'Autor', placeholder: 'Nombre o correo del autor' },
  { value: 'hash', label: 'Hash', placeholder: 'Prefijo del hash' },
];

/** Debounces a fast-changing value. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delay]);
  return debounced;
}

/**
 * Commit search over the whole history (computed in Rust). Results are
 * reported as row indices; Enter / Shift+Enter jump between them.
 */
export function GraphSearch({
  repoId,
  onMatches,
  focusToken,
}: {
  repoId: string;
  onMatches: (matches: Set<number>, current: number | null) => void;
  /** Changes when the search shortcut is pressed. */
  focusToken: number;
}) {
  const [query, setQuery] = useState('');
  const [field, setField] = useState<SearchField>('all');
  const debounced = useDebounced(query.trim(), 180);
  // The position resets whenever the query or the field changes.
  const searchKey = `${field}:${debounced}`;
  const [cursor, setCursor] = useState({ key: searchKey, position: 0 });
  const position = cursor.key === searchKey ? cursor.position : 0;
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollToRow = useWorkspace((s) => s.scrollToRow);

  const results = useQuery({
    queryKey: keys.search(repoId, field, debounced),
    queryFn: () => graphApi.search(repoId, debounced, field),
    enabled: debounced.length > 0,
  });
  const rows = debounced ? (results.data ?? []) : [];
  const current = rows.length > 0 ? (rows[Math.min(position, rows.length - 1)] ?? null) : null;

  useEffect(() => {
    if (focusToken > 0) inputRef.current?.select();
  }, [focusToken]);

  useEffect(() => {
    onMatches(new Set(rows), current);
    if (current !== null) scrollToRow(repoId, current, true);
    // `rows` identity follows the query result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.data, current, debounced]);

  const step = (delta: number) => {
    if (rows.length === 0) return;
    setCursor({ key: searchKey, position: (position + delta + rows.length) % rows.length });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      setQuery('');
      inputRef.current?.blur();
    }
  };

  const placeholder = FIELDS.find((f) => f.value === field)?.placeholder;
  return (
    <div className="flex h-7 items-center rounded-control border border-line bg-canvas/60 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-accent-faint)]">
      <Search className="ml-2 size-3.5 shrink-0 text-fg-subtle" aria-hidden />
      <select
        aria-label="Campo de búsqueda"
        value={field}
        onChange={(e) => {
          setField(e.target.value as SearchField);
        }}
        className="ml-1 h-full appearance-none bg-transparent px-1 text-sm text-fg-muted outline-none hover:text-fg"
      >
        {FIELDS.map((f) => (
          <option key={f.value} value={f.value} className="bg-raised text-fg">
            {f.label}
          </option>
        ))}
      </select>
      <span className="h-4 w-px bg-line" aria-hidden />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        aria-label="Buscar commits"
        className="h-full w-52 min-w-0 bg-transparent px-2 text-sm text-fg outline-none placeholder:text-fg-subtle"
      />
      {debounced ? (
        <>
          <span
            className="shrink-0 px-1 font-mono text-xs text-fg-muted tabular-nums"
            aria-live="polite"
          >
            {results.isFetching
              ? '…'
              : rows.length === 0
                ? '0'
                : `${Math.min(position, rows.length - 1) + 1}/${rows.length}`}
          </span>
          <IconButton
            size="sm"
            label="Anterior"
            shortcut="shift+enter"
            icon={<ChevronUp />}
            onClick={() => step(-1)}
          />
          <IconButton
            size="sm"
            label="Siguiente"
            shortcut="enter"
            icon={<ChevronDown />}
            onClick={() => step(1)}
          />
          <IconButton
            size="sm"
            label="Limpiar búsqueda"
            icon={<X />}
            className="mr-0.5"
            onClick={() => {
              setQuery('');
            }}
          />
        </>
      ) : (
        <Kbd shortcut={SHORTCUTS.search} className="mr-1.5" />
      )}
    </div>
  );
}
