import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server'

// `globals: true` isn't enabled, so RTL's auto-cleanup (which relies on a
// global afterEach) never registers itself; do it explicitly so DOM from one
// test doesn't leak into the next within the same file.
afterEach(cleanup)

// jsdom lacks ResizeObserver, which react-resizable-panels constructs on mount.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom doesn't implement scrollIntoView, which the transcript viewer's
// auto-follow calls when the active token changes.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
