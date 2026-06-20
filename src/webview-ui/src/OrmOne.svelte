<script lang="ts">
  import { vscode } from '$lib/utils/event-handler.browser'

  export function setupOrmTwoMessageHandler(webview: vscode.Webview) {
    webview.onDidReceiveMessage(async (message: any) => {
      if (message === 'prismaPartTwo' || message.command === 'prismaPartTwo') {
        await installPrisma(webview)
      }
    })
  }
  let inAction = $state(false)
  function postMessage(command: string, payload: string) {
    vscode.postMessage({ command, payload })
  }

  let db: DbParams = $state({
    name: 'dbrony',
    owner: 'rony',
    password: 'rony',
    host: 'localhost',
    port: 5432,
  })
  // let name = $state('dbrony')
  // let owner = $state('rony')
  // let password = $state('rony')
  // let host = $state('localhost')
  // let port = $state('5432')
  let isButtonDisabled: boolean = $derived(
    !(db.name && db.owner && db.password),
  )
  function installORMPartOne() {
    // params are OK as button is disabled othervise
    const db_: DbParams = {
      name: db.name,
      owner: db.owner,
      password: db.password,
      host: db.host ?? 'localhost',
      port: db.port ?? '5432',
    }
    postMessage('prismaPartOne', JSON.stringify(db_))

    // prepsre to listen for 'partOneDone' response
    const messageHandler = (event: MessageEvent) => {
      const msg = event.data
      alert(`OrmOne got response  ${msg}`)

      if (msg.command === 'partOneDone') {
        inAction = false
        alert(`OrmOne received partOneDone success: ${msg.success}`)
        // though the emitter window would do it we would be removing the listener
        window.removeEventListener('message', messageHandler)
      }
    }
    // window.addEventListener('message', messageHandler)
    window.addEventListener('message', messageHandler, { once: true }) // ← use once: true
    setTimeout(() => {
      inAction = true
    }, 300)
  }
</script>

<div class="theme-container">
  <div class="container">
    <pre id="installPartOneId">
      <h3>Prisma Installation Part One</h3>
The Extension 'Create CRUD Form Support' found that Prisma ORM is not installed in
the project; it can help with installing it. In the first part of the installation
it will add all the necessary packages and instantiate Prisma in this project by
installing a very basic schema in /prisma/schema.prisma file at the project's root.
    <div class="dbname-block">
      <label for="dbNameId">
        Database Name
        <br /><input
            bind:value={db.name}
            type="text"
            placeholder="avoid dashes in db-name"
          />
      </label>
      <label for="dbOwnerId">
        Database Owner
        <br /><input bind:value={db.owner} type="text" />
      </label>
      <label for="dbOwnerPasswordId">
        Owner's Password
        <br /><input bind:value={db.password} type="password" />
      </label>
      <label for="dbHostId">
        Host Name
        <br /><input bind:value={db.host} type="string" />
      </label>
      <label for="dbPortId">
        Communication Port
        <br /><input bind:value={db.port} type="number" />
      </label>
    </div>

By specifying database name, database owner name and owner's password the Extension will
set the database connection string in the .env file and install with no interaptions.
It will open schema.prisma and .env contents in separate windows and a continue button, 
waiting for you to 
  -  Specify your Prisma models/tables replacing the current schema.prisma content
  -  Specify the connection string in the opened .env file if not set by the Extension
When you are done select the continue button to finish the installation.
If you prefer to close the Extension, in order to finish the above tasks, you could
restart the Extension after that and it will display the commands that you should
enter yourself or to select the continue button to allow the Extension to finish the 
installation.

    <!-- <div class='install-button'
        onclick={installORMPartOne}
        style="margin-left:4rem;"
        disabled={isButtonDisabled}>
        <span class:spinner={inAction}></span>
      Install Prisma ORM
    </div>
      <div id="cancelPartOneBtnId">Cancel</div> -->
    <button
        id="install-button"
        onclick={installORMPartOne}
        style="font-size: 14px !important;cursor:pointer;margin:0'"
        aria-hidden={true}
        disabled={isButtonDisabled}>
      <span class:spinner={inAction}></span>
      Create CRUD Support
    </button>





    </pre>
  </div>
</div>

<style lang="scss">
  .container {
    margin: 2rem 0 0 5rem;
  }
  pre {
    grid-column: 1 / span 2;
    text-align: justify;
    line-height: 1rem;
  }
  .spinner {
    display: inine-block;
    width: 1em;
    height: 1em;
    border: 3px solid #a1c1eb;
    border-top-color: #1b4891;
    border-radius: 50%;
    animation: spin 900ms linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  // input[type='text'] {
  //   width: 18rem;
  //   height: 20px;
  //   padding: 6px 0 8px 1rem;
  //   outline: none;
  //   font-size: 16px;
  //   border: 1px solid gray;
  //   border-radius: 4px;
  //   outline: 1px solid transparent;
  //   margin-top: 8px;
  //   margin-bottom: 10px;
  // }

  // input[type='text']:focus {
  //   outline: 1px solid gray;
  // }

  button {
    display: grid;
    grid-template-columns: minmax(1.2em, 1.2em) 9rem;
    place-items: center;
    gap: 0;
    position: absolute;
    top: 20rem;
    left: 1.2rem;
    outline: none;
    border: 1px solid gray;
    border-radius: 5px;
    font-weight: 400;
    color: var(--candidate-color);
    background-color: var(--candidate-bg-color);
    margin: 6rem 6.5rem;
    width: max-content;
    padding: 2px 5px 2px 0;
    cursor: pointer;
  }

  /* .hidden {
    display: none;
  } */
  .dbname-block {
    @include container($head: 'Database Parameters', $head-color: navy);
    display: grid;
    grid-template-columns: repeat(3, 12rem);
    column-gap: 0.2rem;
    margin: 0;
    padding: 1rem;

    label {
      width: 10rem;
      padding: 0;
      margin: 0 1rem 6px 0;
      color: var(--candidate-color);
    }

    input {
      width: 11rem;
      margin: 0;
      padding: 3px 0 3px 0.5rem !important;
      border: 1px solid lightgray;
      border-radius: 3px;

      &:focus {
        outline: 1px solid skyblue;
      }
    }
  }
  .theme-container {
    height: 98vh;
    width: 98vw;
    // background-color: var(--bg);
    color: var(--text);
    margin: 0;
    padding: 0;
    transition:
      background 0.4s ease,
      color 0.4s ease;
  }
  // .theme-icon {
  //   position: absolute;
  //   top: 4rem;
  //   left: 41rem;
  // }
</style>
