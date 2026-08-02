import * as vscode from 'vscode'
import { ExtensionMode } from 'vscode'
import { inspect } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import { displayWebview } from './webview.js'
import { setupOrmOneMessageHandler } from './ormOne.js'
import { generateParts } from './partsGenerator.js'

let paths: Paths
let inDevelopmentMode = false

let panel: vscode.WebviewPanel | undefined = undefined
export const areShallowEqual = <T extends object>(
  obj1: T,
  obj2: T,
): boolean => {
  const keys1 = Object.keys(obj1) as (keyof T)[]
  // const keys1 = Object.keys(obj1) as Array<keyof T>  // equivalent statement
  const keys2 = Object.keys(obj2) as (keyof T)[]
  if (keys1.length !== keys2.length) {
    return false
  }
  return keys1.every((k) => obj1[k] === obj2[k])
}

/**
 * Returns a map of video names to Webview-compatible URIs.
 */
let wView: vscode.Webview | undefined = undefined
let exUri: vscode.Uri | undefined = undefined

export function getVideoUris(videoNames: string[]): Record<string, string> {
  const videoUris: Record<string, string> = {}

  for (const name of videoNames) {
    // 1. Construct absolute disk path to webview-ui/public/<name>.mp4
    const diskUri = vscode.Uri.joinPath(
      exUri as vscode.Uri,
      'src',
      'webview-ui',
      'public',
      `${name}Video.mp4`,
    )

    // 2. Convert to Webview URI (e.g., https://file+.vscode-resource.vscode-cdn.net/...)
    const webviewUri = (wView as vscode.Webview).asWebviewUri(diskUri)

    // 3. Store as string so it serializes cleanly via postMessage
    videoUris[`${name}Video`] = webviewUri.toString()
  }
  console.log('[ext] getVideoUris', videoUris)
  return videoUris
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

export class Paths {
  // Read-only property so the root path cannot be accidentally overwritten
  public readonly _root: string

  constructor(rootPath: string) {
    this._root = rootPath
  }

  // Getters that dynamically construct paths on the fly
  get root(): string {
    return this._root
  }

  get env(): string {
    return path.join(this._root, '.env')
  }

  get pending(): string {
    return path.join(this._root, 'prisma', 'installORMPartTwoPending.txt')
  }

  get schema(): string {
    return path.join(this._root, 'prisma', 'schema.prisma')
  }

  get components(): string {
    return path.join(this._root, 'src', 'lib', 'components')
  }
}
// Factory function
export class CommandResultTracker<
  TF extends boolean = false,
> implements TCommandResult<TF> {
  // 🚀 Native private field declaration
  success: TF
  code = -1
  stdout = ''
  stderr = ''
  command = ''
  args: string[] = []
  error?: Error

  constructor(initialSuccess: TF) {
    this.success = initialSuccess
  }

  setSuccess(value: TF) {
    this.success = value
    if (value === (true as unknown as TF)) {
      this.stderr = ''
      this.error = undefined
    }
    return this
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
  [inspect.custom](depth: number, options: any, inspectFn: typeof inspect) {
    return {
      success: this.success, // Explicitly pull the getter value
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
  console.log('[ext] === EXTENSION ACTIVATING ===')

  exUri = context.extensionUri
  inDevelopmentMode = context.extensionMode === ExtensionMode.Development

  // Register command
  const disposable = vscode.commands.registerCommand('test-ext.crudTest', () =>
    openCrudSupportPanel(context),
  )

  context.subscriptions.push(disposable)

  console.log('[ext] === EXTENSION ACTIVATED SUCCESSFULLY ===')
}

async function openCrudSupportPanel(context: vscode.ExtensionContext) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One)
    return
  }
  console.log('[ext] openCrudSupportPanel called')
  // Show progress to prevent "unresponsive" feeling
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'CRUD Support',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: 'Creating webview panel...' })

      console.log('[ext] createWebviewPanel')

      panel = vscode.window.createWebviewPanel(
        'crCrudSupport',
        'CRUD Support',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            // 1. Allow the extension's entire compiled output folder (Scripts + CSS + Videos)
            vscode.Uri.joinPath(context.extensionUri, 'out'),
            // 2. Critically allow the end-user's opened workspace directory so webview can parse their schema
            ...(vscode.workspace.workspaceFolders
              ? vscode.workspace.workspaceFolders.map((f) => f.uri)
              : []),
          ],
          portMapping: [{ webviewPort: 5174, extensionHostPort: 5174 }],
        },
      )

      wView = panel.webview
      console.log('[ext] created webview panel')

      setupPanelLifecycle(panel)

      const rootPath = getWorkspaceRootPath()
      if (!rootPath) {
        vscode.window.showErrorMessage('Please open a workspace folder first.')
        panel.dispose()
        return
      }
      // Diagnostic message: verify what Node and Prisma will see
      vscode.window.showInformationMessage(
        `Target directory verified: ${rootPath}`,
      )

      paths = new Paths(rootPath)

      console.log('[ext] paths:', paths)
      progress.report({ message: 'Determining initial page...' })
      const initialPage = determineInitialPage(paths)

      console.log('[ext] initailPage', initialPage)
      progress.report({ message: 'Loading webview...' })
      const displayResult = await displayWebview(
        context,
        panel,
        initialPage as PageKey,
      )
      if (!displayResult.success) {
        panel.dispose()
        return
      }

      if (initialPage === 'OrmOne') {
        progress.report({ message: 'Setting up Prisma ORM...' })
        const setupResult = await setupOrmOneMessageHandler(
          context,
          panel,
          paths,
        )
        if (!setupResult.success) {
          vscode.window.showWarningMessage(
            'Prisma setup failed. Some features may be limited.',
          )
        }
      }

      setupWebviewMessageHandler(panel, context)
    },
  )
}

