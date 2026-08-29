import { Editor } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { shouldShowBubble } from './shouldShowBubble'
import { ClipBlock } from './clipBlockNode'

/** A minimal doc — a paragraph of text followed by a clip node — enough to
 * construct every selection shape `shouldShowBubble` needs to discriminate,
 * without mounting the full `DocumentEditor` component. */
function makeEditor() {
  return new Editor({
    extensions: [StarterKit, ClipBlock],
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello there' }] },
        {
          type: 'paragraph',
          content: [
            {
              type: 'clipBlock',
              attrs: {
                nodeId: 'node-1',
                transcriptId: 't-1',
                videoId: 'v-1',
                startTokenId: 'tok-a',
                endTokenId: 'tok-b',
              },
            },
          ],
        },
      ],
    },
  })
}

describe('shouldShowBubble', () => {
  it('hides for an empty (collapsed) selection', () => {
    const editor = makeEditor()
    const state = editor.state.apply(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1)),
    )
    expect(shouldShowBubble({ state } as never)).toBe(false)
  })

  it('shows for a non-empty text selection', () => {
    const editor = makeEditor()
    const state = editor.state.apply(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 6)),
    )
    expect(shouldShowBubble({ state } as never)).toBe(true)
  })

  it('shows for a NodeSelection over a clipBlock node', () => {
    const editor = makeEditor()
    // Position of the clipBlock node: paragraph 1 ("Hello there") is 13
    // positions (open + 11 chars + close), so the second paragraph opens at
    // 13 and its clipBlock child sits at 14.
    const state = editor.state.apply(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 14)),
    )
    expect(state.selection).toBeInstanceOf(NodeSelection)
    expect((state.selection as NodeSelection).node.type.name).toBe('clipBlock')
    expect(shouldShowBubble({ state } as never)).toBe(true)
  })
})
