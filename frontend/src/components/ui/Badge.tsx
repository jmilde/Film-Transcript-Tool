import type { HTMLAttributes } from 'react'

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const CLASSES: Record<BadgeVariant, { pill: string; dot: string }> = {
  success: { pill: 'bg-success-subtle text-success-text', dot: 'bg-success' },
  warning: { pill: 'bg-warning-subtle text-warning-text', dot: 'bg-warning' },
  danger: { pill: 'bg-danger-subtle text-danger-text', dot: 'bg-danger' },
  info: { pill: 'bg-info-subtle text-info-text', dot: 'bg-info' },
  neutral: { pill: 'bg-surface-raised text-text-muted', dot: 'bg-text-muted' },
}

export function Badge({ variant = 'neutral', className = '', children, ...props }: BadgeProps) {
  const { pill, dot } = CLASSES[variant]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-small font-medium ${pill} ${className}`}
      {...props}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {children}
    </span>
  )
}
