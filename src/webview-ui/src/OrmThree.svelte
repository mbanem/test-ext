<script lang="ts">
  import { vscode } from '$lib/utils/event-handler.browser'
  import { onMount } from 'svelte'
  import CRModelPermissionHandler from '$lib/components/CRModelPermissionHandler.svelte'

  let isLoading = $state(true)
  // const vscode = acquireVsCodeApi()
  let models: Models = $state<Models>({}) as Models
  let inAction = $state(false)
  // when any checkbox on a component model list is selected
  // the component keeps this selectedModels in sync
  let selectedModels = $state<SelectedModels>({})
  let userRoles = $state<string[]>([])
  // what components users want to include in newnly generated pages
  let crComponents: string[] = $state([
    'CRInput',
    'CRSpinner',
    'CRActivity',
    'CRTooltip',
    'CRSummaryDetails',
  ])

  // what authentication/authorization to implement should be optional?
  let appFeatures: string[] = $state([])

  // onclick Create CRUD Support sends models to extension to
  // create individual pages or part of the application
  // function getPayload() {
  //   if (Object.keys(selectedModels).length === 0) {
  //     // return JSON.stringify($state.snapshot(selectedModels))
  //     return selectedModels
  //   }

  //   let payload: Payload = {}
  //   // candidateModels.forEach((modelName) => {
  //   // 	payload[modelName] = $state.snapshot(models[modelName]) as Model;
  //   // });
  //   if (crComponents.length) {
  //     payload['components'] = crComponents
  //   }
  //   for (const key of ['authorization', 'authentication']) {
  //     const el = document.querySelector(
  //       `input[name=${key}]:checked`,
  //     ) as HTMLInputElement
  //     if (el) {
  //       payload[key] = el.value
  //     }
  //   }

  //   if (appFeatures.length) {
  //     payload['features'] = appFeatures
  //   }
  //   payload['selectedModels'] = selectedModels
  //   return JSON.stringify($state.snapshot(payload))
  //   // return $state.snapshot(payload);
  //   // return payload
  // }
  function getPayload() {
    if (Object.keys(selectedModels).length === 0) {
      return selectedModels
    }

    let payload: Payload = {}
    if (crComponents.length) {
      payload['crComponents'] = $state.snapshot(crComponents)
    }
    for (const key of ['authorization', 'authentication']) {
      const el = document.querySelector(
        `input[name=${key}]:checked`,
      ) as HTMLInputElement
      if (el) {
        payload[key] = el.value
      }
    }
    if (appFeatures.length) {
      payload['features'] = $state.snapshot(appFeatures)
    }

    payload['selectedModels'] = $state.snapshot(selectedModels)

    console.log('payload to send', payload)
    console.log('selectedModels in payload', payload.selectedModels)
    return payload
  }

  // Webview sends message to the extension
  function createCRUDSupport(e: MouseEvent) {
    inAction = true
    const el = e.target as HTMLDivElement
    el.style.cursor = 'none'
    let payload = JSON.stringify(getPayload())
    vscode.postMessage({
      command: 'CreateCrudSupport',
      payload: payload,
    })
  }

  let buttonNotAllowed = $derived(Object.keys(selectedModels).length === 0)
  onMount(() => {
    vscode.postMessage({ command: 'ready' })

    window.addEventListener('message', (event) => {
      const msg = event.data

      if (msg.command === 'sendingModels') {
        const pload = $state.snapshot(JSON.parse(msg.payload))
        models = pload.models
        userRoles = Object.keys(Object.values(pload.enums)[0] as TEnum).filter(
          Boolean,
        )
      }
      // if (msg.command === 'confirmationResponse') {
      //   console.log('confirmation not meant for OrmThree.svelte')
      // }
      if (msg.command === 'crudSuportDone') {
        const crudButton = document.getElementById(
          'createBtnId',
        ) as HTMLDivElement
        inAction = false
        crudButton.style.cursor = 'pointer'
      }
      isLoading = false
    })
  })
</script>

<svelte:head>
  <title>CRUD Support</title>
</svelte:head>

