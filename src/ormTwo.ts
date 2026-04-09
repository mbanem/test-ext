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
  if (fs.existsSync(paths.pgPass)) {
    fs.unlink(paths.pgPass, (err) => {
      if (err) {
        vscode.window.showInformationMessage(
          'Could not delete .pgpass file at /home directory. Pleae delete it yourself',
        )
      }
    })
  }
}
export function installPrismaPartTwo(
  panel: vscode.WebviewPanel,
  thePaths: TPaths,
) {
  paths = thePaths
  log('installPrismaPartTwo entry point')

  panel.webview.postMessage({
    command: 'installPartTwoDone',
  })
}
