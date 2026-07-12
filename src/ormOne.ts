import * as vscode from 'vscode'
import { runCommandStream } from './run-command-stream' // your file with the function
import { waitForNewFile } from './extension.js'
import * as fs from 'fs'
import * as path from 'path'
import { Client } from 'pg'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { parsePrismaSchema } from './webview-ui/src/lib/utils/parse-prisma-schema.js'

const ErrCommandResult = {
  success: false,
  code: -1,
  stdout: '',
  stderr: '',
  command: '',
  args: [],
}
let db: DbParams = {}
let paths: TPaths = {}
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
let sudoName_ = ''
// let terminal: vscode.Terminal | undefined
let pm = 'unknown'
let ex = 'unknown'
// interface DatabaseConfig {
//   provider: string
//   user: string
//   password: string
//   host: string
//   port: string
//   database: string
// }

// function isConnectionStringOK(url: string): boolean {
//   let result = true
//   // NOTE in connection string schema is optional
//   const regex =
//     /^DATABASE_URL=(?<provider>[^:]+):\/\/(?<user>[^:]+):(?<password>[^@]+)@(?<host>[^:]+):(?<port>[^/]+)\/(?<database>[^?]+)/

//   const match = url.match(regex)
//   if (!match || !match.groups) {
//     return false
//   }
//   for (const v of Object.values(
//     match.groups as Partial<DatabaseConfig>,
//   ) as string[]) {
//     if ((v as string).trim() === '') {
//       result = false
//     }
//   }
//   return result
// }

// function areSchemaAndEnvOK(): { schema: boolean; conn: boolean } {
//   const { models, enums } = parsePrismaSchema(
//     fs.readFileSync(paths.schema, 'utf-8'),
//   )
//   const envContent = fs.readFileSync(paths.env, 'utf-8')
//   const connOK = isConnectionStringOK(envContent)
//   return { schema: !!models.length, conn: connOK }
// }
function createPendingFile() {
  fs.writeFileSync(paths.pending, pendingText, 'utf-8')
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
  for (const [p, h] of Object.entries(pathManager)) {
    if (fs.existsSync(path.join(paths.root, p))) {
      return (pm = h)
    }
  }
  return 'unknown'
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
  for (const [p, ex] of Object.entries(pex)) {
    if (pm === p) {
      return ex
    }
  }
  return 'unknown'
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
  ,
]
let initial = true
let schemaDoc: vscode.TextEditor | undefined
let envDoc: vscode.TextEditor | undefined
let schemaDocSaved = false
let envDocSaved = false

