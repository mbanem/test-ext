<script lang="ts">
  import { vscode, type TPayload } from '$lib/utils/event-handler.browser'

  function postMessage(command: string, payload: TPayload) {
    vscode.postMessage({ command, payload })
  }

  let dbName = 'aquatica'
  let dbOwner = 'mili'
  let dbOwnerPassword = 'password'
  let dbHost = 'localhost'
  let dbPort = '5173'

  function installORMPartOne() {
    if (dbName && dbOwner && dbOwnerPassword) {
      postMessage('installPrismaPartOne', {
        dbName,
        dbOwner,
        dbOwnerPassword,
        dbHost: dbHost ?? 'localhost',
        dbPort: dbPort ?? '5173',
      })
    }
  }
</script>

<div class="container">
  <pre id="installPartOneId" class="part-one">
      <h3>Prisma Installation Part One</h3>
The Extension 'Create CRUD Form Support' found that Prisma ORM is not installed in
the project; it can help with installing it. In the first part of the installation
it will add all the necessary packages and instantiate Prisma in this project by
installing a very basic schema in /prisma/schema.prisma file at the project's root.
  <div class="dbname-block">
    <label for="dbNameId">
      Database Name
      <br /><input
          bind:value={dbName}
          type="text"
          placeholder="avoid dashes in db-name"
        />
    </label>
    <label for="dbOwnerId">
      Database Owner
      <br /><input bind:value={dbOwner} type="text" />
    </label>
    <label for="dbOwnerPasswordId">
      Owner's Password
      <br /><input bind:value={dbOwnerPassword} type="password" />
    </label>
    <label for="dbHostId">
      Host Name
      <br /><input bind:value={dbHost} type="string" />
    </label>
    <label for="dbPortId">
      Communication Port
      <br /><input bind:value={dbPort} type="number" />
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

  <button onclick={installORMPartOne} style="margin-left:4rem;"
      >Install Prisma ORM</button
    ><button id="cancelPartOneBtnId">Cancel</button>
</pre>
</div>

<style lang="scss">
  .container {
    margin: 2rem 0 0 5rem;
  }
  pre {
    grid-column: 1 / span 2;
    text-align: justify;
    font-size: 12px;
    color: navy;
  }

  input[type='text'] {
    width: 18rem;
    height: 20px;
    padding: 6px 0 8px 1rem;
    outline: none;
    font-size: 16px;
    border: 1px solid gray;
    border-radius: 4px;
    outline: 1px solid transparent;
    margin-top: 8px;
    margin-bottom: 10px;
  }

  input[type='text']:focus {
    outline: 1px solid gray;
  }

  button {
    display: inline-block;
    margin: 1rem 1rem 1rem 0;
    background-color: navy;
    color: yellow;
    border: 1px solid gray;
    border-radius: 5px;
    font-size: 12px;
    cursor: pointer;
    padding: 3px 1rem;
    user-select: none;
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
    padding: 0;

    label {
      width: 10rem;
      padding: 0;
      margin: 0 1rem 6px 0;
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
</style>
