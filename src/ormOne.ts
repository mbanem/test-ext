import * as vscode from 'vscode'
import { exec } from 'child_process'
import * as util from 'util'
import { runCommandStream } from './run-command-stream' // your file with the function
import {
  waitForNewFile,
  CommandResultTracker,
  getVideoUris,
  areShallowEqual,
} from './extension.js'
import * as fs from 'fs'
import * as path from 'path'
import { Client } from 'pg'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { parsePrismaSchema } from './webview-ui/src/lib/utils/parse-prisma-schema.js'
import { SvelteSet } from 'svelte/reactivity'

let db: DbParams = {}
let paths: TPaths
const videoNames = [
  'CRInput',
  'CRSpinner',
  'CRActivity',
  'CRTooltip',
  'CRSummaryDetails',
  'CRModelPermissioins',
]
const pendingText = `
This file is used as a flag to indicate that the second part of
Prisma ORM installation is pending and not yet completed.
It will be deleted  after the second part of installation is done.
if you manually finished the second part please delete this file.
`

let pm = 'unknown'
let ex = 'unknown'
// property names are according to pg.client
interface DatabaseConfig {
  provider: string
  user: string
  password: string
  host: string
  port: string
  database: string
}

function isConnectionStringOK(): boolean {
  let result = true
  const envDb: { [key: string]: string | number } = {}
  const envContent = fs.readFileSync(paths.env, 'utf-8')
  // NOTE in the DATABASE_URL schema entry is optional so we do not parse for it
  const regex =
    /^\s*DATABASE_URL=(?<provider>[^:]+):\/\/(?<user>[^:]+):(?<password>[^@]+)@(?<host>[^:]+):(?<port>[^/]+)\/(?<database>[^?]+)/m

  const match = envContent.match(regex)
  if (!match || !match.groups) {
    return false
  }
  // any missing <group name> renders invalid DATABASE_URL
  for (const [k, v] of Object.entries(
    match.groups as Partial<DatabaseConfig>,
  )) {
    if ((v as string).trim() === '') {
      result = false
    }
    envDb[k] = v
  }
  if (result && !areShallowEqual(db, envDb)) {
    db = envDb
  }

  return result
}

// function areSchemaAndEnvOK(): { models: Models; connOK: boolean } {
//   const { models, enums } = parsePrismaSchema(
//     fs.readFileSync(paths.schema, 'utf-8'),
//   )
//   const envContent = fs.readFileSync(paths.env, 'utf-8')
//   const connOK = isConnectionStringOK(envContent)
//   return { models, connOK: connOK }
// }

// Convert exec into a promise-based function
const execPromise = util.promisify(exec)

export async function validatePrismaSchema(): Promise<{
  success: boolean
  message: string
}> {
  // 1. Get the current workspace root folder
  // const workspaceFolders = vscode.workspace.workspaceFolders
  // if (!workspaceFolders) {
  //   return { success: false, message: 'No workspace folder open.' }
  // }
  // const workspaceRoot = workspaceFolders[0].uri.fsPath

  try {
    // 2. Run pnpm prisma validate inside the workspace directory
    // stdout captures the success message, stderr captures warnings
    const { stdout, stderr } = await execPromise('pnpm prisma validate', {
      cwd: paths.root, // Sets the execution context to your project root
    })

    return {
      success: true,
      message: stdout || stderr || 'Schema is valid!',
    }
  } catch (error: any) {
    // 3. Prisma returns exit code 1 if validation fails
    // The validation errors will be caught inside error.stderr or error.message
    return {
      success: false,
      message: error.stderr || error.message || 'Validation failed.',
    }
  }
}

type TConfigState = {
  modelsOK: boolean
  connOK: boolean
  err: string
}
// TODO if this does not work replace it with abowr commented out function
async function areSchemaAndEnvOK(): Promise<TConfigState> {
  let modelsOK = false
  let errLines = ''

  // const result = await runCommandStream(
  //   'pnpm',
  //   ['exec', 'prisma', 'validate'],
  //   {
  //     useReporter: false,
  //     cwd: paths.root,

  //     onStdout: (text: string) => {
  //       if (text.includes('is valid') || text.includes('The schema at')) {
  //         modelsOK = true
  //       }
  //     },

  //     onStderr: (text: string) => {
  //       // Only treat real errors as failure
  //       if (/^(?:error:|Error:|P\d{4})/m.test(text)) {
  //         const regex = /^(?:error:|\d+\s+\|).*/gm
  //         const matches = text.match(regex)
  //         if (matches) {
  //           errLines = matches.join('\n')
  //           modelsOK = false
  //         }
  //       }
  //       // Ignore "Loaded config", "schema loaded", etc.
  //     },
  //   },
  // )
  const result = await validatePrismaSchema()
  // Safety net
  if (result.success && !errLines) {
    modelsOK = true
  }

  const connOK = isConnectionStringOK()

  return {
    modelsOK,
    connOK,
    err: errLines,
  }
}
function createPendingFile() {
  fs.writeFileSync(paths.pending, pendingText, 'utf-8')
}
function deletePendingFile() {
  if (fs.existsSync(paths.pending)) {
    fs.unlink(paths.pending, (err) => {
      if (err) {
        console.log(
          'Could not delete installPartTwo.pending file at App Root. Delete it yourself',
        )
      }
    })
  }
}

