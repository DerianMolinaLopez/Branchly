import type { ErrorCode, ErrorPayload, Result } from './bindings';

/** Error codes from the backend plus failures of the IPC layer itself. */
export type GitErrorCode = ErrorCode | 'IPC';

/** A typed error raised by every API call that fails. */
export class GitError extends Error {
  readonly code: GitErrorCode;
  readonly detail: string | null;

  constructor(code: GitErrorCode, message: string, detail: string | null = null) {
    super(message);
    this.name = 'GitError';
    this.code = code;
    this.detail = detail;
  }

  static from(error: unknown): GitError {
    if (error instanceof GitError) return error;
    if (isPayload(error)) return new GitError(error.code, error.message, error.detail);
    const message = error instanceof Error ? error.message : String(error);
    return new GitError('IPC', message || 'Error de comunicación con el backend');
  }
}

function isPayload(value: unknown): value is ErrorPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as { message: unknown }).message === 'string'
  );
}

/** Awaits a generated command and throws its error as a {@link GitError}. */
export async function unwrap<T>(call: Promise<Result<T, ErrorPayload>>): Promise<T> {
  let result: Result<T, ErrorPayload>;
  try {
    result = await call;
  } catch (error) {
    throw GitError.from(error);
  }
  if (result.status === 'ok') return result.data;
  throw GitError.from(result.error);
}

/** Wraps commands that do not return a Result, normalising thrown errors. */
export async function call<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    throw GitError.from(error);
  }
}

export function isGitError(error: unknown, code?: GitErrorCode): error is GitError {
  return error instanceof GitError && (code === undefined || error.code === code);
}
