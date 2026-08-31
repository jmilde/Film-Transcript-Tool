import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export interface DialogContentProps {
  children: ReactNode
  title: string
  description?: string
  className?: string
}

/** Radix supplies focus trapping, Escape-to-close, and click-outside-to-close
 * (ADR 0002) — this wrapper only adds the visual shell and Phase 1's theme
 * variables/animations. */
export function DialogContent({
  children,
  title,
  description,
  className = '',
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-testid="dialog-overlay"
        className="fixed inset-0 z-40 bg-black/40 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in"
      />
      <DialogPrimitive.Content
        className={`fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-6 shadow-lg outline-none data-[state=closed]:animate-scale-out data-[state=open]:animate-scale-in ${className}`}
      >
        <DialogPrimitive.Title className="text-h3 text-text">{title}</DialogPrimitive.Title>
        {description && (
          <DialogPrimitive.Description className="mt-1 text-small text-text-muted">
            {description}
          </DialogPrimitive.Description>
        )}
        <div className="mt-4">{children}</div>
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute top-4 right-4 text-text-muted transition-colors hover:text-text"
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
