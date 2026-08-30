import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from './theme'

describe('useThemeStore', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    useThemeStore.setState({ isDark: false })
  })

  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('toggles isDark and the .dark class on <html>', () => {
    useThemeStore.getState().toggle()
    expect(useThemeStore.getState().isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    useThemeStore.getState().toggle()
    expect(useThemeStore.getState().isDark).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('persists the choice to localStorage', () => {
    useThemeStore.getState().toggle()
    const stored = JSON.parse(localStorage.getItem('theme') ?? '{}')
    expect(stored.state.isDark).toBe(true)
  })
})
