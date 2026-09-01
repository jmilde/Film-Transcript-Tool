import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  isDark: boolean
  toggle: () => void
}

function applyClass(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
}

/** Manual-only switch, persisted to localStorage — no `prefers-color-scheme`
 * auto-detection (see CONTEXT.md / TODO_FRONTEND_OVERHAUL.md). */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      isDark: false,
      toggle: () => {
        const next = !get().isDark
        applyClass(next)
        set({ isDark: next })
      },
    }),
    {
      name: 'theme',
      onRehydrateStorage: () => (state) => {
        if (state) applyClass(state.isDark)
      },
    },
  ),
)
