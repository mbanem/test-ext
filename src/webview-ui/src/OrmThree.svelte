<script lang="ts">
  import { vscode } from '$lib/utils/event-handler.browser'
  import { onMount } from 'svelte'
  import CRModelPermissionHandler from '$lib/components/CRModelPermissionHandler.svelte'

  type TProps = {
    pageInfo: TToggleFunc
  }
  let { pageInfo = $bindable<TToggleFunc>() }: TProps = $props()
  let isActive = $state(false)
  function handlePageInfo() {
    console.log('OrmThree - handlePageInfo')
    isActive = isActive ? false : true
  }
  pageInfo = handlePageInfo

  let appName = $state('')
  let isLoading = $state(true)
  // // const vscode = acquireVsCodeApi()
  let models: Models = $state<Models>({}) as Models
  let inAction = $state(false)
  // NOTE selectedModels are maintained by CRModelPermissionHandler
  // when any checkbox on a component model list is selected
  // the component keeps this selectedModels in sync
  // it is Record<ModelName,{routeName, permissions?}>
  let selectedModels = $state<SelectedModels>({})
  let userRoles = $state<string[]>([])
  // // what components users want to include in newnly generated pages
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
  // NOTE old version returns models as objects, but the extension
  //      holds all models so only selected moel names should be sent
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
    console.log('[OrmThree] posting ready')
    vscode.postMessage({ command: 'ready' })

    window.addEventListener('message', (event) => {
      const msg = event.data

      if (msg.command === 'sendingModels') {
        console.log('[OrmThree] received', event.data)
        const pload = $state.snapshot(JSON.parse(msg.payload))
        models = pload.models
        userRoles = Object.keys(Object.values(pload.enums)[0] as TEnum).filter(
          Boolean,
        )
        appName = pload.appName
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
{#snippet pagePurpose()}
  <pre>
  The main part of this page is on the right.

  1) ORM Models -- table names,
    a list of models/table-names from /prisma/schema.prisma parsed file.
    Every model is presented in a row that can be expanded to show list
      of fields/table-columns -- where some could be UI data-entry fields
      and the others like userAuthToken, passwordHash, createdAt... are
      not to be displayed to the users.
      Rows contain:
    - input box for naming routes, e.g. for model
      Object.keys models  route would be a folder under
      /appName/routes/Object.keys models if model is selected
    - a checkbox to signal that model is selected for generating a route
    - Model name
    - Permissions -- when clicked opens a dropdown with UserKind from
      enums found in schema.prisma, or if enums are not found the extension
      uses the default enums: USER ADMIN MODERATOR VISITOR.
  2) Extra Models
    Some pages could be based on partial models that include only several
    fields/columns like Login that includes only say email and password.
    Extra model are added entering extra model name in the input box with
    placeholder 'Add extra model' and selecting the 'add' button.
    Model can be removed from the list by entering its name and selecting
    remove and answering the Confirmation Box to allow the action.
  3) Adding Fields to Extra Model(s)
    When extra model(s) are defined then opening any ORM Model will show
    tooltip like a radio-button group with Model Name beside when some
    data-entry field is hovered allowing users to select the model and the
    hovered field will be copied into selected extra model.
    When more than on extra model is defined tooltip radio-button group
    includes label 'Both' or 'All' if more then two extra models exist.
  4)Create CRUD Support button is enabled when some or all models are
    selected, and when clicked it sends selected page attributes for
    page-by-page decoration selecting some additional attributes and/or
    specific behavior offered by the extension, like what Components to
    include in the given page.
    </pre>
{/snippet}
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

  <div class="authentication-authorization">
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
<!-- {#snippet pageByPageNote()}
    <cr-pre>
    For every route name and selected checkbox model from summary/details block
    the extension would build a TypeScript data entry +page.svelte with
    accompanying +page.server.ts for communicating with Prisma ORM local
    PostgreSQL database, based on a connection string set in the .env file in
    the app root folder.
  </cr-pre>
    {@render pageByPageMiddleColumn()}
  {/snippet} -->
{#if isActive}
  <div class="page-info">
    {@render pagePurpose()}
  </div>
{/if}
<div id="crudUIBlockId" class="cr-main-grid">
  <div class="application-settings">
    <!-- {@render pageByPageNote()} -->
    {@render pageByPageMiddleColumn()}
  </div>
  <CRModelPermissionHandler
    {models}
    bind:selectedModels
    bind:isLoading
    {userRoles}
  ></CRModelPermissionHandler>
</div>

<!-- <pre>selectedModels
{JSON.stringify($state.snapshot(selectedModels), null, 2)}
</pre> -->

<style lang="scss">
  .spinner {
    display: inine-block;
    width: 1em;
    height: 1em;
    border: 3px solid #a1c1eb;
    border-top-color: #1b4891;
    border-radius: 50%;
    animation: spin 900ms linear infinite;
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
    column-gap: 1rem;
    margin: 0 0 0 1rem;
    width: max-content;
    height: auto;
    align-items: start;
    opacity: 1;
  }
  .application-settings {
    width: 30rem;
    align-items: start;
    height: 100%;
  }
  .cr-left-column {
    @include container($head: 'Application Settings', $head-color: navy);
    position: relative;
    border: 1px solid gray;
    border-radius: 8px;
    height: 40.2rem;
    width: 30rem;
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
  P .notallowed {
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
  .authentication-authorization {
    display: grid !important;
    grid-template-columns: 11rem 14rem;
    column-gap: 0.5rem;
  }

  .page-info {
    @include page-info(
      $head: 'What Does This Page Do',
      $color: var(--page-purpose-color)
    );
  }
</style>
