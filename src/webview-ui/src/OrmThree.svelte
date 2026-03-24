<script lang="ts">
  import { onMount } from 'svelte'

  // import { browser } from '$app/environment'
  // import { schema } from './schema_prisma'
  import { sleep, handleTryCatch, createEventHandler } from '$lib/utils'

  import { SvelteMap } from 'svelte/reactivity'
  import type { Field, Models } from '$lib/utils/parse-prisma-schema'
  import { parsePrismaSchema } from '$lib/utils/parse-prisma-schema'
  import { vscode, type TPayload } from '$lib/utils/event-handler.browser'

  function postMessage(command: string, payload: TPayload) {
    vscode.postMessage({ command, payload })
  }
  const schema = `// Prisma schema,
	generator client {
		provider = "prisma-client-js"
	}

	datasource db {
		provider = "postgresql"
	}

	model User {
		id      			String   @id @default(uuid())
		firstName    	String   @map("first_name")
		lastName    	String   @map("last_name")
		email   			String
		passwordHash 	String   @map("password_hash")
		userAuthToken	String   @unique @map("user_auth_token")

		role          Role    @default(VISITOR)
		posts   			Post[]
		profile 			Profile?

		articles      Article[]
		todos         Todo[]    // arrays are optional and could be empty

		createdAt DateTime @default(now())   @map("created_at")
		updatedAt DateTime? @updatedAt        @map("updated_at")

		@@unique(name: "fullNameEmail", [firstName, lastName, email])
		@@map("users")
	}


	enum Role {
		USER
		ADMIN
		VISITOR
		MODERATOR
	}
	model Profile {
		id     		String  @id @default(uuid())
		bio    		String?

		user   		User    @relation(fields: [userId], references: [id])
		userId 		String  @unique    @map("user_id")

		createdAt DateTime @default(now())   @map("created_at")
		updatedAt DateTime? @updatedAt       @map("updated_at")

		@@map("profile")
	}
	model Article {
    id      	String @id @default(uuid())
    title   	String
    content 	String
    author 	 	User 	 @relation(fields: [authorId], references: [id])
    authorId 	String @map("author_id")

    @@map("article")
	}

	model Post {
		id        String 	 @id @default(uuid())
		title     String   @db.VarChar(255)
		content   String?
		published Boolean  @default(false)

		author    User     @relation(fields: [authorId], references: [id])
		authorId  String   @map("author_id")

		categories Category[]

		createdAt DateTime @default(now())   @map("created_at")
		updatedAt DateTime? @updatedAt        @map("updated_at")

		@@map("post")
	}

	model Category {
		id    Int    @id @default(autoincrement())
		name  String
		posts Post[]

		@@map("category")
	}
	model Todo {
		id        String  @id @default(uuid())
		title     String
		content   String
		priority  Int     @default(0)
		completed Boolean @default(false)

		user   		User    @relation(fields: [userId], references: [id])
		userId 		String  @map("user_id")

		createdAt DateTime @default(now())   @map("created_at")
		updatedAt DateTime? @updatedAt        @map("updated_at")

		@@map("todo")
	}
	`
  let { uiModels, nuiModels, fieldStrips } = parsePrismaSchema(schema)
  // console.log(uiModels)
  let modelName = ''

  // type fieldNames = {
  // 	modelName: string;
  // 	namesList: string;
  // };

  let fieldsListEl: HTMLDivElement
  let fieldListsInitialized = false

  const eh = createEventHandler()
  // console.log('createEventHandler', eh !== null);

  // FIELDS
  let removeHintEl: HTMLParagraphElement
  let schemaContainerEl: HTMLDivElement
  let middleColumnEl: HTMLDivElement

  let routeLabelNode: HTMLElement
  let routeLabelEl: HTMLLabelElement
  let routeNameEl: HTMLInputElement

  let fieldLabelNode: HTMLElement
  let fieldLabelEl: HTMLLabelElement
  let fieldNameEl: HTMLInputElement

  let timer: any //NodeJS.Timeout
  let fieldNameAndType = 'Field Name and Type'
  let unacceptable = '  not a UI field'
  let deletedFields = new SvelteMap<string, Node>()
  // global msg set by isFieldFormatValid, isInFieldStrips and isInListEls
  let msg = ''
  let models: Models = {}

  // schema = ''; TODO in Webview component get read from this file content

  // Prisma model displayed in a list of <summary>/<details>
  let prismaSumDetailsBlock = ``
  // models = uiModels is another reference to the same uiModel
  // so we must deep copy to the models

  for (const [modelName, model] of Object.entries(uiModels)) {
    models[modelName] = { fields: [], attrs: [] }
    models[modelName].fields = model.fields
  }
  for (const [modelName, model] of Object.entries(models)) {
    model.fields = [...model.fields, ...nuiModels[modelName].fields]
    model.attrs = nuiModels[modelName].attrs
  }
  // nuiModels = {};
  // Object.entries() return [key,value] -- key is modelName, value is model
  // fields cannot be deeply destructured as it is an array, which is not destructurable
  for (const [modelName, model] of Object.entries(models)) {
    prismaSumDetailsBlock += `<div class='cr-model-block>'>
		<details>
			<summary class='cr-model-name'>${modelName}</summary>
				<div  class='cr-fields-column'>
				`
    for (const field of model.fields) {
      const { name, type, attrs } = field
      if (
        attrs?.includes('@id') ||
        attrs?.includes('@default') ||
        attrs?.includes('@updatedAt') ||
        attrs?.includes('@unique')
      ) {
        const color = attrs.includes('@id') ? 'lightgreen' : 'pink'
        prismaSumDetailsBlock += `<p>${name}</p><p>type:${type} <span style='color:${color}'>${attrs ?? 'na'}</span></p>`
      } else {
        prismaSumDetailsBlock += `<p>${name}</p><p>type:${type} ${attrs ?? 'na'}</p>`
      }
    }
    prismaSumDetailsBlock += `</div>
		`
    for (const attr of model.attrs as string[]) {
      prismaSumDetailsBlock += `<p class='cr-model-attr'>${attr}</p>
			`
    }
    prismaSumDetailsBlock += `</details>
		</div>
		`
  }
  // we do not clear all the entries and rebuild from the fields
  // but just add a newly entered in the Field Name fieldNameId
  let fields: string[] = []
  function anyOpenDetails() {
    let open = false
    const dets = schemaContainerEl?.children as HTMLCollection
    for (const child of Object.entries(dets)) {
      if ((child[1].children[0] as HTMLElement).hasAttribute('open')) {
        open = true
      }
    }
    return open
  }
  /**
   * Closes all opened <details>
   * @param dets
   */
  function closeDetails(dets: HTMLCollection) {
    for (const child of Object.entries(dets)) {
      ;(child[1].children[0] as HTMLElement).removeAttribute('open')
    }
  }

  /**<details><summary>
   * return built |fieldName: type| string of expanded fields
   */
  let pipeElsString = `!`

  /**
   * clears candidate field list
   */
  function clearListEls() {
    ;(fieldsListEl as HTMLDivElement).innerHTML = ''
  }

  /**
   * Acceptable field: formatOK not in fieldStrips not in listEls is in fieldStrips[modelName]
   * @param value
   */
  function isFieldAcceptable(value: string) {
    msg = ''
    if (!fieldListsInitialized) {
      // not yet collected but Prisma fields are rendered initially
      return true
    }
    // after delete from Candidates field is removed from
    // fieldStrips[modelName] stay intact to control what field could go to Candidates
    // while entry from getListEls() and fieldNames[modelName] are deleted
    const [, name, type] = value.match(/([^:]+):\s*(.+)?/) as string[]
    const formatValid = isFieldFormatValid(value)
    const inFieldStrips = isInFieldStrips(value)
    const inListEls = isInListEls({
      name,
      type,
      isArray: false,
      isOptional: false,
    })

    if (inListEls) {
      msg = 'Already selected'
    } else if (!formatValid || !inFieldStrips) {
      msg = 'Invalid format or not UI field'
    }
    if (msg) {
      setLabelCaption('pink', msg, 2000, 'field')
      return false
    }

    const tf =
      Object.values(uiModels[modelName].fields).find(
        (el) => el.name === value.replace(/:.+$/, ''),
      ) !== undefined

    if (tf) {
      return true
    }
    setLabelCaption('pink', msg, 2000, 'field')
  }
  /**
   * must have fieldName: valid type
   * @param value
   */
  const invfmt = ' Invalid format or type'
  function isFieldFormatValid(value: string) {
    if (!value.includes(':')) {
      msg += invfmt
      return true
    }
    value = value.trim().replace(/\s+/g, ' ')
    const [, name, type] = value.match(/([^:]+):\s*(.+)?/) as string[]
    const tf =
      name && type && '|string|number|boolean|Date|Role|'.includes(`|${type}|`)
    if (!tf) msg += invfmt
    return tf
  }

  /**
   * fieldStrip in '|id: string|completed: boolean|updatedAt: Date|'
   * @param field
   */
  function isInFieldStrips(fieldStrip: string) {
    const tf = fieldStrips[modelName].includes(`|${fieldStrip}|`)
    if (!tf) msg += unacceptable
    return tf
  }
  function isInListEls(field: Field) {
    return fieldsListEl.innerText.includes(`${field.name}: ${field.type}`)
  }
  function addToFieldList(fieldName: string) {
    // if (!browser) return
    // Create nested  elements
    const span = document.createElement('span')
    span.textContent = fieldName
    const div = document.createElement('div')
    div.className = 'cr-list-el' // TODO is this necessary
    // Append span to div
    div.appendChild(span)

    // rendering simple div via innerHTML is slow compared to objects
    // div.innerHTML = `<span class='cr-list-el'>${fieldName}</span>`;
    // append div to the fieldsListEl
    ;(fieldsListEl as HTMLDivElement).appendChild(div)
  }
  /**
   * renders a field showing a tooltop 'click to remove' when hovered
   * @param fieldName
   */
  function renderField(fieldName: string) {
    setTimeout(() => {
      addToFieldList(fieldName)
      fieldListsInitialized = true
    }, 0)
    return
  }

  /**
   * scrols fields list to show the last element
   * @param el
   */
  const scroll = (el: HTMLDivElement) => {
    if (
      el.offsetHeight + el.scrollTop >
      el.getBoundingClientRect().height - 20
    ) {
      setTimeout(() => {
        el.scrollTo(0, el.scrollHeight)
      }, 0)
    }
  }
  /**
   * ensures field entry is a fieldName: type
   * @param val
   */
  function adjustFiledNameAndType(val: string) {
    val = val.replace(/\\s+/g, '')

    const m = val.match(/\s*([a-zA-z0-9_]+)\s*:?\s*([a-zA-z0-9_]+)?$/)
    if (!m) return val
    if (m[2]) {
      val = `${m[1]}: ${m[2]}`
    }
    return val
  }
  /**
   * clear a label message after timeout
   */
  function clearLabelText() {
    clearTimeout(timer)

    routeLabelEl.style.color = ''
    routeLabelNode.textContent = 'Route Name'
  }
  /**
   * temporarily change label text and returns after timeoit
   * @param color
   * @param text
   * @param duration
   */
  function setLabelCaption(
    color: string,
    text: string,
    duration: number,
    type: string = 'route',
  ) {
    // preserve text to restore at timeout
    const [node, label, restore] =
      type === 'route'
        ? [routeLabelNode, routeLabelEl, 'Route Name']
        : [fieldLabelNode, fieldLabelEl, fieldNameAndType]
    node.textContent = text
    label.style.color = color
    if (duration > 0) {
      timer = setTimeout(() => {
        node.textContent = restore
        label.style.color = ''
      }, duration)
    } else if (color === 'pink') {
      clear = [node, label]
    }
  }
  let clear: Array<HTMLElement> = []
  let nokeyup = false
  setTimeout(() => {
    if (fieldNameEl) {
      ;(routeNameEl as HTMLInputElement).addEventListener('keyup', (_) => {
        setButtonAvailability()
      })
      ;(fieldNameEl as HTMLInputElement).addEventListener(
        'change',
        (event: Event) => {
          nokeyup = true
          if (clear.length) {
            setLabelCaption('black', 'FieldName and Type', 0, 'field')
            clear = []
          }
          const value = (event.target as HTMLInputElement).value.trim()
          if (!value || !isFieldAcceptable(value)) {
            return
          }
          renderField(value)
          setButtonAvailability()
        },
      )
      ;(fieldNameEl as HTMLInputElement).addEventListener(
        'keyup',
        (event: KeyboardEvent) => {
          if (nokeyup) {
            nokeyup = false
            return
          }

          let fieldName = (fieldNameEl as HTMLInputElement).value.trim()
          if (
            !fieldName ||
            !isFieldAcceptable(fieldName) ||
            event.key !== 'Enter'
          ) {
            return
          }

          fieldNameEl.value = ''
          if (deletedFields.has(fieldName)) {
            ;(fieldsListEl as HTMLDivElement).appendChild(
              deletedFields.get(fieldName) as Node,
            )
            deletedFields.delete(fieldName)
            return
          }

          fieldName = adjustFiledNameAndType(fieldName)
          renderField(fieldName)
          scroll(fieldsListEl as HTMLDivElement as HTMLDivElement)
        },
      )
    }
  }, 200)

  function onMouseOver(e: MouseEvent) {
    const el = e.target as HTMLElement
    removeHintEl.style.top = String(el.offsetTop - el.offsetHeight) + 'px'
    removeHintEl.style.left = String(el.offsetLeft + 12) + 'px'
    removeHintEl.style.opacity = '1'
  }

  function onMouseOut(_: MouseEvent) {
    removeHintEl.style.opacity = '0'
  }
  function onDrop(_: MouseEvent) {
    console.log('onDrop')
  }

  function setButtonAvailability() {
    buttonNotAllowed = !fieldsListEl.innerText || !routeNameEl.value
  }
  function onClick(e: MouseEvent) {
    const el = e.target as HTMLElement
    removeHintEl.style.opacity = '0'

    if (fieldNameEl.value === '') {
      fieldNameEl.value = el.innerText
      fieldNameEl.focus()
    }
    deletedFields.set(el.innerText, el)
    el.remove()
    setButtonAvailability()
  }

  onMount(() => {
    const createCrudSupportEl = document.getElementById(
      'createBtnId',
    ) as HTMLDivElement
    createCrudSupportEl.onclick = () => {
      postMessage('createCRUDSupport', {
        modelName,
        payload: uiModels[modelName],
      })
    }

    fieldNameEl = document.getElementById('fieldNameId') as HTMLInputElement
    schemaContainerEl = document.getElementById(
      'schemaContainerId',
    ) as HTMLDivElement
    fieldsListEl = document.getElementById('fieldsListId') as HTMLDivElement
    middleColumnEl = document.getElementById('middleColumnId') as HTMLDivElement
    removeHintEl = document.getElementById(
      'removeHintId',
    ) as HTMLParagraphElement
    routeNameEl = document.getElementById('routeNameId') as HTMLInputElement
    removeHintEl.style.opacity = '0' // make it as a cr-hidden tooltip
    routeLabelEl = document.querySelector(
      "label[for='routeNameId']",
    ) as HTMLLabelElement
    fieldLabelEl = document.querySelector(
      "label[for='fieldNameId']",
    ) as HTMLLabelElement
    routeLabelNode = Array.from(routeLabelEl.childNodes).filter(
      (node) => node.nodeType === Node.TEXT_NODE,
    )[0] as HTMLElement
    fieldLabelNode = Array.from(fieldLabelEl.childNodes).filter(
      (node) => node.nodeType === Node.TEXT_NODE,
    )[0] as HTMLElement
    schemaContainerEl.innerHTML = prismaSumDetailsBlock

    schemaContainerEl!.addEventListener('click', async (event: MouseEvent) => {
      if ((event.target as HTMLElement).tagName === 'SUMMARY') {
        middleColumnEl.classList.toggle('cr-middle-column-height')
        // now at app level active modelName
        modelName = (event.target as HTMLElement).innerText
        const details = (event.target as HTMLElement).closest('details')
        if (details && details.open) {
          stopRenderField = true
          setTimeout(() => {
            // has to use setTimeout as the element is still in opening
            details.removeAttribute('open')
            stopRenderField = false
            ;(fieldsListEl as HTMLDivElement).innerHTML = ''
            fieldNameEl.value = ''
          }, 100)
          clearLabelText()
          pipeElsString = `!`
          clearListEls()
          closeSchemaModels()
          eh.destroy()
          return
        }
        if (anyOpenDetails()) {
          closeSchemaModels()
          await sleep(500)
        }
        setLabelCaption('pink', 'Change Route Name if necessary', 4000)
        // ------------ adding fields into listEls --------------------
        routeNameEl.value = modelName.toLowerCase()
        fields = []

        // console.log('field', uiModels[modelName].fields.length);
        for (const field of uiModels[modelName].fields) {
          // console.log('field', field.name)
        }
        for (const field of uiModels[modelName].fields) {
          if (stopRenderField) {
            break
          }
          const fld = `${field.name}: ${field.type}`
          fields.push(fld)
          renderField(fld)
          await sleep(50)
        }
        if (pipeElsString === '!') {
          for (const field of uiModels[modelName].fields) {
            pipeElsString += `${field.name}: ${field.type}|`
          }
        }
        // field list takes time to load field names
        setTimeout(() => {
          fieldsListEl.ondrop = onDrop
          eh.setup(fieldsListEl, {
            click: onClick,
            mouseover: onMouseOver,
            mouseout: onMouseOut,
          })
          // drag-drop to move fieldNames up and down the fields list
          eh.setup(fieldsListEl)
          buttonNotAllowed = false
        }, 0)

        //----------------
      } else {
        // ----------- PRISMA KEYUP HANDLER clicked on a field name in <details> block ---------------
        const el = event.target as HTMLDivElement
        let fieldName = el.innerText
        try {
          const type = el.nextSibling?.textContent?.match(
            /type:(\w+)/,
          )?.[1] as string
          fieldName += ': ' + type
        } catch (err: unknown) {
          handleTryCatch(err)
        }
        if (!isFieldAcceptable(fieldName)) {
          return
        }
        fieldNameEl.value = ''
        if (deletedFields.has(fieldName)) {
          ;(fieldsListEl as HTMLDivElement).appendChild(
            deletedFields.get(fieldName) as Node,
          )
          setButtonAvailability()
          deletedFields.delete(fieldName)
          return
        }
        renderField(fieldName)
        fieldStrips[modelName] += fieldName + '|'
      }
    })
    // for (let i = 1; i < 10; i++) {
    // 	console.log(localStorage.getItem(`click-over-out${i}`));
    // 	console.log(localStorage.getItem(`drag-drop${i}`));
    // }
    // localStorage.clear();
    return () => {
      eh.destroy()
    }
  })

  // -----------------------------------
  // for Wevschema Extension
  let stopRenderField = false
  function closeSchemaModels() {
    stopRenderField = true
    fields = []
    routeNameEl.value = ''
    fieldNameEl.value = ''
    const children = schemaContainerEl?.children as HTMLCollection
    closeDetails(children)
    buttonNotAllowed = true
    setTimeout(() => {
      fieldsListEl.innerHTML = ''
      stopRenderField = false
      deletedFields.clear()
    }, 400)
  }
  let buttonNotAllowed = $state<boolean>(true)
