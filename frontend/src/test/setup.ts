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

// jsdom doesn't implement pointer capture, which Radix's Select uses to
// track pointer interaction with its trigger/items.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}

// jsdom doesn't implement layout, which ProseMirror (the document editor's
// underlying engine) needs for click-to-position and scroll-into-view.
// Zeroed-out geometry is fine for tests — nothing asserts on real layout.
if (!document.elementFromPoint) {
  document.elementFromPoint = () => null
}
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
}
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
