import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { displayWebview } from './webview.js'
import { spawn, execSync } from 'child_process'
import { parsePrismaSchema } from './webview-ui/src/lib/utils/parse-prisma-schema.js'
let paths: TPaths = {}
let panel: vscode.WebviewPanel | undefined = undefined
let appName = ''
export function runCommandStream(
  command: string,
  args: string[],
  options: {
    cwd?: string
    onStdout?: (data: string) => void
    onStderr?: (data: string) => void
    terminal?: vscode.Terminal
  } = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      shell: true,
    })

    proc.stdout.on('data', (data: any) => {
      const text = data.toString()
      options.onStdout?.(text)

      if (options.terminal) {
        options.terminal.sendText(text, false)
      }
    })

    proc.stderr.on('data', (data) => {
      const text = data.toString()
      options.onStderr?.(text)

      if (options.terminal) {
        options.terminal.sendText(text, false)
      }
    })

    proc.on('close', (code: any) => {
      resolve(code ?? 0)
    })

    proc.on('error', (err: string) => {
      reject(err)
    })
  })
}
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
export async function activate(context: vscode.ExtensionContext) {
  try {
    console.log('ACTIVATE CALLED')
    vscode.window.showInformationMessage(`CRUD TEST-EXT -- activated`)

    context.subscriptions.push(
      vscode.commands.registerCommand('test-ext.crudTest', async () => {
        console.log('COMMAND CALLED: test-ext.crudTest')

        // Priority order for root path
        let rootPath: string | undefined

        rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

        if (!rootPath) {
          // NOTE launching from Command Palette is OK, debug needs this
          rootPath = '/mili/home/Ext/test-ext'
        }
        if (!rootPath) {
          vscode.window.showErrorMessage(
            'No workspace folder found. Open a folder first.',
          )
          return
        }

        appName = rootPath.match(/\/?([a-zA-z0-9_-]+)$/)?.[1] as string
        console.log('Final rootPath:', rootPath)
        vscode.window.showInformationMessage(`Working in: ${rootPath}`)
        console.log(`[Backend] Resolved Root Path: ${rootPath}`)
        vscode.window.showInformationMessage(`Resolved Root Path: ${rootPath}`)

        // await vscode.window.showWarningMessage(
        //   rootPath,
        //   {
        //     modal: true,
        //     detail: 'page is blank',
        //   },
        //   'This should be te rootPath',
        // )
        console.log(`rootPath is ${rootPath}`)
        paths = {
          root: rootPath,
          env: path.join(rootPath, '.env'),
          pending: path.join(rootPath, 'prisma/installORMPartTwoPending.txt'),
          schema: path.join(rootPath, 'prisma/schema.prisma'),
          components: path.join(rootPath, 'src', 'lib', 'components'),
        } as TPaths

        // create a customizable user interface that appears as a distinct editor tab
        // within extension's activation logic
        panel = vscode.window.createWebviewPanel(
          'crCrudSupport',
          'CRUD Support',
          vscode.ViewColumn.One,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          },
        )
        const result = displayWebview(context, panel!)
        console.log('initial call displayWebview', result)
        if (!fs.existsSync(paths.schema)) {
          // open OrmOne.html and wait for 'installPrismaPartOne' command from
          // it with db_ object as payload
          panel!.webview.postMessage({ command: 'showPage', page: 'OrmOne' })
        } else if (fs.existsSync(paths.pending)) {
          panel!.webview.postMessage({ command: 'showPage', page: 'OrmTwo' })
        } else {
          panel!.webview.postMessage({ command: 'showPage', page: 'OrmThree' })
        }
        panel.webview.onDidReceiveMessage(async (msg) => {
          switch (msg.command) {
            case 'ready':
              // when OrmThree.html is ready it sends 'ready' command and we respond
              // by sending prisma models and field strips
              let schema = '' // NOTE to set it to an empty string after parsing is done
              try {
                schema = fs.readFileSync(paths.schema, 'utf-8')
                if (!schema) {
                  info(`${paths.schema} not found, cannot continue`)
                  panel!.dispose()
                }
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                console.log('reading schema.prisma', err)
              }
              const { models, enums } = parsePrismaSchema(schema)
              console.log('models', models)
              console.log('enums', enums)
              schema = '' // free up memory by clearing schema string after parsing

              panel!.webview.postMessage({
                command: 'sendingModels',
                payload: JSON.stringify({
                  models,
                  enums,
                  appName,
                }),
              })
              break
            default:
              log(`Unknown command: ${msg.command}`)
          }
        })
        panel.onDidDispose(() => {
          panel = undefined
        })
      }),
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    vscode.window.showErrorMessage(
      'Extension failed to activate. Check output logs.',
    )
  }
}
export function deactivate() {}
