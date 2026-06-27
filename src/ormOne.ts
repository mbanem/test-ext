import * as vscode from 'vscode'
import { runCommandStream } from './run-command-stream' // your file with the function
import { info, waitForNewFile } from './extension.js'
import * as fs from 'fs'
import * as path from 'path'
import { Client } from 'pg'
import { error } from 'console'

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
let currentWebview: vscode.Webview | undefined
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
  '@sveltejs/adapter-auto',
  '@sveltejs/kit',
  '@sveltejs/vite-plugin-svelte',
  '@tsconfig/svelte',
  '@types/bcrypt',
  '@types/eslint',
  '@types/node',
  '@types/pg',
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
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
  '@types/vscode',
  'concurrently',
  'esbuild',
]
const deps = [
  '@dflare/svelte-page-navigation',
  '@prisma/adapter-pg',
  '@prisma/client',
  '@prisma/internals',
  'bcrypt',
  'dotenv',
  'pg',
  'tslib',
]
export function setupOrmOneMessageHandler(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  thepaths: TPaths,
) {
  currentWebview = webview
  paths = thepaths
  webview.onDidReceiveMessage(async (msg) => {
    // console.log('[ormOne.ts] onDidReceiveMessage', msg)
    let result: CommandResult = ErrCommandResult
    console.log('[ormOne.ts] received db ', db)
    db = JSON.parse(msg.dbParams)
    switch (msg.command) {
      case 'prismaPartOne':
        vscode.window.showInformationMessage(
          `[ormOne.ts] got request prismaPartOne ${JSON.stringify(db)}`,
        )

        pm = detectPackageManager()

        if (pm === 'unknown') {
          vscode.window.showInformationMessage('detectPackageManager err:' + pm)
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
          vscode.window.showInformationMessage('install devDependencies failed')
          return result
        }
        result = await installPrisma(
          webview,
          {
            useOnlyBuiltDependencies: msg.useOnlyBuiltDependencies ?? true,
          },
          deps,
          '',
        )
        if (!result.success) {
          vscode.window.showInformationMessage('install dependencies failed')
          return result
        }

        const init = ['prisma', 'init', '--datasource-provider', 'postgresql']
        // find pnpm dlx or other execs
        let pgm = ex
        let pgx = ''
        if (ex === 'pnpx') {
          pgm = 'pnpm'
          pgx = 'dlx'
        } else if (ex === 'yarnx') {
          pgm = 'yarn'
          pgx = 'dlx'
        }
        console.log('[ormOne.ts] IMPORTANT PRISMA INIT MESSAGE')
        console.log(
          `[ormOne.ts] executing command ${pgm} ${pgx} ${init.join(' ')} to initialize Prisma...`,
        )

        result = await runCommandStream(pgm, [pgx, ...init], {
          cwd: paths.root,
          onStdout: (msg: string) => console.log(msg),
          onStderr: (err: string) => console.error(err),
        })
        if (!result.success) {
          vscode.window.showInformationMessage(
            'prisma init --datasource-provider postgresql failed',
          )
          return result
        }
        if (
          !waitForNewFile(path.join(paths.root, 'prisma.config.ts)'), 60000)
        ) {
          console.log(`[ormOne.ts] prisma.config.ts is not created in 60sec`)
        } else {
          console.log('[ormOne.ts] Prisma prisma.config.ts created')
        }
        result = await createRoleAndDb()
        if (!result.success) {
          vscode.window.showInformationMessage(
            'Creating PostgresSQL Role and database failed',
          )
        }
        return result
        break

      case 'approveAllBuildPackages':
        // Run pnpm approve-builds (approves everything pending)
        await runCommandStream('pnpm', ['approve-builds'], { cwd: paths.root })
        break

      case 'approveBuildPackage':
        await runCommandStream('pnpm', ['approve-builds', msg.package], {
          cwd: paths.root,
        })
        break
    }
  })
}

async function createRoleAndDb(): Promise<CommandResult> {
  let result: CommandResult = ErrCommandResult
  console.log(`[OrmOne.ts] createRoleAndDb ENTRY POINT`)
  // db admin must login in order to create role and database for the user,
  // so we connect to postgres with admin credentials
  const client = new Client({
    host: db.host as string,
    port: db.port as number,
    user: db.adminPwd as string, // admin user
    password: 'kiki',
    database: 'postgres',
  })
  console.log('CLIENT CONNECT')
  console.log([
    '[OrmOne.ts] Connecting to Postgres with admin credentials...',
    JSON.stringify(client),
  ])
  // await client.connect()
  try {
    // This resolves to undefined; do not assign it to a variable
    await client.connect()
    console.log('[OrmOne.ts] client.connect successfully')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.stack : String(err)
    vscode.window.showInformationMessage(
      `Failed to connect to pg Client: ${msg}`,
    )
    result.error = err as Error
    return result
  }

  console.log(`[OrmOne.ts] Creating role ${db.owner}...`)
  const roleExists = await client.query(
    `SELECT 1 FROM pg_roles WHERE rolname = $1`,
    [db.owner],
  )

  if (roleExists.rowCount === 0) {
    console.log('[OrmOne.ts] client.connect successful')
    await client.query(
      `CREATE ROLE "${db.owner}" LOGIN PASSWORD '${db.password}' CREATEDB`,
    )
  }

  console.log(`[OrmOne.ts] Does database ${db.name}... exists?`)
  // check existence
  const res = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [db.name],
  )

  if (res.rowCount === 0) {
    console.log(`[OrmOne.ts] Create database ${db.name}`)
    await client.query(`CREATE DATABASE "${db.name}" OWNER "${db.owner}"`)
  }

  console.log(`[OrmOne.ts] clicnt.end()`)
  await client.end()

  console.log(`Database ${db.name} created`)
  result.success = true
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
  console.log('[ormOne.ts] installPrisma')
  webview.postMessage({
    command: 'prismaInstallStart',
    message: `Starting Prisma at ${paths.root} dependencies installation...`,
  })

  result = await runCommandStream('pnpm', installArgs, {
    cwd: paths.root,
    timeoutMs: 10 * 60 * 1000,

    onProgress: (p) => {
      console.log('[ormOne.ts] onProgress')
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
  return result
}
