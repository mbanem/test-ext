import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import * as childProcess from 'child_process'
import { displayWebview } from './webview.js'
import { installPrismaPartOne } from './ormOne.js'
import { installPrismaPartTwo } from './ormTwo.js'
import { creaateCrudSupportPage } from './ormThree.js'

import { exec } from 'child_process'
import { homedir } from 'os'
import { Models, parsePrismaSchema } from './parse-prisma-schema.js'

const schemaWhatToDo = `/*
MAKE YOUR PRISMA SCHEMA MODELS HERE
As databases could have stronger requests for naming tables and columns
use Prisma modification operators for renaming TypeScript model names
into new database names like
    model User {
      id      			String   @id @default(uuid())
      firstName    	String   @map("first_name")
      createdAt DateTime @default(now())   @map("created_at")
      @@map("users")
    }
Now in your program you use firstName but in db it is the first_name
and the table in program is User but in db users thanks to the operators
@map first_name and @@map users, as some db have
internal user table so we use plural instead.
*/`

const envWhatToDo = `# Environment variables declared in this file are automatically made available to Prisma.
// See the documentation for more detail: https://pris.ly/d/prisma-schema//accessing-environment-variables-from-the-schema

// Prisma supports the native connection string format for PostgreSQL, MySQL, SQLite, SQL Server, MongoDB and CockroachDB.
// See the documentation for all the connection string options: https://pris.ly/d/connection-strings

// example is for PostgreSQL, change values wrapped in
// username is a Role in PostgreSQL
// password is username's db password
// dbName is database name to connect to

DATABASE_URL="postgresql://username:password@localhost:5432/dbName?schema=public"

// see docs for how to use SECRET_API_KEYs
SECRET_APT_KEY="kiki:kiki@localhost:5432
SECRET_APT_ENV=development
SECRET_API_KEY=1234567890`

export type TPaths = Record<string, string>
export type DbParams = Record<string, string | number>
let paths: TPaths = {}
let db: DbParams = {}
export type TMessage = {
  command: string
  payload?: any
}

let panel: vscode.WebviewPanel | undefined = undefined

