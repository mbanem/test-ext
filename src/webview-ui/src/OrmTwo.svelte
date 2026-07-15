<script lang="ts">
  import { onMount } from 'svelte'
  import { type Theme, getInitialTheme } from '$lib/utils/toggle-theme'
  // import { createEventHandler, resolveElement } from './lib/utils'
  // import { resolveElement } from './lib/utils'
  import { vscode } from '$lib/utils/event-handler.browser'

  type TProps = {
    pageInfo: TToggleFunc
  }
  let { pageInfo = $bindable() }: TProps = $props()
  let isActive = $state(false)
  function handlePageInfo() {
    isActive = isActive ? false : true
  }
  pageInfo = handlePageInfo as TToggleFunc

  function postMessage(command: string, payload?: Payload) {
    console.log('[OrmTwo] to postMessage', command, payload)
    vscode.postMessage({ command, payload })
    console.log('[OrmTwo] postMessage done', command, payload)
  }
  // const eh = createEventHandler()
  // let button: HTMLButtonElement | null = null

  let canContinue = 'Files schema.prisma and connection string are valid'
  let buttonStartPartTwoEl: HTMLButtonElement
  let partTwoMsgEl: HTMLParagraphElement
  let partTwoMessage = $state('schema.prisma and .env connection string status')

  // -------- toggle theme begin ---------
  let currentTheme: Theme = $state('light') // Svelte 5 runes syntax
  let mounted = $state(false)

  // Apply theme to document
  export function applyTheme() {
    document.documentElement.classList.add(currentTheme)
  }
  // Toggle theme
  export function toggleTheme() {
    document.documentElement.classList.remove(currentTheme)
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', currentTheme)
    applyTheme()
  }

  // TODO Listen for system theme changes -- does not work
  $effect(() => {
    if (!mounted) return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      // Only auto-change if user hasn't manually selected a theme
      if (!localStorage.getItem('theme')) {
        currentTheme = e.matches ? 'dark' : 'light'
        applyTheme()
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  })
  // Get saved preference or system preference
  // function getInitialTheme(): Theme {
  //   // if (!browser) return 'light'

  //   const saved = localStorage.getItem('theme') as Theme | null
  //   if (saved) return saved

  //   return window.matchMedia('(prefers-color-scheme: dark)').matches
  //     ? 'dark'
  //     : 'light'
  // }

  // // Toggle theme
  // function toggleTheme() {
  //   currentTheme = currentTheme === 'dark' ? 'light' : 'dark'
  //   localStorage.setItem('theme', currentTheme)
  //   applyTheme()
  // }
  // -------- toggle theme end ---------
  // function startPrismaPartTwo() {
  //   console.log('[OrmOne] startPrismaPartTwo')
  //   vscode.postMessage({
  //     command: 'showPage',
  //     page: 'OrmTwo',
  //   })
  // }
  function prismaPartTwo() {
    console.log('[OrmOne] postCommand "prismaPartTwo"')
    postMessage('prismaPartTwo', {
      payload: 'do prisma init and call OrmPageThree',
    })
  }
  function closeTheApp() {
    console.log('[OrmOne] postMessage "close" who is listening?')
    postMessage('close', { payload: 'close the extension' })
  }
  function setMessage(msg: string) {
    partTwoMsgEl.innerText = msg
    partTwoMsgEl.style.color = msg === canContinue ? 'lightgreen' : 'tomato'
    partTwoMsgEl.classList.remove('hidden')
  }
  onMount(() => {
    console.log('[OrmTwo] onMount')
    // -------- toggle theme begin ---------

    currentTheme = getInitialTheme()
    applyTheme()
    toggleTheme()
    mounted = true
    // -------- toggle theme end ---------

    const handler = (event: MessageEvent) => {
      const msg = event.data
      console.log('[OrmTwo] got message', msg.command)
      switch (msg.command) {
        case 'prismaLog':
          console.log('[OrmTwo] prismaLog', msg.text)
          break
        case 'enableContinueButton':
          // buttonStartPartTwoEl.classList.remove('hidden')
          setMessage(canContinue)
          break
        case 'notValidSchemaOrEnv':
          const { modelsLength, connOK } = msg.payload
          // buttonStartPartTwoEl.classList.add('hidden')
          let message =
            modelsLength === 0
              ? 'Prisma schema is not valid'
              : !connOK
                ? 'Connection string in .env is not valid'
                : setMessage(canContinue)
          setMessage(message as string)
          break
        case 'noSchemaOrEnvDoc':
          setMessage(msg.payload)
          break
      }
    }
    window.addEventListener('message', handler)
    console.log('[OrmTwo] mounted event listener for "message"')

    return () => {
      window.removeEventListener('message', handler)
    }
  })
</script>

{#snippet pagePurpose()}
  <pre>
    This page is the second part of the Prisma installation process. 
    It assumed that schema.prisma contains the final models/tables to
    be created in the database created in the Prisma Part One, and that
    the connection string contains walid database name, owner name and
    its password. 
    The extension will issue the final commands for installing Prisma ORM; 
    otherwise you can enter the following commands yourself.

    pnpx prisma migrate dev --name init  # create first migration (when ready)
    pnpx prisma generate
  </pre>
{/snippet}
{#if isActive}
  <div class="page-info" style="position:absolute;top:5px;left:0;z-index:200;">
    {@render pagePurpose()}
  </div>
{/if}
<div class="container">
  <h3>Prisma Installation Part Two</h3>

  <pre>
  By selecting the continue button the extension will issue the final commands 
  for installing Prisma ORM; otherwise click the 'About This Page' at navigation
  bar for commands to be issued manually. 
  
  After successful installation, the extension will switch to the next page for 
  selecting models/tables to be used to create complete CRUD functionality in 
  the application.

</pre>
  <button onclick={prismaPartTwo}> Continue </button><button
    onclick={closeTheApp}>Close</button
  >

  <p
    bind:this={partTwoMsgEl}
    class="hidden"
    style="color:var(--candidate-color);background-color:var(--candidate-bg-color);"
  >
    {partTwoMessage}
  </p>
</div>

<style lang="scss">
  .container {
    height: 98vh;
    width: 98vw;
    // margin: 2rem 0 0 5rem;
    margin: 0;
    padding: 1rem 0 0 2rem;
    // background-color: var(--bg);
    color: var(--text);
  }
  .page-info {
    @include page-info();
    z-index: 2027;
  }
  .button-start-prisma-part-two {
    display: inline-block;
    outline: none;
    border: 1px solid gray;
    border-radius: 5px;
    font-weight: 400;
    color: var(--candidate-color);
    background-color: var(--candidate-bg-color);
    width: max-content;
    height: 1.6rem;
    padding: 2px 1rem 2px 1rem;
    cursor: pointer;
  }

  pre {
    margin: 2px 0;
    font-size: 0.9em;
    white-space: pre-wrap;
    color: var(--pre-color);
    // color: var(--candidate-color);
    background-color: var(--candidate-bg-color);
  }
  // button {
  //   width: 5rem;
  //   padding: 2px 0;
  //   text-align: center;
  //   &:last-child {
  //     margin-left: 1rem;
  //   }
  // }
  // .theme-icon {
  //   position: absolute;
  //   top: 4rem;
  //   left: 41rem;
  // }
</style>
