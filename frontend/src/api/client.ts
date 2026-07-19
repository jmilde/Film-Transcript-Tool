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

/** Narrow an openapi-fetch result to its data, throwing on transport/API error. */
export function unwrap<T>(result: { data?: T; error?: unknown }): T {
  if (result.error !== undefined || result.data === undefined) {
    throw new Error('Request failed')
  }
  return result.data
}
