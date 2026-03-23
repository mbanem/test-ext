/*
  prisma/schema.prisma is actually loaded by extension
*/
// import { handleTryCatch } from '$lib/utils'

// export type Field = { name: string; type: string; attrs?: string }
export type Field = {
  name: string
  type: string
  isArray: boolean
  isOptional: boolean
  attrs?: string
}
export type Model = {
  fields: Field[]
  attrs?: string[]
}
export type Models = Record<string, Model>

const modelRegex = /model\s+(\w+)\s*{([^}]*)}/gms
// const modelRegex = /model\s+(\w+)\s*{([\s\S]*?)^\}/gm
const strModelNames = new Set<string>()
const UI = {
  ui: 'ui',
  namesOnly: 'namesOnly',
  nonUI: 'nonUI',
  all: 'all'
} as const
type UIType = (typeof UI)[keyof typeof UI]
const primitiveTypes = new Set([
  'string',
  'number',
  'boolean',
  'Date',
  'float',
  'decimal',
  'json'
])

// found in utils but included here for you CA
export const handleTryCatch = (err: unknown, info?: string) => {
  const msg = err instanceof Error ? err.message : String(err)
  //(info, msg)
}

// schema.prisma usually have fields in order that are not likeable
// like having Id filds in the middle of the list, so the orderedNames
// is forceing list to begin with orderedNames field names if any and 
// then including the rest of schema.prisma fields
const orderedNames = new Set<string>([
  'id',
  'authorId',
  'userId',
  'employeeId',
  'customerId',
  'ownerId',
  'firstName',
  'lastName',
  'middleName',
  'name',
  'completed',
  'profileId',
  'dob',
  'dateOfBirth',
  'email',
  'password',
  'bio',
  'biography',
  'address',
  'city',
  'state',
  'title',
  'content',
  'category',
  'role',
  'priority',
  'price',
  'updatedAt'
])

/**
   * Inside sortModelsByOrdered check if field is UI/data-entry field
   * @param field: type Field= { name: string; type: string; attrs?: string }
   */
function isUICandidate({ name, type, attrs }: Field): boolean {
  type = type.toLowerCase().trim()
  attrs = attrs ?? ''
  if (strModelNames.has(type) || strModelNames.has(name)) {
    return false
  }
  if (
    /[\|\|]/.test(type) ||
    name.includes('@@') ||
    (type === 'Date' && /createdAt/i.test(name)) ||
    /hash|token/i.test(name)
  ) {
    return false
  }
  const ui = /\b@id @default(uuid())\b/i.test(attrs) || primitiveTypes.has(type)
  return ui
}
/**
   * makes LIST od model names |User|Profile|Todo|...
   * @param schema.prisma
   */
function makeStrModelNames(schemaContent: string) {
  let modelMatch
  while ((modelMatch = modelRegex.exec(schemaContent)) !== null) {
    strModelNames.add(modelMatch[1])
  }
}

/**
 *  LEADING array part sorted by orderedNames followed by leftowers
*/
function sortModelsByOrdered(models: Models, kind: UIType = UI.all) {
  let orderedFields: Field[] = []
  let leftoverFields: Field[] = []
  const uiModels: Models = {}
  const nuiModels: Models = {}
  for (const [modelName, model] of Object.entries(models)) {
    let uiNames = '|'
    let uiStrips = '|'
    const fieldNames: Record<string, string> = {}
    const fieldStrips: Record<string, string> = {}
    // must create entry for model name as uiModels[modelName].fields
    // are two-level deep so it does not exists until first level is done
    uiModels[modelName] = { fields: [], attrs: [] }
    nuiModels[modelName] = { fields: [], attrs: [] }
    const fieldMap = new Map(model.fields.map(f => [f.name, f]))
    if (kind === UI.ui || kind === UI.all) {
      for (const key of orderedNames) {
        // orderedNames array holds UI/data-entry field names
        // const field = model.fields.find((field) => field.name === key) as Field
        const field = fieldMap.get(key)
        if (field) {
          orderedFields.push(field)
          uiNames += field.name + '|'
          uiStrips += `${field.name}: ${field.type}` + '|'
        }
      }
      for (const field of model.fields) {
        // for rest of fields not selected by orderedNames test if they are UI candidates
        if (!orderedFields.includes(field) && isUICandidate(field)) {
          orderedFields.push(field)
          uiNames += field.name + '|'
          uiStrips += `${field.name}: ${field.type}` + '|'
        }
      }
    }
    for (const field of model.fields) {
      if (!orderedFields.includes(field)) {
        leftoverFields.push(field)
      }
    }
    orderedFields = orderedFields.filter(Boolean)
    uiModels[modelName].fields = orderedFields
    nuiModels[modelName].fields = leftoverFields
    nuiModels[modelName].attrs = models[modelName].attrs
    fieldNames[modelName] = uiNames
    fieldStrips[modelName] = uiStrips
    // cr-prepare for next model
    orderedFields = []
    leftoverFields = []
    // uiNames = ''
  }
  return [uiModels, nuiModels]
}

export function parsePrismaSchema(schemaContent: string): { uiModels: Models, nuiModels: Models, fieldStrips: Record<string, string> } {
  //('parsePrismaSchema', schemaContent.length)
  const models: Models = {}
  // let uiModels: Models = {}
  // let nuiModels: Models = {}
  // const fieldNames: Record<string, string> = {}
  const fieldStrips: Record<string, string> = {}
  // models = {}
  type Fields = Field[]
  let fields: Fields = []
  makeStrModelNames(schemaContent)
  //('strModelNames', strModelNames)
  let modelMatch

  try {
    while ((modelMatch = modelRegex.exec(schemaContent)) !== null) {
      const [, modelName, body] = modelMatch
      const modelAttrs: string[] = []
      //('parsePrismaSchema model loop', modelName)
      // // Remove block comments first
      const bodyWithoutBlocks = body.replace(/\/\*[\s\S]*?\*\//g, '')

      const lines = bodyWithoutBlocks
        .split('\n')
        .map((line) => line.trim().replace(/\s{2,}|\t/gm, ' '))
        .filter(Boolean)
      // console.log('lines.length', lines.length);
      for (let line of lines) {
        //('line', line)
        line = line
          .trim()
          .replace(/String/g, 'string')
          .replace(/DateTime/g, 'Date')
          .replace(/Int/g, 'number')
          .replace(/Boolean/g, 'boolean')
        // .replace(/[?]/g, '')

        if (line.startsWith('//')) {
          continue
        }

        const parts = line.split(/\s+/) // split on whitespace

        if (line.startsWith('@@')) {
          // Block attribute
          modelAttrs.push(line)
        } else if (parts.length >= 2) {
          // console.log('field', parts[0], parts[1])
          // build fields incrementally
          fields.push({
            name: parts[0],
            type: parts[1],
            isArray: parts[1].includes('[]'),
            isOptional: parts[1].includes('?'),
            attrs: parts.slice(2).join(' ')
          })
        }
      }
      models[modelName] = {
        fields: fields, //: sortObjectKeys(fields),
        attrs: modelAttrs
      }

      fields = []
    }
  } catch (err) {
    handleTryCatch(err)
  }
  const [uiModels, nuiModels] = sortModelsByOrdered(models, UI.all)
  // models = {}
  // console.log(uiModels, nuiModels, fieldStrips)
  return { uiModels, nuiModels, fieldStrips }
}