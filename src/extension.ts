import * as vscode from 'vscode'
import { ExtensionContext, ExtensionMode } from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { displayWebview } from './webview.js'
import { spawn, execSync, ChildProcess } from 'child_process'
import { parsePrismaSchema } from './webview-ui/src/lib/utils/parse-prisma-schema.js'
import { setupOrmOneMessageHandler } from './ormOne.js'
import { setupOrmTwoMessageHandler } from './ormTwo.js'
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
export const sudoName_ = 'mili'
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
export const channel = vscode.window.createOutputChannel('loadMainMarkup')
export const channelShow = (msg: string | string[], show: boolean = false) => {
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
    // show('test-ext.crudTest ACTIVATED')
    vscode.window.showInformationMessage(`CRUD TEST-EXT -- activated`)
    inDevelopmentMode = context.extensionMode === ExtensionMode.Development
    context.subscriptions.push(
      vscode.commands.registerCommand('test-ext.crudTest', async () => {
        channelShow('test-ext.crudTest REGISTERED')

        // Priority order for root pathlet rootPath: string | undefined

        let rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

        if (!rootPath && inDevelopmentMode) {
          // NOTE launching from Command Palette is OK, debug needs this
          rootPath = '/home/mili/Ext/test-ext'
          console.log(
            '[extension] debug only! rootPath not found use /home/mili/Ext/test-ext',
          )
        }
        if (!rootPath) {
          console.log(
            '[extension] No workspace folder found. Open a folder first.',
          )
          return
        }
        appName = rootPath.match(/\/?([a-zA-z0-9_-]+)$/)?.[1] as string
        console.log(`[extension]  Resolved Root Path: ${rootPath}`)
        paths = {
          root: rootPath,
          env: path.join(rootPath, '.env'),
          pending: path.join(rootPath, 'prisma/installORMPartTwoPending.txt'),
          schema: path.join(rootPath, 'prisma/schema.prisma'),
          components: path.join(rootPath, 'src', 'lib', 'components'),
        } as TPaths

        if (!displayWebview(context, panel!, 'OrmOne').success) {
          info('closing displayWebview OrmOne return result.success false')
          return
        }
        if (paths.schema && !fs.existsSync(paths.schema)) {
          console.log(
            `[extension] we need OrmOne; schema.prisma does not exist at ${paths.schema}`,
          )

          // NOTE not an action -- just setup message-listener (onDidReceiveMesssage) for OrmOne requests
          setupOrmOneMessageHandler(context, panel!.webview, paths)
          panel!.webview.postMessage({ command: 'showPage', page: 'OrmOne' })
          return
          // Open OrmOne to call prismaPartOne and bring db_ object as payload to ormOne listener
          // if (displayWebview(context, panel!, 'OrmOne').success) {
          //   console.log(
          //     '[extension] closing displayWebview, OrmOne return result.success true',
          //   )
          // } else {
          //   console.log(
          //     '[extension] displayWebview, OrmOne return result.success false',
          //   )
          //   return
          // }
          // // panel!.webview.postMessage({ command: 'showPage', page: 'OrmOne' })
          // console.log(
          //   '[extension] displayWebview loaded html?',
          //   panel!.webview.html,
          // )
          // request to App.svelte for page OrmOne
        } else if (fs.existsSync(paths.pending)) {
          console.log('[extension] pending file exists')
          // NOTE this case is when prisma is installed but latter on
          // extension is started. Below is case when user continue
          // form OrmTwo when prisma generate is done

          setupOrmTwoMessageHandler(panel!, paths)
          if (!displayWebview(context, panel!, 'OrmTwo').success) {
            console.log(
              '[extension] closing displayWebview, OrmTwo return result.success false',
            )
          }
        } else if (fs.existsSync(paths.schema)) {
          console.log('[extension] schema.prisma exists call OrmThree')
          panel!.webview.postMessage({ command: 'showPage', page: 'OrmThree' })
          if (!displayWebview(context, panel!, 'OrmThree').success) {
            console.log(
              '[extension] closing displayWebview, OrmThree return result.success false',
            )
            // return
          }
        } else {
          console.log('[extension] unhandled situation')
        }

        const messageHandler = panel!.webview.onDidReceiveMessage(
          async (msg) => {
            switch (msg.command) {
              case 'AppSvelteReady':
                console.log(
                  '[extension] App.svelte report it is ready; we post showPage OrmOne',
                )
                panel!.webview.postMessage({
                  command: 'showPage',
                  page: 'OrmOne',
                })
                break

              // case 'prismaPartOne':
              // console.log(
              //   `[Ext onDid] prismaPartOne comand request from OrmOne ${msg.command}`,
              // )
              // // db = JSON.parse(msg.payload) as DbParams
              // // db.adminPwd = sudoName_ as string
              // // if (db && paths) {
              // setupOrmOneMessageHandler(context, panel!.webview, paths) // ← Pass webview
              // // }
              // // console.log(`after call to prismaPartOne success is ${result.success}`)
              // // // send console.log to OrmOne postMessage(message:any) so we send an object message is object {command,siccess}
              // panel!.webview.postMessage({
              //   command: 'partOneDone',
              //   success: result.success,
              // })
              // console.log(`sent message partOneDone to OrmOne`)
              // if (!result.success) {
              //   panel!.webview.postMessage({
              //     command: 'showPage',
              //     page: 'OrmTwo',
              //   })
              // }
              // break

              // case 'prismaPartTwo':
              //   console.log(
              //     '[extension] prismaPartTwo command request from OrmTwo.html',
              //   )
              //   panel!.webview.postMessage({
              //     command: 'showPage',
              //     page: 'OrmThree',
              //   })
              //   console.log(
              //     '[extension] case prismaPartTwo sent showPage OrmThree',
              //   )
              //   // break
              //   if (!(await setupOrmTwoMessageHandler(panel!, paths)).success) {
              //     console.log('[extension] PrismaPartTwo done, open OrmThree')
              //     panel!.webview.postMessage({
              //       command: 'showPage',
              //       page: 'OrmThree',
              //     })
              //   } else {
              //     console.log('[extension] failed to install prismaPartTwo')
              //   }
              //   break

              case 'ready':
                console.log('[extension] paths.schema', paths.schema)

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
                  console.log(`[extension] reading schema.prisma err ${msg}`)
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
                  console.log('[extension] parsePrismaSchema err', msg)
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
                channelShow(`[showConfirmation], ${message}`)

                const answer = await vscode.window.showWarningMessage(
                  message,
                  {
                    modal: true,
                    detail: detail,
                  },
                  confirmText,
                )
                channelShow(`[user confirmation] ${answer}`)
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
                console.log(
                  '[extension] createCRUDSupportPage command request from OrmThree.html',
                )
                const payload = JSON.parse(msg.payload)
                // const payload = msg.payload
                console.log(
                  '[extension] stringified payload',
                  JSON.stringify(payload),
                )
                console.log('[extension] calling generateParts payload')
                generateParts(context, panel!, channel, paths, payload)
                console.log('[extension]  sending crudSuportDone')
                setTimeout(() => {
                  panel!.webview.postMessage({
                    command: 'crudSuportDone',
                  })
                }, 3000)
                break

              case 'fromAppSvelte':
                console.log('[fromApp]', msg.payload)
                break
              case 'progress':
                console.log(msg.payload)
                break

              case 'showInfo':
                info(msg.message)
                break
              case 'stepCompleted':
                console.log(
                  '[extension.ts stepCompleted] from',
                  msg.from,
                  ' to ',
                  msg.to,
                )
                break

              case 'close':
                info('CRUD Support is closing')
                panel!.dispose()
                break

              // default:
              //   console.log(`[extension] Unknown command: ${msg.command}`)
            }
            panel!.onDidDispose(() => {
              panel = undefined
            })
          },
        )
      }),
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log('Extension failed to activate. Check output logs.')
  }
}
export function deactivate() {}
