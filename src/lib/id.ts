let counter = 0;

/** A process-unique id for long-running operations (used to cancel them). */
export function operationId(kind: string): string {
  counter += 1;
  return `${kind}-${Date.now().toString(36)}-${counter}`;
}
