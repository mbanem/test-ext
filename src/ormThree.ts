import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import type { Model, FieldStrips } from './parse-prisma-schema.js'
import { log } from 'console'
import { TPaths } from './extension.js'

export function creaateCrudSupportPage(
  panel: vscode.WebviewPanel,
  paths: TPaths,
  modelName: string,
  payload: string,
) {
  log('createCRUDSupportPage entry point')
  const [uiModfel, nuiModel, fieldStrip] = JSON.parse(payload) as [
    Model,
    Model,
    FieldStrips,
  ]
  log(
    'creaateCrudSupportPage received payload',
    JSON.stringify({
      uiModfel,
      nuiModel,
      fieldStrip,
    }),
  )
}
