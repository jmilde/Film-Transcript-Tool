import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const insertMarkerPluginKey = new PluginKey<number | null>('insertMarker')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    insertMarker: {
      setInsertMarker: (pos: number) => ReturnType
      clearInsertMarker: () => ReturnType
    }
  }
}

/**
 * Where "Add to Document" should insert the next clip. Tracked
 * automatically from wherever the cursor last was in this document (see
 * `DocumentEditor`'s `selectionUpdate` listener) rather than a manual
 * "mark insert point" action, and held purely as ProseMirror plugin state
 * — never a raw integer in a Zustand store, which would go stale the
 * instant an edit shifted positions around it. Plugin state is mapped
 * through `tr.mapping` on every transaction automatically, so it stays
 * attached to the right spot even after unrelated edits elsewhere in the
 * document.
 *
 * Rendered as a `Decoration.widget` bar styled to look just like the
 * native text caret (thin, blinking) rather than a distinct highlight —
 * and, since it's a document decoration rather than the native browser
 * selection, it keeps rendering even after the editor loses focus (e.g.
 * the user clicks into the search or chat panel while writing), which is
 * the whole point: the marker should look like the cursor "stayed" where
 * it was, not like a separate annotation.
 */
export const InsertMarker = Extension.create({
  name: 'insertMarker',

  addProseMirrorPlugins() {
    return [
      new Plugin<number | null>({
        key: insertMarkerPluginKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(insertMarkerPluginKey) as number | null | undefined
            if (meta !== undefined) return meta
            return value === null ? null : tr.mapping.map(value)
          },
        },
        props: {
          decorations(state) {
            const pos = insertMarkerPluginKey.getState(state)
            if (pos === null || pos === undefined) return null
            return DecorationSet.create(state.doc, [
              Decoration.widget(pos, () => {
                const bar = document.createElement('span')
                bar.setAttribute('data-insert-marker', '')
                bar.className = 'mx-px inline-block h-[1em] w-0.5 animate-pulse bg-brand align-text-bottom'
                return bar
              }),
            ])
          },
        },
      }),
    ]
  },

  addCommands() {
    return {
      setInsertMarker:
        (pos) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(insertMarkerPluginKey, pos))
          return true
        },
      clearInsertMarker:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(insertMarkerPluginKey, null))
          return true
        },
    }
  },
})
