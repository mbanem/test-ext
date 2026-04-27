import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { type TMessage, type TPaths, log, error, info } from './extension.js'

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
let terminal: vscode.Terminal | undefined
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

// All NPM package installations commands are issued from here
function sendToTerminal(cmd: string) {
  if (!terminal) {
    terminal = vscode.window.createTerminal(`WebView Terminal`)
  }
  terminal.show(true) // reveal the terminal
  terminal.sendText(cmd)
}
function deletePendingFile() {
  if (fs.existsSync(paths.pending)) {
    fs.unlink(paths.pending, (err) => {
      if (err) {
        vscode.window.showInformationMessage(
          'Could not delete installPartTwo.pending file at /prisma. Please delete it yourself',
        )
      }
    })
  }
}
export function installPrismaPartTwo(thePaths: TPaths) {
  paths = thePaths
  log('installPrismaPartTwo entry point')

  sendToTerminal(`${ex} prisma migrate dev --name init; ${ex} prisma generate`)
  log('prisma migrate & generate done')
  deletePendingFile()
  log('pending file deleted')
  return { success: true }
}
