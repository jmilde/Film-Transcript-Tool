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

// jsdom doesn't implement the Clipboard API, which the selection toolbar's
// copy action calls.
if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async () => {} },
    configurable: true,
  })
}

// jsdom doesn't implement blob object URLs, which the export download flow
// uses to trigger a file save.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:mock'
  URL.revokeObjectURL = () => {}
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