// ==================== Helper Functions ====================

function setupPanelLifecycle(currentPanel: vscode.WebviewPanel | undefined) {
  console.log('[ext] setupPanelLifecycle')
  currentPanel?.onDidDispose(() => {
    currentPanel = undefined // Important: clear reference
  })
}

function getWorkspaceRootPath(): string | undefined {
  const folders = vscode.workspace.workspaceFolders

  if (!folders || folders.length === 0) {
    if (inDevelopmentMode) {
      console.log('[ext] Test window is empty. Using absolute dev fallback.')
      return '/home/mili/Ext/test-ext'
    }
    return undefined
  }

  // Handle Multi-Project scenarios
  if (folders.length > 1) {
    console.log(
      '[ext] Multi-root workspace detected. Finding active project...',
    )

    // Attempt to grab the path of the file currently active in the text editor
    const activeEditor = vscode.window.activeTextEditor
    if (activeEditor) {
      const activeWorkspace = vscode.workspace.getWorkspaceFolder(
        activeEditor.document.uri,
      )
      if (activeWorkspace) {
        console.log(
          '[ext] Found root path via active editor:',
          activeWorkspace.uri.fsPath,
        )
        return activeWorkspace.uri.fsPath
      }
    }
  }

  // Fallback to the first open folder (guaranteed to be a Linux path under WSL)
  const rootPath = folders[0].uri.fsPath
  console.log('[ext] Resolved workspace root fsPath:', rootPath)
  return rootPath
}

function determineInitialPage(paths: TPaths): string {
  console.log('[ext] determineInitialPage', paths)
  if (
    !paths.schema ||
    !fs.existsSync(paths.schema) ||
    fs.existsSync(paths.pending)
  ) {
    return 'OrmOne'
  }
  return 'OrmThree' // or OrmTwo as per your logic
}

function setupWebviewMessageHandler(
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext,
) {
  panel.webview.onDidReceiveMessage(async (msg) => {
    switch (msg.command) {
      case 'close':
        panel.dispose()
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
          '[ext] createCRUDSupportPage command request from OrmThree.html',
        )
        const payload = JSON.parse(msg.payload)

        generateParts(context, panel!, channel, paths, payload)
        //                console.log('[ext]  sending crudSuportDone')
        setTimeout(() => {
          panel!.webview.postMessage({
            command: 'crudSuportDone',
          })
        }, 3000)
        break

      // Add other cases here
    }
  })
}
