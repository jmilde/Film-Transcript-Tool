import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { Dialog } from './Dialog'

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  children: ReactNode
}

/** The structural shell Phase 7's search overlay fills — a dialog is exactly
 * a command palette's overlay + focus-trapped panel, just anchored near the
 * top of the viewport and wider than a confirmation dialog. `label` is a
 * visually-hidden `Dialog.Title` (Radix requires one for a11y; command
 * palettes don't show a literal title on screen). */
export function CommandPalette({ open, onOpenChange, label, children }: CommandPaletteProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-testid="command-palette-overlay"
          className="fixed inset-0 z-40 bg-black/40 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in"
        />
        <DialogPrimitive.Content
          className="fixed top-[12vh] left-1/2 z-50 w-full max-w-2xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-lg outline-none data-[state=closed]:animate-fade-out data-[state=open]:animate-slide-down"
          onOpenAutoFocus={(event) => {
            // The search input inside `children` manages its own focus.
            event.preventDefault()
          }}
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  )
}
