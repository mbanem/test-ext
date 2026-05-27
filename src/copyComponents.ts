// src/copyComponents.ts
import * as vscode from 'vscode'
import * as path from 'path'

async function directoryExists(uri: vscode.Uri): Promise<boolean> {
  try {
    const result = await vscode.workspace.fs.stat(uri)
    // Check if the URI points to a directory
    return result.type === vscode.FileType.Directory
  } catch {
    // If stat throws, the file or directory does not exist
    return false
  }
}

export async function copySelectedComponents(
  // we imported vscode and couoldmake new context but it will
  // be different so we need to stick with the existing one
  context: vscode.ExtensionContext,
  root: string,
  crComponents: string[],
): Promise<void> {
  console.log('copySelectedComponents entry')
  // components are not selected
  if (!crComponents?.length) {
    return
  }

  const componentsTargetDir = path.join(root, 'src', 'lib', 'components')
  const targetUri = vscode.Uri.file(componentsTargetDir)

  // Create directory if it doesn't exist
  try {
    if (!directoryExists(targetUri)) {
      await vscode.workspace.fs.createDirectory(targetUri)
      console.log(`Created directory: ${componentsTargetDir}`)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Error creating components directory:', msg)
  }

  const sourceUri = vscode.Uri.joinPath(
    context.extensionUri,
    'templates',
    'components',
  )

  const copied: string[] = []
  const failed: string[] = []

  for (const compName of crComponents) {
    const sourceFileUri = vscode.Uri.joinPath(sourceUri, `${compName}.svelte`)
    const targetFileUri = vscode.Uri.joinPath(targetUri, `${compName}.svelte`)

    try {
      const content = await vscode.workspace.fs.readFile(sourceFileUri)
      await vscode.workspace.fs.writeFile(targetFileUri, content)
      copied.push(compName)
    } catch (err: any) {
      console.error(`Failed to copy ${compName}.svelte:`, err)
      failed.push(compName)
    }
  }

  if (copied.length > 0) {
    console.log('copied', copied.length)
    vscode.window.showInformationMessage(
      `✅ Copied ${copied.join(',')} component(s) to src/lib/components`,
    )
  }

  if (failed.length > 0) {
    console.log('failed', failed.length)
    vscode.window.showWarningMessage(`⚠️ Failed to copy: ${failed.join(', ')}`)
  }
}