export function setupOrmOneMessageHandler(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  thepaths: TPaths,
) {
  // 1. Listen for the save event
  // const saveListener = vscode.workspace.onDidSaveTextDocument(
  //   (savedDoc: vscode.TextDocument) => {
  //     const saveDocUri = savedDoc.uri.toString()
  //     // Ensure your reference actually exists
  //     if (!schemaDoc && !envDoc) {
  //       return
  //     }

  //     // 2. Perform the matching check
  //     // Method A: Exact instance comparison (Best for open, active memory documents)
  //     schemaDocSaved =
  //       (schemaDoc as vscode.TextEditor).document.uri.fsPath ===
  //       savedDoc.uri.fsPath
  //     envDocSaved =
  //       (envDoc as vscode.TextEditor).document.uri.fsPath ===
  //       savedDoc.uri.fsPath

  //     const continueButtonEnabled = schemaDocSaved && envDocSaved
  //     if (continueButtonEnabled) {
  //       const {schema, conn} = areSchemaAndEnvOK()
  //       if (schema && conn) {
  //         webview.postMessage({
  //           command: 'enableContinueButton',
  //         })
  //       } else {
  //         webview.postMessage({
  //           command: 'notValidSchemaOrEnv',
  //           payload:{schema, conn}
  //         })
  //       }
  //     }
  //   },
  // )

  // context.subscriptions.push(saveListener)
  console.log('[setupOrmOneMessageHandler] set onDidReceiveMessage')
  let result: CommandResult = ErrCommandResult
  paths = thepaths
  let messageListener: any
  let dispose = false
  // when installation succeeded approveAllBuildPackeges can come
  // so we allow from end of installation only those messages
  // for 60 sec
  // let onlyApprove = false

  // just for the try/finally to dispose onDidReceiveMessage
  try {
    // wait for 'prismaPartOne' command from OrmOne to bring db_ object as payload
    messageListener = webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case 'prismaPartOne':
          if (!initial) {
            console.log(
              '[setupOrmOneMessageHandler] get prismaPartOne but initial is false, returning success',
            )
            result.success = true
            return result
          } else {
            console.log(
              '[ormOne] command prismaPartOne received, initial is true',
            )
          }
          initial = false
          if (msg.dbParams) {
            console.log(
              `[ormOne] got request prismaPartOne ${JSON.stringify(msg.dbParams)}`,
            )
            console.log('[ormOne] received db ', msg.dbParams)
            db = JSON.parse(msg.dbParams)
          }
          pm = detectPackageManager()

          if (pm === 'unknown') {
            console.log('[ormOne] detectPackageManager err:' + pm)
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
              '[setupOrmOneMessageHandler] install devDependencies failed',
            )
            return result
          }
          result = await installPrisma(
            webview,
            {
              useOnlyBuiltDependencies: msg.useOnlyBuiltDependencies ?? true,
            },
            deps as string[],
            '',
          )
          if (!result.success) {
            webview.postMessage({
              command: 'prismaInstallError',
              message: '❌ Install dependencies failed',
            })
            console.log(
              '[setupOrmOneMessageHandler] install dependencies failed',
            )
            return result
          }

          console.log('[ormOne] NEXT -- IMPORTANT PRISMA INIT MESSAGE')
          // ===================================================================

          const execFileAsync = promisify(execFile)

          // ... inside prismaPartOne case, after installing packages:
          console.log('[ormOne] Starting Prisma init with direct spawn...')

          let executable = 'npx'
          let args: string[] = [
            'prisma',
            'init',
            '--datasource-provider',
            'postgresql',
          ]

          if (pm === 'pnpm') {
            executable = 'pnpm'
            args = [
              'dlx',
              'prisma',
              'init',
              '--datasource-provider',
              'postgresql',
            ]
          } else if (pm === 'yarn') {
            executable = 'yarn'
            args = [
              'dlx',
              'prisma',
              'init',
              '--datasource-provider',
              'postgresql',
            ]
          }

          console.log(`[ormOne] Executing: ${executable} ${args.join(' ')}`)

          try {
            const { stdout, stderr } = await execFileAsync(executable, args, {
              cwd: paths.root,
              timeout: 6000, // 6 seconds
            })

            if (stdout) {
              console.log('[ormOne] prisma stdout', stdout)
            }
            if (stderr) {
              webview.postMessage({
                command: 'prismaInstallError',
                message:
                  '❌ prisma init --datasource-provider postgresql failed',
              })
              console.log(
                '❌ prisma init --datasource-provider postgresql failed',
                stderr,
              )
              // console.error('[prisma stderr]', stderr)
              // return result
            }

            webview.postMessage({
              command: 'prismaLog',
              text: stdout || stderr || 'Done',
            })

            result.success = true
          } catch (error: any) {
            console.error('Prisma init error:', error)
            ;((result.success = false),
              (result.stderr = error.message || 'Prisma init failed'))
          }
          // ===================================================================
          const dblink = `DATABASE_URL=postgresql://${db.owner}:${db.password}@localhost:${db.port}/${db.name}?schema=public`
          console.log('[ormOne] preparing dblink for .env file', dblink)
          if (fs.existsSync(paths.env)) {
            console.log(
              '[ormOne] .env file exists, now checking for DATABASE_URL in it',
            )
            // read .env file content
            let envContent = fs.readFileSync(paths.env, 'utf-8')

            if (envContent.includes('DATABASE_URL')) {
              if (!envContent.includes(dblink)) {
                // begin
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
                //end
              }
            } else {
              // no DATABASE_URL in .env file, just append the new connection string
              fs.appendFileSync(paths.env, '\n' + dblink, 'utf-8')
            }
          } else {
            console.log(
              '.env file does not exist, creating it with the new connection string',
            )
            // .env file does not exist, create it with the new connection string
            fs.writeFileSync(paths.env, dblink, 'utf-8')
          }

          if (
            !waitForNewFile(path.join(paths.root, 'prisma.config.ts)'), 60000)
          ) {
            console.log(`[ormOne] prisma.config.ts is not created in 60sec`)
          } else {
            console.log(
              `[ormOne] Prisma prisma.config.ts created at ${paths.root}`,
            )
          }
          result = await createRoleAndDb()
          if (!result.success) {
            // webview.postMessage({
            //   command: 'prismaInstallError',
            //   message: '❌ Creating PostgresSQL Role and database failed',
            // })
            console.log('❌ Creating PostgresSQL Role and database failed')
            return result
          }

          // Create Uri for the schema file
          let uri = vscode.Uri.file(paths.schema)
          // Open schema content in new tab (beside current editor)
          schemaDoc = await vscode.window.showTextDocument(uri, {
            viewColumn: vscode.ViewColumn.Beside, // Opens beside active editor
            preview: false, // Optional: Force a new tab (not preview mode)
          })

          console.log(
            `forming dblink with db params ${JSON.stringify(db)} ${db.owner} ${db.password} ${db.port} ${db.name}`,
          )

          // create Uri for the .env file
          uri = vscode.Uri.file(paths.env)
          envDoc = await vscode.window.showTextDocument(uri, {
            viewColumn: vscode.ViewColumn.Beside, // Opens beside active editor
            preview: false, // Optional: Force a new tab (not preview mode)
          })
          createPendingFile()
          console.log(
            '[ormOne] end of installPrismaPartOne -- return result.success',
            result.success,
          )

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
          result.success = true
          dispose = true
          // onlyApprove = true
          // return result
          break

        case 'approveAllBuildPackages':
          console.log('[ormOne] command approveAllBuildPackage received')
          // Run pnpm approve-builds (approves everything pending)
          await runCommandStream('pnpm', ['approve-builds'], {
            cwd: paths.root,
          })
          break

        case 'approveBuildPackage':
          console.log('[ormOne] command approveBuildPackage received')
          await runCommandStream('pnpm', ['approve-builds', msg.package], {
            cwd: paths.root,
          })
          break
      }
    })
  } finally {
    setTimeout(() => {
      if (dispose) {
        console.log(
          '[setupOrmOneMessageHandler] onDidReceiveMessage: disposing',
        )
        messageListener.dispose()
      }
    }, 200)
  }
}

