import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { log, error, info } from './extension.js'
type TPageName = 'OrmOne' | 'OrmTwo' | 'OrmThree'
let manifestCache: Record<string, any> | null = null
let currentPanel: vscode.WebviewPanel | undefined

function getNonce(): string {
  let text = ''
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += possible[Math.floor(Math.random() * possible.length)]
  }
  return text
}

/**
 * Find and load page assets assembly the page HTML markup and set into panel.webview.html
 */
export function displayWebview(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
  pageName: TPageName,
  owner?: string,
): { success: boolean } {
  log(`displayWebview entry point: display ${pageName}`)
  const html = getWebviewHtml(context, panel.webview, pageName)
  panel.webview.html = html
  return { success: true }
}

/**
 * Returns the final HTML string — with automatic dev fallback
 */
function getWebviewHtml(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  pageName: string,
): string {
  const nonce = getNonce()

  // Locate the HTML file
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  const extensionRoot = context.extensionUri.fsPath

  const possibleRoots = [workspaceRoot, extensionRoot].filter(
    Boolean,
  ) as string[]

  let htmlPath = ''

  for (const root of possibleRoots) {
    const c1 = path.join(root, 'out', 'webview-assets', `${pageName}.html`)
    const c2 = path.join(
      root,
      'out',
      'webview-assets',
      'src',
      'webview-ui',
      `${pageName}.html`,
    )

    for (const candidate of [c1, c2]) {
      if (fs.existsSync(candidate)) {
        htmlPath = candidate
        console.log(`[Webview] ✅ FOUND HTML: ${htmlPath}`)
        break
      }
    }
    if (htmlPath) {
      break
    }
  }

  if (!htmlPath) {
    log(`[Webview] ⚠️ HTML not found for ${pageName}, falling back to dev mode`)
    return getDevHtml(webview, pageName)
  }
  log(`[Webview] ✅ Using HTML: ${htmlPath}`)
  let html = fs.readFileSync(htmlPath, 'utf-8')

  // === BEST FIX: Rebuild all asset URLs using asWebviewUri ===
  const assetsFolder = vscode.Uri.joinPath(
    context.extensionUri,
    'out',
    'webview-assets',
  )

  html = html.replace(
    /(src|href)=["'](\.\/)?([^"']+)["']/gi,
    (
      fullMatch: string,
      attr: string,
      dotSlash: string,
      relativePath: string,
    ) => {
      // Skip external or already-processed URLs
      if (
        relativePath.startsWith('http') ||
        relativePath.startsWith('data:') ||
        relativePath.startsWith('#')
      ) {
        return fullMatch
      }

      try {
        const assetUri = webview.asWebviewUri(
          vscode.Uri.joinPath(assetsFolder, relativePath),
        )
        return `${attr}="${assetUri}"`
      } catch (err) {
        error(`Failed to convert asset: ${relativePath}`)
        return fullMatch
      }
    },
  )
  log(`raw ${pageName}html length: ${html.length}`)
  // Inject CSP
  const csp = [
    `default-src 'none';`,
    `img-src ${webview.cspSource} https: data: blob:;`,
    `style-src ${webview.cspSource} 'unsafe-inline';`,
    `script-src ${webview.cspSource} 'nonce-${nonce}';`,
    `font-src ${webview.cspSource} data:;`,
    `connect-src ${webview.cspSource};`, // Allows source maps
  ].join(' ')

  html = html.replace(
    /<\/head>/i,
    `<meta http-equiv="Content-Security-Policy" content="${csp}">\n</head>`,
  )
  log(`final ${pageName}html length: ${html.length}`)
  return html
}

function getDevHtml(webview: vscode.Webview, pageName: string): string {
  const devUrl = `http://localhost:5174/${pageName}.html`
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-eval' 'unsafe-inline' http://localhost:5174; connect-src http://localhost:5174 ws://localhost:5174;">
  <title>CRUD DEV — ${pageName}</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="${devUrl}"></script>
</body>
</html>`
}

// // Helper to send message from extension to webview
// export function postMessageToWebview(panel: vscode.WebviewPanel, message: any) {
//   panel.webview.postMessage(message)
// }
