import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { show } from './extension.js'
import { runCommandStream } from './run-command-stream.js'
import { Client } from 'pg'

// NOTE: variables ending with an underscore are fuctions that return
//       value of a variable with the same name without underscore
// import { runCommandStream, waitForNewFile } from './extension.js'

let paths: TPaths = {}
let db: DbParams = {}
let panel: vscode.WebviewPanel | undefined = undefined
const pendingText = `
This file is used as a fleg to indicate that the second part of
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

const devDeps = [
  '@eslint/compat',
  '@eslint/js',
  '@prisma/config',
  '@types/pg',
  '@types/eslint',
  '@sveltejs/vite-plugin-svelte',
  '@tsconfig/svelte',
  'tslib',
  '@types/bcrypt',
  '@types/node',
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
  'typescript',
  'typescript-eslint',
  'vite',
  'vite-plugin-sass-dts',
]
const deps = [
  '@prisma/adapter-pg',
  '@prisma/client',
  '@prisma/internals',
  'bcrypt',
  'dotenv',
  'pg',
  'tslib',
]
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

const pex = { npm: 'npx', pnpm: 'pnpx', bun: 'bunx', yarn: 'yarnx' }
function xPackageManager(pm: string): string {
  for (const [p, ex] of Object.entries(pex)) {
    if (pm === p) {
      return ex
    }
  }
  return 'unknown'
}

export async function setupOrmTwoMessageHandlerOne(
  panel: vscode.WebviewPanel,
): Promise<TResult> {
  show('[ormOne.ts] setupOrmTwoMessageHandlerOne entry point')
  // panel.webview.onDidReceiveMessage(async (message: any) => {
  //   if (message === 'prismaPartOne' || message.command === 'prismaPartOne') {
  //     detectPackageManager() // set pm and ex variables above
  //     if (pm === 'unknown') {
  //       vscode.window.showInformationMessage('detectPackageManager err:' + pm)
  //       return { success: false }
  //     } else {
  //       ex = xPackageManager(pm)
  //     }
  //     await installPrismaPartOne(panel, [ex, '-D', ...devDeps])
  //     await installPrismaPartOne(panel, [ex, ...deps])
  //     await installPrismaPartOne(panel, [
  //       ex,
  //       'prisma',
  //       'init',
  //       '--datasource-provider',
  //     ])
  //     const result = createRoleAndDb()
  //     return result
  //   }
  // })
  return { success: true }
}
// Main install function
export async function installPrismaPartOne(
  panel: vscode.WebviewPanel,
  args: string[],
) {
  panel.webview.postMessage({
    command: 'prismaInstallStart',
    message: 'Starting installation...',
  })
  return { success: true }
  const result = await runCommandStream(pm, [...args], {
    cwd: paths.root,
    timeoutMs: 600000, // 10 minutes

    onProgress: (p) => {
      panel.webview.postMessage({
        command: 'prismaProgress',
        percent: p.percent ?? 0,
        added: p.added,
        total: p.total,
        message: p.done
          ? 'Finalizing...'
          : `Installing: ${p.added || 0}/${p.total || '?'}`,
      })
    },

    onStdout: (text) =>
      panel.webview.postMessage({
        command: 'prismaLog',
        type: 'stdout',
        text: text.trim(),
      }),
    onStderr: (text) =>
      panel.webview.postMessage({
        command: 'prismaLog',
        type: 'stderr',
        text: text.trim(),
      }),
  })

  if (result.success) {
    panel.webview.postMessage({
      command: 'prismaInstallSuccess',
      message: '✅ Installation completed successfully!',
    })
  } else {
    panel.webview.postMessage({
      command: 'prismaInstallError',
      message: 'Installation failed',
      error: result.error?.message,
    })
  }
}

// const sleep = async (ms: number) => {
//   return new Promise((resolve) => {
//     setTimeout(() => {
//       // ms here is a dummy but required by
//       // resolve to send out some value
//       resolve(ms)
//     }, ms)
//   })
// }
// function createPendingFile() {
//   fs.writeFileSync(paths.pending, pendingText, 'utf-8')
// }

async function createRoleAndDb() {
  // db admin must login in order tocreate role and database for the user,
  // so we connect to postgres with admin credentials
  const client = new Client({
    host: db.host as string,
    port: db.port as number,
    user: db.adminPwd as string, // admin user
    password: 'kiki',
    database: 'postgres',
  })
  console.log(
    'Connecting to Postgres with admin credentials...',
    JSON.stringify(client),
  )
  console.log('Connecting to Postgres...')
  await client.connect()

  // console.log(`Creating role ${db.owner}...`)
  // const roleExists = await client.query(
  //   `SELECT 1 FROM pg_roles WHERE rolname = $1`,
  //   [db.owner],
  // )

  // if (roleExists.rowCount === 0) {
  //   await client.query(
  //     `CREATE ROLE "${db.owner}" LOGIN PASSWORD '${db.password}' CREATEDB`,
  //   )
  // }

  // console.log(`Creating database ${db.name}...`)
  // // check existence
  // const res = await client.query(
  //   `SELECT 1 FROM pg_database WHERE datname = $1`,
  //   [db.name],
  // )

  // if (res.rowCount === 0) {
  //   await client.query(`CREATE DATABASE "${db.name}" OWNER "${db.owner}"`)
  // }

  await client.end()

  console.log(`Database ${db.name} created`)
}