</script>

<svelte:head>
  <title>CRUD Support</title>
</svelte:head>

<div id="crudUIBlockId" class="cr-main-grid">
  <div class="cr-grid-wrapper">
    <cr-pre class="cr-span-two">
      To create a UI Form for CRUD operations against the underlying ORM fill
      out the <i>Candidate Fields</i>
      by entering field names in the <i>Field Name and Type</i> input box with
      its datatype, e.g. firstName: string, and cr-pressing the Enter key or
      expand a table from the
      <i>Select Fields from ORM</i> block and click on a field name avoiding the auto-generating
      fields usually colored in pink. The UI Form +page.svelte with accompanying +page.server.ts
      will be created in the route specified in the Route Name input box.
    </cr-pre>

    <div class="cr-left-column">
      <label for="routeNameId"> Route Name </label>
      <input
        id="routeNameId"
        type="text"
        placeholder="app name equal routes folder name"
      />
      <label for="fieldNameId"> Field Name and Type </label>
      <input id="fieldNameId" type="text" placeholder="fieldName: type" />
      <div
        id="createBtnId"
        style="font-size: 14px !important;cursor:pointer;"
        class:notallowed={buttonNotAllowed}
      >
        Create CRUD Support
      </div>
      <div class="cr-crud-support-done cr-hidden"></div>
      <div id="messagesId" style="z-index:10;width:20rem;">Messages:</div>
    </div>

    <div id="middleColumnId" class="cr-middle-column cr-middle-column-height">
      <div class="cr-fields-list cr-fields-list-height" id="fieldsListId"></div>
      <p id="removeHintId" class="cr-remove-hint">click to remove</p>
    </div>

    <div class="embellishments">
      <div class="checkbox-item">
        <input id="CRInput" type="checkbox" checked />
        <label for="CRInput">CRInput component</label>
      </div>
      <div class="checkbox-item">
        <input id="CRSpinner" type="checkbox" checked />
        <label for="CRSpinner">CRSpinner component</label>
      </div>
      <div class="checkbox-item">
        <input id="CRActivity" type="checkbox" checked />
        <label for="CRActivity">CRActivity component</label>
      </div>
      <div class="checkbox-item">
        <input id="CRTooltip" type="checkbox" checked />
        <label for="CRTooltip">Tooltip component</label>
      </div>
      <div class="checkbox-item">
        <input id="CRSummaryDetail" type="checkbox" checked />
        <label for="CRSummaryDetail">Summary/Details component</label>
      </div>
    </div>
  </div>

  <div id="rightColumnId" class="cr-right-column">
    <div id="schemaContainerId"></div>
  </div>
