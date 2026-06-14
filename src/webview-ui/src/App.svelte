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

  let togglePageInfo: TToggleFunc = $state<TToggleFunc>() as TToggleFunc
  function triggerPageInfo(e: MouseEvent) {
    try {
      // ;(e.target as HTMLElement).style.backgroundColor = 'red'
      console.log('parent - togglePageInfo')
      togglePageInfo()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(msg)
    }
  }

  function isPageKey(value: unknown): value is PageKey {
    return typeof value === 'string' && value in pages
  }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(theme)
  }

  onMount(() => {
    theme = getInitialTheme()
    applyTheme(theme)

    // listener for extension messges
    const handler = (event: MessageEvent) => {
      const msg = event.data

      if (msg.command === 'showPage' && isPageKey(msg.page)) {
        key = msg.page
      }
    }
    window.addEventListener('message', handler)

    return () => {
      window.removeEventListener('message', handler)
    }
  })
</script>

<!-- extension send message 'showPage' of name = msg.page
we get Current = $derived(pages[key]) and render it
NOTE: the variable component  must be with capital so
Current is OK while Svelte will treat as a tag a name
<current></current> and will left it as is in the markup
so no page would be rendered
-->
<nav>
  <span class="toggle-info-page" onclick={triggerPageInfo} aria-hidden={true}
    >What Does This Page Do?
  </span>
  <p onclick={toggleTheme} aria-hidden={true}>
    <span class="icon">{getIcon(theme)}</span>
  </p>
</nav>

<div class="main">
  <Current bind:pageInfo={togglePageInfo}></Current>
</div>

<style lang="scss">
  nav {
    position: static;
    top: 0;
    left: 0;
    display: flex;
    gap: 10px;
    justify-content: flex-start;
    align-items: center;
    width: 96vw;
    height: 1.5rem;
    padding: 0;
    margin: 0;
    // @include nav-colors;
    p {
      margin-left: auto;
      display: inline-block;
      height: 25px;
      width: 25px;
      outline: none;
      // @include border;
      background-color: var(--tab-bg);
      z-index: 100;
      span.icon {
        // position: absolute;
        // top: 0;
        display: inline-block;
        // margin: 4px 0 0 4px;
        // padding: 0;
        width: 25px;
        height: 25px;
        // @include border;
        background-color: var(--icon-bg);
        cursor: pointer;
        & > * {
          padding-top: 5px;
          padding-left: 5px;
        }
      }
    }
  }
  .page-info {
    position: static;
    top: 1.5rem;
    left: 0;
    width: max-content;
    height: auto;
  }
  .toggle-info-page {
    display: inline-block;
    width: max-content;
    padding: 0;
    margin: 0;
    color: var(--cr-text);
    cursor: pointer;
    // @include border($padding: 0 0.5rem);
    background-color: var(--tab-bg);
    &:hover {
      color: yellow;
      background-color: #151515;
    }
  }
  .main {
    position: relative;
    width: max-content;
    height: auto;
    padding: 0;
    margin: 1rem 0 0 0;
  }
  .hidden {
    display: none;
  }
</style>
