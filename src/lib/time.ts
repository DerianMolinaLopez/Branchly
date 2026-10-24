// "ayer" reads better than "hace 1 d", but "el año pasado" is too long for
// the graph's date column: only days use the idiomatic form.
const relativeAuto = new Intl.RelativeTimeFormat('es', { numeric: 'auto', style: 'short' });
const relative = new Intl.RelativeTimeFormat('es', { numeric: 'always', style: 'short' });
const absolute = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "hace 3 h", "ayer", "hace 2 sem." — for a Unix timestamp in seconds. */
export function formatRelative(timestamp: number, now: number = Date.now() / 1000): string {
  const diff = timestamp - now;
  const abs = Math.abs(diff);
  if (abs < 45) return 'ahora';
  for (const [unit, seconds] of UNITS) {
    if (abs >= seconds) {
      return (unit === 'day' ? relativeAuto : relative).format(Math.round(diff / seconds), unit);
    }
  }
  return relative.format(Math.round(diff / 60), 'minute');
}

/** Full local date and time for tooltips and the detail panel. */
export function formatAbsolute(timestamp: number): string {
  return absolute.format(new Date(timestamp * 1000));
}
