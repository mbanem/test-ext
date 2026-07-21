import * as vscode from 'vscode'
import { runCommandStream } from './run-command-stream' // your file with the function
import { waitForNewFile, CommandResultTracker } from './extension.js'
import * as fs from 'fs'
import * as path from 'path'
import { Client } from 'pg'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { parsePrismaSchema } from './webview-ui/src/lib/utils/parse-prisma-schema.js'
import { SvelteSet } from 'svelte/reactivity'

let db: DbParams = {}
let paths: TPaths
const pendingText = `
This file is used as a flag to indicate that the second part of
Prisma ORM installation is pending and not yet completed.
It will be deleted  after the second part of installation is done.
if you manually finished the second part please delete this file.
`
const schemaWhatToDo = `/*
MAKE YOUR PRISMA SCHEMA MODELS HERE
As databases could have stronger requests for naming tables and columns
use Prisma modification operators for renaming TypeScript model names
into new database names like
    model User {
      id      			String   @id @default(uuid())
      firstName    	String   @map("first_name")
      createdAt DateTime @default(now())   @map("created_at")
      @@map("users")
    }
Now in your program you use firstName but in db it is the first_name
and the table in program is User but in db users thanks to the operators
@map first_name and @@map users, as some db have
internal user table so we use plural instead.
*/`

const envWhatToDo = `# Environment variables declared in this file are automatically made available to Prisma.
// See the documentation for more detail: https://pris.ly/d/prisma-schema//accessing-environment-variables-from-the-schema

// Prisma supports the native connection string format for PostgreSQL, MySQL, SQLite, SQL Server, MongoDB and CockroachDB.
// See the documentation for all the connection string options: https://pris.ly/d/connection-strings

// example is for PostgreSQL, change values wrapped in
// username is a Role in PostgreSQL
// password is username's db password
// dbName is database name to connect to

DATABASE_URL="postgresql://username:password@localhost:5432/dbName?schema=public"

// see docs for how to use SECRET_API_KEYs
SECRET_APT_KEY="kiki:kiki@localhost:5432
SECRET_APT_ENV=development
SECRET_API_KEY=1234567890
`

let pm = 'unknown'
let ex = 'unknown'
interface DatabaseConfig {
  provider: string
  user: string
  password: string
  host: string
  port: string
  database: string
}

function isConnectionStringOK(url: string): boolean {
  let result = true
  // NOTE in connection string schema is optional
  const regex =
    /^\s*DATABASE_URL=(?<provider>[^:]+):\/\/(?<user>[^:]+):(?<password>[^@]+)@(?<host>[^:]+):(?<port>[^/]+)\/(?<database>[^?]+)/m

  const match = url.match(regex)
  if (!match || !match.groups) {
    return false
  }
  for (const v of Object.values(
    match.groups as Partial<DatabaseConfig>,
  ) as string[]) {
    if ((v as string).trim() === '') {
      result = false
    }
  }
  return result
}

function areSchemaAndEnvOK(): { models: Models; connOK: boolean } {
  const { models, enums } = parsePrismaSchema(
    fs.readFileSync(paths.schema, 'utf-8'),
  )
  const envContent = fs.readFileSync(paths.env, 'utf-8')
  const connOK = isConnectionStringOK(envContent)
  return { models, connOK: connOK }
}
function createPendingFile() {
  fs.writeFileSync(paths.pending, pendingText, 'utf-8')
}
function deletePendingFile() {
  //  console.log('[ormOne] tries to delete pending file')
  if (fs.existsSync(paths.pending)) {
    //    console.log('[ormOne] pending fils exists')
    fs.unlink(paths.pending, (err) => {
      if (err) {
        console.log(
          'Could not delete installPartTwo.pending file at App Root. Delete it yourself',
        )
      } else {
        //        console.log('[ormOne] pending file deleted')
      }
    })
  }
}

