import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { Client } from 'pg'
import { runCommandStream } from './run-command-stream'
import { CommandResultTracker, Paths, waitForNewFile } from './extension'

// ====================== Types ======================
interface DbParams {
  name: string
  owner: string
  password: string
  host?: string
  port?: number | string
  adminName?: string
  adminPwd?: string
}

// ====================== Main Entry ======================
export async function setupOrmOneMessageHandler(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
  paths: Paths,
): Promise<CommandResultTracker<boolean>> {
  const webview = panel.webview
  const result = new CommandResultTracker<boolean>(true)

  // ---------- Save listener (schema + .env) ----------
  const savedFiles = new Set<string>()

  const saveListener = vscode.workspace.onDidSaveTextDocument(
    async (document) => {
      const fileName = path.basename(document.fileName)
      savedFiles.add(fileName)

      if (savedFiles.has('schema.prisma') && savedFiles.has('.env')) {
        const { modelsOK, connOK } = await areSchemaAndEnvOK(paths)

        if (modelsOK && connOK) {
          webview.postMessage({
            command: 'showPage',
            page: 'OrmThree',
            from: 'ormOne',
          })
          deletePendingFile(paths)
          saveListener.dispose()
        } else {
          webview.postMessage({
            command: 'notValidSchemaOrEnv',
            payload: { modelsOK, connOK },
          })
        }
      }
    },
  )

  context.subscriptions.push(saveListener)

  // ---------- Message listener ----------
  const messageListener = webview.onDidReceiveMessage(async (msg) => {
    switch (msg.command) {
      case 'checkOnPendingFile':
        await handleCheckOnPendingFile(webview, paths)
        break

      case 'prismaPartOne':
        await handlePrismaPartOne(msg, webview, paths)
        break

      case 'approveBuildPackage':
        await runCommandStream('pnpm', ['approve-builds', msg.package], {
          cwd: paths.root,
        })
        break

      case 'approveAllBuildPackages':
        await runCommandStream('pnpm', ['approve-builds'], {
          cwd: paths.root,
        })
        break

      case 'close':
        saveListener.dispose()
        messageListener.dispose()
        panel.dispose()
        break
    }
  })

  return result
}

// ====================== Handlers ======================

async function handleCheckOnPendingFile(webview: vscode.Webview, paths: Paths) {
  if (fs.existsSync(paths.pending)) {
    await openFilesInEditorTabs([paths.schema, paths.env])
    webview.postMessage({ command: 'schemaAndEnvInEditorTabs' })
  }
}

async function handlePrismaPartOne(
  msg: any,
  webview: vscode.Webview,
  paths: Paths,
): Promise<CommandResultTracker<boolean>> {
  const result = new CommandResultTracker<boolean>(true)

  try {
    const dbParams: DbParams = msg.dbParams ? JSON.parse(msg.dbParams) : null
    if (!dbParams?.name || !dbParams?.owner || !dbParams?.password) {
      throw new Error('Missing required database parameters')
    }

    // 1. Install packages
    webview.postMessage({
      command: 'prismaInstallStart',
      message: 'Installing packages...',
    })

    const installResult = await installPackages(webview, paths)
    if (!installResult.success) {
      throw new Error(
        installResult.error?.message || 'Package installation failed',
      )
    }

    // 2. Run prisma init
    const initResult = await runPrismaInit(paths)
    if (!initResult.success) {
      throw new Error(initResult.error?.message || 'prisma init failed')
    }

    // 3. Configure .env
    await configureEnvFile(paths, dbParams)

    // 4. Create Role + Database (optional)
    if (dbParams.adminName && dbParams.adminPwd) {
      const dbResult = await createRoleAndDatabase(dbParams)
      if (!dbResult.success) {
        webview.postMessage({
          command: 'prismaInstallError',
          message: 'Failed to create PostgreSQL role/database',
          error: dbResult.error?.message,
        })
      }
    }

    // 5. Open files + create pending flag
    await openFilesInEditorTabs([paths.schema, paths.env])
    createPendingFile(paths)

    webview.postMessage({
      command: 'prismaInstallSuccess',
      message: 'Prisma initialized. Please review schema.prisma and .env',
    })

    result.setSuccess(true)
  } catch (err: any) {
    const message = err.message || String(err)
    console.error('[ormOne] handlePrismaPartOne error:', message)

    webview.postMessage({
      command: 'prismaInstallError',
      message: 'Installation failed',
      error: message,
    })

    result.setSuccess(false)
    result.error = err
  }

  return result
}

