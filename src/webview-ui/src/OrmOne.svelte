<script lang="ts">
  import { vscode } from '$lib/utils/event-handler.browser'
  import { onMount } from 'svelte'
  const RX =
    /^Progress:|\.\.\.\/node_modules\/|dependencies:|devDependencies:|\+ /
  let currentDetailsEl: HTMLDetailsElement | undefined = $state()
  let rlCounter = $state(0)
  let rawLinesEl: HTMLDetailsElement
  let depEl: HTMLDetailsElement
  let devDepEl: HTMLDetailsElement
  let follow = $state('') // dependencies | devDependencies
  let useOnlyBuiltDependencies = $state(true) // Default: safe for most users
  let approvalPackages = $state<string[]>([])
  let progressPercents = $state(0)
  let statusMessage = $state('Ready to install Prisma')
  let isInstalling = $state(false)
  let logs: { type: 'stdout' | 'stderr'; text: string }[] = $state([])
  let progressLineEl: HTMLParagraphElement
  let nodeModulesEl: HTMLDetailsElement
  let checkThisEl: HTMLDetailsElement
  let otherLinesEl: HTMLDetailsElement
  let installPrismaButton: HTMLButtonElement
  // let continueButton: HTMLButtonElement

  let db: DbParams = $state({
    name: 'dbrony',
    owner: 'rony',
    password: 'rony',
    host: 'localhost',
    port: 5432,
  })

  let isButtonDisabled: boolean = $derived(
    !(db.name && db.owner && db.password),
  )

  let pEl: HTMLParagraphElement
  // begin of parsing progress rawLine for kind ot output
  // what does this page do handler
  type TProps = {
    pageInfo: TToggleFunc
  }
  let { pageInfo = $bindable() }: TProps = $props()
  let isActive = $state(false)

  function handlePageInfo() {
    isActive = isActive ? false : true
  }
  pageInfo = handlePageInfo as TToggleFunc
  // end of what does this page do handler

  const inputStyle =
    'display: block;width: 18rem;height: 1.5rem !important;margin: 8px 0 10px 0;padding: 6px 0 8px 1rem;border-radius: 4px;outline: none;'

  function startPrismaInstall() {
    installPrismaButton.classList.add('hidden')
    isInstalling = true
    progressPercents = 0
    logs = []
    statusMessage = 'Starting installation...'
    const db_: DbParams = {
      name: db.name,
      owner: db.owner,
      password: db.password,
      host: db.host ?? 'localhost',
      port: db.port ?? '5432',
    }
    console.log('[OrmOne] postCommand prismaPartOne')
    vscode.postMessage({
      command: 'prismaPartOne',
      useOnlyBuiltDependencies,
      dbParams: JSON.stringify(db_),
    })
  }

  function approvePackage(e: MouseEvent, pkg: string) {
    let button = e.target as HTMLButtonElement
    button.disabled = true
    button.style.cursor = 'not-allowed'
    vscode.postMessage({ command: 'approveBuildPackage', package: pkg })
  }

  function approveAll() {
    const container = document.querySelector(
      '.approval-section',
    ) as HTMLDivElement

    if (container) {
      // 1. Get the buttons directly with the correct TypeScript type
      const buttons = container.getElementsByTagName('button')

      // 2. Loop through the collection using Array.from()
      Array.from(buttons).forEach((button) => {
        button.disabled = true
        button.style.cursor = 'not-allowed'
      })
    }
    vscode.postMessage({ command: 'approveAllBuildPackages' })
  }
  function appendLine(el: HTMLDetailsElement, line: string) {
    if (currentDetailsEl) {
      currentDetailsEl.open = false
    }
    el.open = true
    if (rawLinesEl.open) {
      rawLinesEl.open = false
    }
    const pel = document.createElement('p')
    el.appendChild(pel)
    Object.assign(pel.style, { padding: 0, margin: 0 })
    pel.textContent = line
  }

  function closetheApp() {
    console.log(
      '[OrmOne] closetheApp',
      vscode ? 'vscode is defined' : 'vscode is undefined',
    )
    vscode.postMessage({
      command: 'close',
      payload: 'close the extension',
    })
  }
  onMount(() => {
    vscode.postMessage({
      command: 'showInfo',
      payload: '[OrmOne] onMount test message',
    })
    window.addEventListener('message', (event) => {
      const msg = event.data
      // console.log('[OrmOne] listener msg', msg)
      vscode.postMessage({
        command: 'progress',
        payload: `[OrmOne] listener ${msg.command}`,
      })
      switch (msg.command) {
        case 'prismaInstallStart':
          break
        case 'prismaPartOneDone':
          console.log('[OrmOne] got message', msg.command, msg.payloads)
          // console.log('[OrmOne] postMessage prismaPartTwo')
          // vscode.postMessage({
          //   command: 'prismaPartTwo',
          //   payload: 'sent from OrmOne after receviing prismaPartOneDone',
          // })
          break
        case 'notValidSchemaOrEnv':
          console.log('[OrmOne] invalid models or env', msg)
          break
        case 'prismaProgress':
          progressPercents = msg.percent
          statusMessage = msg.message
          const rl = msg.rawLine
          pEl = document.createElement('p')
          rawLinesEl.appendChild(pEl)
          if (rl.includes('[WARN] Issues with peer dependencies found.')) {
            appendLine(checkThisEl, rl)
          }
          ++rlCounter
          if (rlCounter === 1) {
            rawLinesEl.open = true
          }
          Object.assign(pEl.style, { padding: 0, margin: 0 })
          pEl.textContent = rl
          const m = RX.exec(rl)
          if (m) {
            switch (m[0]) {
              case 'Progress:':
                progressLineEl.innerText = rl
                break
              case '.../node_modules/':
                appendLine(nodeModulesEl, rl.slice(17))
                break
              case 'dependencies:':
                follow = 'dependencies'
                // depEl.innerText = 'dependencies'
                break
              case 'devDependencies:':
                follow = 'devDependencies'
                // devDepEl.innerText = 'devDependencies'
                break
              case '+ ':
                if (follow === 'dependencies') {
                  appendLine(depEl, rl)
                }
                if (follow === 'devDependencies') {
                  appendLine(devDepEl, rl)
                }
                break
              default:
                if (follow) {
                  follow = ''
                }
                if (rl.includes('check')) {
                  appendLine(checkThisEl, rl)
                  checkThisEl.classList.remove('hidden')
                } else {
                  appendLine(otherLinesEl, rl)
                }
                break
            }
          }
          break
        case 'prismaLog':
          logs = [...logs, { type: msg.type, text: msg.text }]
          // Optional: auto-scroll to bottom
          break
        case 'prismaInstallError':
          isInstalling = false
          statusMessage = msg.message + ' - ' + msg.error
          console.log('[OrmOne] prismaInstallError msg', msg)
          break
        case 'prismaBuildApprovalNeeded':
          approvalPackages = msg.packages || []
          break

        case 'prismaInstallSuccess':
          console.log('[OrmOne] prismaInstallSuccess msg', msg)
          isInstalling = false
          progressPercents = 100
          statusMessage = msg.message
          console.log('[OrmOne] sent prismaInstallSuccess msg', msg)

          break

        case 'prismaPartOneFailed':
          console.log('[OrmOne] prismaPartOne failed')
          break
      }
    })
  })
