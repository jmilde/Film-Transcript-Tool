import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  isDocumentConflict,
  useDocument,
  useResolveClipBlock,
  useUpdateDocument,
} from '../../api/hooks/useDocuments'
import { useDocumentPanelStore } from '../../store/documentPanel'
import { ClipBlock, stripResolvedClipFields } from './clipBlockNode'
import type { Document } from '../../api/hooks/useDocuments'

const SAVE_DEBOUNCE_MS = 1000

interface DocumentEditorProps {
  projectId: string
  documentId: string
}

/**
 * Loads a document and mounts a TipTap editor over its content, debouncing
 * saves and surfacing a stale-`expected_version` conflict the same way
 * `TranscriptViewer` does for token edits (see its `reloadAfterConflict`).
 *
 * Also owns consuming the panel store's queued "Add to Document" insert
 * (rather than `DocumentPanel`, which doesn't have an editor instance to call
 * `insertClipBlockAt` on) once this document's editor has finished loading.
 */
export function DocumentEditor({ projectId, documentId }: DocumentEditorProps) {
  const { data: doc, isLoading } = useDocument(documentId)
  const updateDocument = useUpdateDocument(projectId, documentId)
  const resolveClipBlock = useResolveClipBlock(documentId)
  const pendingInsert = useDocumentPanelStore((s) => s.pendingInsert)
  const consumePendingInsert = useDocumentPanelStore((s) => s.consumePendingInsert)
  const client = useQueryClient()

  // The version to send with the next save; kept outside React state since
  // updating it must never itself trigger a re-render/editor reset.
  const versionRef = useRef(1)
  const [initialized, setInitialized] = useState(false)
  const [title, setTitle] = useState('')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2] },
          blockquote: false,
          code: false,
          codeBlock: false,
          horizontalRule: false,
          strike: false,
          link: false,
          underline: false,
        }),
        ClipBlock,
      ],
      content: { type: 'doc', content: [] },
      onUpdate: ({ editor }) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = setTimeout(() => {
          updateDocument.mutate(
            {
              content: stripResolvedClipFields(editor.getJSON()) as Document['content'],
              expectedVersion: versionRef.current,
            },
            { onSuccess: (updated) => (versionRef.current = updated.version) },
          )
        }, SAVE_DEBOUNCE_MS)
      },
    },
    [documentId],
  )

  // A document switch needs a fresh initial load even though `doc` itself
  // may briefly hold the previous document's data while the new one fetches.
  useEffect(() => {
    setInitialized(false)
  }, [documentId])

  useEffect(() => {
    if (!editor || !doc || initialized) return
    editor.commands.setContent(doc.content, { emitUpdate: false })
    versionRef.current = doc.version
    setTitle(doc.title)
    setInitialized(true)
  }, [editor, doc, initialized])

  // Renames on blur, sharing this same version-tracking with content saves —
  // splitting title/content into separately-versioned mutations would let one
  // silently invalidate the other's `expected_version`.
  function saveTitle() {
    if (!initialized || title === doc?.title) return
    updateDocument.mutate(
      { title, expectedVersion: versionRef.current },
      { onSuccess: (updated) => (versionRef.current = updated.version) },
    )
  }

  // Insert a queued clip once there's an initialized editor to receive it —
  // resolve its display fields first so the card renders correctly right
  // away, without waiting on a full document refetch.
  useEffect(() => {
    if (!editor || !initialized || pendingInsert === null) return
    const payload = consumePendingInsert()
    if (!payload) return
    resolveClipBlock.mutate(
      {
        transcriptId: payload.transcriptId,
        startTokenId: payload.startTokenId,
        endTokenId: payload.endTokenId,
      },
      {
        onSuccess: (clip) => {
          editor.commands.insertClipBlockAt(editor.state.doc.content.size, {
            nodeId: crypto.randomUUID(),
            transcriptId: payload.transcriptId,
            videoId: payload.videoId,
            startTokenId: payload.startTokenId,
            endTokenId: payload.endTokenId,
            note: null,
            ...clip,
          })
        },
      },
    )
  }, [editor, initialized, pendingInsert, consumePendingInsert, resolveClipBlock])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  function reloadAfterConflict() {
    updateDocument.reset()
    setInitialized(false)
    void client.invalidateQueries({ queryKey: ['document', documentId] })
  }

  if (isLoading || !editor) {
    return <div className="p-6 text-center text-sm text-slate-400">Loading document…</div>
  }

  return (
    <div className="flex h-full flex-col">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        aria-label="Document title"
        className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none"
      />
      {isDocumentConflict(updateDocument.error) && (
        <div className="flex items-center gap-3 border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          <span>This document was edited by someone else. Your change was not saved.</span>
          <button
            type="button"
            onClick={reloadAfterConflict}
            className="ml-auto rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-500"
          >
            Reload
          </button>
        </div>
      )}
      {updateDocument.isError && !isDocumentConflict(updateDocument.error) && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          Your last change could not be saved. Check your connection and permissions, then try
          again.
        </div>
      )}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none flex-1 overflow-y-auto px-4 py-3"
      />
    </div>
  )
}
