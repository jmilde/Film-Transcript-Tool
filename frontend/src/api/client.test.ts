import { describe, expect, it } from 'vitest'
import { ApiError, unwrap } from './client'

function result(status: number, data?: unknown, error?: unknown) {
  return { data, error, response: new Response(null, { status }) }
}

describe('unwrap', () => {
  it('returns data on a normal 200 response', () => {
    expect(unwrap(result(200, { id: '1' }))).toEqual({ id: '1' })
  })

  it('returns undefined (not a thrown error) on a successful 204 with no body', () => {
    expect(unwrap(result(204, undefined))).toBeUndefined()
  })

  it('throws ApiError on a non-2xx response', () => {
    expect(() =>
      unwrap(result(409, undefined, { error: { code: 'CONFLICT', message: 'stale' } })),
    ).toThrow(ApiError)
  })

  it('preserves status/code/message on the thrown ApiError', () => {
    try {
      unwrap(result(409, undefined, { error: { code: 'CONFLICT', message: 'stale' } }))
      throw new Error('expected unwrap to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      const apiError = err as ApiError
      expect(apiError.status).toBe(409)
      expect(apiError.code).toBe('CONFLICT')
      expect(apiError.message).toBe('stale')
    }
  })
})
