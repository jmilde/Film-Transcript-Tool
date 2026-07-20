interface IconProps {
  className?: string
}

export function FolderIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M2 5a1 1 0 0 1 1-1h4.5l1.5 1.5H17a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5Z" />
    </svg>
  )
}

export function VideoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M3 5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v2.2l3.4-2A1 1 0 0 1 18 6v8a1 1 0 0 1-1.6.8L13 12.8V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5Z" />
    </svg>
  )
}
