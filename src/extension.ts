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
let inDevelopmentMode = false

let panel: vscode.WebviewPanel | undefined = undefined
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
// Factory function
export class CommandResultTracker<
  TF extends boolean = false,
> implements TCommandResult<TF> {
  // 🚀 Native private field declaration
  #success: TF
  code = -1
  stdout = ''
  stderr = ''
  command = ''
  args: string[] = []
  error?: Error

  constructor(initialSuccess: TF) {
    this.#success = initialSuccess
  }

  get success(): TF {
    return this.#success
  }

  set success(value: TF) {
    this.#success = value
    if (value === (true as unknown as TF)) {
      this.stderr = ''
      this.error = undefined
    }
  }

  *[Symbol.iterator](): Generator<TCommandResult<TF>, void, unknown> {
    yield {
      success: this.success, // Calls the public getter safely
      code: this.code,
      stdout: this.stdout,
      stderr: this.stderr,
      command: this.command,
      args: this.args,
      error: this.error,
    }
  }
}

export const waitForNewFile = async (
  filePath: string,
  timeoutMs: number,
): Promise<boolean> => {
  const uri = vscode.Uri.file(filePath)

  // 1. Initial check using await: if file already exists, return true immediately
  try {
    await vscode.workspace.fs.stat(uri)
    return true
  } catch {
    // File does not exist yet; proceed to setup the watcher
  }

  // 2. Setup the FileSystemWatcher using a Promise wrapper
  return new Promise<boolean>((resolve) => {
    const relativePattern = new vscode.RelativePattern(
      path.dirname(filePath),
      path.basename(filePath),
    )

    const watcher = vscode.workspace.createFileSystemWatcher(relativePattern)

    // Safety timeout to prevent the promise from hanging forever
    const timer = setTimeout(() => {
      watcher.dispose()
      resolve(false)
    }, timeoutMs)

    // Watcher event triggers instantly when the file is created
    watcher.onDidCreate(() => {
      clearTimeout(timer)
      watcher.dispose()
      resolve(true)
    })
  })
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
    console.log(`CRUD TEST-EXT -- activated`)
    inDevelopmentMode = context.extensionMode === ExtensionMode.Development
    if (panel) {
      context.subscriptions.push(panel)
    }
    context.subscriptions.push(
      vscode.commands.registerCommand('test-ext.crudTest', async () => {
        console.log('test-ext.crudTest REGISTERED')

        if (panel) {
          panel.reveal(vscode.ViewColumn.One)
          return
        }
        panel = vscode.window.createWebviewPanel(
          'crCrudSupport',
          'CRUD Support',
          vscode.ViewColumn.One,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          },
        )

        // 4. Register lifecycle IMMEDIATELY after creation
        panel.onDidDispose(() => {
          console.log('[extension] panel disposed, set panel = undefined')
          panel = undefined // Safely clears the reference so it can be re-created later
        })
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
        console.log(`[extension] Resolved Root Path: ${rootPath}`)
        paths = {
          root: rootPath,
          env: path.join(rootPath, '.env'),
          // pending: path.join(rootPath, 'prisma/installORMPartTwoPending.txt'),
          schema: path.join(rootPath, 'prisma/schema.prisma'),
          components: path.join(rootPath, 'src', 'lib', 'components'),
        } as TPaths

        // set initial page based on progression state
        let initialpage = 'OrmThree'
        if (paths.schema && !fs.existsSync(paths.schema)) {
          initialpage = 'OrmOne' as PageKey
        } else if (fs.existsSync(paths.pending)) {
          initialpage = 'OrmTwo'
        }

        if (!displayWebview(context, panel!, initialpage as PageKey).success) {
          info('closing displayWebview OrmOne return result.success false')
          return
        }

        if (initialpage === 'OrmOne') {
          let res = await setupOrmOneMessageHandler(context, panel!, paths)
          console.log('[extension] setupOrmOneMessageHandler result', res)
          if (!res.success) {
            console.log('[extension] setupOrmOneMessageHandler failed', res)
            return
          } else {
            console.log('[extension] setupOrmOneMessageHandler succeeded', res)
          }
        }
        // else if (initialpage === 'OrmTwo') {
        //   let res = await setupOrmTwoMessageHandler(
        //     context,
        //     panel!.webview,
        //     paths,
        //   )
        //   console.log('[extension] setupOrmTwoMessageHandler result', res)
        //   if (!res.success) {
        //     return
        //   }
        // }
        panel!.onDidDispose(() => {
          console.log('[extension] panel disposed, set panel to undefined')
          panel = undefined
        })

        const messageHandler = panel!.webview.onDidReceiveMessage(
          async (msg) => {
            switch (msg.command) {
              case 'ready':
                console.log(
                  '[extension] OrmThree is waiting for "sendingModels"',
                )

                // when OrmThree.html is ready it sends 'ready' command and we respond
                // by sending prisma models and field strips
                let schema = '' // NOTE to set it to an empty string after parsing is done
                try {
                  console.log('[extension] reading schema.prisma')
                  schema = fs.readFileSync(paths.schema, 'utf-8')
                  if (!schema) {
                    console.log('[extension] cannot read schema.prisma')
                    vscode.window.showInformationMessage(
                      `${paths.schema} not found, cannot continue`,
                    )
                    panel!.dispose()
                  } else {
                    console.log(
                      '[extension] schema.prisma read length is',
                      schema.length,
                    )
                  }
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err)
                  console.log(`[extension] reading schema.prisma err ${msg}`)
                }
                try {
                  console.log('[extension] calling parsePrismaSchema')
                  const { models, enums } = parsePrismaSchema(schema)
                  console.log(
                    '[extension] models.lebgth?',
                    Object.keys(models).length,
                  )
                  console.log(
                    '[extension] postMessage "sendingModels" stringified',
                  )
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
              case 'AppSvelteReady':
                console.log(
                  '[extension] App.svelte report it is ready; we post showPage OrmOne',
                )
                panel!.webview.postMessage({
                  command: 'showPage',
                  page: 'OrmOne',
                })
                break
              case 'close':
                console.log(
                  '[extension]  extension is closing, panel!.dispose()',
                )
                messageHandler.dispose()
                panel!.dispose()
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
              //     '[extension] prismaPartTwo command request from OrmOne.svelte',
              //     msg.payload,
              //   )
              //   if (
              //     (
              //       await setupOrmTwoMessageHandler(
              //         context,
              //         panel!.webview,
              //         paths,
              //       )
              //     ).success
              //   ) {
              //     console.log('[extension] PrismaPartTwo done, open OrmThree')
              //     // panel!.webview.postMessage({
              //     //   command: 'showPage',
              //     //   page: 'OrmThree',
              //     // })
              //   } else {
              //     console.log('[extension] failed to install prismaPartTwo')
              //   }
              //   break

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
                console.log(msg.message)
                break
              case 'stepCompleted':
                console.log(
                  '[extension] stepCompleted from',
                  msg.from,
                  ' to ',
                  msg.to,
                )
                panel!.webview.postMessage({
                  command: 'showPage',
                  page: 'OrmTwo',
                })
                break

              // default:
              //   console.log(`[extension] Unknown command: ${msg.command}`)
            }
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
