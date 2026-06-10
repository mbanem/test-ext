<script lang="ts">
  import OrmOne from './OrmOne.svelte'
  import OrmTwo from './OrmTwo.svelte'
  import OrmThree from './OrmThree.svelte'
  import { onMount } from 'svelte'
  import '$lib/styles/themes.scss'
  /* theme belongs to the webview UI shell
    - App.svelte owns the theme state
    - child pages receive what they need as props
    - CSS uses VS Code theme variables as the base
    VS Code webviews already get theme classes on <body>: vscode-light, vscode-dark, 
    vscode-high-contrast, and VS Code exposes CSS variables like --vscode-editor-foreground.
    So the extension should respect those first
  */
  import {
    applyTheme,
    getIcon,
    getInitialTheme,
    type Theme,
  } from '$lib/utils/toggle-theme'

  const pages = {
    OrmOne,
    OrmTwo,
    OrmThree,
  }
  type PageKey = keyof typeof pages
  let key = $state<PageKey>('OrmThree')
  let Current = $derived(pages[key])
  // Toggle theme
  let theme = $state<Theme>('light')

  function isPageKey(value: unknown): value is PageKey {
    return typeof value === 'string' && value in pages
  }
  console.log('inside App.svelte')

  // window.addEventListener('message', (event) => {
  //   const msg = event.data
  //   console.log('App.svelte listener', msg)
  //   if (msg.command === 'showPage') {
  //     console.log('showPage', msg.page)
  //     key = msg.page as PageKey
  //   }
  // })
  // Q1: It components have to call it (which I do not expect as it is app level func)
  // but if that has to be then how to export it (it is not <script modeule>)
  function toggleTheme() {
    console.log('toggle theme')
    theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(theme)
  }
  onMount(() => {
    theme = getInitialTheme()
    applyTheme(theme)
    console.log('onMount called')
    const handler = (event: MessageEvent) => {
      const msg = event.data
      console.log('App.svelte message handler called', msg)

      if (msg.command === 'showPage' && isPageKey(msg.page)) {
        console.log('[From Extension] command show page ', msg)
        key = msg.page
      }
    }
    window.addEventListener('message', handler)

    return () => {
      window.removeEventListener('message', handler)
    }
  })
</script>

<nav class="app-nav">
  <p class="theme-btn" onclick={toggleTheme} aria-hidden={true}>
    {getIcon(theme)}
  </p>
</nav>

<!-- the current causes the following error: This condition will always return true
since this function is always defined. Did you mean to call it instead?ts(2774)
Q2: why TS thinks it is a function?  -->
<!-- every transpiled comp.svelte into comp.html (not .svelte) should have id='app' 
  as the main.ts calls mount(App, binding HTMLElement that has id='app')
  and App.svelte renders <component {theme}/> from a list of const pages based on the key 
  (initially set to OrmOne)
  But if App.svelte adds additional markup beside <component {theme}/> it should be
  rendered as well, but it is missing, Q3: so does something else in the chain has the last word?
  -->
<!-- Q4: components get the theme, which is 'dark' or 'light' 
    and what component should do with it? There is no theme-btn in it and toggleTheme has no argument; 
    what should they implement fo handle the theme?
-->
<div class="page-wrapper">
  <Current></Current>
</div>

<style lang="scss">
  .theme-btn {
    display: inline-block;
    padding: 0;
    margin: 0;
    height: 25px;
    width: 25px;
    outline: none;
    border-radius: 5px;
    cursor: pointer;
    background-color: var(--cr-bg);
    z-index: 200;
  }
  .app-nav {
    // display: inline-block;
    // border: 1px solid gray;
    // border-radius: 5px;
    display: flex;
    gap: 10px;
    align-items: center;
    width: 100vw;
    height: 1rem;
    background-color: var(--cr-bg);
  }
  .page-wrapper {
    margin-top: 1rem;
    background-color: var(--cr-bg);
  }
</style>