async function openFilesInEditorTabs(
  thePaths: string[],
  webview?: vscode.Webview,
): Promise<CommandResultTracker<boolean>> {
  let result = new CommandResultTracker<boolean>(true)
  try {
    // pin extension tab to make reak estate for two editor tabs schena & .env
    await vscode.commands.executeCommand('workbench.action.pinEditor')
    thePaths.forEach(async (p) => {
      let uri = vscode.Uri.file(p)
      // Open schema content in new tab (beside current editor)
      const pDoc = await vscode.window.showTextDocument(uri, {
        viewColumn: vscode.ViewColumn.Active, // Opens beside active editor
        preview: false, // Optional: Force a new tab (not preview mode)
      })

      // Programmatically trigger a "dirty" state by appending and removing a space
      await pDoc.edit((editBuilder) => {
        // 1. Get the position at the very end of the document
        const endPosition = pDoc.document.positionAt(
          pDoc.document.getText().length,
        )

        // 2. Insert a temporary character (e.g., a space)
        editBuilder.insert(endPosition, ' ')
      })

      // At this point, the document is officially marked as dirty.
      // Now, remove temporary character so the actual text isn't fundamentally altered.
      // Some editors would ignore saving as nothing was actually changed
      await pDoc.edit((editBuilder) => {
        const textLength = pDoc.document.getText().length
        const lastCharPosition = pDoc.document.positionAt(textLength - 1)
        const endPosition = pDoc.document.positionAt(textLength)

        // Create a range over that temporary space and delete it
        const rangeToRemove = new vscode.Range(lastCharPosition, endPosition)
        editBuilder.delete(rangeToRemove)
      })
      // 1. Create a range at the very start of the document (Line 0, Column 0)
      const startPosition = new vscode.Position(0, 0)
      const startRange = new vscode.Range(startPosition, startPosition)

      // 2. Reveal that range at the top of the editor
      pDoc.revealRange(startRange, vscode.TextEditorRevealType.AtTop)
    })
    webview?.postMessage({
      command: 'schemaAndEnvInEditorTabs',
      payload: 'show requirements for schema and .env',
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    //    console.log('[ormOne] openFilesInEditorTabs', err)
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
    (document: vscode.TextDocument) => {
      // const saveDocUri = document.uri.toString()
      //      console.log('[ormOne] onDidSaveTextDocument saved', document.fileName)
      set.add(path.basename(document.fileName))
      //      console.log('[ormOne] onDidSaveTextDocument saved documents', set)

      if (set.has('schema.prisma') && set.has('.env')) {
        const { models, connOK } = areSchemaAndEnvOK()
        //        console.log('[ormOne] models', models, connOK)
        if (models && connOK) {
          //          console.log('[ormOne] schema and connection string are OK and')
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
            payload: { models, connOK },
          })
          // openSchemaAndEnvAgain()
        }
      }
    },
  )
  context.subscriptions.push(saveListener)
  //  console.log('[ormOne] set onDidReceiveMessage')
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
          //          console.log('[ormOne] got checkOnPendingFile')
          if (fs.existsSync(paths.pending)) {
            // console.log('[ormOne] pending file found')
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
          console.log(
            '[ormOne] got "ready" from OrmThree, reading schema.prisma',
          )
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
          //          console.log('[extension] models.length?', Object.keys(models).length)
          //          console.log('[extension] postMessage "sendingModels" stringified')
          //          console.log('[ormOne] extracting appName from', paths.root)
          const appName = paths.root.match(
            /\/?([a-zA-z0-9_-]+)$/,
          )?.[1] as string

          panel!.webview.postMessage({
            command: 'sendingModels',
            payload: JSON.stringify({
              models,
              enums,
              appName,
            }),
          })
          break
        case 'close':
          //          console.log('[ormOne]  extension is closing, panel!.dispose()')
          saveListener.dispose()
          messageListener.dispose()
          panel!.dispose()
          break
        case 'prismaPartOne':
          if (pendingFileFound) {
            console.log(
              '[ormOne] got prismaPartOne but ignored as pendigFileFound',
              pendingFileFound,
            )
            break
          }
          //          console.log('[ormOne] received prismaPartOne message', msg)
          if (!initial) {
            console.log(
              '[ormOne] get prismaPartOne but initial is false, will return success',
            )
            result.setSuccess(true)
            return result
          } else {
            //  console.log(
            //   '[ormOne] command prismaPartOne received, initial is true',
            // )
          }
          initial = false
          if (msg.dbParams) {
            db = JSON.parse(msg.dbParams)
            //            console.log('[ormOne] got prismaPartOne received db ', db)
          }
          pm = detectPackageManager()

          if (pm === 'unknown') {
            console.log('[ormOne] detectPackageManager err:' + pm)
            result.setSuccess(false)
            return result
          } else {
            //            console.log('[ormOne] package manager is', pm)
            ex = xPackageManager(pm)
          }
          // console.log('[ormOne] installPrisma first call')
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
          // console.log('[ormOne] installPrisma second call')
          result = await installPrisma(
            webview,
            {
              useOnlyBuiltDependencies: msg.useOnlyBuiltDependencies ?? true,
            },
            deps,
            '',
          )
          if (!result.success) {
            webview.postMessage({
              command: 'prismaInstallError',
              message: '❌ Install dependencies failed',
            })
            console.log(
              '[ormOne] setupOrmOneMessageHandler install dependencies failed',
            )
            return result
          }

          //          console.log('[ormOne] NEXT -- IMPORTANT PRISMA INIT MESSAGE')
          // ===================================================================

          const execFileAsync = promisify(execFile)

          // ... inside prismaPartOne case, after installing packages:
          //          console.log('[ormOne] Starting Prisma init with direct spawn...')

          async function executeCommand(
            args: string[],
          ): Promise<CommandResultTracker<boolean>> {
            try {
              const { stdout, stderr } = await execFileAsync('pnpm', args, {
                cwd: paths.root,
                timeout: 30000, // 🚀 Raised to 30 seconds for absolute safety
              })

              if (stdout) {
                //                console.log('[ormOne] prisma stdout', stdout)
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
          //          console.log('[ormOne]  getPrismaComandArgs treturned', args)
          if (!(await executeCommand(args.init))) {
            //            console.log('[ormOne] prisma init failed')
            result.setSuccess(false)
            return result
          }
          // ===================================================================
          const dblink = `DATABASE_URL=postgresql://${db.owner}:${db.password}@localhost:${db.port}/${db.name}?schema=public`
          //          console.log('[ormOne] preparing dblink for .env file', dblink)
          if (fs.existsSync(paths.env)) {
            // console.log(
            //   '[ormOne] .env file exists, now checking for DATABASE_URL in it',
            // )
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
            // console.log(
            //   '[ormOne] .env file does not exist, creating it with the new connection string',
            // )
            // .env file does not exist, create it with the new connection string
            fs.writeFileSync(paths.env, dblink, 'utf-8')
          }
          //          console.log('[ormOne] waitForNewFile prisma.config.ts')
          let configOK = false

          configOK = await waitForNewFile(
            path.join(paths.root, 'prisma.config.ts'),
            30000,
          )
          if (configOK) {
            //            console.log(
            //   `[ormOne] Prisma prisma.config.ts created at ${paths.root}`,
            // )
          } else {
            //            console.log(`[ormOne] prisma.config.ts is not created in 30 sec`)
          }
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
          // +++++++++++++++ Create Uri for the schema file  +++++++++++++++++++++
          openFilesInEditorTabs([paths.schema, paths.env])

          // createPendingFile()
          console.log(
            '[ormOne] end of installPrismaPartOne -- return result.success',
            result.success,
          )

          //          console.log(
          //   '[ormOne] clear multiple /src/generated/prisma messages from .gitignore',
          // )
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
          //          console.log('[ormOne] command approveAllBuildPackage received')
          // Run pnpm approve-builds (approves everything pending)
          await runCommandStream('pnpm', ['approve-builds'], {
            cwd: paths.root,
          })
          break

        case 'approveBuildPackage':
          //          console.log('[ormOne] command approveBuildPackage received')
          await runCommandStream('pnpm', ['approve-builds', msg.package], {
            cwd: paths.root,
          })
          break
      }
    })
  } finally {
    //    console.log('[ormOne] try/finaly is finaly executing')

    if (result.success) {
      //      console.log('[ormOne] try/finaly success is true')
      //// console.log('[ormOne] postMessage prismaPartOneDone to ormOne')
      // if (displayWebview(context, panel!, 'OrmTwo').success) {
      //   const res = await setupOrmTwoMessageHandler(
      //     context,
      //     panel!.webview,
      //     paths,
      //     schemaDoc,
      //     envDoc,
      //   )
      // } else {
      ////   console.log(
      //     '[ormOne] closing displayWebview OrmTwo return result.success false',
      //   )
      // }
      // webview.postMessage({
      //   command: 'prismaPartOneDone',
      //   payload: 'the finally part',
      // })
    } else {
      //      console.log('[ormOne] prismaPartOne failed')
      webview.postMessage({
        command: 'prismaPartOneFailed',
      })
    }
    // setTimeout(() => {
    //   if (dispose) {
    ////     console.log(
    //       '[ormOne] setupOrmOneMessageHandler onDidReceiveMessage: disposing',
    //     )
    //     messageListener.dispose()
    //   }
    // }, 200)
  }
  return result
}

