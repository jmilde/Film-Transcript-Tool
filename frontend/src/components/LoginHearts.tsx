import type { CSSProperties } from 'react'

/* Purely decorative sign-in backdrop: a big beating heart plus a steady
   stream of little hearts and sparkles floating up the screen. Positions
   come from a fixed-seed generator so every render (and every test run)
   lays them out identically. Animations live in index.css under
   `.login-hearts` and switch off under `prefers-reduced-motion`. */

const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'

const COLORS = ['1', '2', '3', '4', 'lilac'].map((name) => `var(--raw-love-${name})`)

function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const random = seeded(14)

const FLOATERS = Array.from({ length: 28 }, (_, i) => ({
  key: i,
  sparkle: i % 7 === 3,
  left: random() * 100,
  size: 14 + random() * 34,
  duration: 9 + random() * 9,
  delay: -random() * 18,
  sway: 12 + random() * 36,
  color: COLORS[Math.floor(random() * COLORS.length)],
}))

function Heart({ className, color }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={color ?? 'currentColor'}>
      <path d={HEART_PATH} />
    </svg>
  )
}

export function LoginHearts() {
  return (
    <div className="login-hearts" aria-hidden="true">
      {FLOATERS.map((f) => (
        <span
          key={f.key}
          className="login-hearts__floater"
          style={
            {
              left: `${f.left}%`,
              width: f.size,
              height: f.size,
              color: f.color,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
              '--sway': `${f.sway}px`,
            } as CSSProperties
          }
        >
          {f.sparkle ? <span className="login-hearts__sparkle">✦</span> : <Heart />}
        </span>
      ))}
    </div>
  )
}

export function BigHeart() {
  return (
    <div className="login-big-heart" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <defs>
          <linearGradient id="login-big-heart-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--raw-love-2)" />
            <stop offset="55%" stopColor="var(--raw-love-1)" />
            <stop offset="100%" stopColor="var(--raw-love-deep)" />
          </linearGradient>
        </defs>
        <path d={HEART_PATH} fill="url(#login-big-heart-fill)" />
        <ellipse
          cx="7.6"
          cy="7.4"
          rx="2.1"
          ry="1.3"
          fill="var(--raw-text-inverted)"
          opacity="0.55"
          transform="rotate(-35 7.6 7.4)"
        />
      </svg>
    </div>
  )
}
