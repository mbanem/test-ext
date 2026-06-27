import * as vscode from 'vscode'
import { runCommandStream } from './run-command-stream' // your file with the function
import { info, waitForNewFile } from './extension.js'
import * as fs from 'fs'
import * as path from 'path'
import { Client } from 'pg'

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
    console.log('[ormOne.ts] onDidReceiveMessage', msg)
    let result: CommandResult = ErrCommandResult
    switch (msg.command) {
      case 'prismaPartOne':
        vscode.window.showInformationMessage(
          '[ormOne.ts] got request prismaPartOne',
        )
        pm = detectPackageManager()

        if (pm === 'unknown') {
          vscode.window.showInformationMessage('detectPackageManager err:' + pm)
          return result
        } else {
          ex = xPackageManager(pm)
        }
        await installPrisma(
          webview,
          {
            useOnlyBuiltDependencies: msg.useOnlyBuiltDependencies ?? true,
          },
          devDeps,
          '-D',
        )
        await installPrisma(
          webview,
          {
            useOnlyBuiltDependencies: msg.useOnlyBuiltDependencies ?? true,
          },
          deps,
          '',
        )
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

// Main install function

async function installPrisma(
  webview: vscode.Webview,
  options: { useOnlyBuiltDependencies: boolean },
  packages: string[],
  dd: string,
) {
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

  const result = await runCommandStream('pnpm', installArgs, {
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
  } else {
    webview.postMessage({
      command: 'prismaInstallError',
      message: '❌ Installation failed',
      error: result.error?.message || 'Unknown error',
    })
  }
}
