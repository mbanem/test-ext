import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { displayWebview } from './webview.js'
import { installPrismaPartOne } from './ormOne.js'
import { installPrismaPartTwo } from './ormTwo.js'
import { creaateCrudSupportPage } from './ormThree.js'

import { exec } from 'child_process'
import { homedir } from 'os'
import { Models, parsePrismaSchema } from './parse-prisma-schema.js'

export type TPaths = Record<string, string>
export type DbParams = Record<string, string | number>
let paths: TPaths = {}
let db: DbParams = {}
export type TMessage = {
  command: string
  payload?: any
}

let panel: vscode.WebviewPanel | undefined = undefined

function execShell(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(
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
export const channel = vscode.window.createOutputChannel('getWebviewHtml')
export const log = (msg: string | string[], show: boolean = true) => {
  channel.appendLine(Array.isArray(msg) ? msg.join('\n') : msg)
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
// let db: DbParams = {}
export async function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage(`CRUD TEST-EXT -- activated`)
  const workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined =
    vscode.workspace.workspaceFolders
  // console.log(vscode.workspace.workspaceFolders)
  context.subscriptions.push(
    vscode.commands.registerCommand('test-ext.crudTest', () => {
      // NOTE: in order for vscode.workspace.workspaceFolders to be defined
      // set "path": "/home/mili/Ext/test-ext", in test-ext.code-workspace
      // and set  "name": "webview-ui" in webview-ui/package.json for debugger
      // const folder = vscode.workspace.workspaceFolders?.[0]
      let rootPath = ''
      if (vscode.workspace.workspaceFolders?.[0].uri.fsPath) {
        rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath
      } else {
        rootPath = homedir() // fallback to home directory if workspace folder is not found
        if (rootPath !== '/home/mili/Ext/test-ext') {
          rootPath = '/home/mili/Ext/test-ext' // override with specific path if home directory is not correct
        }
      }
      log(`rootPath is ${rootPath}`)
      paths = {
        root: rootPath,
        env: path.join(rootPath, '.env'),
        pending: path.join(rootPath, 'prisma/installORMPartTwoPending.txt'),
        schema: path.join(rootPath, 'prisma/schema.prisma'),
      } as TPaths

      // create a customizable user interface that appears as a distinct editor tab
      // within extension's activation logic
      panel = vscode.window.createWebviewPanel(
        'crCrudSupport', // Identifies the type of the webview internally
        'CRUD Support', // Title displayed to the user
        vscode.ViewColumn.One, // Editor column to show the panel in
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        },
      )
      // If prismaSchemaFound is false start with OrmOne.html page twhich should return
      // a db_ object and so commence communication between this extension and ORMxxx
      // pages in wizard like steps for creating database, installing ORM and generating
      // SvelteKit CRUD support app pages based on the prisma schema models

      log('call to render OrmOne.html')
      // open OrmOne.html and wait for installPrismaPartOne command from it with db_ object as payload
      displayWebview(context, panel, 'OrmOne')

      panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.command) {
          // OrmOne.html sends this command with db_ object as payload when user clicks 'Install Prisma ORM'
          case 'installPrismaPartOne':
            log('installPrismaPartOne comand request from OrmOne.html 1')
            db = JSON.parse(msg.payload) as DbParams

            const result = await installPrismaPartOne(db, paths)
            log(
              `after call to installPrismaPartOne success is ${result.success.toString()}`,
            )
            displayWebview(context, panel!, 'OrmTwo')

            break

          case 'installPrismaPartTwo':
            log('installPrismaPartTwo command request from OrmTwo.html')
            // installPrismaPartTwo(panel!, paths) //FIX: needs build db models from schema

            // log('installPrismaPartTwoDone')
            // displayWebview(context, panel!, 'OrmThree')

            //             // log(
            //             // let schema = fs.readlinkSync(
            //             //   path.join(rootPath, 'prisma/schema.prisma'),
            //             // )
            //             // if (!schema) {
            //             //   info('/prisma/schema.prisma not found, cannot continue')
            //             //   panel!.dispose()
            //             // }
            //             // `installPrismaPartTwoDone, read prisma/schema.prisma content: ${schema.slice(
            //             //   0,
            //             //   50,
            //             // )}`,
            //             // )
            //             // const models = parsePrismaSchema(schema)

            // models: { uiModels, nuiModels, fieldStrips }
            //             // panel!.webview.postMessage({
            //             //   command: 'sentORMStringifiedModels',
            //             //   // payload: JSON.stringify(models),
            //             // })
            break

          case 'createCRUDSupportPage':
            log('createCRUDSupportPage command request from OrmThree.html')
            // creaateCrudSupportPage(panel!, paths, msg.modelName, msg.payload)
            break

          case 'close':
            info('CRUD Support is closing')
            panel!.dispose()
            break
          default:
            log(`Unknown command: ${msg.command}`)
        }
      })
    }),
  )

  // panel?.dispose()
  // Clean up when panel is closed
  panel?.onDidDispose(() => {
    panel = undefined
  })
}
// This method is called when your extension is deactivated
export function deactivate() {}
