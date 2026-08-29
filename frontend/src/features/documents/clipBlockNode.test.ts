import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { ClipBlock } from './clipBlockNode'
import type { JSONContent } from '@tiptap/core'

const ATTRS = {
  nodeId: 'n-1',
  transcriptId: 't-1',
  videoId: 'v-1',
  startTokenId: 'tok-a',
  endTokenId: 'tok-b',
}

function makeEditor(content: JSONContent) {
  return new Editor({ extensions: [StarterKit, ClipBlock], content })
}

describe('insertClipBlockAt', () => {
  it('wraps a fresh paragraph around the clip when the document is empty', () => {
    const editor = makeEditor({ type: 'doc', content: [] })

    editor.commands.insertClipBlockAt(0, ATTRS)

    const json = editor.getJSON()
    expect(json.content?.[0]?.type).toBe('paragraph')
    expect(json.content?.[0]?.content?.[0]?.type).toBe('clipBlock')
  })

  it('inserts inline at the end of existing prose without an extra paragraph', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    })
    const endPos = editor.state.doc.content.size

    editor.commands.insertClipBlockAt(endPos, ATTRS)

    const json = editor.getJSON()
    expect(json.content?.length).toBe(1)
    expect(json.content?.[0]?.content?.map((n) => n.type)).toEqual(['text', 'clipBlock'])
  })

  it('inserts inline mid-sentence without wrapping', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello there' }] }],
    })
    const midPos = 7 // just after "Hello "

    editor.commands.insertClipBlockAt(midPos, ATTRS)

    const json = editor.getJSON()
    expect(json.content?.length).toBe(1)
    expect(json.content?.[0]?.content?.map((n) => n.type)).toEqual(['text', 'clipBlock', 'text'])
  })
})
