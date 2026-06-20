import * as vscode from 'vscode'
import { ExtensionContext, ExtensionMode } from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { displayWebview } from './webview.js'
import { spawn, execSync, ChildProcess } from 'child_process'
import { parsePrismaSchema } from './webview-ui/src/lib/utils/parse-prisma-schema.js'
import { setupOrmTwoMessageHandlerOne } from './ormOne.js'
import { setupOrmTwoMessageHandlerTwo } from './ormTwo.js'
import { installPrismaPartTwo } from './ormTwo.js'
import {} from './ormOne.js'
import { generateParts } from './partsGenerator.js'
let paths: TPaths = {}
let db: DbParams = {}
let appName = ''
let result: TResult = { success: false }
let inDevelopmentMode = false

let panel: vscode.WebviewPanel | undefined = vscode.window.createWebviewPanel(
  // let as dispose sets it to null
  'crCrudSupport',
  'CRUD Support',
  vscode.ViewColumn.One,
  {
    enableScripts: true,
    retainContextWhenHidden: true,
  },
)

// function execShell(cmd: string): string | null {
//   try {
//     // Blocks the event loop until the command finishes
//     return execSync(cmd, { encoding: 'utf8' })
//   } catch (error) {
//     console.error('Execution failed:', error)
//   }
//   return null
// }
// export const sudoName_ = execShell('whoami')?.trim()
export const sudoName_ = 'mili'
// export function runCommandStream(
//   command: string,
//   args: string[],
//   options: {
//     cwd?: string
//     onStdout?: (data: string) => void
//     onStderr?: (data: string) => void
//     terminal?: vscode.Terminal
//   } = {},
// ): Promise<number> {
//   return new Promise((resolve, reject) => {
//     const proc = spawn(command, args, {
//       cwd: options.cwd,
//       shell: true,
//     })

//     proc.stdout.on('data', (data: any) => {
//       const text = data.toString()
//       options.onStdout?.(text)

//       if (options.terminal) {
//         options.terminal.sendText(text, false)
//       }
//     })

//     proc.stderr.on('data', (data) => {
//       const text = data.toString()
//       options.onStderr?.(text)

//       if (options.terminal) {
//         options.terminal.sendText(text, false)
//       }
//     })

//     proc.on('close', (code: any) => {
//       resolve(code ?? 0)
//     })

