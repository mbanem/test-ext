import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { displayWebview } from './webview.js'
import { installPrismaPartOne } from './ormOne.js'
import { installPrismaPartTwo } from './ormTwo.js'
import { generateParts } from './partsGenerator.js'
import { spawn, execSync } from 'child_process'
import { parsePrismaSchema } from './webview-ui/src/lib/utils/parse-prisma-schema.js'

/*
  To make your file-writing tasks 100% immune to Windows backslashes (\) vs Linux forward 
  slashes (/), always use the built-in vscode.Uri.file() and vscode.Uri.joinPath() utilities 
  when referencing paths in your backend.
  const prismaSchemaUri = vscode.Uri.joinPath(projectRootUri, 'app', 'prisma', 'schema.prisma');
*/
let paths: TPaths = {}
let db: DbParams = {}
export type TMessage = {
  command: string
  payload?: any
}

let panel: vscode.WebviewPanel | undefined = undefined

function execShell(cmd: string): string | null {
  try {
    // Blocks the event loop until the command finishes
    return execSync(cmd, { encoding: 'utf8' })
  } catch (error) {
    console.error('Execution failed:', error)
  }
  return null
}
async function getUserInput(): Promise<string | null> {
  const result = await vscode.window.showInputBox({
    value: '/home/mili/Ext/test-ext',
    placeHolder: 'Enter application root directory',
    prompt: 'Please enter a valid value',
    validateInput: (text) => {
      return text.length === 0 ? 'Input cannot be empty!' : null
    },
  })

  if (result === undefined) {
    // User cancelled the operation by hitting 'Escape'
    return null
  }

  vscode.window.showInformationMessage(`User typed: ${result}`)
  return result
}
export const sudoName_ = execShell('whoami')?.trim()
// const root = (await execShell('pwd')).trim()
// will hold the content of prisma/schema.prisma file as a string after we read it
// with fs.readlinkSync in response to 'ready' command from OrmThree.html
// after making models with parsePrismaSchema we will send stringified models
// and set schema to empty string to free up memory
let schema: string = '' //
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

    proc.stdout.on('data', (data) => {
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

    proc.on('close', (code) => {
      resolve(code ?? 0)
    })

    proc.on('error', (err) => {
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
// All NPM package installations commands are issued from here
let terminal: vscode.Terminal | undefined
function sendToTerminal(cmd: string) {
  if (!terminal) {
    terminal = vscode.window.createTerminal(`WebView Terminal`)
  }
  terminal.show(true) // reveal the terminal
  terminal.sendText(cmd)
}
// let db: DbParams = {}
export async function activate(context: vscode.ExtensionContext) {
  console.log('ACTIVATE CALLED')
  vscode.window.showInformationMessage(`CRUD TEST-EXT -- activated`)

  context.subscriptions.push(
    vscode.commands.registerCommand('test-ext.crudTest', async () => {
      console.log('COMMAND CALLED: test-ext.crudTest')

      let rootPath: string | undefined

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]

      if (workspaceFolder && workspaceFolder.uri.scheme === 'vscode-remote') {
        // Correct remote path evaluation
        rootPath = workspaceFolder.uri.path
      } else {
        // If VS Code passes a local Windows path or system file location,
        // fallback to Node's native Linux Current Working Directory
        rootPath = process.cwd()
      }

      // Emergency cleanup guard: If it STILL contains a /mnt/c/ override,
      // strip the tail folder name dynamically and map it back to your Linux structure
      if (rootPath.startsWith('/mnt/c/')) {
        const currentFolder = path.basename(
          vscode.workspace.workspaceFolders?.[0]?.uri.path || '',
        )
        console.log(
          'Detected WSL path, remapping to Linux structure with folder:',
          currentFolder,
        )
        rootPath = currentFolder
          ? `/home/mili/Ext/${currentFolder}`
          : '/home/mili/Ext/test-ext'
      }

      console.log('Guaranteed Workspace Linux Path:', rootPath)
      console.log(`[Backend] Resolved Root Path: ${rootPath}`)
      vscode.window.showInformationMessage(`Resolved Root Path: ${rootPath}`)

      await vscode.window.showWarningMessage(
        rootPath,
        {
          modal: true,
          detail: 'page is blank',
        },
        'This should be te rootPath',
      )
      log(`rootPath is ${rootPath}`)
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
        'crCrudSupport', // Identifies the type of the webview internally
        'CRUD Support', // Title displayed to the user
        vscode.ViewColumn.One, // Editor column to show the panel in
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        },
      )
      // If prismaSchemaFound is false start with OrmOne.html page which should return
      // a db_ object and so commence communication between this extension and ORMxxx
      // pages in wizard like steps for installing ORM, creating database and generating
      // SvelteKit CRUD support app pages based on the prisma schema models and some
      // additonal functionality selected by users

      if (!fs.existsSync(paths.schema)) {
        // open OrmOne.html and wait for 'installPrismaPartOne' command from
        // it with db_ object as payload
        displayWebview(context, panel, 'OrmOne')
      } else if (fs.existsSync(paths.pending)) {
        displayWebview(context, panel!, 'OrmTwo')
      } else {
        displayWebview(context, panel!, 'OrmThree')
      }
      panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.command) {
          // OrmOne.html sends this command with db_ object as payload when
          // user clicks 'Install Prisma ORM'
          case 'installPrismaPartOne':
            log('installPrismaPartOne comand request from OrmOne.html 1')
            db = JSON.parse(msg.payload) as DbParams
            db.adminPwd = sudoName_ as string
            let result = await installPrismaPartOne(db, paths)
            log(
              `after call to installPrismaPartOne success is ${result.success.toString()}`,
            )
            displayWebview(context, panel!, 'OrmTwo')
            break

          case 'installPrismaPartTwo':
            log('installPrismaPartTwo command request from OrmTwo.html')
            const cmd = installPrismaPartTwo(paths) //FIX: needs build db models from schema
            sendToTerminal(`cd ${paths.root}`)
            sendToTerminal(cmd)

            deletePendingFile()
            log('pending file deleted')
            console.log('installPrismaPartTwo done')

            // if (result.success) {
            // wait until prisma migrations folder is created
            const migrateFolder = path.join(paths.root, 'prisma/migrations')
            for (let i = 0; i < 10; i++) {
              await sleep(1000)
              if (fs.existsSync(migrateFolder)) {
                break
              }
            }
            await sleep(3000)
            // }
            //   // Create Uri for the schema file
            //   let uri = vscode.Uri.file(paths.schema)
            //   // Open schema content in new tab (beside current editor)
            //   await vscode.window.showTextDocument(uri, {
            //     viewColumn: vscode.ViewColumn.Beside, // Opens beside active editor
            //     preview: false, // Optional: Force a new tab (not preview mode)
            //   })
            //   log(
            //     `forming dblink with db params ${JSON.stringify(db)} ${db.owner} ${db.password} ${db.port} ${db.name}`,
            //   )
            //   // create Uri for the .env file
            //   uri = vscode.Uri.file(paths.env)
            //   await vscode.window.showTextDocument(uri, {
            //     viewColumn: vscode.ViewColumn.Beside, // Opens beside active editor
            //     preview: false, // Optional: Force a new tab (not preview mode)
            //   })
            // }
            // log(`installPrismaPartTwo success: ${result.success}`)
            // console.log('installPrismaPartTwo result', result.success)
            // // OrmThree needs prisma models; we parse prisma and send stringified models to it
            console.log('call to open OrmThree')
            displayWebview(context, panel!, 'OrmThree')
            break

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
              payload: JSON.stringify({ models, enums }),
            })
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
            console.log('extension got showConfirmation', message)

            const answer = await vscode.window.showWarningMessage(
              message,
              {
                modal: true,
                detail: detail,
              },
              confirmText,
            )
            console.log('user confirmation', answer)
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
            log('createCRUDSupportPage command request from OrmThree.html')
            const payload = JSON.parse(msg.payload)
            // const payload = msg.payload
            log(['stringified payload', JSON.stringify(payload)])
            generateParts(context, panel!, paths, payload)
            log('Extension: sending crudSuportDone')
            panel!.webview.postMessage({
              command: 'crudSuportDone',
            })
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
