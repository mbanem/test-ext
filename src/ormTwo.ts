import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { channelShow } from './extension.js'
import { runCommandStream } from './run-command-stream.js'

const envWhatToDo = `# Environment variables declared in this file are automatically made available to Prisma.
# See the documentation for more detail: https://pris.ly/d/prisma-schema#accessing-environment-variables-from-the-schema

# Prisma supports the native connection string format for PostgreSQL, MySQL, SQLite, SQL Server, MongoDB and CockroachDB.
# See the documentation for all the connection string options: https://pris.ly/d/connection-strings

# example is for PostgreSQL, change values wrapped in < >
# <username> is a Role in PostgreSQL
# <password> is username's db password
# <dbName> is database name to connect to
DATABASE_URL="postgresql://<username>:<password>@localhost:5432/<dbName>?schema=public"

# see docs for how to use SECRET_API_KEYs
SECRET_APT_KEY="kiki:kiki@localhost:5432
SECRET_APT_ENV=development
SECRET_API_KEY=1234567890`

let paths: TPaths = {}
let panel: vscode.WebviewPanel | undefined = undefined

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

const pex = { npm: 'pnpm', pnpm: 'pnpm dlx', bun: 'bunx', yarn: 'yarn dlx' }
function xPackageManager(pm: string): string {
  for (const [p, ex] of Object.entries(pex)) {
    if (pm === p) {
      return ex
    }
  }
  return 'unknown'
}

export async function setupOrmTwoMessageHandler(panel: vscode.WebviewPanel) {
  channelShow('[ormTwo.ts] setupOrmTwoMessageHandlerTwo entry point')
  panel.webview.onDidReceiveMessage(async (message: any) => {
    if (message === 'prismaPartTwo' || message.command === 'prismaPartTwo') {
      detectPackageManager()
      if (pm === 'unknown') {
        vscode.window.showInformationMessage('detectPackageManager err:' + pm)
        return { success: false }
      } else {
        ex = xPackageManager(pm)
      }
      await installPrismaPartTwo(panel, [ex, 'prisma', 'generate'])
    }
  })
  return { success: true }
}

// Main install function
export async function installPrismaPartTwo(
  panel: vscode.WebviewPanel,
  args: string[],
): Promise<{ success: boolean }> {
  // const cmd2 = ' prisma generate' // TODO
  // }

  panel!.webview.postMessage({
    command: 'prismaInstallStart',
    message: 'Starting installation...',
  })
  return { success: true }
  const result = await runCommandStream(pm, [...args], {
    cwd: paths.root,
    timeoutMs: 600000, // 10 minutes

    onProgress: (p) => {
      panel!.webview.postMessage({
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
  return result
}