async function createRoleAndDb(): Promise<CommandResult> {
  let result: CommandResult = ErrCommandResult
  console.log(`[OrmOne] createRoleAndDb ENTRY POINT`)
  // db admin must login in order to create role and database for the user,
  // so we connect to postgres with admin credentials
  const client = new Client({
    host: db.host as string,
    port: db.port as number,
    user: db.adminPwd as string, // admin user
    password: 'kiki',
    database: 'postgres',
  })
  console.log('[ormOne] CLIENT CONNECT')
  console.log([
    '[OrmOne] Connecting to Postgres with admin credentials...',
    JSON.stringify(client),
  ])
  // await client.connect()
  try {
    // This resolves to undefined; do not assign it to a variable
    await client.connect()
    console.log('[OrmOne] client.connect successful')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.stack : String(err)
    console.log(`[ormOne] Failed to connect to pg Client: ${msg}`)
    result.error = err as Error
    result.success = false
    return result
  }

  try {
    console.log(`[OrmOne] Creating role ${db.owner}...`)
    const roleExists = await client.query(
      `SELECT 1 FROM pg_roles WHERE rolname = $1`,
      [db.owner],
    )

    // role not found
    if (roleExists.rowCount === 0) {
      console.log('[OrmOne] role does not ezist, create one')
      await client.query(
        `CREATE ROLE "${db.owner}" LOGIN PASSWORD '${db.password}' CREATEDB`,
      )
    }

    console.log(`[OrmOne] Does database ${db.name}... exists?`)
    // check existence
    const res = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [db],
    )

    if (res.rowCount === 0) {
      console.log(`[OrmOne] no database found; create ${db.name}`)
      await client.query(`CREATE DATABASE "${db.name}" OWNER "${db.owner}"`)
    }

    console.log(`[OrmOne] client.end()`)
    await client.end()

    result.success = true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.stack : String(err)
    console.log(
      `[ormOne] Error occurred while creating role and database: ${msg}`,
    )
    result.error = err as Error
    result.success = false
  }
  return result
}
// Main install function

async function installPrisma(
  webview: vscode.Webview,
  options: { useOnlyBuiltDependencies: boolean },
  packages: string[],
  dd: string,
): Promise<CommandResult> {
  let result: CommandResult = ErrCommandResult
  let installArgs = ['i', dd, ...packages]
  // if (options.useOnlyBuiltDependencies) {
  //   installArgs.push(
  //     '--config.onlyBuiltDependencies=prisma,@prisma/client,esbuild,sharp,@swc/core,better-sqlite3',
  //   )
  // }
  try {
    console.log('[ormOne] installPrisma')
    webview.postMessage({
      command: 'prismaInstallStart',
      message: `Starting Prisma at ${paths.root} dependencies installation...`,
    })

    result = await runCommandStream('pnpm', installArgs, {
      cwd: paths.root,
      timeoutMs: 10 * 60 * 1000,

      onProgress: (p) => {
        console.log('[ormOne] onProgress')
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
        console.log('[ormOne] onStderr', text)
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
        message: '✅ Prisma and dependencies installed successfully!',
      })
      result.success = true
    } else {
      webview.postMessage({
        command: 'prismaInstallError',
        message: '❌ Installation failed',
        error: result.error?.message || 'Unknown error',
      })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.stack : String(err)
    console.log(`[ormOne] Error occurred during installation: ${msg}`)
    result.error = err as Error
    result.success = false
  }
  return result
}