function execShell(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(
      cmd,
      { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Command failed: ${stderr}`))
          return
        }
        resolve(stdout)
      },
    )
  })
}
export const sudoName_ = await execShell('whoami')
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
// let db: DbParams = {}
export async function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage(`CRUD TEST-EXT -- activated`)
  const workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined =
    vscode.workspace.workspaceFolders
  // console.log(vscode.workspace.workspaceFolders)
  context.subscriptions.push(
    vscode.commands.registerCommand('test-ext.crudTest', () => {
      // NOTE: in order for vscode.workspace.workspaceFolders to be defined
      // set "path": "/home/mili/Ext/test-ext", in test-ext.code-workspace
      // and set  "name": "webview-ui" in webview-ui/package.json for debugger
      // const folder = vscode.workspace.workspaceFolders?.[0]
      const rootPath =
        vscode.workspace.workspaceFolders?.[0].uri.fsPath ??
        '/home/mili/test-ext'

      const prismaSchemaExists = fs.existsSync(
        path.join(rootPath, 'prisma/schema.prisma'),
      )
      paths = {
        root: rootPath,
        env: path.join(rootPath, '.env'),
        pending: path.join(rootPath, 'prisma/installORMPartTwoPending.txt'),
        schema: path.join(rootPath, 'prisma/schema.prisma'),
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
      // If prismaSchemaFound is false start with OrmOne.html page twhich should return
      // a db_ object and so commence communication between this extension and ORMxxx
      // pages in wizard like steps for creating database, installing ORM and generating
      // SvelteKit CRUD support app pages based on the prisma schema models

      log('call to render OrmOne.html')
      // open OrmOne.html and wait for installPrismaPartOne command from it with db_ object as payload
      displayWebview(context, panel, 'OrmOne')

      panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.command) {
          // OrmOne.html sends this command with db_ object as payload when user clicks 'Install Prisma ORM'
          case 'installPrismaPartOne':
            log('installPrismaPartOne comand request from OrmOne.html 1')
            // take db params and pass to installPrismaPartOne  that will create database
            // and then send message 'installPartOneDone' here
            // if (msg.payload) {
            //   log(['payload from OrmOne', msg.payload])
            // } else {
            //   log('no payload from OrmOne')
            // }
            db = JSON.parse(msg.payload) as DbParams
            // log([
            //   'calling installPrismaPartOne with db params and paths',
            //   JSON.stringify(db),
            //   JSON.stringify(paths),
            // ])
            const result = await installPrismaPartOne(panel!, db, paths)
            log(
              `after call to installPrismaPartOne success is ${result.success.toString()}`,
            )
            //==begin
            // TODO need to open schema.prisma and .env content in two tabs
            // log(`test is schema.prisma found? ${paths.schema}`)
            if (!prismaSchemaExists) {
              fs.writeFileSync(paths.schema, '', 'utf-8')
            } else {
              let schemaContent = fs.readFileSync(paths.schema, 'utf-8')
              if (
                !schemaContent.includes('MAKE YOUR PRISMA SCHEMA MODELS HERE')
              ) {
                fs.appendFileSync(
                  paths.schema,
                  '\n\n' + schemaWhatToDo,
                  'utf-8',
                )
              }
            }

            // Create Uri for the schema file
            let uri = vscode.Uri.file(paths.schema)
            // Open schema content in new tab (beside current editor)
            await vscode.window.showTextDocument(uri, {
              viewColumn: vscode.ViewColumn.Beside, // Opens beside active editor
              preview: false, // Optional: Force a new tab (not preview mode)
            })

            // create Uri for the .env file
            uri = vscode.Uri.file(paths.env)
            log(
              `forming dblibk with db params ${JSON.stringify(db)} ${db.owner} ${db.password} ${db.port} ${db.name}`,
            )
            const dblink = `DATABASE_URL=postgresql://${db.owner}:${db.password}@localhost:${db.port}/${db.name}?schema=public`
            if (fs.existsSync(paths.env)) {
              // read .env file content
              let envContent = fs.readFileSync(paths.env, 'utf-8')

              if (envContent.includes('DATABASE_URL')) {
                if (!envContent.includes(dblink)) {
                  // begin
                  // comment out previous DATABASE_URL if exists and expamd content by appending new connection string
                  envContent = envContent
                    .trim()
                    .replace(
                      /(DATABASE_URL=)(.*)$/gm,
                      '//\tThe previous connection string\n//\t$1$2\n//\thas been replaced with the following\n' +
                        dblink,
                    )
                  // write the updated content back to the .env file
                  fs.writeFileSync(paths.env, envContent, 'utf-8')
                  //end
                }
              } else {
                // no DATABASE_URL in .env file, just append the new connection string
                fs.appendFileSync(paths.env, '\n' + dblink, 'utf-8')
              }
            } else {
              // .env file does not exist, create it with the new connection string
              fs.writeFileSync(paths.env, dblink, 'utf-8')
            }

            await vscode.window.showTextDocument(uri, {
              viewColumn: vscode.ViewColumn.Beside, // Opens beside active editor
              preview: false, // Optional: Force a new tab (not preview mode)
            })

            //             // display schema.prisma content in a new tab and env content in another new tab
            //             // allowing user to edit them and then click 'Continue' button in OrmTwo.html that
            //             // sends 'installPrismaPartTwo' command to here to continue with installation
            //             if (fs.existsSync(paths.schema)) {
            //               fs.appendFileSync(paths.schema, schemaWhatToDo, 'utf-8')
            //             } else {
            //               fs.writeFileSync(paths.schema, schemaWhatToDo, 'utf-8')
            //             }
            //             uri = vscode.Uri.file(paths.schema)
            //             await vscode.window.showTextDocument(uri, {
            //               viewColumn: vscode.ViewColumn.Beside, // Opens beside active editor
            //               preview: false, // Optional: Force a new tab (not preview mode)
            //             })
            //             break

            // display OrmTwo.html page with instructions to user to edit
            // schema.prisma and .env files and then click 'Continue' button
            // that sends 'installPrismaPartTwo' command to here
            displayWebview(context, panel!, 'OrmTwo')

            break

          case 'installPrismaPartTwo':
            log('installPrismaPartTwo command request from OrmTwo.html')
            installPrismaPartTwo(panel!, paths) //FIX: needs build db models from schema

            log('installPrismaPartTwoDone')
            displayWebview(context, panel!, 'OrmThree')

            //             // log(
            //             // let schema = fs.readlinkSync(
            //             //   path.join(rootPath, 'prisma/schema.prisma'),
            //             // )
            //             // if (!schema) {
            //             //   info('/prisma/schema.prisma not found, cannot continue')
            //             //   panel!.dispose()
            //             // }
            //             // `installPrismaPartTwoDone, read prisma/schema.prisma content: ${schema.slice(
            //             //   0,
            //             //   50,
            //             // )}`,
            //             // )
            //             // const models = parsePrismaSchema(schema)

            // models: { uiModels, nuiModels, fieldStrips }
            //             // panel!.webview.postMessage({
            //             //   command: 'sentORMStringifiedModels',
            //             //   // payload: JSON.stringify(models),
            //             // })
            break

          case 'createCRUDSupportPage':
            log('createCRUDSupportPage command request from OrmThree.html')
            // creaateCrudSupportPage(panel!, paths, msg.modelName, msg.payload)
            break

          case 'close':
            info('CRUD Support is closing')
            panel!.dispose()
            break
          default:
            log(`Unknown command: ${msg.command}`)
        }
        // log(`ORM: ${JSON.stringify(workspaceFolders)}`)
        // info(`Command registered `)
        // createWebviewPanel(context, 'OrmOne')
        // info(`After  createWebviewPanel OrmOne`)
      })
    }),
  )

  // panel?.dispose()
  // // Clean up when panel is closed
  // panel?.onDidDispose(() => {
  //   panel = undefined
  // })
}
// This method is called when your extension is deactivated
export function deactivate() {}
