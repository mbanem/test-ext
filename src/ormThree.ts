import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import type { Models } from './parse-prisma-schema.js'
import { log } from 'console'
import { TPaths } from './extension.js'

let models: Models = {}
export function creaateCrudSupportPage(
  panel: vscode.WebviewPanel,
  paths: TPaths,
  payload: string,
) {
  log('createCRUDSupportPage entry point')
  const models = JSON.parse(payload) as Models
  log(
    'creaateCrudSupportPage received payload',
    JSON.stringify({
      models,
    }),
  )
}
