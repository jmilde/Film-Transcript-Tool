import { ArrowLeft } from 'lucide-react'

export interface ReturnToOriginProps {
  label: string
  onClick: () => void
}

/** Small affordance rendered next to (not inside) `AppShell`'s breadcrumb —
 * this is navigation history ("where you came from"), not hierarchy, so
 * folding it into the breadcrumb would make the breadcrumb lie when the same
 * video is reached by browsing instead of via a search hit or citation. */
export function ReturnToOrigin({ label, onClick }: ReturnToOriginProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-small text-text-muted hover:bg-surface-raised hover:text-text"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  )
}
