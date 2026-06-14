import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { Client } from 'pg'
import { spawn } from 'child_process'

// NOTE: variables ending with an underscore are fuctions that return
//       value of a variable with the same name without underscore
import {
  runCommandStream,
  log,
  waitForNewFile,
  error,
  info,
} from './extension.js'

let paths: TPaths = {}
let db: DbParams = {}

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
SECRET_API_KEY=1234567890`

// let sudoName_ = ''
let terminal: vscode.Terminal | undefined
let pm = 'unknown'
let ex = 'unknown'

const sleep = async (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      // ms here is a dummy but required by
      // resolve to send out some value
      resolve(ms)
    }, ms)
  })
}
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

const pex = { npm: 'npx', pnpm: 'pnpx', bun: 'bunx', yarn: 'yarnx' }
function xPackageManager(pm: string): string {
  for (const [p, ex] of Object.entries(pex)) {
    if (pm === p) {
      return ex
    }
  }
  return 'unknown'
}
let interval: ReturnType<typeof setInterval>
function cliSpinner(startStop: boolean): void {
  if (!startStop) {
    clearInterval(interval)
    return
  }
  const spinner = ['/', '-', '\\', '|']
  let i = 0

  interval = setInterval(() => {
    process.stdout.write(`\r${spinner[i]}`)
    i = (i + 1) % spinner.length
  }, 200)

  // Stop the spinner after 3 seconds
  // setTimeout(() => clearInterval(interval), 3000)
}
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
const init = ['prisma', 'init', '--datasource-provider', 'postgresql']
async function installNpmInitPrisma(): Promise<void> {
  console.log('installNpmInitPrisma entry')
  pm = detectPackageManager()

  if (pm === 'unknown') {
    vscode.window.showInformationMessage('detectPackageManager err:' + pm)
  } else {
    ex = xPackageManager(pm)
  }
  // sendToTerminal(`cd ${paths.root}`)
  // spawn('cd',[paths.root])

  log(
    `detected package manager is ${pm} and its executable for devDependencies is ${ex}`,
  )
  console.log('pnpm i -D ...')
  cliSpinner(true)
  await runCommandStream('pnpm', ['i', '-D', ...devDeps], {
    cwd: paths.root,
    onStdout: (msg: string) => console.log(msg),
    onStderr: (err: string) => console.error(err),
  })
  log('dev dependencies installed, now installing regular dependencies')
  console.log('pnpm i dependancies')
  await runCommandStream('pnpm', ['i', '-D', ...deps], {
    cwd: paths.root,
    onStdout: (msg: string) => console.log(msg),
    onStderr: (err: string) => console.error(err),
  })
  let pgm = ex
  if (ex === 'pnpx') {
    pgm = 'pnpm dlx '
  } else if (ex === 'yarnx') {
    pgm = 'yarn dlx '
  }
  log(`executing command ${pgm} ${init.join(' ')} to initialize Prisma...`)
  console.log('prisma init')
  await runCommandStream(pgm, [...init], {
    cwd: paths.root,
    onStdout: (msg: string) => console.log(msg),
    onStderr: (err: string) => console.error(err),
  })
  if (!waitForNewFile(path.join(paths.root, 'prisma.config.ts)'), 60000)) {
    log(`prisma.config.ts not created in 60sec`)
  } else {
    log('Prisma initialized successfully')
  }
  cliSpinner(false)
  console.log('end of installNpmInitPrisma')
}

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
  log([
    'Connecting to Postgres with admin credentials...',
    JSON.stringify(client),
  ])
  log('Connecting to Postgres...')
  await client.connect()

  log(`Creating role ${db.owner}...`)
  const roleExists = await client.query(
    `SELECT 1 FROM pg_roles WHERE rolname = $1`,
    [db.owner],
  )

  if (roleExists.rowCount === 0) {
    await client.query(
      `CREATE ROLE "${db.owner}" LOGIN PASSWORD '${db.password}' CREATEDB`,
    )
  }

  log(`Creating database ${db.name}...`)
  // check existence
  const res = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [db.name],
  )

  if (res.rowCount === 0) {
    await client.query(`CREATE DATABASE "${db.name}" OWNER "${db.owner}"`)
  }

  // await client.end()

  log(`Database ${db.name} created`)
}

export async function installPrismaPartOne(
  db_: DbParams,
  thePaths: TPaths,
): Promise<{ success: boolean }> {
  db = db_
  paths = thePaths
  log([
    'installPrismaPartOne entry point',
    JSON.stringify(db),
    JSON.stringify(paths),
  ])
  // install all required npm packages for Prisma and database client
  log('Installing NPM packages...')
  await installNpmInitPrisma()

  log('NPM packages installed successfully')
  createRoleAndDb()
  log('Role and database created successfully')

  const dblink = `DATABASE_URL=postgresql://${db.owner}:${db.password}@localhost:${db.port}/${db.name}?schema=public`
  if (fs.existsSync(paths.env)) {
    log('.env file exists, now checking for DATABASE_URL in it')
    // read .env file content
    let envContent = fs.readFileSync(paths.env, 'utf-8')

    if (envContent.includes('DATABASE_URL')) {
      if (!envContent.includes(dblink)) {
        // begin
        // comment out previous DATABASE_URL if exists and expamd content by appending new connection string
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
    log('.env file does not exist, creating it with the new connection string')
    // .env file does not exist, create it with the new connection string
    fs.writeFileSync(paths.env, dblink, 'utf-8')
  }

  // log('cannot wait for prisma initialization using loop with sleep')
  if (!waitForNewFile(paths.schema, 30000)) {
    log(`did not create db ${db.name} and role ${db.owner} in 30sec`)
  }

  log('looks like we cannot open new tab in VS Code')
  // Create Uri for the schema file
  let uri = vscode.Uri.file(paths.schema)
  // Open schema content in new tab (beside current editor)
  await vscode.window.showTextDocument(uri, {
    viewColumn: vscode.ViewColumn.Beside, // Opens beside active editor
    preview: false, // Optional: Force a new tab (not preview mode)
  })

  log(
    `forming dblink with db params ${JSON.stringify(db)} ${db.owner} ${db.password} ${db.port} ${db.name}`,
  )

  // create Uri for the .env file
  uri = vscode.Uri.file(paths.env)
  await vscode.window.showTextDocument(uri, {
    viewColumn: vscode.ViewColumn.Beside, // Opens beside active editor
    preview: false, // Optional: Force a new tab (not preview mode)
  })
  createPendingFile()
  log('end of installPrismaPartOne -- return {success: true}')
  return { success: true }
}
