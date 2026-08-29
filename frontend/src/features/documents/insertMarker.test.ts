import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { InsertMarker, insertMarkerPluginKey } from './insertMarker'

function makeEditor() {
  return new Editor({
    extensions: [StarterKit, InsertMarker],
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello there' }] }],
    },
  })
}

describe('InsertMarker', () => {
  it('starts with no marker set', () => {
    const editor = makeEditor()
    expect(insertMarkerPluginKey.getState(editor.state)).toBeNull()
  })

  it('sets and reads back a marker position', () => {
    const editor = makeEditor()
    editor.commands.setInsertMarker(6)
    expect(insertMarkerPluginKey.getState(editor.state)).toBe(6)
  })

  it('maps the marker position forward through an unrelated edit earlier in the document', () => {
    const editor = makeEditor()
    // Marker just before "there" (position 6, after "Hello ").
    editor.commands.setInsertMarker(6)

    // Unrelated insert earlier in the doc, at the very start.
    editor.chain().insertContentAt(1, 'Oh, ').run()

    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ')).toBe(
      'Oh, Hello there',
    )
    // The marker must have shifted forward by exactly the inserted length.
    expect(insertMarkerPluginKey.getState(editor.state)).toBe(6 + 'Oh, '.length)
  })

  it('does not map a marker positioned after an edit that happens further down the document', () => {
    const editor = makeEditor()
    editor.commands.setInsertMarker(1) // right at the very start of "Hello"

    editor.chain().insertContentAt(12, ' again').run()

    expect(insertMarkerPluginKey.getState(editor.state)).toBe(1)
  })

  it('clears the marker', () => {
    const editor = makeEditor()
    editor.commands.setInsertMarker(6)
    editor.commands.clearInsertMarker()
    expect(insertMarkerPluginKey.getState(editor.state)).toBeNull()
  })
})
