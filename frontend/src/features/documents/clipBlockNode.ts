import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { ClipBlockView } from './ClipBlockView'

/** Attrs persisted on the node — written by the frontend at insert time and
 * round-tripped verbatim through save/load. Everything else a `clipBlock`
 * attrs object may carry (video_name, excerpt, thumbnail_token, ...) is a
 * read-only display field the backend injects fresh on every `GET`; see
 * `stripResolvedClipFields`. A clip's "note" is a regular `Comment` row
 * anchored via `DocumentCommentAnchor.clip_node_id = nodeId` — not an attr
 * here — so there is no `note` field. */
export interface ClipBlockAttrs {
  nodeId: string
  transcriptId: string
  videoId: string
  startTokenId: string
  endTokenId: string
}

const RESOLVED_ONLY_KEYS = [
  'video_id',
  'video_name',
  'segment_id',
  'start_time',
  'end_time',
  'speaker_name',
  'language',
  'excerpt',
  'thumbnail_token',
  'folder_path',
]

/** Strip the backend's read-only resolved fields from a document tree before
 * saving, so a stale excerpt/thumbnail never round-trips back into storage —
 * the excerpt must only ever come from a fresh resolve on read. */
export function stripResolvedClipFields(content: JSONContent): JSONContent {
  if (content.type === 'clipBlock' && content.attrs) {
    const attrs = { ...content.attrs }
    for (const key of RESOLVED_ONLY_KEYS) delete attrs[key]
    return { ...content, attrs, content: content.content?.map(stripResolvedClipFields) }
  }
  return { ...content, content: content.content?.map(stripResolvedClipFields) }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    clipBlock: {
      insertClipBlockAt: (
        pos: number,
        // Accepts the resolved display fields (video_name, excerpt, ...)
        // alongside the persisted attrs, so a freshly inserted clip renders
        // immediately without waiting for a full document refetch.
        attrs: ClipBlockAttrs & Record<string, unknown>,
      ) => ReturnType
    }
  }
}

/** A non-editable, atomic reference to a transcript token range, rendered
 * inline within the document's normal paragraph flow (not as a block-level
 * card) — see the design record for why. The excerpt/timecode/etc. shown by
 * `ClipBlockView` are never part of these attrs on disk — they're injected by
 * the backend into a response copy on every read (see
 * `resolve_document_content`). */
export const ClipBlock = Node.create({
  name: 'clipBlock',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      nodeId: { default: null },
      transcriptId: { default: null },
      videoId: { default: null },
      startTokenId: { default: null },
      endTokenId: { default: null },
      // Resolved-only display fields (see `RESOLVED_ONLY_KEYS`/
      // `stripResolvedClipFields`) — never persisted, but must still be
      // declared here: ProseMirror's schema silently drops any JSON attrs
      // not declared on the node type when parsing content, both on
      // `setContent` (load) and `insertContentAt` (insert), so without this
      // the backend's injected excerpt/thumbnail/etc. would never actually
      // reach `node.attrs` for `ClipBlockView` to read.
      ...Object.fromEntries(RESOLVED_ONLY_KEYS.map((key) => [key, { default: null }])),
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-clip-block]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-clip-block': '' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ClipBlockView)
  },

  addCommands() {
    return {
      // An inline atom can't be a direct child of `doc` (only textblocks
      // can). `pos` lands at a block boundary — parent `doc` — whenever the
      // caller asks to insert at the very end of the document (that
      // position sits *after* the last block closes, not inside it), not
      // just for an empty document. Prefer stepping one position back into
      // the preceding textblock over always wrapping a fresh paragraph, so
      // "append at document end" reads as inline continuation of existing
      // prose rather than a new paragraph every time.
      insertClipBlockAt:
        (pos, attrs) =>
        ({ chain, state }) => {
          const clamped = Math.min(pos, state.doc.content.size)
          const $pos = state.doc.resolve(clamped)
          if ($pos.parent.type.name !== 'doc') {
            return chain().insertContentAt(clamped, { type: this.name, attrs }).run()
          }
          if ($pos.nodeBefore?.isTextblock) {
            return chain()
              .insertContentAt(clamped - 1, { type: this.name, attrs })
              .run()
          }
          return chain()
            .insertContentAt(clamped, { type: 'paragraph', content: [] })
            .insertContentAt(clamped + 1, { type: this.name, attrs })
            .run()
        },
    }
  },
})
