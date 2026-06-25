import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { info } from './extension.js'

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
 * Find and load the starting OrmOne.html page from /out/webview-assets
 * Insert CSP security part into its markup and set into panel.webview.html
 * This is an old way of finding and loading every .html page.
 * New way is to do so for the first required page and then calling App.svelte
 *
 * ---- The old way -----
  export function displayWebview(
    context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel,showPage
    pageName: TPageName,
    owner?: string,
  ): { success: boolean } {
    console.log(`displayWebview entry point: display ${pageName}`)
    const html = getWebviewHtml(context, panel.webview, pageName)
    panel.webview.html = html
    return { success: true }
  }
*/

// The new way
export function displayWebview(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
): TResult {
  info('[Webview] displayWebview entry point')

  const html = getWebviewHtml(context, panel.webview, 'OrmOne')
  panel.webview.html = html
  info('[Webview] displayWebview inital page returns {success: true}')
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
        info(`[Webview] ✅ FOUND HTML: ${htmlPath}`)
        break
      }
    }
    if (htmlPath) {
      break
    }
  }

  if (!htmlPath) {
    info(
      `[Webview] ⚠️ HTML not found for ${pageName}, falling back to dev mode`,
    )
    return getDevHtml(webview, pageName)
  }
  info(`[Webview] ✅ Using HTML: ${htmlPath}`)
  let html = fs.readFileSync(htmlPath, 'utf-8')

  // === BEST FIX: Rebuild all asset URLs using asWebviewUri ===
  const assetsFolder = vscode.Uri.joinPath(
    context.extensionUri,
    'out',
    'webview-assets',
  )

  html = html.replace(
    /(src|href)=["'](\.\/)?([^"']+)["']/gi,
    (fullMatch, attr, dotSlash, relativePath) => {
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
        console.log(`Failed to convert asset: ${relativePath}`)
        return fullMatch
      }
    },
  )
  info(`raw ${pageName}html length: ${html.length}`)
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
  info(`final ${pageName}html length: ${html.length}`)
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
  <!-- this src as a prop for <script is new for me -->
  <script type="module" src="${devUrl}"></script>
</body>
</html>
`
}
