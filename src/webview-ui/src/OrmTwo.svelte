<script lang="ts">
  import { onMount } from 'svelte'
  import { createEventHandler, resolveElement } from './lib/utils'
  import { vscode, type TPayload } from '$lib/utils/event-handler.browser'

  function postMessage(command: string, payload?: TPayload) {
    vscode.postMessage({ command, payload })
  }
  const eh = createEventHandler()
  let button: HTMLButtonElement | null = null
  onMount(() => {
    button = resolveElement('installPartTwoBtnId') as HTMLButtonElement
    button?.addEventListener('click', () => {
      postMessage('installPrismaPartTwo')
    })
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
  </pre>

  <button id="installPartTwoBtnId"> Continue </button><button
    id="cancelPartTwoBtnId">Cancel</button
  >
</div>

<style lang="scss">
  .container {
    margin: 2rem 0 0 5rem;
  }
  pre {
    font-size: 14px;
    color: navy;
    /*text-align: justify;*/
    font-size: 12px;
    /*color: var(--pre-color);*/
  }
  button {
    width: 5rem;
    padding: 2px 0;
    text-align: center;
    &:last-child {
      margin-left: 1rem;
    }
  }
</style>
