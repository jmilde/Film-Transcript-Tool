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

export function PlayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M6 4.5a1 1 0 0 1 1.5-.87l9 5.5a1 1 0 0 1 0 1.74l-9 5.5A1 1 0 0 1 6 15.5v-11Z" />
    </svg>
  )
}

export function PauseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M5 4a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4ZM11.5 4a1 1 0 0 1 1-1H14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V4Z" />
    </svg>
  )
}

export function CopyIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      className={className}
    >
      <rect x="7" y="7" width="9" height="9" rx="1.5" />
      <path d="M4.5 12.5V5A1.5 1.5 0 0 1 6 3.5h7.5" />
    </svg>
  )
}

export function EditIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M12.5 3.5 16 7l-8.5 8.5-4 1 1-4 8-8.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 6h12M8 6V4.5A1 1 0 0 1 9 3.5h2a1 1 0 0 1 1 1V6M6 6v9.5A1.5 1.5 0 0 0 7.5 17h5a1.5 1.5 0 0 0 1.5-1.5V6" />
    </svg>
  )
}

export function CommentIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      className={className}
    >
      <path d="M3.5 4.5h13v9h-7L6 16v-2.5h-2.5v-9Z" strokeLinejoin="round" />
    </svg>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 5l10 10M15 5 5 15" strokeLinecap="round" />
    </svg>
  )
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="m16 16-3.7-3.7" strokeLinecap="round" />
    </svg>
  )
}

export function ChevronUpIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
      className={className}
    >
      <path d="m5 12 5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
      className={className}
    >
      <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SkipBackIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M5 4a.75.75 0 0 1 1.5 0v12a.75.75 0 0 1-1.5 0V4ZM16.35 4.13a1 1 0 0 1 .65.93v9.88a1 1 0 0 1-1.55.83l-7.4-4.94a1 1 0 0 1 0-1.66l7.4-4.94a1 1 0 0 1 .9-.1Z" />
    </svg>
  )
}

export function SkipForwardIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M15 4a.75.75 0 0 0-1.5 0v12a.75.75 0 0 0 1.5 0V4ZM3.65 4.13a1 1 0 0 0-.65.93v9.88a1 1 0 0 0 1.55.83l7.4-4.94a1 1 0 0 0 0-1.66l-7.4-4.94a1 1 0 0 0-.9-.1Z" />
    </svg>
  )
}

export function TranslateIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M3 5h7M6.5 3.5v2M4.5 5c.3 2.5 2 4.5 4 5.7M8.5 5c-.6 3.3-3 6-6 7.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m13 8.5 3.8 8.5M13 8.5 9.2 17M10.3 14.5h5.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
