import * as vscode from 'vscode'
import { copySelectedComponents } from './copyComponents.js'
export function generateParts(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
  paths: TPaths,
  payload: Payload,
) {
  console.log('calling copySelectedComponents', paths.root, payload)
  console.log('components?', payload.crComponents)
  copySelectedComponents(
    context,
    paths.root,
    payload.crComponents as Components,
  )
}
