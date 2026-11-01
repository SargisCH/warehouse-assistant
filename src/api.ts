import { fetchAuthSession } from 'aws-amplify/auth';
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken?.toString();
  if (!token) throw new ApiError(401, 'Please sign in again.');
  const base = process.env.REACT_APP_API_URL || 'http://localhost:3300/api/v1/';
  const response = await fetch(
    new URL(path, base.endsWith('/') ? base : base + '/').toString(),
    {
      ...init,
      headers: {
        ...init.headers,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message;
    throw new ApiError(
      response.status,
      Array.isArray(message)
        ? message.join(', ')
        : typeof message === 'string'
        ? message
        : `Request failed (${response.status}).`,
    );
  }
  return payload as T;
}
export function act<T>(threadId: string, action: string, body?: unknown) {
  return request<T>(
    `assistant/threads/${encodeURIComponent(threadId)}/${action}`,
    {
      method: action === 'status' ? 'PATCH' : 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
}
