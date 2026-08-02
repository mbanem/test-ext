<script lang="ts">
  import { onMount } from 'svelte'
  import '$lib/styles/themes.scss'

  import OrmOne from './OrmOne.svelte'
  import OrmThree from './OrmThree.svelte'

  import {
    applyTheme,
    getIcon,
    getInitialTheme,
    type Theme,
  } from '$lib/utils/toggle-theme'

  type PageKey = 'OrmOne' | 'OrmThree'

  let currentPage = $state<PageKey>('OrmOne')
  let theme = $state<Theme>('light')
  let togglePageInfo = $state<(() => void) | undefined>()

  function triggerPageInfo(_: MouseEvent | KeyboardEvent) {
    togglePageInfo?.()
  }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(theme)
  }

  function getInitialPage(): PageKey {
    if ((window as any).__INITIAL_PAGE) {
      const page = (window as any).__INITIAL_PAGE as PageKey
      delete (window as any).__INITIAL_PAGE
      return page
    }

    const appDiv = document.getElementById('app')
    return (appDiv?.dataset.initialPage as PageKey) || 'OrmOne'
  }

  onMount(() => {
    theme = getInitialTheme()
    applyTheme(theme)

    currentPage = getInitialPage()

    const handler = (event: MessageEvent) => {
      const msg = event.data
      if (
        msg.command === 'showPage' &&
        ['OrmOne', 'OrmThree'].includes(msg.page)
      ) {
        currentPage = msg.page
      }
      if (msg.command === 'prismaInitDone') {
        currentPage = 'OrmThree'
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  })
</script>

<nav>
  <span
    class="toggle-info-page"
    onclick={triggerPageInfo}
    onkeyup={triggerPageInfo}
    role="button"
    tabindex="0">About This Page</span
  >
  <button onclick={toggleTheme}>
    <span
      class="icon-wrapper"
      role="button"
      tabindex="0"
      aria-label="Toggle Theme"
      aria-pressed="false">{getIcon(theme)}</span
    >
  </button>
</nav>

<div class="main">
  {#key currentPage}
    {#if currentPage === 'OrmOne'}
      <OrmOne bind:pageInfo={togglePageInfo} />
    {:else if currentPage === 'OrmThree'}
      <OrmThree bind:pageInfo={togglePageInfo} />
    {/if}
  {/key}
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
  .icon-wrapper {
    /* 1. Reset all browser-default button styles */
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;

    /* 2. Act as a clean layout wrapper for the icon */
    display: inline-flex;
    align-items: center;
    justify-content: center;

    /* Avoid text selection highlights in the UI */
    user-select: none;
  }

  /* 3. Handle focus states gracefully within VS Code styling themes */
  .icon-wrapper:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: 2px;
  }
</style>
