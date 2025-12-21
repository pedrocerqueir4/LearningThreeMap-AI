import { create } from 'zustand'

type ThemeMode = 'light' | 'dark'
type ColorTheme = 'cyber' | 'ocean' | 'forest' | 'sunset'

type ThemeState = {
  mode: ThemeMode
  colorTheme: ColorTheme
}

type ThemeActions = {
  setMode: (mode: ThemeMode) => void
  toggleMode: () => void
  setColorTheme: (theme: ColorTheme) => void
}

export const useThemeStore = create<ThemeState & ThemeActions>((set) => {
  const savedMode = (typeof localStorage !== 'undefined' ? localStorage.getItem('theme-mode') : null) as ThemeMode | null
  const savedColorTheme = (typeof localStorage !== 'undefined' ? localStorage.getItem('color-theme') : null) as ColorTheme | null

  const initialMode: ThemeMode = savedMode === 'dark' || savedMode === 'light' ? savedMode : 'light'
  const initialColorTheme: ColorTheme = savedColorTheme === 'cyber' || savedColorTheme === 'ocean' || savedColorTheme === 'forest' || savedColorTheme === 'sunset' ? savedColorTheme : 'cyber'

  // Apply initial theme
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', initialMode)
    document.documentElement.setAttribute('data-color-theme', initialColorTheme)
  }

  return {
    mode: initialMode,
    colorTheme: initialColorTheme,
    setMode: (mode: ThemeMode) => {
      set({ mode })
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('theme-mode', mode)
      }
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', mode)
      }
    },
    toggleMode: () => {
      set((state) => {
        const newMode: ThemeMode = state.mode === 'light' ? 'dark' : 'light'
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('theme-mode', newMode)
        }
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', newMode)
        }
        return { mode: newMode }
      })
    },
    setColorTheme: (theme: ColorTheme) => {
      set({ colorTheme: theme })
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('color-theme', theme)
      }
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-color-theme', theme)
      }
    },
  }
})
