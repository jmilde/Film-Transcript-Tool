import type { ClipBlockAttrs } from './clipBlockNode'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * Marker HTML for a single clip reference, in the exact `span[data-clip-block]`
 * shape `clipBlockNode.ts`'s `parseHTML` matches. Each persisted attr is set
 * as a plain (un-prefixed) HTML attribute rather than a `data-*` one: TipTap's
 * default attribute parsing reads `element.getAttribute(<attrName>)` verbatim
 * (see `injectExtensionAttributesToParseRule` in `@tiptap/core`) — it does not
 * dasherize — so these names must match `ClipBlockAttrs`'s keys exactly for
 * the paste pipeline to reconstruct the node's attrs.
 *
 * Also carries `excerpt` as an attribute (`ClipBlock` already declares it —
 * see `RESOLVED_ONLY_KEYS` — and `stripResolvedClipFields` strips it back out
 * on save, exactly like the resolved fields the "Add to Document" insert path
 * carries for its immediate render). Without it, a pasted clip has no display
 * text to fall back on: `ClipBlock` is an atom node, so its inner text is
 * dropped on parse, and nothing re-resolves a pasted node's excerpt during
 * the session (`DocumentEditor` only calls `resolveClipBlock` for its own
 * queued-insert path) — the clip would render the bare "Clip" placeholder
 * until the document is reloaded from scratch.
 */
export function clipBlockMarkerHtml(attrs: ClipBlockAttrs, excerpt: string): string {
  const escapedExcerpt = escapeHtml(excerpt)
  return (
    `<span data-clip-block ` +
    `nodeId="${attrs.nodeId}" transcriptId="${attrs.transcriptId}" videoId="${attrs.videoId}" ` +
    `startTokenId="${attrs.startTokenId}" endTokenId="${attrs.endTokenId}" excerpt="${escapedExcerpt}">` +
    `${escapedExcerpt}</span>`
  )
}

/**
 * Writes both a plain-text and an HTML clipboard entry so pasting into a
 * document editor reconstructs an inline `clipBlock` node (read from the HTML
 * entry) while pasting anywhere else — a chat box, another app — yields the
 * plain excerpt text untouched. Falls back to plain `writeText` on browsers
 * without the async Clipboard `write`/`ClipboardItem` APIs (e.g. a
 * non-secure context, or older Firefox).
 */
export async function writeClipToClipboard(text: string, html: string): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
    const item = new ClipboardItem({
      'text/plain': new Blob([text], { type: 'text/plain' }),
      'text/html': new Blob([html], { type: 'text/html' }),
    })
    await navigator.clipboard.write([item])
    return
  }
  await navigator.clipboard.writeText(text)
}
