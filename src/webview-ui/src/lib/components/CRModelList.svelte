<!--
@component

-->

<script lang="ts">
  import { tick, onMount } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import { capitalize } from '$lib/utils'
  import { showConfirmation } from '$lib/utils'
  import ShowMessage from '$lib/components/CRShowMessage.svelte'
  import CRUserRolesSelect from '$lib/components/CRUserRolesSelect.svelte'
  let sm: ShowMessage

  export type TProps = {
    models: Models
    selectedModels: SelectedModels
    isLoading: boolean
    userRoles: string[]
  }

  // Receive initial models from parent
  let {
    models,
    selectedModels = $bindable({}),
    isLoading = $bindable(true),
    userRoles = [],
  }: TProps = $props()

  function anySelected() {
    return Object.keys(selectedModels).length > 0
  }
  // Make it deeply reactive + owned by this component
  // Works only between client components not from server to client component (not server->browser)
  // let models = $state<Models>(structuredClone(initialModels)) // or just { ...initialModels } if shallow is enough

  let tooltipBlockEl: HTMLDivElement
  let emptyModel: Model = { fields: [], attrs: [] }
  let includeAll = 'All' // last word for models in CRRBTooltip -- here is 'Both'
  let newModelName = $state('')
  let isSummaryOpen = $state(false)
  let extraModels = new SvelteSet<string>()
  let notDataEntryEl: HTMLDivElement
  let modelWrapperEl: HTMLDivElement
  let hoveredEl: HTMLElement | null = null

  let tooltipMessage = $state('not data entry field')
  const notDataEntry = 'not data entry field'
  const clickToRemove = 'click to remove'
  let det: HTMLDetailsElement
  let fieldsRect: DOMRect
  const defaultMessage = 'Add/Remove extra model like Login, Admin,...'
  const alreadyDefined = 'Module is already registered'
  const notRegistered = 'Module is not registered yet'
  const noModelName = 'Please enter model name'
  let modelName = $state('')
  let message = $state(defaultMessage)
  let msgClass = $state('navy')
  let busy = $state(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  const nuiRegex = new RegExp(`\\b@id|@defaults|@updatedAt|@unique\\b`, 'g')
  let x = $state(100)
  let y = $state(100)
  export const exportModels = (modelName?: string) => {
    console.log('exportModels called', modelName)
    selectedModels = {}
    // get only selected models based on the checkbox checked state
    for (const chkbox of modelWrapperEl.querySelectorAll(
      'input[type="checkbox"]:checked',
    )) {
      try {
        const routeName = (
          (chkbox as HTMLInputElement)
            .previousElementSibling as HTMLInputElement
        ).value as string

        const modelName = (chkbox as HTMLInputElement).value as string
        const permissions = models[modelName]?.permissions as string
        selectedModels[modelName] = {
          routeName,
          permissions,
        }
        // selectedModels[modelName].permissions = permissions
        // selectedModels[modelName].routeName = routeName
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(msg)
      }
    }
  }
  function killTimeout() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  function fieldAttrsClass(field: Field) {
    return nuiRegex.test(field.attrs as string) ? 'attr-id' : ''
  }
  function fieldAttrs(field: Field) {
    return field.attrs ?? 'no attributes'
  }
  function toggleCheckboxes(e: MouseEvent) {
    const el = e.target as HTMLParagraphElement
    const newState = el.innerText.includes('select all') ? true : false
    el.innerText = newState ? '(clear all)' : '(select all)'
    ;(
      document.querySelectorAll(
        '.model-checkboxes',
      ) as unknown as Array<HTMLInputElement>
    ).forEach(async (chkbox) => {
      // chkbox.checked = newState
      chkbox.click()
      await tick()
    })
    exportModels()
  }

  function getUIField(fieldName: string) {
    if (/password/i.test(fieldName)) {
      return {
        name: 'password',
        isDataEntry: true,
        isOptional: false,
        isArray: false,
        attrs: 'saved excrypted',
      } as Field
    }

    return models[modelName]?.fields.find(
      (field) => field.name === fieldName,
    ) as Field
  }

  // called from tooltipBlockEl tooltip when radio button fires change event
  function addFieldToModel(e: Event) {
    try {
      e.preventDefault()
      killTimeout()
      if (!hoveredEl) {
        return
      }
      const fieldName = hoveredEl?.innerText as string
      const mName = (
        tooltipBlockEl.querySelector(
          `input[type=radio]:checked`,
        ) as HTMLInputElement
      ).value as string
      if (!(mName === includeAll || extraModels.has(mName))) {
        return
      }
      const field = getUIField(fieldName)
      if (field) {
        if (mName === includeAll) {
          for (const m of extraModels) {
            if (models[m] && !models[m].fields.includes(field)) {
              models[m].fields.push(field)
            }
          }
        } else {
          if (!models[mName]?.fields.includes(field)) {
            models[mName]?.fields.push(field)
          }
        }
      }
      // after adding the field to a model clear selected
      // radio button and hide the radio button tooltip
      ;(e.target as HTMLInputElement).checked = false
      tooltipBlockEl.style.opacity = '0'
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log('addFieldToModel', msg)
    }
    if (anySelected()) {
      exportModels()
    }
  }

  function outOfBound(e: MouseEvent, el: HTMLElement) {
    const rect = el.getBoundingClientRect()
    return (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    )
  }
  function showNoDataEntry(x: number, y: number) {
    killTimeout()
    hoveredEl = null
    tooltipBlockEl.style.opacity = '0'
    Object.assign(notDataEntryEl.style, {
      position: 'fixed',
      top: `${y - 15}px`,
      left: `${x}px`,
      zIndex: '9999',
      pointerEvents: 'auto',
      opacity: '1',
    })
  }
  async function showTooltip(e: MouseEvent) {
    e.preventDefault()
    killTimeout()
    timer = null
    if (outOfBound(e, modelWrapperEl)) {
      if (!extraModels.size) {
        return
      }
      tooltipBlockEl.style.opacity = '0'
    }

    if (
      (e.target as HTMLElement).tagName !== 'SECTION' &&
      outOfBound(e, tooltipBlockEl)
    ) {
      tooltipBlockEl.style.opacity = '0'
      return
    }
    if (e.type === 'mouseover') {
      // offer no copy field to extra model(s) as no extra models are defined
      if (extraModels.size === 0) {
        return
      }
      // there are extra data models for radio-button block to offer copy field
      const dataset = (e.target as HTMLElement).dataset
      const { x, y } = (e.target as HTMLElement).getBoundingClientRect()

      // not a data entry field so no radio-block but info no-dataa-entry
      // or remove field if extraModel field is hovered
      if (dataset.entry === 'false' || dataset.extra === 'true') {
        console.log('data entry or extra')
        if (dataset.entry === 'false') {
          tooltipMessage = notDataEntry
        } else {
          tooltipMessage = clickToRemove
        }
        showNoDataEntry(x, y)
        return
      }
      hoveredEl = e.target as HTMLElement
      timer = setTimeout(() => {
        busy = false
      }, 100)
      busy = true
      Object.assign(tooltipBlockEl.style, {
        position: 'fixed',
        top: `${y - 8}px`,
        left: `${x}px`,
        zIndex: '9999',
        pointerEvents: 'auto',
        opacity: '1',
        cursor: 'pointer',
      })
    } else {
      if (busy) {
        return
      }
      tooltipBlockEl.style.opacity = '0'
      notDataEntryEl.style.opacity = '0'
    }
  }
  async function toggleSummary(e: MouseEvent) {
    // e.preventDefault();
    const el = e.target as HTMLElement
    switch (el.tagName) {
      case 'SUMMARY':
        //console.log('summary clicked');
        det = el.closest('details') as HTMLDetailsElement
        if (!det || det.tagName !== 'DETAILS') {
          return
        }
        tooltipBlockEl.style.opacity = '0'
        modelName = det.innerText?.match(/^\S+/)?.[0] as string
        if (extraModels.has(modelName)) {
          fieldsRect = (el.parentElement as HTMLElement)
            .querySelector('.cr-fields-column')
            ?.getBoundingClientRect() as DOMRect
          console.log('fieldsRect', fieldsRect)
        }
        for (const item of modelWrapperEl.getElementsByTagName('DETAILS')) {
          if (item.firstChild !== el) {
            Object.assign((item.parentElement as HTMLElement).style, {
              opacity: `${isSummaryOpen ? '1' : '0'}`,
              position: `${isSummaryOpen ? 'relative' : 'absolute'}`,
              top: '0',
              left: '0',
            })
          }
        }
        isSummaryOpen = !isSummaryOpen
        // hovering is necessary only when newModels is not empty
        if (!extraModels.size) {
          return
        }
        if (det.open) {
          if (modelWrapperEl.onmouseover) {
            modelWrapperEl.removeEventListener('mouseover', showTooltip)
            modelWrapperEl.removeEventListener('mouseout', showTooltip)
          }
        } else {
          if (!modelWrapperEl.onmouseover) {
            modelWrapperEl.addEventListener('mouseover', showTooltip)
            modelWrapperEl.addEventListener('mouseout', showTooltip)
          }
        }
        return
      case 'INPUT':
        //console.log('input clicked');
        if (
          (el as HTMLInputElement).type &&
          (el as HTMLInputElement).type === 'checkbox'
        ) {
          exportModels()
        }
        break
      case 'SPAN':
      case 'P':
        // e.preventDefault();
        //console.log('role list clicked', el.tagName);
        break
      default:
        //console.log('default clicked', el.tagName);
        break
    }
    // return;
  }

  function hideTooltipBlock() {
    killTimeout()
  }

  function showMessage(
    msg: string,
    className: string = 'tomato',
    milisec: number = 2000,
  ) {
    message = msg
    msgClass = className
    setTimeout(() => {
      message = defaultMessage
      msgClass = 'navy'
    }, milisec)
  }
  async function addNewModel(e: MouseEvent | KeyboardEvent) {
    e.preventDefault()
    if (e instanceof KeyboardEvent && e.key !== 'Enter') {
      return
    }
    tooltipBlockEl.style.opacity = '0'
    const model = capitalize(newModelName)

    if (models[model]) {
      showMessage(alreadyDefined)
      // newModelName = '';
      return
    }
    await tick()

    extraModels.add(model)
    // add another model initially with no fields and attrs
    // so the models list can expand
    models[model] = emptyModel
    newModelName = ''
    if (anySelected()) {
      exportModels()
    }
  }
  async function deleteModel(e: MouseEvent, modelName: string) {
    console.log('await showConfirmation')
    sm?.showMessage(e, `Model "${modelName}" to be deleted.`)
    const confirmed = await showConfirmation({
      message: `Remove model "${modelName}"?`,
      detail: 'This action cannot be undone.',
      confirmText: 'Yes, Remove',
      cancelText: 'Cancel',
    })
    console.log('extension response', confirmed)
    if (confirmed) {
      delete models[modelName]
      if (models[modelName]) {
        console.log('removing model failed', modelName)
        sm?.showMessage(e, `Model "${modelName}" has been removed.`)
      } else {
        console.log('removing model succeeded', modelName)
        sm?.showMessage(e, `Model "${modelName}" is removed.`)
      }
      if (anySelected()) {
        exportModels()
      }
    } else {
      console.log('user did not confirm removing', modelName, 'model')
    }
  }
  async function removeModel(e: MouseEvent) {
    console.log('removeModel entry')
    if (!newModelName) {
      console.log('noModelname')
      showMessage(e, noModelName)
      return
    }
    const model = capitalize(newModelName)
    console.log('model', model)

    if (!models[model]) {
      console.log('no model found')
      showMessage(e, notRegistered)
      return
    }
    if (models[model]) {
      console.log('model', model, 'exists')
      deleteModel(e, model)
      // Optional: notify user inside webview
      sm.showMessage(e, `Model "${modelName}" has been deleted.`)
      if (anySelected()) {
        exportModels()
      }
    }
  }
  function isInside(rect: DOMRect, e: MouseEvent) {
    return (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    )
  }
  function hideClickToRemove(e: MouseEvent) {
    e.preventDefault()
    console.log('hideClickToRemove fieldRect?', fieldsRect)
    if (!isInside(fieldsRect, e)) {
      notDataEntryEl.style.opacity = '0'
    }
  }
  function removeExtraModelField(e: MouseEvent) {
    const el = e.target as HTMLElement
    const fieldName = el.innerText
    const model = models[modelName]
    if (!model || !model.fields) {
      return
    }
    model.fields = model.fields.filter((field) => field.name !== fieldName)
    notDataEntryEl.style.opacity = '0'
    if (anySelected()) {
      exportModels()
    }
  }
  onMount(() => {
    tooltipBlockEl.classList.remove('hidden')
    notDataEntryEl.classList.remove('hidden')
    tooltipBlockEl.addEventListener('change', addFieldToModel)
    tooltipBlockEl.addEventListener('mouseleave', hideTooltipBlock)

    return () => {
      modelWrapperEl.removeEventListener('change', addFieldToModel)
      tooltipBlockEl.removeEventListener('mouseleave', hideTooltipBlock)
    }
  })
</script>

<div bind:this={tooltipBlockEl} class="radio-tooltip hidden">
  {@render tooltipBlock()}
</div>
<div bind:this={notDataEntryEl} class="no-data-entry hidden">
  {tooltipMessage}
</div>

{#snippet permissions(modelName: string)}
  <CRUserRolesSelect {userRoles} {modelName} bind:models {exportModels} />
{/snippet}
{#snippet tooltipBlock()}
  {#each extraModels as model (model)}
    <label><input type="radio" name={model} value={model} />{model}</label>
  {/each}
  {#if extraModels.size === 2}
    <label><input type="radio" name="All" value="All" />Both</label>
  {/if}
  {#if extraModels.size > 2}
    <label><input type="radio" name="All" value="All" />All</label>
  {/if}
{/snippet}

{#snippet summaryDetailsModel(modelName: string, model: Model)}
  <div style="position:relative;">
    <input
      type="text"
      id="route{modelName}"
      value={modelName.toLowerCase()}
      onchange={exportModels}
      style="position:absolute;top:0;left:4px;color:var(--candidate-color);background-color:var(--candidate-bg-color);width:5rem;height:1rem;padding:0 0 0 5px;margin:4px 0 0 0;border:none;font-size:14px;"
    />
    <input
      type="checkbox"
      style="position:absolute;top:0;left:6rem;"
      value={modelName}
      class="model-checkboxes"
    />
    <details class="model-details">
      <summary class="cr-model-name">
        {capitalize(modelName)}
        {@render permissions(modelName)}
      </summary>

      <div
        class="cr-fields-column"
        onmouseleave={extraModels.has(modelName)
          ? hideClickToRemove
          : undefined}
        onclick={removeExtraModelField}
        aria-hidden={true}
      >
        {#each model.fields as field (field.name)}
          {@const attrClass = fieldAttrsClass(field) as string}
          <section
            data-entry={field.isDataEntry}
            data-extra={extraModels.has(modelName)}
          >
            {field.name}
          </section>
          <p>
            type:{field.type} <span class={attrClass}>{fieldAttrs(field)}</span>
          </p>
        {/each}
      </div>
      <div>
        {#each model.attrs as attr (attr)}
          <p class="cr-model-attr">{attr}</p>
        {/each}
      </div>
    </details>
  </div>
{/snippet}

{#snippet summaryDetailsModels()}
  {#each Object.entries(models) as [modelName, model] (modelName)}
    {@render summaryDetailsModel(modelName, model)}
  {/each}
{/snippet}
<div class="container">
  <div class="schema-container" onclick={toggleSummary} aria-hidden={true}>
    <p class="orm-models-caption">Route folder name for ORM Model</p>
    <p class="select-all" onclick={toggleCheckboxes} aria-hidden={true}>
      (select all)
    </p>
    <div bind:this={modelWrapperEl} class="model-wrapper">
      {#if isLoading}
        <div class="spinner-wrapper">
          <span class="spinner"></span><span>Loading models...</span>
        </div>
      {/if}
      {#if !isLoading && Object.keys(models).length > 0}
        {@render summaryDetailsModels()}
      {/if}
    </div>
  </div>
  <div class="add-extra-model">
    <span class={msgClass}>{message}</span>
    <input
      type="text"
      bind:value={newModelName}
      onkeyup={addNewModel}
      placeholder="Add extra model"
    />
    <button onclick={addNewModel} disabled={!newModelName}>add</button><button
      onclick={removeModel}
      disabled={!newModelName}>remove</button
    >
  </div>
</div>
<!-- no display just a showMessage utils with markup -->
<ShowMessage bind:this={sm} />

<style lang="scss">
  *,
  *::before,
  *::after {
    box-sizing: border-box;
    user-select: none;
  }

  input[type='text'] {
    width: 93%;
    height: 20px;
    padding: 6px 0 8px 1rem;
    outline: none;
    font-size: 16px;
    border: 1px solid gray;
    border-radius: 4px;
    outline: 1rem solid transparent;
    margin-top: 8px;
    margin-bottom: 10px;
    &::placeholder {
      font-size: 13px;
    }
    &:focus {
      outline: 1px solid gray;
    }
  }
  .container {
    width: 23rem;
    margin-top: 1rem;
    height: 39.7rem;
    border: 1px solid green;
    .schema-container {
      position: relative;
      width: 22.8rem;
      height: 35.9rem;
      border: 1px solid gray;
      // border: 1px solid blue;
      border-radius: 6px;
      padding: 1rem 0 0 3px;
      .model-wrapper {
        width: 22rem;
        padding: 0;
        margin: 0;
        height: 34.4rem;
        // border: 1px solid red;
        z-index: 15;
        overflow-y: auto;
        scrollbar-width: none;
        overflow-x: hidden;
      }
    }
  }
  .spinner-wrapper {
    display: grid;
    grid-template-columns: 1em 10rem;
    column-gap: 0.5rem;
  }
  .spinner {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 0.8em;
    height: 0.8em;
    border: 3px solid #a1c1eb;
    border-top-color: #1b4891;
    border-radius: 50%;
    margin: 4px 0 0 0.5rem;
    animation: spin 900ms linear infinite;
    span {
      display: inline-block;
    }
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .add-extra-model {
    width: 100%;
    color: var(--candidate-color);
    background-color: var(--candidate-bg-color);
    margin: 6px 0 0 0;
    opacity: 1;
    input {
      width: 65.5% !important;
      font-size: 14px;
      color: var(--candidate-color);
      background-color: var(--candidate-bg-color);
    }
    button {
      width: 3.5rem;
      padding: 0;
      margin-right: 4px;
      &:last-of-type {
        margin-right: 0;
      }
    }
  }
  .tomato {
    color: tomato;
  }
  .navy {
    color: navy;
  }

  .model-details {
    width: 21.5rem;
  }

  .orm-models-caption,
  .select-all {
    position: absolute;
    top: -1.6rem;
    left: 1rem;
    z-index: 10;
    padding: 0 5px;
    color: var(--candidate-color);
    background-color: var(--panel-bg-color);
  }
  .select-all {
    left: 16rem;
    width: 5rem;
    cursor: pointer;
    &:hover {
      border: 1px solid var(--candidate-color);
      border-radius: 4px;
    }
  }

  .cr-model-attr {
    grid-column: span 2;
    width: 18rem;
    padding: 0;
    margin: 0 0 0 2rem;
    text-wrap: wrap;
    color: tomato;
    font-size: 13px;
  }
  .cr-model-name {
    color: var(--summary-color);
    background-color: var(--summary-bg-color);
    margin: 3px 9px 0 0;
    width: 21.5rem;
    border-radius: 6px;
    padding-left: 8rem;
    height: 1.6rem;
    cursor: pointer;
  }

  .cr-fields-column {
    display: grid;
    grid-template-columns: 7rem 9.5rem;
    column-gap: 5px;
    width: 21.5rem;
    padding: 6px 0 6px 1rem;
    max-height: 75vh;
    font-size: 14px;
    font-weight: 400;
    color: var(--candidate-color);
    background-color: var(--candidate-bg-color);
    cursor: pointer;
  }

  .cr-fields-column p {
    margin: 4px 0 0 0;
    padding: 1px 0 1px 6px;
    text-wrap: wrap;
  }

  .cr-fields-column p:nth-child(odd) {
    cursor: pointer;
    width: max-content;
    padding: 4px 1rem;
  }

  .cr-fields-column p:nth-child(even) {
    font-weight: 400 !important;
    font-size: 12px !important; /* prisma attrs column */
    color: var(--model-name);
    span {
      display: block;
      margin-left: 1rem;
      color: var(--pink-tomato);
    }
  }

  .pink-tomato {
    color: var(--pink-tomato);
  }
  .attr-id {
    color: var(--attr-id);
  }

  .model-checkboxes {
    color: navy;
    padding: 0 1rem 0 0;
    margin-left: 0;
    cursor: default !important;
  }
  details {
    width: 22rem;
  }
  details:last-of-type[open]::details-content {
    width: 21.5rem;
    background-color: #f0f0f0;
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
  }
  details:last-of-type[open] summary {
    background-color: var(--summary-bg-color);
  }
  .radio-tooltip {
    opacity: 0;
    position: fixed;
    top: 30rem;
    left: 30rem;
    z-index: 10;
    display: flex;
    column-gap: 2px;
    pointer-events: auto;
    border-radius: 6px;
    padding: 4px 0.5rem 1px 5px;
    color: var(--candidate-color);
    background-color: skyblue;
    label,
    input {
      cursor: pointer !important;
    }
  }
  .no-data-entry {
    position: fixed;
    top: 0;
    left: 0;
    color: var(--pink-tomato);
    background-color: var(--candidate-bg-color);
    width: max-content;
    padding: 2px 0.5rem;
    border: 1px solid gray;
    border-radius: 5px;
    z-index: 10;
    opacity: 0;
  }
  .hidden {
    display: none;
  }
</style>
