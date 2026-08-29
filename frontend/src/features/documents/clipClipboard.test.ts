import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClipBlock } from './clipBlockNode'
import { clipBlockMarkerHtml, writeClipToClipboard } from './clipClipboard'
import type { JSONContent } from '@tiptap/core'

const ATTRS = {
  nodeId: 'n-1',
  transcriptId: 't-1',
  videoId: 'v-1',
  startTokenId: 'tok-a',
  endTokenId: 'tok-b',
}

describe('clipBlockMarkerHtml', () => {
  it('renders a span carrying every persisted attr as a plain (unprefixed) HTML attribute', () => {
    const html = clipBlockMarkerHtml(ATTRS, 'Hello there')

    expect(html).toBe(
      '<span data-clip-block nodeId="n-1" transcriptId="t-1" videoId="v-1" ' +
        'startTokenId="tok-a" endTokenId="tok-b" excerpt="Hello there">Hello there</span>',
    )
  })

  it('escapes excerpt text that contains HTML-significant characters', () => {
    const html = clipBlockMarkerHtml(ATTRS, 'Tom & Jerry <said> "hi"')

    expect(html).toContain('Tom &amp; Jerry &lt;said&gt; &quot;hi&quot;')
  })
})

describe('writeClipToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('falls back to writeText when ClipboardItem/clipboard.write are unavailable', async () => {
    vi.stubGlobal('ClipboardItem', undefined)
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)

    await writeClipToClipboard('plain text', '<span>html</span>')

    expect(writeText).toHaveBeenCalledWith('plain text')
  })

  it('writes both MIME entries via ClipboardItem when the API is available', async () => {
    const items: unknown[] = []
    class FakeClipboardItem {
      data: Record<string, Blob>
      constructor(data: Record<string, Blob>) {
        this.data = data
      }
    }
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)
    const write = vi.fn(async (written: unknown[]) => {
      items.push(...written)
    })
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { ...navigator.clipboard, write },
    })

    await writeClipToClipboard('plain text', '<span>html</span>')

    expect(write).toHaveBeenCalledTimes(1)
    const written = items[0] as FakeClipboardItem
    expect(Object.keys(written.data)).toEqual(['text/plain', 'text/html'])
    expect(await written.data['text/plain']?.text()).toBe('plain text')
    expect(await written.data['text/html']?.text()).toBe('<span>html</span>')
  })
})

describe('marker HTML round-trip through the editor schema', () => {
  it('reconstructs an inline clipBlock node with correct attrs, in-flow with surrounding text', () => {
    const editor = new Editor({
      extensions: [StarterKit, ClipBlock],
      content: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
    })

    const html = `Before ${clipBlockMarkerHtml(ATTRS, 'Hello there')} After`
    editor.commands.insertContent(html)

    const json = editor.getJSON()
    const paragraph = json.content?.[0]
    expect(paragraph?.content?.map((n) => n.type)).toEqual(['text', 'clipBlock', 'text'])

    const clip = paragraph?.content?.[1] as JSONContent | undefined
    expect(clip?.type).toBe('clipBlock')
    expect(clip?.attrs).toMatchObject(ATTRS)
    // The excerpt must survive the round-trip too: `ClipBlock` is an atom
    // node, so its inner text is dropped on parse — without `excerpt` also
    // carried as an attribute, a pasted clip would fall back to the "Clip"
    // placeholder (see `ClipBlockView`) until the document reloads.
    expect(clip?.attrs?.excerpt).toBe('Hello there')
  })
})