async function openFilesInEditorTabs(
  thePaths: string[],
  webview?: vscode.Webview,
  beside: boolean = false,
): Promise<CommandResultTracker<boolean>> {
  let result = new CommandResultTracker<boolean>(true)
  try {
    // pin extension tab to make reak estate for two editor tabs schena & .env
    await vscode.commands.executeCommand('workbench.action.pinEditor')
    thePaths.forEach(async (p) => {
      let uri = vscode.Uri.file(p)
      // Open schema content in new tab (beside current editor)
      const pDoc = await vscode.window.showTextDocument(uri, {
        viewColumn: beside
          ? vscode.ViewColumn.Beside
          : vscode.ViewColumn.Active, // Opens beside active editor
        preview: false, // Optional: Force a new tab (not preview mode)
      })

      // Programmatically trigger a "dirty" state by appending and removing a space
      await pDoc.edit((editBuilder) => {
        // 1. Get the position at the very end of the document
        const position = pDoc.document.positionAt(0)
        //   pDoc.document.getText().length,
        // )
        // 2. Insert a space to make the file dirty for saving
        editBuilder.insert(position, ' ')
      })

      // At this point, the document is officially marked as dirty.
      // Now, remove temporary character so the actual text isn't fundamentally altered.
      // Some editors would ignore saving as nothing was actually changed
      // await pDoc.edit((editBuilder) => {
      //   // const textLength = pDoc.document.getText().length
      //   const position = pDoc.document.positionAt(0)
      //   // const endPosition = pDoc.document.positionAt(textLength)

      //   // Create a range over that temporary space and delete it
      //   const rangeToRemove = new vscode.Range(position, position)
      //   editBuilder.delete(rangeToRemove)
      // })
      // 1. Create a range at the very start of the document (Line 0, Column 0)
      // const position = new vscode.Position(0, 0)
      // const range = new vscode.Range(position, position)
      //   new vscode.Position(0, 0),
      //   new vscode.Position(0, 1),
      // )
      const range = new vscode.Range(0, 0, 0, 0)
      // 2. Reveal that range at the top of the editor
      pDoc.revealRange(range, vscode.TextEditorRevealType.AtTop)
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    result.setSuccess(false)
  }
  return result
}
// Find what Package Manager is installed to carry on installation of NPM packages
type PMErr = { err: string }
const pathManager = {
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn.lock',
  'bun.lockb': 'bun',
  'package-lock.json': 'npm',
}
function detectPackageManager(): string {
  let pm = 'unknown'
  for (const [p, h] of Object.entries(pathManager)) {
    if (fs.existsSync(path.join(paths.root, p))) {
      pm = h
    }
  }
  return pm
}
function extractBuildApprovalPackages(line: string): string[] {
  const match = line.match(/Ignored build scripts:\s*(.+?)(?:\s*Run|$)/i)
  if (!match) {
    return []
  }

  return match[1]
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

const pex = { npm: 'npx', pnpm: 'pnpx', bun: 'bunx', yarn: 'yarnx' }
function xPackageManager(pm: string): string {
  let pnx = 'unknown'
  for (const [p, ex] of Object.entries(pex)) {
    if (pm === p) {
      pnx = ex
    }
  }
  return pnx
}
type TPrismaCommandArgs = {
  init: string[]
  migrate: string[]
  generate: string[]
}
function getPrismaComandArgs(): TPrismaCommandArgs {
  // if (pm === 'pnpm') {
  return {
    init: ['prisma', 'init', '--datasource-provider', 'postgresql'],
    migrate: ['prisma', 'migrate', 'dev', '--name', 'init'],
    generate: ['prisma', 'generate'],
  }
  // }
}
const devDeps = [
  '@eslint/compat',
  '@eslint/js',
  '@prisma/adapter-pg',
  '@prisma/config',
  '@prisma/internals',
  '@sveltejs/vite-plugin-svelte',
  '@tsconfig/svelte',
  '@types/bcrypt',
  '@types/eslint',
  '@types/node',
  '@types/pg',
  '@types/vscode',
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  'concurrently',
  'esbuild',
  'eslint',
  'eslint-config-prettier',
  'eslint-plugin-svelte',
  'globals',
  'postcss',
  'postcss-load-config',
  'prettier',
  'prettier-plugin-svelte',
  'prisma',
  'sass',
  'sass-embedded',
  'svelte',
  'svelte-check',
  'svelte-preprocess',
  'ts-node',
  'tslib',
  'typescript',
  'typescript-eslint',
  'vite',
  'vite-plugin-sass-dts',
  'tslib',
]
const deps = [
  '@prisma/adapter-pg',
  '@prisma/client',
  '@prisma/internals',
  'bcrypt',
  'dotenv',
  'pg',
]
let initial = true
let schemaDoc: vscode.TextEditor | undefined
let envDoc: vscode.TextEditor | undefined
let pendingFileFound = false

export async function setupOrmOneMessageHandler(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
  thepaths: TPaths,
): Promise<CommandResultTracker<boolean>> {
  const webview = panel.webview
  paths = thepaths
  let result = new CommandResultTracker<boolean>(true)
  const set = new SvelteSet<string>()
  // 1. Listen for the save event
  const saveListener = vscode.workspace.onDidSaveTextDocument(
    async (document: vscode.TextDocument) => {
      set.add(path.basename(document.fileName))

      if (set.has('schema.prisma') && set.has('.env')) {
        const { modelsOK, connOK, err } = await areSchemaAndEnvOK()
        if (modelsOK && connOK) {
          try {
            webview.postMessage({
              command: 'showPage',
              page: 'OrmThree',
              from: 'ormOne',
            })
            deletePendingFile()
            saveListener.dispose()
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            console.log('[extension] parsePrismaSchema err', msg)
          }
        } else {
          webview.postMessage({
            command: 'notValidSchemaOrEnv',
            payload: { modelsOK, connOK },
          })
          // openSchemaAndEnvAgain()
        }
      }
    },
  )
  context.subscriptions.push(saveListener)
  paths = thepaths
  let messageListener: any
  let dispose = false
  // when installation succeeded approveAllBuildPackeges can come
  // so we allow from end of installation only those messages
  // for 60 sec
  let onlyApprove = false

  // just for the try/finally to dispose onDidReceiveMessage
  try {
    // wait for 'prismaPartOne' command from ormOne to bring db_ object as payload
    messageListener = webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case 'checkOnPendingFile':
          if (fs.existsSync(paths.pending)) {
            pendingFileFound = true
            const result = await openFilesInEditorTabs([
              paths.schema,
              paths.env,
            ])
            if (!result.success) {
              console.log(
                '[ormOne] openFilesInEditorTabs([paths.schema, paths.env] failed',
              )
            }
          }
          break
        case 'ready':
          let schema = ''
          schema = fs.readFileSync(paths.schema, 'utf-8')
          if (!schema) {
            console.log('[ormOne] cannot read schema.prisma')
            return
          }
          const { models, enums } = parsePrismaSchema(schema)
          if (!models) {
            console.log('[ormOne] parse schema.prisma returned no models')
            return
          }
          const appName = paths.root.match(
            /\/?([a-zA-z0-9_-]+)$/,
          )?.[1] as string

          const videoUris = getVideoUris(videoNames)
          panel!.webview.postMessage({
            command: 'sendingModels',
            payload: JSON.stringify({
              models,
              enums,
              appName,
              videoUris: videoUris,
            }),
          })
          break
        case 'close':
          saveListener.dispose()
          messageListener.dispose()
          panel!.dispose()
          break
        case 'prismaPartOne':
          if (pendingFileFound) {
            break
          }
          if (!initial) {
            result.setSuccess(true)
            return result
          }
          initial = false
          if (msg.dbParams) {
            db = JSON.parse(msg.dbParams)
          }
          pm = detectPackageManager()

          if (pm === 'unknown') {
            console.log('[ormOne] detectPackageManager err:' + pm)
            result.setSuccess(false)
            return result
          } else {
            ex = xPackageManager(pm)
          }
          result = await installPrisma(
            webview,
            {
              useOnlyBuiltDependencies: msg.useOnlyBuiltDependencies ?? true,
            },
            devDeps,
            '-D',
          )
          if (!result.success) {
            webview.postMessage({
              command: 'prismaInstallError',
              message: '❌ install devDependencies failed',
            })
            console.log(
              '[ormOne] setupOrmOneMessageHandler install devDependencies failed',
            )
            return result
          }

          // ===================================================================

          const execFileAsync = promisify(execFile)

          // ... inside prismaPartOne case, after installing packages:

          async function executeCommand(
            args: string[],
          ): Promise<CommandResultTracker<boolean>> {
            try {
              const { stdout, stderr } = await execFileAsync('pnpm', args, {
                cwd: paths.root,
                timeout: 30000,
              })

              if (stdout) {
                console.log('[ormOne] prisma stdout', stdout)
              }
              if (stderr) {
                console.log(
                  '[ormOne] execute command ',
                  args,
                  ' failed',
                  stderr,
                )
                webview.postMessage({
                  command: 'prismaInstallError',
                  message:
                    'prisma init --datasource-provider postgresql failed',
                })
                result.setSuccess(false)
                result.stderr = stderr || 'executeCommand failed'
                // console.error('[prisma stderr]', stderr)
                return result
              }

              webview.postMessage({
                command: 'prismaLog',
                text: stdout || stderr || 'Done',
              })

              result.setSuccess(true)
            } catch (error: any) {
              console.error('Prisma init error:', error)
              result.setSuccess(false)
              result.stderr = error.message || 'Prisma init failed'
            }
            return result
          }

          const args = getPrismaComandArgs()
          if (!(await executeCommand(args.init))) {
            result.setSuccess(false)
            return result
          }
          // ===================================================================
          const dblink = `DATABASE_URL=postgresql://${db.owner}:${db.password}@localhost:${db.port}/${db.name}?schema=public`
          if (fs.existsSync(paths.env)) {
            // read .env file content
            let envContent = fs.readFileSync(paths.env, 'utf-8')

            if (envContent.includes('DATABASE_URL')) {
              if (!envContent.includes(dblink)) {
                // comment out previous DATABASE_URL if exists and expand content by appending new connection string
                envContent = envContent
                  .trim()
                  .replace(
                    /(DATABASE_URL=)(.*)$/gm,
                    '//\tThe previous connection string\n//\t$1$2\n//\thas been replaced with the following\n' +
                      dblink,
                  )
                // write the updated content back to the .env file
                fs.writeFileSync(paths.env, envContent, 'utf-8')
              }
            } else {
              // no DATABASE_URL in .env file, just append the new connection string
              fs.appendFileSync(paths.env, '\n' + dblink, 'utf-8')
            }
          } else {
            // .env file does not exist, create it with the new connection string
            fs.writeFileSync(paths.env, dblink, 'utf-8')
          }
          let configOK = false

          configOK = await waitForNewFile(
            path.join(paths.root, 'prisma.config.ts'),
            30000,
          )
          let res = await areSchemaAndEnvOK()
          // if user did not fill dbparams valid we open .env and schema to make them vLID
          if (res.modelsOK && res.connOK) {
            result.setSuccess(configOK)
            result = await createRoleAndDb()
            if (!result.success) {
              webview.postMessage({
                command: 'prismaInstallError',
                message:
                  '[ormOne] ❌ Creating PostgresSQL Role and database failed',
              })
              console.log(
                '[ormOne] ❌ Creating PostgresSQL Role and database failed',
              )
              return result
            }
          }
          // +++++++++++++++ Create Uri for the schema file  +++++++++++++++++++++
          openFilesInEditorTabs([paths.schema, paths.env])

          // clear multiple /src/generated/prisma messages from .gitignore
          const gitignorePath = path.join(paths.root, '.gitignore')
          if (fs.existsSync(gitignorePath)) {
            const uniqueLines = [
              ...new Set(
                fs.readFileSync(gitignorePath, 'utf-8').split(/\r?\n/),
              ),
            ].join('\n')
            fs.writeFileSync(gitignorePath, uniqueLines.trim(), 'utf-8')
          }
          result.setSuccess(true)
          dispose = true
          // NOTE if user does not supply correct schema.prisma and connection string
          // and close the extension, when stated extension again it will know based
          // on the pending file to display schema and .env in Editor tabs and wait for
          // for them to be saved

          createPendingFile()
          // onlyApprove = true
          // webview.postMessage({
          //   command: 'prismaPartOneDone',
          //   payloaad: 'end of regular processing for prismaPartOne',
          // })
          // webview.postMessage({
          //   command: 'showPage',
          //   page: 'OrmThree',
          // })
          // return result
          break // TODO return result or break?

        case 'approveAllBuildPackages':
          // Run pnpm approve-builds (approves everything pending)
          await runCommandStream('pnpm', ['approve-builds'], {
            cwd: paths.root,
          })
          break

        case 'approveBuildPackage':
          await runCommandStream('pnpm', ['approve-builds', msg.package], {
            cwd: paths.root,
          })
          break
      }
    })
  } finally {
    if (!result.success) {
      webview.postMessage({
        command: 'prismaPartOneFailed',
      })
    }
  }
  return result
}

