import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { Client } from 'pg'

// NOTE: variables ending with an underscore are fubctions thatreturn
//       value of a variable with the same name without underscore
import { type DbParams, type TPaths, log, error, info } from './extension.js'
// import { log, error, info } from './extension.js'

let paths: TPaths = {}
let db: DbParams = {}
import type { Models, FieldStrips } from './parse-prisma-schema.js'
import { ModifierFlags } from 'typescript'
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
function detectPackageManager(): string {
  //}'npm' | 'pnpm' | 'yarn' | 'bun' | PMErr {
  log('detectPackageManager entry point')
  if (fs.existsSync(path.join(paths.root, 'pnpm-lock.yaml'))) {
    return (pm = 'pnpm')
  }
  if (fs.existsSync(path.join(paths.root, 'yarn.lock'))) {
    return (pm = 'yarn')
  }
  if (fs.existsSync(path.join(paths.root, 'bun.lockb'))) {
    return (pm = 'bun')
  }
  if (fs.existsSync(path.join(paths.root, 'package-lock.json'))) {
    return (pm = 'npm')
  }

  return 'unknown'
}

function xPackageManager(pm: string): string {
  //}'npx' | 'pnpm' | 'pnpm dlx' | 'yarn dlx' | 'bunx' | 'unknown' {
  switch (pm) {
    case 'npm':
      return (ex = 'pnpm')
    case 'pnpm':
      return (ex = 'pnpm dlx') // as pnpx is deprecated how to use pnpm ext below?
    case 'bun':
      return (ex = 'bunx')
    case 'yarn':
      return (ex = 'yarn dlx')
    default:
      return (ex = 'unknown')
  }
}

// All NPM package installations commands are issued from here
function sendToTerminal(cmd: string) {
  if (!terminal) {
    terminal = vscode.window.createTerminal(`WebView Terminal`)
  }
  terminal.show(true) // reveal the terminal
  terminal.sendText(cmd)
}

async function installNpmInitPrisma() {
  const pm = detectPackageManager()

  if (pm === 'unknown') {
    vscode.window.showInformationMessage('detectPackageManager err:' + pm)
  } else {
    xPackageManager(pm)
  }
  // sendToTerminal(`cd ${paths.root}`)
  sendToTerminal(`cd ${paths.root}`)

  sendToTerminal(
    `${pm} i -D @eslint/compat,@eslint/js,@prisma/config, @types/pg,@types/eslint
    @sveltejs/vite-plugin-svelte,@tsconfig/svelte,tslib,@types/bcrypt,@types/node,
    @typescript-eslint/eslint-plugin,@typescript-eslint/parser,eslint,eslint-config-prettier,
    eslint-plugin-svelte,globals,postcss,postcss-load-config,prettier,prettier-plugin-svelte,
    prisma,sass,sass-embedded,svelte,svelte-check,svelte-preprocess,ts-node,@types/node,typescript,
    typescript-eslint,vite,vite-plugin-sass-dts`,
  )

  sendToTerminal(
    `${pm} i @prisma/adapter-pg,@prisma/client,@prisma/internals,bcrypt,dotenv,pg,tslib`,
  )
  sendToTerminal(`${ex} prisma init --datasource-provider postgresql`)
}

async function createRoleAndDb() {
  // db admin must login in order tocreate role and database for the user,
  // so we connect to postgres with admin credentials
  const client = new Client({
    host: db.host as string,
    port: db.port as number,
    user: 'mili', // admin user
    password: 'kiki',
    database: 'postgres',
  })
  log('Connecting to Postgres...')
  await client.connect()

  log(`Creating role ${db.owner}...`)
  await client.query(
    `
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT FROM pg_roles WHERE rolname = $1
    ) THEN
      EXECUTE format(
        'CREATE ROLE %I LOGIN PASSWORD %L CREATEDB',
        $1, $2
      );
    END IF;
  END
  $$;
  `,
    [db.owner, db.password],
  )

  log(`Creating database ${db.name}...`)
  await client.query(
    `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT FROM pg_database WHERE datname = $1
      ) THEN
        EXECUTE format(
          'CREATE DATABASE %I OWNER %I',
          $1, $2
        );
      END IF;
    END
    $$;
    `,
    [db.name, db.owner],
  )

  await client.end()

  log(`Database ${db.name} created`)

  createPendingFile()
}
async function installORM() {
  log('installORM entry point')
  sendToTerminal(`${ex} prisma init --datasource-provider postgresql`)
  // installation is in progress so wait to see that schema.prisma is installed
  for (let i = 0; i < 30; i++) {
    await sleep(1000)
    if (fs.existsSync(paths.schema)) {
      break
    }
  }
  await sleep(1000) // to be sure it is completed
}

export async function installPrismaPartOne(db_: DbParams, thePaths: TPaths) {
  db = db_
  paths = thePaths
  log([
    'installPrismaPartOne entry point',
    JSON.stringify(db),
    JSON.stringify(paths),
  ])

  // install all required npm packages for Prisma and database client
  log('Installing NPM packages...')
  installNpmInitPrisma()

  // installORM() // BUG: does not work
  createRoleAndDb()

  // // BUG prisma init should create prisma/schema.prisma no we
  // // log(`test is schema.prisma found? ${paths.schema}`)
  // if (!fs.existsSync(paths.schema)) {
  //   fs.writeFileSync(paths.schema, '', 'utf-8')
  // } else {
  //   let schemaContent = fs.readFileSync(paths.schema, 'utf-8')
  //   if (!schemaContent.includes('MAKE YOUR PRISMA SCHEMA MODELS HERE')) {
  //     fs.appendFileSync(paths.schema, '\n\n' + schemaWhatToDo, 'utf-8')
  //   }
  // }

  const dblink = `DATABASE_URL=postgresql://${db.owner}:${db.password}@localhost:${db.port}/${db.name}?schema=public`
  if (fs.existsSync(paths.env)) {
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
    // .env file does not exist, create it with the new connection string
    fs.writeFileSync(paths.env, dblink, 'utf-8')
  }
  // Create Uri for the schema file
  let uri = vscode.Uri.file(paths.schema)
  // Open schema content in new tab (beside current editor)
  await vscode.window.showTextDocument(uri, {
    viewColumn: vscode.ViewColumn.Beside, // Opens beside active editor
    preview: false, // Optional: Force a new tab (not preview mode)
  })
  log(
    `forming dblibk with db params ${JSON.stringify(db)} ${db.owner} ${db.password} ${db.port} ${db.name}`,
  )

  // create Uri for the .env file
  uri = vscode.Uri.file(paths.env)
  await vscode.window.showTextDocument(uri, {
    viewColumn: vscode.ViewColumn.Beside, // Opens beside active editor
    preview: false, // Optional: Force a new tab (not preview mode)
  })

  log('end of installPrismaPartOne -- return {success: true}')
  return { success: true }
}
