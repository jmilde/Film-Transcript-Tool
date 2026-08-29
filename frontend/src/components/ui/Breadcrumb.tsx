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
 * params + `useProject`/`useVideo`/folder_path) before rendering. */
export function Breadcrumb({ items, className = '' }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1.5 text-small ${className}`}>
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
          {index > 0 && (
            <ChevronRight className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
          )}
          {item.href ? (
            <Link to={item.href} className="text-text-muted hover:text-text hover:underline">
              {item.label}
            </Link>
          ) : (
            <span
              className={index === items.length - 1 ? 'font-medium text-text' : 'text-text-muted'}
            >
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}
