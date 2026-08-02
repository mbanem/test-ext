<script lang="ts">
  import { onMount } from 'svelte'
  import { vscode } from '$lib/utils/event-handler.browser'
  // import HoveringDetails from '$lib/components/HoverableDetails.svelte'
  import ConfigurationRequired from '$lib/components/ConfigurationRequired.svelte'
  import CRShowTooltip from '$lib/components/CRShowTooltip.svelte'

  // ====================== Props ======================
  type TProps = {
    pageInfo?: () => void
  }
  let { pageInfo = $bindable() }: TProps = $props()

  // ====================== State ======================
  let crShowMessage: CRShowTooltip

  let isInstalling = $state(false)
  let isOpen = $state(false)
  let schemaInEditorTab = $state(false)
  let progressPercents = $state(0)
  let statusMessage = $state('Ready to install Prisma')
  let approvalPackages = $state<string[]>([])
  let logs = $state<{ type: 'stdout' | 'stderr'; text: string }[]>([])

  let useOnlyBuiltDependencies = $state(true)
  let mandatoryEl: HTMLDivElement

  // Progress reporting
  type ProgressCategory =
    | 'progress'
    | 'dependencies'
    | 'devDependencies'
    | 'node_modules'
    | 'warnings'
    | 'other'

  let progressData = $state<Record<ProgressCategory, string[]>>({
    progress: [],
    dependencies: [],
    devDependencies: [],
    node_modules: [],
    warnings: [],
    other: [],
  })

  let lastUpdated = $state<Record<string, number>>({})

  let db = $state({
    name: 'dbrony',
    owner: 'rony',
    password: 'rony',
    host: 'localhost',
    port: 5432,
    adminName: '',
    adminPwd: '',
  })

  let isButtonDisabled = $derived(
    !(db.name && db.owner && db.password) || isInstalling,
  )

  // ====================== Page Info ======================
  let isActive = $state(false)

  function showMandatoryEntries(e: MouseEvent) {
    if (e.type === 'mouseenter' && !(db.adminName || db.adminPwd)) {
      crShowMessage.showTooltip(e, mandatoryEl, 'below', {
        backgroundColor: 'navy',
        color: 'tomato',
      })
    } else if (e.type === 'mouseleave') {
      crShowMessage.hideMessage()
    }
  }

  function handlePageInfo() {
    isActive = !isActive
  }
  pageInfo = handlePageInfo

  // ====================== Helpers ======================
  function categorizeProgressLine(line: string): ProgressCategory {
    const trimmed = line.trim().toLowerCase()

    if (trimmed.startsWith('progress:')) return 'progress'
    if (trimmed.includes('dependencies:')) return 'dependencies'
    if (trimmed.includes('devdependencies:')) return 'devDependencies'
    if (trimmed.includes('node_modules')) return 'node_modules'
    if (trimmed.includes('warn') || trimmed.includes('issues with peer')) {
      return 'warnings'
    }
    return 'other'
  }

  // ====================== Actions ======================
  function startPrismaInstall() {
    isInstalling = true
    isOpen = false
    progressPercents = 0
    logs = []
    statusMessage = 'Starting installation...'

    // Reset progress data
    progressData = {
      progress: [],
      dependencies: [],
      devDependencies: [],
      node_modules: [],
      warnings: [],
      other: [],
    }
    lastUpdated = {}

    vscode.postMessage({
      command: 'prismaPartOne',
      useOnlyBuiltDependencies,
      dbParams: JSON.stringify({
        name: db.name,
        owner: db.owner,
        password: db.password,
        host: db.host || 'localhost',
        port: db.port || 5432,
        adminName: db.adminName,
        adminPwd: db.adminPwd,
      }),
    })
  }

  function approvePackage(pkg: string, event: MouseEvent) {
    const button = event.target as HTMLButtonElement
    button.disabled = true
    vscode.postMessage({ command: 'approveBuildPackage', package: pkg })
  }

  function approveAll() {
    vscode.postMessage({ command: 'approveAllBuildPackages' })
  }

  function closeTheApp() {
    vscode.postMessage({ command: 'close' })
  }

  // ====================== Lifecycle ======================
  onMount(() => {
    vscode.postMessage({ command: 'checkOnPendingFile' })

    const handler = (event: MessageEvent) => {
      const msg = event.data

      switch (msg.command) {
        case 'schemaAndEnvInEditorTabs':
          schemaInEditorTab = true
          break

        case 'prismaProgress':
          progressPercents = msg.percent ?? 0
          statusMessage = msg.message ?? ''

          if (msg.rawLine) {
            const category = categorizeProgressLine(msg.rawLine)
            progressData[category] = [...progressData[category], msg.rawLine]
            lastUpdated[category] = Date.now()
          }
          break

        case 'prismaLog':
          logs = [...logs, { type: msg.type, text: msg.text }]
          break

        case 'prismaInstallError':
          isInstalling = false
          statusMessage = `${msg.message} - ${msg.error || ''}`
          break

        case 'prismaBuildApprovalNeeded':
          approvalPackages = msg.packages || []
          break

        case 'prismaInstallSuccess':
          isInstalling = false
          progressPercents = 100
          statusMessage = msg.message
          break
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  })
</script>

<CRShowTooltip bind:this={crShowMessage} />

{#if isActive}
  <div class="page-info">
    <pre>
This page appears because Prisma ORM is not fully set up yet.

1. Fill in the database parameters.
2. Click "Install Prisma + Dependencies".
3. Review the generated schema.prisma and .env files.
    </pre>
  </div>
{/if}

{#if schemaInEditorTab}
  <ConfigurationRequired />
  <button onclick={() => (schemaInEditorTab = false)}>I'll work on it</button>
  <button onclick={closeTheApp}>Close and restart later</button>
{:else}
  <div class="db-params-block">
    <details bind:open={isOpen}>
      <summary class="summary">Parameters for Creating Database</summary>

      <div class="dbname-block">
        <label>
          Database Name
          <input bind:value={db.name} type="text" placeholder="e.g. myapp" />
        </label>

        <label>
          Database Owner
          <input bind:value={db.owner} type="text" />
        </label>

        <label>
          Owner's Password
          <input bind:value={db.password} type="password" />
        </label>

        <label>
          Host
          <input bind:value={db.host} type="text" />
        </label>

        <label>
          Port
          <input bind:value={db.port} type="number" />
        </label>

        <p>
          <strong>Admin Credentials</strong> (required to auto-create role & DB)
        </p>

        <label>
          Admin Name
          <input bind:value={db.adminName} type="text" />
        </label>

        <label>
          Admin Password
          <input bind:value={db.adminPwd} type="password" />
        </label>
      </div>
    </details>

    <button
      class="button-install"
      onclick={startPrismaInstall}
      onmouseenter={showMandatoryEntries}
      onmouseleave={showMandatoryEntries}
      disabled={isButtonDisabled}
    >
      {#if isInstalling}
        <span class="spinner"></span>
      {/if}
      Install Prisma + Dependencies
    </button>

    <button class="button-close" onclick={closeTheApp}>Close</button>

    {#if isInstalling || progressPercents > 0}
      <div class="progress-container">
        <progress value={progressPercents} max="100"></progress>
        <p>{progressPercents}% — {statusMessage}</p>
      </div>
    {/if}
  </div>

  <!-- ========== Improved Progress Reporting ========== -->
  <div class="progress-sections">
    {#each Object.entries(progressData) as [category, lines]}
      {#if lines.length > 0}
        <details open={Date.now() - (lastUpdated[category] || 0) < 4000}>
          <summary>
            {category}
            {#if Date.now() - (lastUpdated[category] || 0) < 4000}
              <span class="new-badge">new</span>
            {/if}
          </summary>

          <div class="lines">
            {#each lines as line}
              <p>{line}</p>
            {/each}
          </div>
        </details>
      {/if}
    {/each}
  </div>

  {#if approvalPackages.length > 0}
    <div class="approval-section">
      <p>
        <strong>Some packages require approval to run build scripts:</strong>
      </p>
      <ul>
        {#each approvalPackages as pkg (pkg)}
          <li>
            <button onclick={(e) => approvePackage(pkg, e)}>{pkg}</button>
          </li>
        {/each}
      </ul>
      <button onclick={approveAll}>Approve All</button>
    </div>
  {/if}
{/if}
<!-- tooltip message -->
<div bind:this={mandatoryEl} class="mandatory-entries">
  <p>Without Admin Credentials for Managing DB</p>
  <p>Role and Database cannot be created automatically.</p>
  <p>Prisma may be left in an incomplete state.</p>
</div>

<style lang="scss">
  .progress-sections {
    margin-top: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;

    details {
      border: 1px solid var(--border-color, #555);
      border-radius: 6px;
      padding: 0.4rem 0.6rem;
      background-color: var(--candidate-bg-color);

      summary {
        cursor: pointer;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 0.5rem;

        .new-badge {
          background: #3b82f6;
          color: white;
          font-size: 0.7rem;
          padding: 1px 6px;
          border-radius: 999px;
        }
      }

      .lines {
        margin-top: 0.5rem;
        max-height: 180px;
        overflow-y: auto;

        p {
          margin: 0.15rem 0;
          font-size: 0.85rem;
          white-space: pre-wrap;
        }
      }
    }
  }

  .mandatory-entries {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 16rem;
    padding: 0.5rem;
    margin: 0;
    border: 1px solid gray;
    border-radius: 4px;
    opacity: 0;
    p {
      padding: 0;
      margin: 0;
    }
  }
</style>
