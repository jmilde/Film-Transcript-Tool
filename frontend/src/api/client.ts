import createClient from 'openapi-fetch'
import type { paths } from './schema'
import { API_URL } from '../env'
import { supabase } from '../auth/supabase'

// The single typed API client. Every response is typed by the generated schema,
// so callers never deal with untyped JSON. A middleware attaches the current
// Supabase access token as a Bearer header on every request.
export const api = createClient<paths>({
  baseUrl: API_URL,
  // Resolve fetch lazily at call time rather than capturing it at construction,
  // so test interceptors (MSW) that replace globalThis.fetch are honored.
  fetch: (request) => globalThis.fetch(request),
})

api.use({
  async onRequest({ request }) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    return request
  },
})

interface ErrorBody {
  code?: string
  message?: string
  [key: string]: unknown
}

/** Thrown by `unwrap` on a non-2xx response, preserving status/code/body so
 * callers can branch on them (e.g. a 409 token-edit conflict). */
export class ApiError extends Error {
  status: number
  code: string | undefined
  body: ErrorBody | undefined

  constructor(status: number, message: string, code?: string, body?: ErrorBody) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.body = body
  }
}

/** Narrow an openapi-fetch result to its data, throwing an `ApiError` on failure.
 *
 * Success is determined by `response.ok`, not by whether `data` is present:
 * openapi-fetch returns `{ data: undefined }` for a successful 204 (e.g.
 * `DELETE`), which `data === undefined` would otherwise misclassify as a
 * failure. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok) {
    const body = (result.error as { error?: ErrorBody } | undefined)?.error
    throw new ApiError(result.response.status, body?.message ?? 'Request failed', body?.code, body)
  }
  return result.data as T
}
