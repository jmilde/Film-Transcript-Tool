import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const commentHighlightPluginKey = new PluginKey<string | null>('commentHighlight')

/**
 * Highlights whichever comment mark matches the currently hovered/selected
 * comment (`useCommentsStore`'s `hoveredId ?? selectedId`, pushed in from
 * `DocumentEditor` via `setMeta`) — the same "point at this range" affordance
 * `TranscriptViewer` gets for free from its own selection-range background,
 * but comment marks here aren't a `NodeSelection`, so this needs its own
 * decoration. Separate plugin from `commentResolvedDecoration` (rather than
 * folding highlight into that one's map) since the two are pushed from
 * independent React state and would otherwise fight over one `setMeta` shape.
 */
export const CommentHighlightDecoration = Extension.create({
  name: 'commentHighlightDecoration',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: commentHighlightPluginKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(commentHighlightPluginKey) as string | null | undefined
            return meta === undefined ? value : meta
          },
        },
        props: {
          decorations(state) {
            const highlightedId = commentHighlightPluginKey.getState(state)
            if (!highlightedId) return null
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (!node.isText) return
              for (const mark of node.marks) {
                if (mark.type.name !== 'comment') continue
                if (mark.attrs.commentId !== highlightedId) continue
                decorations.push(
                  Decoration.inline(pos, pos + node.nodeSize, { class: 'bg-brand-subtle' }),
                )
              }
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