</div>

<style lang="scss">
  .cr-main-grid {
    display: grid;
    padding: 0.6rem 0 0 0.6rem;
    grid-template-columns: 33rem 20rem;
    margin-top: 0.5rem;
    width: 98vw;
  }

  .cr-grid-wrapper {
    display: grid;
    grid-template-columns: 20rem 12rem;
    column-gap: 0.5rem;
    row-gap: 1rem;
  }
  .cr-crud-support-done {
    width: max-content;
    padding: 5px 2rem;
    margin: 1rem 0 0 0;
    color: lightgreen;
    font-size: 14px;
    border: 1px solid gray;
    border-radius: 5px;
    cursor: pointer;
    text-align: center;
  }

  .cr-hidden {
    display: none;
    border: none;
  }

  .cr-left-column {
    @include container($head: 'Application Settings', $head-color: navy);
    border: 1px solid gray;
    border-radius: 8px;
    height: 54vh;
    padding: 1rem 0 0 0.7rem;
    background-color: var(--panel-bg-color);
    label {
      display: block;
      color: var(--candidate-color);
    }
    /* div {
      display: block;
    }*/
  }

  .cr-middle-column {
    @include container($head: 'Candidate Fields', $head-color: navy);
    position: relative;
    border: 1px solid gray;
    border-radius: 5px;
    padding: 1rem 6px 0 6px;
    height: 54vh;
    width: 12rem;
    background-color: var(--panel-bg-color);
  }

  :global(.cr-fields-list) {
    display: grid;
    grid-template-rows: 1.3rem;
    grid-auto-rows: 1.3rem;
    cursor: pointer;
    text-align: center;
    padding: 0;
    margin: 0 0 2rem 0;
    color: navy;
    :global(.cr-list-el) {
      background-color: var(--candidate-bg-color);
      color: var(--candidate-color);
      border: 1px solid #ccc;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    :global(.cr-list-el:first-child) {
      border-top-left-radius: 10px;
      border-top-right-radius: 10px;
    }
    :global(.cr-list-el:last-child) {
      border-bottom-left-radius: 10px;
      border-bottom-right-radius: 10px;
    }
  }
  .cr-remove-hint {
    position: absolute;
    left: 1.5rem !important;
    z-index: 10;
    font-size: 12px;
    color: red;
    padding: 0 0.5rem 1px 0.5rem;
    background-color: cornsilk;
    opacity: 0;
    text-align: center;
    border: 1px solid lightgray;
    border-radius: 5px;
    transition: opacity 0.2s;
    pointer-events: none;
    white-space: nowrap;
  }
  .cr-span-two,
  cr-pre {
    grid-column: 1 / span 2;
    text-align: justify;
    font-size: 12px;
    color: var(--pre-color);
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
    &::placeholder {
      font-size: 13px;
    }
    &:focus {
      outline: 1px solid gray;
    }
  }

  #schemaContainerId {
    height: 40rem;
    overflow-y: auto;
  }

  .cr-right-column {
    position: relative;
    @include container($head: 'Select UI Fields from ORM', $head-color: navy);
    border: 1px solid gray;
    border-radius: 4px;
    background-color: var(--panel-bg-color);
    height: 88vh;
  }
  .embellishments {
    @include container($head: 'Include Components', $head-color: navy);
    background-color: var(--panel-bg-color);

    position: relative;
    grid-column: span 2;
    display: grid;
    grid-template-columns: 1rem 20rem;

    column-gap: 0.5rem;
    row-gap: 0.1rem;
    align-items: center;
    padding: 8px 1rem;
    border: 1px solid gray;
    border-radius: 6px;
    user-select: none;
  }
  input {
    color: var(--input-color);
    background-color: var(--input-bg-color);
  }
  .checkbox-item {
    display: contents;
  }

  .checkbox-item input[type='checkbox'] {
    grid-column: 1;
    justify-self: start;
    align-self: center;
    margin: 0;
  }

  .checkbox-item label {
    grid-column: 2;
    justify-self: start;
    align-self: center;
    cursor: pointer;
    line-height: 1;
    width: 25rem !important;
  }

  .checkbox-item label:hover {
    background-color: cornsilk;
    cursor: pointer;
    width: 25rem !important;
  }
  :global(.cr-model-attr) {
    grid-column: span 2;
    width: 18rem;
    padding: 0;
    margin: 0 0 0 1rem;
    text-wrap: wrap;
    color: tomato;
    font-size: 13px;
  }
  :global(.cr-model-block) {
    height: 40rem;
    overflow-y: auto;
  }
  :global(.cr-model-name) {
    color: var(--summary-color);
    background-color: var(--summary-bg-color);
    margin-top: 3px;
    width: 18rem;
    border-radius: 6px;
    padding-left: 1rem;
    cursor: pointer;
  }

  :global(.cr-fields-column) {
    display: grid;
    grid-template-columns: 7rem 9.5rem;
    column-gap: 5px;
    width: max-content;
    padding: 6px 0 6px 1rem;
    height: auto;
    font-family: Georgia, 'Times New Roman', Times, serif;
    font-size: 15px !important;
    font-weight: 500 !important;
  }

  :global(.cr-fields-column p) {
    margin: 4px 0 0 0;
    padding: 2px 0 0 4px;
    border-bottom: 1px solid lightgray;
    text-wrap: wrap;
  }

  :global(.cr-fields-column p:nth-child(odd)) {
    color: skyblue;
    cursor: pointer;
    width: 100%;
    padding: 2px 0 2px 0.5rem;
  }

  :global(.cr-fields-column p:nth-child(even)) {
    font-weight: 400 !important;
    font-size: 12px !important; /* prisma attrs column */
  }
  #createBtnId {
    outline: none;
    border: 1px solid gray;
    border-radius: 5px;
    font-weight: 400;
    padding: 4px 1rem;
    color: #f8f9fa;
    background-color: navy;
    border: 1px solid gray;
    width: max-content;
    cursor: pointer;
  }
  .notallowed {
    opacity: 0.3;
    cursor: not-allowed;
  }
  /*.rectangle {
    width: 6rem;
    height: 6rem;
    border: 3px solid navy;
    border-radius: 8px;
    background-color: lightgreen;
  }*/
</style>
