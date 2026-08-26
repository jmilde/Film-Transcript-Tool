import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { isDocumentConflict, useDocument, useUpdateDocument } from '../../api/hooks/useDocuments'
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
 */
export function DocumentEditor({ projectId, documentId }: DocumentEditorProps) {
  const { data: doc, isLoading } = useDocument(documentId)
  const updateDocument = useUpdateDocument(projectId, documentId)
  const client = useQueryClient()

  // The version to send with the next save; kept outside React state since
  // updating it must never itself trigger a re-render/editor reset.
  const versionRef = useRef(1)
  const initializedRef = useRef(false)
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
    initializedRef.current = false
  }, [documentId])

  useEffect(() => {
    if (!editor || !doc || initializedRef.current) return
    editor.commands.setContent(doc.content, { emitUpdate: false })
    versionRef.current = doc.version
    initializedRef.current = true
  }, [editor, doc])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  function reloadAfterConflict() {
    updateDocument.reset()
    initializedRef.current = false
    void client.invalidateQueries({ queryKey: ['document', documentId] })
  }

  if (isLoading || !editor) {
    return <div className="p-6 text-center text-sm text-slate-400">Loading document…</div>
  }

  return (
    <div className="flex h-full flex-col">
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
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none flex-1 overflow-y-auto px-4 py-3"
      />
    </div>
  )
}
