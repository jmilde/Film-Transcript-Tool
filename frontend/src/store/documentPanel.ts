import { create } from 'zustand'

/** Reference ids needed to insert a clip block — resolved into display fields
 * (excerpt/thumbnail/etc.) once the editor calls `useResolveClipBlock`. */
export interface ClipInsertPayload {
  transcriptId: string
  videoId: string
  startTokenId: string
  endTokenId: string
}

/** A clip the panel should preview with its own player — set when a clip
 * block's play button is clicked for a video that isn't already open in
 * `VideoWorkspace` (see `store/playback.ts`'s `activeVideoId`). */
export interface ClipPreview {
  videoId: string
  startTime: number
  endTime: number
}

/**
 * Global state (§17-equivalent "Document Panel State") for the persistent
 * document-builder panel docked in `AppShell`. Unlike page-scoped stores, this
 * one must survive navigation between ProjectView/SearchPage/ChatPage/
 * VideoWorkspace, since the whole point of the panel is to stay open while
 * browsing. `pendingInsert` bridges an "Add to Document" click to the editor:
 * if the panel/editor isn't mounted yet, the payload is queued here and
 * consumed once `DocumentEditor` mounts (see `consumePendingInsert`).
 */
interface DocumentPanelState {
  isOpen: boolean
  activeProjectId: string | null
  activeDocumentId: string | null
  pendingInsert: ClipInsertPayload | null
  previewClip: ClipPreview | null
  // Thin flag only — *whether* the active document has an insert point
  // marked, not the position itself (that lives in `insertMarker.ts`'s
  // ProseMirror plugin state, the only thing that can keep it correctly
  // mapped through edits). Lets other components render "a marker is set"
  // without reaching into the editor instance.
  insertMarkerDocumentId: string | null
  open: (projectId: string) => void
  close: () => void
  setActiveProject: (projectId: string | null) => void
  setActiveDocument: (documentId: string | null) => void
  queueInsert: (payload: ClipInsertPayload) => void
  consumePendingInsert: () => ClipInsertPayload | null
  setPreviewClip: (clip: ClipPreview | null) => void
  setInsertMarkerDocumentId: (documentId: string | null) => void
}

export const useDocumentPanelStore = create<DocumentPanelState>((set, get) => ({
  isOpen: false,
  activeProjectId: null,
  activeDocumentId: null,
  pendingInsert: null,
  previewClip: null,
  insertMarkerDocumentId: null,
  open: (projectId) => set({ isOpen: true, activeProjectId: projectId }),
  close: () => set({ isOpen: false }),
  setActiveProject: (projectId) => set({ activeProjectId: projectId }),
  // Switching documents always leaves the old marker behind — it's plugin
  // state on an editor instance that's about to be torn down/rebuilt.
  setActiveDocument: (documentId) =>
    set({ activeDocumentId: documentId, insertMarkerDocumentId: null }),
  queueInsert: (payload) => set({ pendingInsert: payload, isOpen: true }),
  consumePendingInsert: () => {
    const payload = get().pendingInsert
    if (payload !== null) set({ pendingInsert: null })
    return payload
  },
  setPreviewClip: (clip) => set({ previewClip: clip }),
  setInsertMarkerDocumentId: (documentId) => set({ insertMarkerDocumentId: documentId }),
}))
