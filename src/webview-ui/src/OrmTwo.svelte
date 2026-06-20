<script lang="ts">
  import { onMount } from 'svelte'
  import { type Theme, getInitialTheme } from '$lib/utils/toggle-theme'
  // import { createEventHandler, resolveElement } from './lib/utils'
  import { resolveElement } from './lib/utils'
  import { vscode } from '$lib/utils/event-handler.browser'

  function postMessage(command: string, payload?: Payload) {
    vscode.postMessage({ command, payload })
  }
  // const eh = createEventHandler()
  let button: HTMLButtonElement | null = null

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

  onMount(() => {
    button = resolveElement('installPartTwoBtnId') as HTMLButtonElement
    button?.addEventListener('click', () => {
      postMessage('prismaPartTwo')
    })
    // -------- toggle theme begin ---------

    currentTheme = getInitialTheme()
    applyTheme()
    toggleTheme()
    mounted = true
    // -------- toggle theme end ---------
  })
</script>

<div class="container">
  <h3>Prisma Installation Part Two</h3>

  <pre>
  By selecting the continue button the extension will issue the final commands 
  for installing Prisma ORM; otherwise you can enter the following commands yourself 
  DBNAME="MyDBNAME" # your database name 
  DBOWNER='JohnDoe' # the name of the database owner
  sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DBNAME;" 
  
  createdb "$DBNAME" -U "$DBOWNER" 
  "GRANT ALL ON SCHEMA public TO $DBOWNER; GRANT CONNECT ON DATABASE $DBNAME TO $DBOWNER;" 
  sudo -u postgres psql -d "$DBNAME" -c "GRANT ALL PRIVILEGES ON SCHEMA public TO $DBOWNER; 
  ALTER SCHEMA public OWNER TO $DBOWNER; ALTER DATABASE dbtest OWNER TO $DBOWNER;" 
  sudo -u postgres psql -d "$DBNAME" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA
  public GRANT ALL ON TABLES TO $DBOWNER; ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO $DBOWNER;"

  pnpx prisma migrate dev --name init  # create first migration (when ready)
  pnpx prisma generate
  
  <button id="installPartTwoBtnId"> Continue </button><button
      id="cancelPartTwoBtnId">Cancel</button
    >
</pre>
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
  pre {
    color: var(--pre-color);
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
