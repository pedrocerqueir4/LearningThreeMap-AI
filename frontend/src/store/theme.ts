import { create } from 'zustand'

type ThemeMode = 'light' | 'dark'

type ThemeState = {
  mode: ThemeMode
}

type ThemeActions = {
  setMode: (mode: ThemeMode) => void
  toggleMode: () => void
}

export const useThemeStore = create<ThemeState & ThemeActions>((set) => {
  const savedMode = (typeof localStorage !== 'undefined' ? localStorage.getItem('theme-mode') : null) as ThemeMode | null
  const initialMode: ThemeMode = savedMode === 'dark' || savedMode === 'light' ? savedMode : 'light'

  return {
    mode: initialMode,
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
  }
})
