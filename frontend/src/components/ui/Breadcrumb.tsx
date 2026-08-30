import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

/** Presentational only — no data-fetching. Callers resolve `items` (route
 * params + `useProject`/`useVideo`/folder_path) before rendering.
 *
 * The last item always renders as plain (bold) text, ignoring `href` if one
 * is passed — it's the current page, so a caller can pass every ancestor's
 * `href` uniformly (e.g. always the project's) without special-casing
 * whichever crumb happens to be current. */
export function Breadcrumb({ items, className = '' }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1.5 text-small ${className}`}>
      {items.map((item, index) => {
        const isCurrent = index === items.length - 1
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
            )}
            {item.href && !isCurrent ? (
              <Link to={item.href} className="text-text-muted hover:text-text hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className={isCurrent ? 'font-medium text-text' : 'text-text-muted'}>
                {item.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
