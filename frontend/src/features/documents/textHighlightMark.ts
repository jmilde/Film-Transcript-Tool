import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textHighlight: {
      toggleTextHighlight: () => ReturnType
    }
  }
}

/**
 * A user-toggled pastel-orange highlight over selected document text — a
 * plain boolean mark with no attributes, persisted as part of the document's
 * own ProseMirror JSON (`Document.content`), so unlike the transcript's
 * token-level `is_highlighted` flag this needs no backend schema change.
 * Named distinctly from `commentHighlightDecoration`'s "highlight" (which
 * means "point at this comment's range," an unrelated concept).
 */
export const TextHighlightMark = Mark.create({
  name: 'textHighlight',

  parseHTML() {
    return [{ tag: 'mark[data-text-highlight]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'mark',
      mergeAttributes(HTMLAttributes, {
        'data-text-highlight': '',
        class: 'bg-highlight-subtle rounded-sm',
      }),
      0,
    ]
  },

  addCommands() {
    return {
      toggleTextHighlight:
        () =>
        ({ chain }) =>
          chain().toggleMark(this.name).run(),
    }
  },
})
