import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

function getNonce(): string {
  let text = ''
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += possible[Math.floor(Math.random() * possible.length)]
  }
  return text
}

export async function displayWebview(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
  initialPage: 'OrmOne' | 'OrmThree',
): Promise<TResult> {
  const isDev = context.extensionMode === vscode.ExtensionMode.Development

  try {
    const html = isDev
      ? getDevHtml(panel.webview, initialPage)
      : await loadMainMarkup(context, panel.webview, initialPage)

    panel.webview.html = html //
    ;(panel as any)._currentPage = initialPage

    setTimeout(() => {
      panel.webview.postMessage({
        command: 'showPage',
        page: initialPage,
      })
    }, 300)

    if (isDev) {
      setupDevHotReload(panel)
    }

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[Webview] CRITICAL ERROR:`, msg)
    return { success: false, error: msg }
  }
}

async function loadMainMarkup(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  initialPage: string,
): Promise<string> {
  const nonce = getNonce()

  // Define target using standard URI logic
  const htmlUri = vscode.Uri.joinPath(
    context.extensionUri,
    'out',
    'webview-assets',
    'index.html',
  )

  let html = ''
  try {
    const rawData = await vscode.workspace.fs.readFile(htmlUri)
    html = new TextDecoder('utf-8').decode(rawData)
  } catch (err) {
    console.error('[ormOne] Webview Failed to read production index.html:', err)
    return getDevHtml(webview, initialPage)
  }
  // === BEST FIX: Rebuild all asset URLs using asWebviewUri ===
  const assetsFolder = vscode.Uri.joinPath(
    context.extensionUri,
    'out',
    'webview-assets',
  )

  html = html.replace(
    /(src|href)=["']\/??(?:\.\/)?([^"']+)["']/gi, // Gracefully handles leading /, ./, or direct path names
    (fullMatch, attr, relativePath) => {
      // Skip remote external protocols, inline fragments, and explicit data payloads
      if (
        relativePath.startsWith('http') ||
        relativePath.startsWith('data:') ||
        relativePath.startsWith('#')
      ) {
        return fullMatch
      }

      try {
        // Correctly computes nested routes like 'assets/index-DlR18Vur.js' inside the out/webview-assets context
        const assetUri = webview.asWebviewUri(
          vscode.Uri.joinPath(assetsFolder, relativePath),
        )
        return `${attr}="${assetUri}"`
      } catch (err) {
        console.error(
          `[Webview] Path transformation failed for: ${relativePath}`,
          err,
        )
        return fullMatch
      }
    },
  )

  // Inject CSP
  const csp = [
    `default-src 'none';`,
    `img-src ${webview.cspSource} https: data: blob:;`,
    `style-src ${webview.cspSource} 'unsafe-inline';`,
    `script-src ${webview.cspSource} 'nonce-${nonce}';`,
    `font-src ${webview.cspSource} data:;`,
    `connect-src ${webview.cspSource};`, // Allows source maps
    `media-src ${webview.cspSource};`,
  ].join(' ')

  html = html.replace(
    /<\/head>/i,
    `<meta http-equiv="Content-Security-Policy" content="${csp}">\n</head>`,
  )
  html = html.replace(
    '<div id="app"></div>',
    `<div id="app" data-initial-page="${initialPage}"></div>`,
  )
  // Inject initial page as global variable
  html = html.replace(
    '<script type="module"',
    `<script>
      window.__INITIAL_PAGE = "${initialPage}";
    </script>
    <script type="module"`,
  )

  return html
}

function getDevHtml(webview: vscode.Webview, initialPage: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    img-src ${webview.cspSource} https: data: blob:;
    style-src ${webview.cspSource} 'unsafe-inline' http://localhost:5174 http://127.0.0.1:5174;
    script-src ${webview.cspSource} 'unsafe-eval' 'unsafe-inline' http://localhost:5174 http://127.0.0.1:5174;
    connect-src http://localhost:5174 http://127.0.0.1:5174 ws://localhost:5174 ws://127.0.0.1:5174;
    font-src ${webview.cspSource} data:;
  ">
  <title>CRUD DEV</title>
</head>
<body>
  <div id="app" data-initial-page="${initialPage}"></div>
  <script type="module" src="http://localhost:5174/@vite/client"></script>
  <script type="module" src="http://localhost:5174/src/main.ts"></script>
</body>
</html>`
}

function setupDevHotReload(panel: vscode.WebviewPanel) {
  // Optional: You can still watch files if you want extra safety
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/src/webview-ui/**/*.{svelte,ts,js,css}',
  )

  watcher.onDidChange(() => {
    console.log('[HMR] Change detected - Vite should handle it')
    // Vite HMR usually handles it automatically
  })

  panel.onDidDispose(() => watcher.dispose())
}
function setupWebviewHotReload(
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext,
) {
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      context.extensionUri,
      'out/webview-assets/**/*.{js,css}', // Adjust if your output path is different
    ),
  )

  watcher.onDidChange(async () => {
    console.log('[Hot Reload] Webview assets changed → reloading...')

    const currentPage = (panel as any)._currentPage || 'OrmOne'

    const html = await loadMainMarkup(context, panel.webview, currentPage)
    panel.webview.html = html
    if (context.extensionMode === vscode.ExtensionMode.Development) {
      setupWebviewHotReload(panel, context)
    }

    // Re-send the page command after a small delay
    setTimeout(() => {
      panel.webview.postMessage({
        command: 'showPage',
        page: currentPage,
      })
    }, 400)
  })

  // Cleanup
  panel.onDidDispose(() => {
    watcher.dispose()
  })
}
