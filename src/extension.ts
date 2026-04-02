import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import * as childProcess from 'child_process'
import { createWebviewPanel, postMessageToWebview } from './webview.js'

export type TMessage = {
  command: string
  payload?: any
}
let rootPath = ''
export const getRootPath = () => {
  return rootPath
}
export const channel = vscode.window.createOutputChannel('getWebviewHtml')
export const log = (msg: string, show: boolean = true) => {
  channel.appendLine(msg)
  if (show) {
    channel.show()
  }
}
export const error = (msg: string) => {
  vscode.window.showErrorMessage(msg)
  log(`ERROR: ${msg}`)
}
export const info = (msg: string) => {
  vscode.window.showInformationMessage(msg)
}
function execShell(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    childProcess.exec(
      cmd,
      { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Command failed: ${stderr}`))
          return
        }
        resolve(stdout)
      },
    )
  })
}
export const sudoName_ = await execShell('whoami')

export async function activate(context: vscode.ExtensionContext) {
  // vscode.window.showInformationMessage(`CRUD TEST-EXT -- activated`)
  const workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined =
    vscode.workspace.workspaceFolders
  rootPath = await execShell('pwd')
  context.subscriptions.push(
    vscode.commands.registerCommand('test-ext.crudTest', () => {
      log(`ORM: ${JSON.stringify(workspaceFolders)}`)
      info(`Command registered `)
      createWebviewPanel(context, 'OrmOne')
      info(`After  createWebviewPanel OrmOne`)
    }),
  )
  // The commandId parameter must match the command field in package.json
}
// This method is called when your extension is deactivated
export function deactivate() {}