{#snippet appIncludes()}
  <label for="Navbar" class="app-labels">
    <input
      type="checkbox"
      id="Navbar"
      value="NavBar"
      bind:group={appFeatures}
    />
    Include navbar in app root +layout.svelte</label
  >
  <label for="ThemeIcon" class="app-labels">
    <input
      type="checkbox"
      id="ThemeIcon"
      value="ThemeIcon"
      bind:group={appFeatures}
    />
    Include dark/light/system theme icon</label
  >

  <div class="radio-check-groups">
    <div class="authentication">
      {#each ['pasword-based', 'multi-factor MFA', 'certificate-based', 'token-based JWT', 'Exlude'] as auth (auth.slice(0, 4))}
        <label>
          <input
            type="radio"
            name="authentication"
            value={auth}
            checked={auth === 'token-based JWT'}
          />
          {auth}
        </label>
      {/each}
    </div>
    <div class="authorization">
      {#each ['JSON Web Tokens JWT', 'API Keys', 'Bearer Tokens', 'Digest Authentication', 'Mutual TLS', 'Exclude'] as auth (auth.slice(0, 4))}
        <label>
          <input
            type="radio"
            name="authorization"
            value={auth}
            checked={auth === 'Bearer Tokens'}
          />
          {auth}
        </label>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet pageByPageMiddleColumn()}
  <div class="cr-left-column">
    {@render appIncludes()}
    <div class="embellishments">
      {#each ['CRInput', 'CRSpinner', 'CRActivity', 'CRTooltip', 'CRSummaryDetails'] as comp (comp)}
        <div class="checkbox-item">
          <label for={comp}
            ><input
              id={comp}
              type="checkbox"
              value={comp}
              bind:group={crComponents}
            />
            {comp} component</label
          >
        </div>
      {/each}
    </div>
    <div
      id="createBtnId"
      onclick={createCRUDSupport}
      style="font-size: 14px !important;cursor:pointer;margin:0'"
      class:notallowed={buttonNotAllowed}
      aria-hidden={true}
    >
      <span class:spinner={inAction}></span>
      Create CRUD Support
    </div>
  </div>
{/snippet}
{#snippet pageByPageNote()}
  <cr-pre>
    For every route name and selected checkbox model from summary/details block
    the extension would build a TypeScript data entry +page.svelte with
    accompanying +page.server.ts for communicating with Prisma ORM local
    PostgreSQL database, based on a connection string set in the .env file in
    the app root folder.
  </cr-pre>
  {@render pageByPageMiddleColumn()}
{/snippet}
<div id="crudUIBlockId" class="cr-main-grid">
  <div class="application-settings">
    {@render pageByPageNote()}
  </div>
  <CRModelPermissionHandler
    {models}
    bind:selectedModels
    bind:isLoading
    {userRoles}
  ></CRModelPermissionHandler>
</div>

<pre>selectedModels
{JSON.stringify($state.snapshot(selectedModels), null, 2)}
</pre>

<style lang="scss">
  .spinner {
    display: inine-block;
    width: 0.8em;
    height: 0.8em;
    border: 3px solid #a1c1eb;
    border-top-color: #1b4891;
    border-radius: 50%;
    // margin: -1px 0 0 2px;
    animation: spin 900ms linear infinite;
    span {
      display: inline-block;
    }
  }
  #createBtnId {
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
    margin: 6rem 6.5rem;
    width: max-content;
    padding: 2px 5px 2px 0;
    cursor: pointer;
  }
  .cr-main-grid {
    position: relative;
    display: grid;
    grid-template-columns: 30rem 23rem;
    // border: 1px solid gray;
    column-gap: 1rem;
    margin: 0.5rem 0 0 1rem;
    width: max-content;
    height: auto;
    align-items: start;
  }
  .application-settings {
    width: 30rem;
    align-items: start;
    height: 100%;
    // border: 1px dashed gray;
  }
  .cr-left-column {
    @include container($head: 'Application Settings', $head-color: navy);
    position: relative;
    border: 1px solid gray;
    border-radius: 8px;
    height: 74vh;
    width: 30rem;
    margin-top: 1rem;
    padding: 1rem 0 0 0.7rem;
    background-color: var(--panel-bg-color);

    label {
      display: block;
      color: var(--candidate-color);
      cursor: pointer;
    }
    div {
      display: block;
    }
  }

  cr-pre {
    grid-column: 1 / span 2;
    text-align: justify;
    font-size: 14px;
    color: var(--pre-color);
    align-items: start;
  }

  .embellishments {
    @include container($head: 'Include Components', $head-color: navy);
    background-color: var(--panel-bg-color);

    position: relative;
    display: grid;
    grid-template-columns: minmax(2em, auto) 7rem;
    align-items: center;
    width: 97.2%;
    column-gap: 0.5rem;
    row-gap: 0.1rem;
    align-items: center;
    padding: 8px 1rem;
    border: 1px solid gray;
    border-radius: 6px;
    user-select: none;
  }

  .notallowed {
    opacity: 0.3;
    cursor: not-allowed;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .app-labels {
    color: var(--checkbox-label-color);
    margin: 3px 0 3px 1rem;

    &:last-of-type {
      margin-bottom: 1rem;
    }
  }

  .authentication,
  .authorization {
    @include container(
      $head: 'Authentication',
      $head-color: navy,
      $padding: 0.5rem 1rem,
      $left: 1rem,
      $width: max-content
    );
    label {
      cursor: pointer;
    }
    margin: 0.5rem 0 1rem 0;
  }
  .authorization {
    @include container($head: 'Authorization', $left: 0.5rem);
    width: 16rem;
  }
  .radio-check-groups {
    display: grid !important;
    grid-template-columns: 11rem 14rem;
    column-gap: 0.5rem;
  }
</style>
