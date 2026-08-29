import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      setCommentMark: (attrs: { commentId: string }) => ReturnType
    }
  }
}

/**
 * A stable position reference for a prose-text comment, riding ProseMirror's
 * transaction mapping through edits/undo exactly like `clipBlock`'s token
 * ids do for a clip. Carries only `commentId` — `resolved`/text stay
 * authoritative on the `Comment` row (fetched via `useDocumentComments`) and
 * are applied as a `data-comment-resolved` DOM attribute at render time
 * (see `DocumentEditor`), never stored redundantly on the mark itself.
 */
export const CommentMark = Mark.create({
  name: 'comment',

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-comment-id'),
        renderHTML: (attributes) => ({ 'data-comment-id': attributes.commentId as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setCommentMark:
        (attrs) =>
        ({ chain }) =>
          chain().setMark(this.name, attrs).run(),
    }
  },
})
