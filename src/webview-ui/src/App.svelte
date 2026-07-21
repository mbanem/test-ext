<script lang="ts">
  // import { vscode } from '$lib/utils/event-handler.browser.js'
  import { onMount } from 'svelte'
  import '$lib/styles/themes.scss'
  // import type { Component } from 'svelte'

  import {
    applyTheme,
    getIcon,
    getInitialTheme,
    type Theme,
  } from '$lib/utils/toggle-theme'

  // type PageKey = 'OrmOne' | 'OrmTwo' | 'OrmThree'
  type TImports =
    | typeof import('./OrmOne.svelte')
    | typeof import('./OrmTwo.svelte')
    | typeof import('./OrmThree.svelte')

  export const handleTryCatch = (err: unknown, info?: string) => {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(info, msg)
  }
  // Attach the actual function to the global scope
  ;(globalThis as any).handleTryCatch = handleTryCatch
  const pageLoaders = {
    OrmOne: () => import('./OrmOne.svelte'),
    OrmTwo: () => import('./OrmTwo.svelte'),
    OrmThree: () => import('./OrmThree.svelte'),
  } as const satisfies Record<PageKey, () => Promise<TImports>>

  let key = $state<PageKey | null>(null)
  // let Current = $state<TImports | null>(null)
  // let Current = $state<Component<TImports> | null>(null)
  let Current = $state<any>(null)
  let isLoading = $state(false)
  let loadError = $state<string | null>(null)

  let theme = $state<Theme>('light')

  let togglePageInfo = $state<TToggleFunc>()
  function triggerPageInfo() {
    togglePageInfo?.()
  }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(theme)
  }

  async function loadPage(pageKey: PageKey) {
    if (key === pageKey && Current) {
      //      console.log(
      //   '[App] loadPage multiple calls with the same pageKey',
      //   pageKey,
      // )
      return
    }
    //    console.log('[App] loadPage', pageKey)
    isLoading = true
    loadError = null
    key = pageKey

    try {
      const loader = pageLoaders[pageKey]
      const module = await loader() // { default: Component, ... }
      Current = module.default // This is the Svelte component constructor
      //      console.log(`[App] loadPage set ${pageKey} as the Current`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[App] loadPage error for', pageKey, msg)
      loadError = msg
      key = null
    } finally {
      isLoading = false
    }
  }
  // Trigger initial load
  function getInitialPage(): PageKey {
    let initialPage: PageKey = 'OrmOne' // default
    //// console.log('[App] getInitialPage() called set OrmOne as default')
    // Priority 1: Global variable (injected by extension)
    if ((window as any).__INITIAL_PAGE) {
      initialPage = (window as any).__INITIAL_PAGE as PageKey
      //      console.log(`[App] Found window.__INITIAL_PAGE = ${initialPage}`)

      // Clean up
      delete (window as any).__INITIAL_PAGE
    } // Fallback
    else {
      const appDiv = document.getElementById('app')
      initialPage = (appDiv?.dataset.initialPage as PageKey) || 'OrmOne'
      //      console.log(`[App] Used data-initial-page: ${initialPage}`)
    }
    //// console.log(`[App] getInitialPage → ${initialPage}`)
    return initialPage
  }
  onMount(() => {
    //    console.log('[App] onMount - timestamp:', new Date().toISOString())
    theme = getInitialTheme()
    applyTheme(theme)

    const initialPage: PageKey = getInitialPage()
    //    console.log('[App] got initialPage', initialPage)

    loadPage(initialPage)
    //    console.log('[App] after loadPage', initialPage)
    // listener for server-side messages
    const handler = (event: MessageEvent) => {
      try {
        const msg = event.data
        switch (msg.command) {
          case 'showPage':
            //            console.log('[App] showPage', msg)
            const page = msg.page as PageKey
            if (['OrmOne', 'OrmTwo', 'OrmThree'].includes(page)) {
              //              console.log('[App] calling loadPage', page)
              loadPage(page)
            }
            break
          case 'prismaInitDone':
            //            console.log('[App] prismaInitDone display OrmThree', msg.payload)
            loadPage('OrmThree')
            break
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        //        console.log('[App] listenner error msg and event.data', msg)
      }
    }
    window.addEventListener('message', handler)
    // vscode.postMessage({
    //   command: 'AppSvelteReady',
    // })
    //    console.log('[App] set up event listener for "message"')

    return () => {
      //      console.log('[App] removing listener')
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
    >About This Page
  </span>
  <p onclick={toggleTheme} aria-hidden={true}>
    <span class="icon">{getIcon(theme)}</span>
  </p>
</nav>

<div class="main">
  {#if isLoading}
    <div>Loading page...</div>
  {:else if loadError}
    <div>Error: {loadError}</div>
  {:else if Current}
    {console.log('[App] rendering <Current>')}
    <Current bind:pageInfo={togglePageInfo} />
  {:else}
    <div>Initializing...</div>
  {/if}
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
    height: 1.45rem;
    padding: 0;
    margin: 0;
    color: var(--cr-text);
    background-color: var(--bg);
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
        display: inline-block;
        width: 25px;
        height: 25px;
        background-color: var(--icon-bg);
        border: 1px solid var(--icon-border-color);
        cursor: pointer;
        & > * {
          padding-top: 5px;
          padding-left: 5px;
          display: inline-block;
        }
      }
    }
  }

  .toggle-info-page {
    display: inline-block;
    width: max-content;
    padding: 0;
    margin: 0;
    color: var(--cr-text);
    background-color: var(--bg);
    cursor: pointer;
    &:hover {
      color: var(--hover-button);
    }
  }
  .main {
    position: relative;
    width: 100vw;
    height: calc(100vh - 1.45rem);
    padding: 0;
    margin: 0;
    color: var(--cr-text);
    background-color: var(--bg);
  }
</style>