// ====================== Helpers ======================

async function installPackages(
  webview: vscode.Webview,
  paths: Paths,
): Promise<CommandResultTracker<boolean>> {
  const devPackages = [
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
  const packages = [
    '@prisma/adapter-pg',
    '@prisma/client',
    '@prisma/internals',
    'bcrypt',
    'dotenv',
    'pg',
  ]

  return await runCommandStream('pnpm', ['add', '-D', ...devPackages], {
    cwd: paths.root,
    timeoutMs: 10 * 60 * 1000,
    onProgress: (p) => {
      webview.postMessage({
        command: 'prismaProgress',
        percent: p.percent ?? 0,
        message: p.done ? 'Finalizing...' : 'Installing packages...',
        rawLine: p.rawLine,
      })
    },
    onStdout: (text) => {
      webview.postMessage({ command: 'prismaLog', type: 'stdout', text })
    },
    onStderr: (text) => {
      webview.postMessage({ command: 'prismaLog', type: 'stderr', text })
    },
  })
}

async function runPrismaInit(
  paths: Paths,
): Promise<CommandResultTracker<boolean>> {
  return await runCommandStream(
    'pnpm',
    ['exec', 'prisma', 'init', '--datasource-provider', 'postgresql'],
    {
      cwd: paths.root,
      timeoutMs: 30000,
    },
  )
}

async function configureEnvFile(paths: Paths, db: DbParams) {
  const connectionString = `DATABASE_URL="postgresql://${db.owner}:${db.password}@${db.host || 'localhost'}:${db.port || 5432}/${db.name}?schema=public"`

  let content = fs.existsSync(paths.env)
    ? fs.readFileSync(paths.env, 'utf-8')
    : ''

  if (content.includes('DATABASE_URL')) {
    content = content.replace(/DATABASE_URL=.*$/m, connectionString)
  } else {
    content += `\n${connectionString}\n`
  }

  fs.writeFileSync(paths.env, content, 'utf-8')
}

async function createRoleAndDatabase(
  db: DbParams,
): Promise<CommandResultTracker<boolean>> {
  const result = new CommandResultTracker<boolean>(true)

  if (!db.adminName || !db.adminPwd) {
    result.setSuccess(false)
    result.error = new Error('Admin credentials are required')
    return result
  }

  const client = new Client({
    host: db.host || 'localhost',
    port: Number(db.port) || 5432,
    user: db.adminName,
    password: db.adminPwd,
    database: 'postgres',
  })

  try {
    await client.connect()

    // Create role
    const roleCheck = await client.query(
      `SELECT 1 FROM pg_roles WHERE rolname = $1`,
      [db.owner],
    )
    if (roleCheck.rowCount === 0) {
      await client.query(
        `CREATE ROLE "${db.owner}" LOGIN PASSWORD '${db.password}' CREATEDB`,
      )
    }

    // Create database
    const dbCheck = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [db.name],
    )
    if (dbCheck.rowCount === 0) {
      await client.query(`CREATE DATABASE "${db.name}" OWNER "${db.owner}"`)
    }

    await client.end()
    result.setSuccess(true)
  } catch (err: any) {
    result.setSuccess(false)
    result.error = err
  }

  return result
}

function createPendingFile(paths: Paths) {
  const text = `This file indicates that the second part of Prisma ORM installation is pending.
Delete this file after finishing the installation manually if needed.`
  fs.writeFileSync(paths.pending, text, 'utf-8')
}

function deletePendingFile(paths: Paths) {
  if (fs.existsSync(paths.pending)) {
    fs.unlinkSync(paths.pending)
  }
}

async function openFilesInEditorTabs(filePaths: string[]) {
  for (const p of filePaths) {
    const uri = vscode.Uri.file(p)
    await vscode.window.showTextDocument(uri, {
      preview: false,
      viewColumn: vscode.ViewColumn.Beside,
    })
  }
}

// You still need to implement or keep your existing areSchemaAndEnvOK function
async function areSchemaAndEnvOK(paths: Paths) {
  // Keep your existing logic here for now
  return { modelsOK: true, connOK: true }
}