//     proc.on('error', (err: string) => {
//       reject(err)
//     })
//   })
// }
export const sleep = async (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      // ms here is a dummy but required by
      // resolve to send out some value
      resolve(ms)
    }, ms)
  })
}
export const waitForNewFile = async (filePath: string, howLong: number) => {
  const loops = Math.ceil(howLong / 1000)
  for (let i = 0; i < loops; i++) {
    await sleep(1000)
    if (fs.existsSync(filePath)) {
      return true
    }
  }
  return false
}
export const channel = vscode.window.createOutputChannel('getWebviewHtml')
export const show = (msg: string | string[], show: boolean = false) => {
  channel.appendLine(Array.isArray(msg) ? msg.join('\n') : msg)
  if (show) {
    channel.show()
  }
}
export const error = (msg: string) => {
  vscode.window.showErrorMessage(msg)
  channel.appendLine(`ERROR: ${msg}`)
}
export const info = (msg: string) => {
  vscode.window.showInformationMessage(msg)
}
export async function activate(context: vscode.ExtensionContext) {
  try {
    show('test-ext.crudTest ACTIVATED')
    vscode.window.showInformationMessage(`CRUD TEST-EXT -- activated`)
    inDevelopmentMode = context.extensionMode === ExtensionMode.Development
    context.subscriptions.push(
      vscode.commands.registerCommand('test-ext.crudTest', async () => {
        show('test-ext.crudTest REGISTERED')

        // Priority order for root path
        let rootPath: string | undefined

        rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

        if (!rootPath && inDevelopmentMode) {
          // NOTE launching from Command Palette is OK, debug needs this
          rootPath = '/home/mili/Ext/test-ext'
          show('rootPath not found use /home/mili/Ext/test-ext')
        }
        if (!rootPath) {
          show('No workspace folder found. Open a folder first.')
          return
        }
        appName = rootPath.match(/\/?([a-zA-z0-9_-]+)$/)?.[1] as string
        show(`[Backend] Resolved Root Path: ${rootPath}`)

        // await vscode.window.showWarningMessage(
        //   rootPath,
        //   {
        //     modal: true,
        //     detail: 'page is blank',
        //   },
        //   'This should be te rootPath',
        // )
        paths = {
          root: rootPath,
          env: path.join(rootPath, '.env'),
          pending: path.join(rootPath, 'prisma/installORMPartTwoPending.txt'),
          schema: path.join(rootPath, 'prisma/schema.prisma'),
          components: path.join(rootPath, 'src', 'lib', 'components'),
        } as TPaths
        // create a customizable user interface that appears as a distinct editor tab
        // within extension's activation logic
        // panel = vscode.window.createWebviewPanel(
        //   // let as dispose sets it to null
        //   'crCrudSupport',
        //   'CRUD Support',
        //   vscode.ViewColumn.One,
        //   {
        //     enableScripts: true,
        //     retainContextWhenHidden: true,
        //   },
        // )
        if (!displayWebview(context, panel!).success) {
          info('closing displayWebview OrmOne return result.success false')
          return
        }
        // if (!fs.existsSync(paths.schema)) {
        //   // open OrmOne.html and wait for 'prismaPartOne' command from
        //   // it with db_ object as payload
        //   show('schema.prisma does not exist')
        //   panel!.webview.postMessage({ command: 'showPage', page: 'OrmOne' })
        // } else if (fs.existsSync(paths.pending)) {
        //   show('pending file exists')
        //   panel!.webview.postMessage({ command: 'showPage', page: 'OrmTwo' })
        // } else if (fs.existsSync(paths.schema)) {
        show('schema.prisma exists call OrmThree')
        panel!.webview.postMessage({ command: 'showPage', page: 'OrmThree' })
        // } else {
        //   show('unhandled situation')
        // }

        panel!.webview.onDidReceiveMessage(async (msg) => {
          switch (msg.command) {
            //     case 'prismaPartOne':
            //       show('prismaPartOne comand request from OrmOne')
            //       // db = JSON.parse(msg.payload) as DbParams
            //       // db.adminPwd = sudoName_ as string
            //       // if (db && paths) {
            //       //   result = await setupOrmTwoMessageHandlerOne(panel!) // ← Pass webview
            //       // }
            //       // info(`after call to prismaPartOne success is ${result.success}`)
            //       // // send info to OrmOne postMessage(message:any) so we send an object message is object {command,siccess}
            //       // panel!.webview.postMessage({
            //       //   command: 'partOneDone',
            //       //   success: result.success,
            //       // })
            //       // info(`sent message partOneDone to OrmOne`)
            //       // if (!result.success) {
            //       //   panel!.webview.postMessage({
            //       //     command: 'showPage',
            //       //     page: 'OrmThree',
            //       //   })
            //       // }
            //       break

            //     case 'prismaPartTwo':
            //       show('prismaPartTwo command request from OrmTwo.html')
            //       // if (!(await setupOrmTwoMessageHandlerTwo(panel!)).success) {
            //       //   info('PrismaPartTwo done, open OrmThree')
            //       //   panel!.webview.postMessage({
            //       //     command: 'showPage',
            //       //     page: 'OrmThree',
            //       //   })
            //       // } else {
            //       //   info('failed to install prismaPartTwo')
            //       // }
            //       break

            case 'ready':
              show(['paths.schema', paths.schema])

              // when OrmThree.html is ready it sends 'ready' command and we respond
              // by sending prisma models and field strips
              let schema = '' // NOTE to set it to an empty string after parsing is done
              try {
                schema = fs.readFileSync(paths.schema, 'utf-8')
                if (!schema) {
                  vscode.window.showInformationMessage(
                    `${paths.schema} not found, cannot continue`,
                  )
                  panel!.dispose()
                }
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                info(`reading schema.prisma err ${msg}`)
              }
              try {
                const { models, enums } = parsePrismaSchema(schema)
                panel!.webview.postMessage({
                  command: 'sendingModels',
                  payload: JSON.stringify({
                    models,
                    enums,
                    appName,
                  }),
                })
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err)
                show(['parsePrismaSchema err', msg])
              }

              schema = '' // free up memory by clearing schema string after parsing

              break

            case 'showConfirmation':
              const {
                id,
                message,
                detail,
                confirmText = 'Yes',
                cancelText = 'No',
                title,
              } = msg.payload
              show(`[showConfirmation], ${message}`)

              const answer = await vscode.window.showWarningMessage(
                message,
                {
                  modal: true,
                  detail: detail,
                },
                confirmText,
              )
              show(`[user confirmation] ${answer}`)
              panel!.webview.postMessage({
                command: 'confirmationResponse',
                payload: {
                  id,
                  confirmed: answer === confirmText,
                  decision: answer || 'Cancelled',
                  subject: title || message,
                },
              })
              break
            case 'CreateCrudSupport':
              show('createCRUDSupportPage command request from OrmThree.html')
              const payload = JSON.parse(msg.payload)
              // const payload = msg.payload
              show(['stringified payload', JSON.stringify(payload)])
              show('calling generateParts payload')
              generateParts(context, panel!, channel, paths, payload)
              show('Extension: sending crudSuportDone')
              setTimeout(() => {
                panel!.webview.postMessage({
                  command: 'crudSuportDone',
                })
              }, 3000)

              break
            case 'fromAppSvelte':
              show(msg.payload)
              break
            case 'close':
              info('CRUD Support is closing')
              panel!.dispose()
              break

            //     case 'showInfo':
            //       info(msg.message)
            //       break
            //     default:
            //       show(`Unknown command: ${msg.command}`)
          }
          //   // panel!.onDidDispose(() => {
          //   //   panel = undefined
          //   // })
        })
      }),
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    info('Extension failed to activate. Check output logs.')
  }
}
export function deactivate() {}