</script>

{#snippet pagePurpose()}
  <pre>
    
This page is shown as the Prisma ORM is not installed in this app.
You can proceed with the installation or close the extension and
do the installation yourself.

<span>In the screen First Part</span>

When clicking 'Create database' summary button it opens a panel
for getting the following parameters
  - database name
  - role name as a database owner
  - role's password for connecting and handling database
  - optional server name (default is localhost)
  - optional communication port (default is 5432)

<span>In the screen Second Part</span> 

The 'Install Prisma + Dependencies' button starts the process for
installing Prisma ORM, creating database with given parameters and 
installing the other necessary software packages utilizing current
Package Manager e.g. pnpm.

  </pre>
{/snippet}
{#if isActive}
  <div class="page-info" style="position:absolute;top:5px;left:0;z-index:200;">
    {@render pagePurpose()}
  </div>
{/if}

<div class="buttons-row">
  <details style="position:relative;z-index:2;">
    <summary class="summary">Parameters for Creating Database </summary>
    <div
      class="dbname-block"
      style="border: 1px solid gray;width:19.4rem;padding:0.5rem;
			border-radius: 6px;margin-top:0.1rem;
			color: var(--candidate-color);
			background-color: var(--candidate-bg-color);"
    >
      <label>
        Database Name
        <br /><input
          bind:value={db.name}
          type="text"
          placeholder="avoid dashes in db-name"
          style={inputStyle}
        />
      </label>
      <label for="dbOwnerId">
        Database Owner
        <br /><input
          bind:value={db.owner}
          id="dbOwnerId"
          type="text"
          style={inputStyle}
        />
      </label>
      <label>
        Owner's Password
        <br /><input
          bind:value={db.password}
          type="password"
          style={inputStyle}
        />
      </label>
      <label>
        Host Name
        <br /><input bind:value={db.host} type="text" style={inputStyle} />
      </label>
      <label>
        Communication Port
        <br /><input bind:value={db.port} type="number" style={inputStyle} />
      </label>
    </div>
  </details>

  <button
    bind:this={installPrismaButton}
    cLass="button-install"
    onclick={startPrismaInstall}
    style="font-size: 14px !important;cursor:pointer;margin:0'"
    disabled={isButtonDisabled}
    class:notallowed={isButtonDisabled}
    aria-hidden={true}
  >
    <span class:spinner={isInstalling}></span>
    Install Prisma + Dependencies
  </button>
  <!-- <button bind:this={continueButton} onclick={} class="button-install hidden"
    >Continue</button
  > -->
  <button class="button-close" onclick={closetheApp}>close</button>

  {#if isInstalling || progressPercents > 0}
    <div class="progress-container">
      <progress value={progressPercents} max="100" style="width: 100%;"
      ></progress>
      <p style="padding:0;margin:0;">{progressPercents}% — {statusMessage}</p>
    </div>
  {/if}
</div>

<!-- <div style="border:1px solid red;height:36rem;"> -->
<div class="grid-container">
  <div class="left-column">
    <label class="dependencies-label">
      <input
        type="checkbox"
        bind:checked={useOnlyBuiltDependencies}
        style="display:inline-block;"
      />
      Pre-approve common build dependencies (recommended)
    </label>
    <div class="progress-line">
      <span class="progress-title" style="margin-left:0.5rem;width:93.3%;"
        >Progress</span
      >
      <p bind:this={progressLineEl}></p>
    </div>
    <details bind:this={nodeModulesEl} class="node-modules">
      <summary>node modules</summary>
    </details>
    <details bind:this={rawLinesEl} class="raw-lines">
      <summary>raw lines {rlCounter > 0 ? rlCounter : ''}</summary>
    </details>
    <details bind:this={otherLinesEl} class="other-progress-lines overflow-y">
      <summary>Other Progress Lines</summary>
    </details>
    <details bind:this={checkThisEl} class="check-this" style="height:3.5rem">
      <summary>Check This</summary>
    </details>

    <details bind:this={otherLinesEl} class="other-progress-lines overflow-y">
      <summary>Other</summary>
    </details>
  </div>
  <div class="right-column">
    <details bind:this={depEl} class="dependencies-list overflow-y">
      <summary>Installed dependencies</summary>
    </details>
    <details bind:this={devDepEl} class="dev-dependencies-list overflow-y">
      <summary>Installed devDependencies</summary>
    </details>
  </div>
  <div class="logs">
    <h4>Installation Logs</h4>
    {#each logs as log (log)}
      <pre class={log.type}>{log.text}</pre>
    {/each}
  </div>
</div>

{#if approvalPackages.length > 0}
  <div class="approval-section">
    <p>
      <strong>Some packages require approval to run build scripts:</strong>
    </p>
    <ul>
      {#each approvalPackages as pkg (pkg)}
        <li>
          <button onclick={(e: MouseEvent) => approvePackage(e, pkg)}
            >{pkg}</button
          >
        </li>
      {/each}
    </ul>
    <button onclick={approveAll}>Approve All</button>
  </div>
{/if}

<style lang="scss">
  .page-info {
    @include page-info();
    z-index: 2027;
  }
  div,
  ul,
  p {
    background: var(--bg);
    color: var(--cr-text);
  }
  .progress-container {
    margin: -5px 0 0 0;
    grid-column: span 3;
  }
  .logs {
    margin-top: 20px;
    max-height: 400px;
    overflow-y: auto;
    background: #1e1e1e;
    padding: 10px;
    z-index: 4000;
  }
  pre {
    margin: 2px 0;
    font-size: 0.9em;
    white-space: pre-wrap;
    color: var(--pre-color);
    // color: var(--candidate-color);
    background-color: var(--candidate-bg-color);
  }
  .stderr {
    color: #ff6666;
  }
  button {
    @include button();
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
  .buttons-row {
    position: absolute;
    top: 0;
    left: 0;
    display: grid;
    grid-template-columns: 26rem 13.2rem 5rem;
    grid-auto-rows: 0.6rem;
    align-items: self-start;
    background-color: transparent;
    padding: 0;
    gap: 1rem;

    .button-install {
      display: flex;
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
      span {
        width: 1em;
      }
    }
    .button-close {
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
  }
  .dependencies-label {
    display: inline-block;
    grid-column: span 3;
    margin-left: 0.5rem;
    color: var(--candidate-color);
    background-color: var(--candidate-bg-color);
  }
  .node-modules {
    @include progress-field();
  }
  .raw-lines {
    position: relative;
    @include progress-field();
  }
  .other-progress-lines {
    @include progress-field();
  }
  .check-this {
    @include progress-field();
    :global(p) {
      color: var(--tomato-violet);
    }
  }
  .grid-container {
    position: absolute;
    top: 0.5rem;
    left: 0;
    display: grid;
    grid-template-columns: repeat(2, 40vw);
    gap: 0.4rem;
    margin-top: 4rem;
    .left-column {
      border: 1px solid gray;
      border-radius: 8px;
      font-size: 14px;
      color: var(--candidate-color);
      background-color: var(--candidate-bg-color);
    }
    // .left_column {
    //   .progress-line {
    //     @include progress-field();
    //     margin-top: 0.5rem;
    //   }
    // }
    .right-column {
      .dependencies-list {
        @include progress-field();
        height: 3.5rem;
      }
      .dev-dependencies-list {
        @include progress-field();
        height: 3.5rem;
      }
    }

    .progress-title {
      display: inline-block;
      color: var(--candidate-color);
      background-color: var(--candidate-bg-title-color);
      font-weight: 600;
      width: 95%;
      & ~ p {
        padding-left: 0.5rem;
        font-weight: 400;
      }
    }
    .overflow-y {
      overflow-y: auto;
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
    .hidden {
      display: none;
    }

    // NOTE many css classes do not work so inline styles are often used
    .dbname-block {
      position: absolute;
      top: 2rem;
      left: 0;
      // @include container($head: 'Database Parameters', $head-color: navy);
      margin: 0;
      padding: 1rem;
      label {
        width: 10rem;
        padding: 0;
        margin: 0 1rem 6px 0;
        color: var(--candidate-color);
      }

      input[type='text'],
      input[type='number'] {
        display: block;
        width: 18rem;
        height: 1rem !important;
        margin-bottom: 10px;
        padding: 6px 0 8px 1rem;
        border-radius: 4px;
        outline: none;
      }
    }
  }
  input {
    display: block;
    height: 1rem !important;
    margin-bottom: 10px;
  }
  .summary {
    position: relative;
    /* list-style: none; */
    width: 19.5rem;
    border: 1px solid gray;
    color: var(--candidate-color);
    background-color: var(--candidate-bg-color);
    border-radius: 6px;
    height: 1.6rem;
    padding-left: 0.5rem;
    line-height: 1.5rem;
    cursor: pointer;
    z-index: 1;
  }
  .details {
    position: relative;
    z-index: 1;
    border: 1px solid gray;
    width: 19rem;
    border-radius: 6px;
    padding: 0 0.5rem;
    overflow: hidden;
    transition: all 0.2s ease;
    &[open] {
      z-index: 201;
      height: 14rem;
      overflow-y: auto;
    }
  }
  .hidden {
    display: none;
  }
</style>
