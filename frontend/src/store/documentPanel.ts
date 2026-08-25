import { create } from 'zustand'

/** Reference ids needed to insert a clip block — resolved into display fields
 * (excerpt/thumbnail/etc.) once the editor calls `useResolveClipBlock`. */
export interface ClipInsertPayload {
  transcriptId: string
  videoId: string
  startTokenId: string
  endTokenId: string
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
  open: (projectId: string) => void
  close: () => void
  setActiveProject: (projectId: string | null) => void
  setActiveDocument: (documentId: string | null) => void
  queueInsert: (payload: ClipInsertPayload) => void
  consumePendingInsert: () => ClipInsertPayload | null
}

export const useDocumentPanelStore = create<DocumentPanelState>((set, get) => ({
  isOpen: false,
  activeProjectId: null,
  activeDocumentId: null,
  pendingInsert: null,
  open: (projectId) => set({ isOpen: true, activeProjectId: projectId }),
  close: () => set({ isOpen: false }),
  setActiveProject: (projectId) => set({ activeProjectId: projectId }),
  setActiveDocument: (documentId) => set({ activeDocumentId: documentId }),
  queueInsert: (payload) => set({ pendingInsert: payload, isOpen: true }),
  consumePendingInsert: () => {
    const payload = get().pendingInsert
    if (payload !== null) set({ pendingInsert: null })
    return payload
  },
}))