async function createRoleAndDb(): Promise<CommandResultTracker<boolean>> {
  let result = new CommandResultTracker<boolean>(true)
  // db admin must login in order to create role and database for the user,
  // so we connect to postgres with admin credentials
  const client = new Client({
    host: db.host as string,
    port: db.port as number,
    user: db.adminPwd as string, // admin user
    password: 'kiki',
    database: 'postgres',
  })

  try {
    // This resolves to undefined; do not assign it to a variable
    await client.connect()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.stack : String(err)
    result.error = err as Error
    result.setSuccess(false)
    return result
  }

  try {
    const roleExists = await client.query(
      `SELECT 1 FROM pg_roles WHERE rolname = $1`,
      [db.owner],
    )

    // role not found
    if (roleExists.rowCount === 0) {
      await client.query(
        `CREATE ROLE "${db.owner}" LOGIN PASSWORD '${db.password}' CREATEDB`,
      )
    }

    // check existence
    const res = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [db.name],
    )

    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE "${db.name}" OWNER "${db.owner}"`)
    }

    await client.end()

    result.setSuccess(true)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.stack : String(err)
    console.log(
      `[ormOne] Error occurred while creating role and database: ${msg}`,
    )
    result.error = err as Error
    result.setSuccess(false)
  }
  return result
}
// Main install function

async function installPrisma(
  webview: vscode.Webview,
  options: { useOnlyBuiltDependencies: boolean },
  packages: string[],
  dd: string,
): Promise<CommandResultTracker<boolean>> {
  let result = new CommandResultTracker<boolean>(false)
  let installArgs = dd === '' ? ['i', ...packages] : ['i', dd, ...packages]
  // if (options.useOnlyBuiltDependencies) {
  //   installArgs.push(
  //     '--config.onlyBuiltDependencies=prisma,@prisma/client,esbuild,sharp,@swc/core,better-sqlite3',
  //   )
  // }
  try {
    webview.postMessage({
      command: 'prismaInstallStart',
      message: `Starting Prisma at ${paths.root} dependencies installation...`,
    })

    result = await runCommandStream('pnpm', installArgs, {
      cwd: paths.root,
      timeoutMs: 10 * 60 * 1000,
      useNdjson: false,

      onProgress: (p) => {
        webview.postMessage({
          command: 'prismaProgress',
          percent: p.percent ?? 0,
          added: p.added,
          total: p.total,
          message: p.done
            ? 'Finalizing installation...'
            : `Installing packages: ${p.added ?? 0}/${p.total ?? '?'}`,
          rawLine: p.rawLine, // useful for debugging
        })
      },

      onStdout: (text: string) => {
        const lines = text.split(/\r?\n/)
        const approvalPackages = new Set<string>() // local to this chunk

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) {
            continue
          }

          // Detect approval warning
          if (
            trimmed.includes('Ignored build scripts:') ||
            trimmed.includes('approve-builds')
          ) {
            const packages = extractBuildApprovalPackages(trimmed)
            packages.forEach((pkg) => approvalPackages.add(pkg))
          }

          // Always log every line
          webview.postMessage({
            command: 'prismaLog',
            type: 'stdout',
            text: trimmed,
          })
        }

        // Send approval message ONLY ONCE per stdout chunk if we found any packages
        if (approvalPackages.size > 0) {
          webview.postMessage({
            command: 'prismaBuildApprovalNeeded',
            packages: Array.from(approvalPackages),
            message: 'Some packages require approval to run build scripts',
          })
        }
      },
      onStderr: (text: string) => {
        webview.postMessage({
          command: 'prismaLog',
          type: 'stderr',
          text: text.trim(),
        })
        return result
      },
    })

    if (result.success) {
      webview.postMessage({
        command: 'prismaInstallSuccess',
        message:
          '✅ npm packages and installed, follows prisma initialization...' +
            dd ===
          '-D'
            ? ' devDependencies'
            : ' dependencies',
      })
      result.setSuccess(true)
    } else {
      webview.postMessage({
        command: 'prismaInstallError',
        message: '❌ Installation failed',
        error: result.error?.message || 'Unknown error',
      })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.stack : String(err)
    result.error = err as Error
    result.setSuccess(false)
  }
  return result
}
