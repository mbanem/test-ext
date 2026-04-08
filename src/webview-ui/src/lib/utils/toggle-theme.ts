// -------- toggle theme begin ---------

// Theme type & state
export type Theme = 'light' | 'dark'

// Get saved preference or system preference
export function getInitialTheme(): Theme {
  // if (!browser) return 'light'

  const saved = localStorage.getItem('theme') as Theme | null
  if (saved) {
    return saved
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}
let currentTheme = 'light'
// Apply theme to document
export function applyTheme(ct?: string) {
  document.documentElement.classList.add(ct ?? currentTheme)
}
// Toggle theme
export function toggleTheme(ct: string) {
  document.documentElement.classList.remove(currentTheme)
  currentTheme = ct === 'dark' ? 'light' : 'dark'
  applyTheme(currentTheme)
  localStorage.setItem('theme', currentTheme)
  applyTheme()
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
