import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { ClipBlockView } from './ClipBlockView'

/** Attrs persisted on the node — written by the frontend at insert time and
 * round-tripped verbatim through save/load. Everything else a `clipBlock`
 * attrs object may carry (video_name, excerpt, thumbnail_token, ...) is a
 * read-only display field the backend injects fresh on every `GET`; see
 * `stripResolvedClipFields`. */
export interface ClipBlockAttrs {
  nodeId: string
  transcriptId: string
  videoId: string
  startTokenId: string
  endTokenId: string
  note: string | null
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

/** A non-editable, atomic reference to a transcript token range (video +
 * range + user note). The excerpt/timecode/etc. shown by `ClipBlockView` are
 * never part of these attrs on disk — they're injected by the backend into a
 * response copy on every read (see `resolve_document_content`). */
export const ClipBlock = Node.create({
  name: 'clipBlock',
  group: 'block',
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
      note: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-clip-block]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-clip-block': '' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ClipBlockView)
  },

  addCommands() {
    return {
      insertClipBlockAt:
        (pos, attrs) =>
        ({ chain }) =>
          chain().insertContentAt(pos, { type: this.name, attrs }).run(),
    }
  },
})
