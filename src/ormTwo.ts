import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
// import { runCommandStream } from './run-command-stream.js'
import { execFile } from 'child_process'
import { promisify } from 'util'

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
const ErrCommandResult = {
  success: false,
  code: -1,
  stdout: '',
  stderr: '',
  command: '',
  args: [],
}
export async function setupOrmTwoMessageHandler(
  panel: vscode.WebviewPanel,
  paths: TPaths,
): Promise<CommandResult> {
  let result: CommandResult = ErrCommandResult
  console.log('[ormTwo] setupOrmTwoMessageHandlerTwo entry point')
  const messageListener = panel.webview.onDidReceiveMessage(
    async (msg: any) => {
      if (msg.command === 'prismaPartTwo') {
        console.log('[ormTwo] received message prismaPartTwo')
        detectPackageManager()
        if (pm === 'unknown') {
          console.log('[ormTwo] detectPackageManager err:' + pm)
          return result
        } else {
          console.log('[ormTwo] packageManager found', pm)
          ex = xPackageManager(pm)
        }
        console.log(
          '[ormTwo] calling installPrismaPartTwo(panel, [ex, "prisma", "generate"]',
        )
        await installPrismaPartTwo(panel, paths, ['prisma', 'generate'])
      }
    },
  )
  console.log('[ormTwo] setupOrmTwoMessageHandler: sending showPage OrmThree')
  panel.webview.postMessage({
    command: 'showPage',
    page: 'OrmThree',
  })
  messageListener.dispose()
  result.success = true

  return result
}

// Main install function
export async function installPrismaPartTwo(
  panel: vscode.WebviewPanel,
  paths: TPaths,
  args: string[],
): Promise<{ success: boolean }> {
  let result: CommandResult = ErrCommandResult
  console.log('[ormTwo] installPrismaPartTwo entry point')

  console.log('[ormTwo] postMessage prismaInstallStart')
  panel!.webview.postMessage({
    command: 'prismaInstallStart',
    message: 'Starting prismaPartTwo installation...',
  })

  let executable = 'npx'
  // let args: string[] = ['prisma', 'generate']
  // [pm, ex, 'prisma', 'generate']

  if (pm === 'pnpm') {
    executable = 'pnpm'
    args = ['dlx', 'prisma', 'generate']
  } else if (pm === 'yarn') {
    executable = 'yarn'
    args = ['dlx', 'prisma', 'generate']
  }

  console.log(`[ormTwo] Executing: ${executable} ${args.join(' ')}`)

  try {
    const execFileAsync = promisify(execFile)
    const { stdout, stderr } = await execFileAsync(executable, args, {
      cwd: paths.root,
      timeout: 60000, // 60 seconds
    })

    if (stdout) {
      console.log('[prisma stdout]', stdout)
    }
    if (stderr) {
      console.log('[prisma stderr]', stderr)
    }

    panel.webview.postMessage({
      command: 'prismaLog',
      text: stdout || stderr || 'Done',
    })

    result.success = true
  } catch (error: any) {
    console.log('[ormTwo] Prisma init error:', error)
    ;((result.success = false),
      (result.stderr = error.message || 'Prisma init failed'))
  }
  // return { success: true }
  // const result = await runCommandStream(pm, [...args], {
  //   cwd: paths.root,
  //   timeoutMs: 600000, // 10 minutes

  //   onProgress: (p) => {
  //     panel!.webview.postMessage({
  //       command: 'prismaProgress',
  //       percent: p.percent ?? 0,
  //       added: p.added,
  //       total: p.total,
  //       message: p.done
  //         ? 'Finalizing...'
  //         : `Installing: ${p.added || 0}/${p.total || '?'}`,
  //     })
  //   },

  //   onStdout: (text) =>
  //     panel.webview.postMessage({
  //       command: 'prismaLog',
  //       type: 'stdout',
  //       text: text.trim(),
  //     }),
  //   onStderr: (text) =>
  //     panel.webview.postMessage({
  //       command: 'prismaLog',
  //       type: 'stderr',
  //       text: text.trim(),
  //     }),
  // })
  console.log('[ormTwo] installPrismaPartTwo tries to delete pending file')
  if (fs.existsSync(paths.pending)) {
    console.log('[ormTwo] installPrismaPartTwo pending fils exists')
    fs.unlink(paths.pending, (err) => {
      if (err) {
        vscode.window.showInformationMessage(
          'Could not delete installPartTwo.pending file at App Root. Delete it yourself',
        )
      } else {
        console.log('[ormTwo] installPrismaPartTwo: pending file deleted')
      }
    })
  }

  if (result.success) {
    panel.webview.postMessage({
      command: 'prismaInstallOutcome',
      message: '✅ Installation completed successfully!',
    })
  } else {
    panel.webview.postMessage({
      command: 'prismaInstallOutcome',
      message: 'Installation failed',
      error: result.stderr,
    })
  }
  return result
}
