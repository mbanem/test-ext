import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { createWebviewPanel, postMessageToWebview } from './webview.js'

export async function activate(context: vscode.ExtensionContext) {
  // vscode.window.showInformationMessage(`CRUD TEST-EXT -- activated`)
  const workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined =
    vscode.workspace.workspaceFolders
  context.subscriptions.push(
    vscode.commands.registerCommand('test-ext.crudTest', () => {
      const outputChannel = vscode.window.createOutputChannel('getWebviewHtml')
      outputChannel.appendLine(
        `Workspace Folders: ${JSON.stringify(workspaceFolders)}`,
      )
      outputChannel.show()

      // vscode.window.showInformationMessage(`Command registered `)
      createWebviewPanel(context, 'OrmOne')
      vscode.window.showInformationMessage(`After  createWebviewPanel OrmOne`)
    }),
  )
  // The commandId parameter must match the command field in package.json
}
// This method is called when your extension is deactivated
export function deactivate() {}
