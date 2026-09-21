'use client';

/**
 * Browser API client.
 *
 * All requests go to the same origin and are proxied to the backend by the
 * Next.js rewrite, so the session cookie travels automatically and never
 * becomes a third-party cookie. The CSRF token is read from the readable
 * `mailstrive_csrf` cookie and echoed in a header on every mutating request.
 */

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level messages from a Zod validation failure, when present. */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const entries: Record<string, string> = {};
    for (const item of this.details as Array<{ path?: string; message?: string }>) {
      if (item?.path && item?.message) entries[item.path] = item.message;
    }
    return entries;
  }
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Set for FormData uploads so the browser can pick the multipart boundary. */
  rawBody?: BodyInit;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);

  if (options.body !== undefined && !options.rawBody) {
    headers.set('Content-Type', 'application/json');
  }
  if (MUTATING_METHODS.has(method)) {
    const csrf = readCookie('mailstrive_csrf');
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }

  const response = await fetch(path.startsWith('/api') ? path : `/api${path}`, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
    body: options.rawBody ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: ApiErrorBody } | null)?.error;
    throw new ApiError(
      error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.details,
    );
  }

  return (payload as { data: T }).data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', rawBody: formData }),
};

/** Turns any thrown value into something safe to render. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
