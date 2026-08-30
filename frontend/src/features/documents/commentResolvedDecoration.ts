import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const commentResolvedPluginKey = new PluginKey<Map<string, boolean>>('commentResolved')

/**
 * Renders the resolved/unresolved underline for `comment` marks as
 * ProseMirror decorations, not DOM attributes set imperatively after render.
 * PM redraws mark spans from `renderHTML` on its own schedule (any nearby
 * edit, not just ones that touch this mark) and would silently wipe an
 * attribute poked onto the DOM directly; a decoration is recomputed by PM
 * itself on every redraw, so it can never go stale or flicker.
 *
 * The resolved-state map lives in this plugin's own state, pushed in from
 * React (`DocumentEditor`) via a `setMeta` transaction whenever
 * `useDocumentComments` data changes — never stored on the mark itself.
 */
export const CommentResolvedDecoration = Extension.create({
  name: 'commentResolvedDecoration',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: commentResolvedPluginKey,
        state: {
          init: () => new Map<string, boolean>(),
          apply(tr, value) {
            const meta = tr.getMeta(commentResolvedPluginKey) as Map<string, boolean> | undefined
            return meta ?? value
          },
        },
        props: {
          decorations(state) {
            const resolvedByCommentId = commentResolvedPluginKey.getState(state) ?? new Map()
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (!node.isText) return
              for (const mark of node.marks) {
                if (mark.type.name !== 'comment') continue
                const commentId = mark.attrs.commentId as string | null
                if (!commentId) continue
                const resolved = resolvedByCommentId.get(commentId)
                const className =
                  resolved === true
                    ? 'underline decoration-success decoration-2 underline-offset-2'
                    : 'underline decoration-warning decoration-2 underline-offset-2'
                decorations.push(Decoration.inline(pos, pos + node.nodeSize, { class: className }))
              }
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
