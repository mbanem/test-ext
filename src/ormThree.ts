import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { log } from 'console'

let models: Models = {}
export function createCRUDSupport(
  panel: vscode.WebviewPanel,
  paths: TPaths,
  payload: Payload,
) {
  log('createCRUDSupport entry point')
  const models = payload.selectedModels //JSON.parse(payload) as Models
  log(
    'createCRUDSupport received payload',
    JSON.stringify({
      models,
    }),
  )
}
