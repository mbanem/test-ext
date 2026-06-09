// src/webview-ui/src/lib/utils/toggle-theme.ts

export type Theme = 'light' | 'dark'

const THEME_KEY = 'cr-theme'

export function getInitialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY) as Theme | null
  console.log('getInitialTheme saved:', saved)

  if (saved === 'light' || saved === 'dark') {
    return saved
  }

  return document.body.classList.contains('vscode-dark') ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  console.log('applyTheme', theme)
  document.documentElement.dataset.crTheme = theme
  localStorage.setItem(THEME_KEY, theme)
}

export function getIcon(theme: Theme) {
  return theme === 'dark' ? '☀️' : '🌙'
}

// Initialize on client
// onMount(() => {
//   currentTheme = getInitialTheme()
//   applyTheme()
//   toggleTheme()
//   // mounted = true
// })

// // Listen for system theme changes
// $effect(() => {
//   // if (!browser || !mounted) return
//   const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
//   const handleChange = (e: MediaQueryListEvent) => {
//     // Only auto-change if user hasn't manually selected a theme
//     if (!localStorage.getItem('theme')) {
//       currentTheme = e.matches ? 'dark' : 'light'
//       applyTheme()
//     }
//   }

//   mediaQuery.addEventListener('change', handleChange)
//   return () => mediaQuery.removeEventListener('change', handleChange)
// })
// export function getIcon() {
//   return currentTheme === 'dark' ? '☀️' : '🌙'
// }
// -------- toggle theme end ---------