async function createRoleAndDb(): Promise<CommandResultTracker<boolean>> {
  let result = new CommandResultTracker<boolean>(true)
  //  console.log(`[ormOne] createRoleAndDb ENTRY POINT`)
  // db admin must login in order to create role and database for the user,
  // so we connect to postgres with admin credentials
  const client = new Client({
    host: db.host as string,
    port: db.port as number,
    user: db.adminPwd as string, // admin user
    password: 'kiki',
    database: 'postgres',
  })
  //  console.log('[ormOne] createRoleAndDb CLIENT CONNECT')
  //  console.log([
  //   '[ormOne] createRoleAndDb Connecting to Postgres with admin credentials...',
  //   JSON.stringify(client),
  // ])
  // await client.connect()
  try {
    // This resolves to undefined; do not assign it to a variable
    await client.connect()
    //    console.log('[ormOne] client.connect successful')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.stack : String(err)
    //    console.log(`[ormOne] Failed to connect to pg Client: ${msg}`)
    result.error = err as Error
    result.setSuccess(false)
    return result
  }

  try {
    //    console.log(`[ormOne] Creating role ${db.owner}...`)
    const roleExists = await client.query(
      `SELECT 1 FROM pg_roles WHERE rolname = $1`,
      [db.owner],
    )

    // role not found
    if (roleExists.rowCount === 0) {
      //      console.log('[ormOne] role does not exist, create one')
      await client.query(
        `CREATE ROLE "${db.owner}" LOGIN PASSWORD '${db.password}' CREATEDB`,
      )
    } else {
      //      console.log('[ormOne] role already exists, skipping creation')
    }

    //    console.log(`[ormOne] Does database ${db.name}... exists?`)
    // check existence
    const res = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [db.name],
    )

    if (res.rowCount === 0) {
      //      console.log(`[ormOne] no database found; create ${db.name}`)
      await client.query(`CREATE DATABASE "${db.name}" OWNER "${db.owner}"`)
    }

    //    console.log(`[ormOne] client.end()`)
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
  //  console.log('[ormOne] installArgs', installArgs)
  // if (options.useOnlyBuiltDependencies) {
  //   installArgs.push(
  //     '--config.onlyBuiltDependencies=prisma,@prisma/client,esbuild,sharp,@swc/core,better-sqlite3',
  //   )
  // }
  try {
    //// console.log('[ormOne] installPrisma')
    webview.postMessage({
      command: 'prismaInstallStart',
      message: `Starting Prisma at ${paths.root} dependencies installation...`,
    })

    result = await runCommandStream('pnpm', installArgs, {
      cwd: paths.root,
      timeoutMs: 10 * 60 * 1000,
      useNdjson: false,

      onProgress: (p) => {
        //        console.log('[ormOne] onProgress', p)
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
        //        console.log('[ormOne] onStderr', text)
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
    //    console.log(`[ormOne] Error occurred during installation: ${msg}`)
    result.error = err as Error
    result.setSuccess(false)
  }
  return result
}
