import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
// to find the work folder path
import * as childProcess from 'child_process'
import { type TMessage, getRootPath, log, error, info} from './extension.js'

const rootPath = getRootPath()
const pgPassPath = path.join(os.homedir(), '.pgpass')
const pgPassRenamedPath = `${pgPassPath}-renamed`

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
	Some databases have a User table; rename it into users via @@map("users")
	Now in your program you use firstName but in db it is the first_name
*/`


let pendingFile = ''
type TStringBoolean = Record<string, boolean
type TStrKeyStrVal = Record<string, string>
let db_: TStrKeyStrVal = {}
type TSelectBlocks = Record<string, TStrKeyStrVal>

let selectBlocks: TSelectBlocks = {}
let sudoName_ = ''
let pm = 'unknown'
let ex = 'unknown'

function createPendingFile() {

  if (!fs.existsSync(pendingFile)) {
    fs.writeFileSync(pendingFile, 'install Prisma PartOne is done.\nInstallPartTwo is pending but may be already done by User.')
  }
}
function deletePendingFile() {
  if (fs.existsSync(pendingFile)) {
    fs.unlink(pendingFile, (err) => {
      if (err) {
        vscode.window.showInformationMessage('Could not delete installPartTwo.pending file at /prisma. Please delete it yourself')
      }
    })
  }
  if (fs.existsSync(pgPassPath)) {
    fs.unlink(pgPassPath, (err) => {
      if (err) {
        vscode.window.showInformationMessage('Could not delete .pgpass file at /home directory. Pleae delete it yourself')
      }
    })
  }
}
//panel.webview.onDidReceiveMessage(async (msg) => {
//	switch(msg.command){
export installPrismaPartOne(msg: TMessage){
				db_ = msg.payload
        vscode.window.showInformationMessage('db/owner params ' + JSON.stringify(db_))
        // preserve 
        if (db_.name && db_.owner && db_.password) {
        	if (fs.existsSync(pgPassPath)){
		      	try {
							fs.renameSync(pgPassPath, pgPassRenamedPath);
						} catch (err) {
							console.error('temporary renaming .pgpass failed',err);
						}
					}
          const pgpassContent = `${db_.host}:${db_.port}:{db_.name}:${db_.owner}:${db_.password}`
          fs.writeFileSync(pgPassPath, pgpassContent, {
            encoding: 'utf-8',
            mode: 0o600   // Very important for .pgpass! PostgreSQL requires 0600
          })
        }
				const pm = detectPackageManager()
        if (typeof pm === 'object') {
          //vscode.window.showInformationMessage('detectPackageManager err:' + pm.err)
          throw new Error(`cannot c ontinue -- no package manager found`)
        } else {
          xPackageManager(pm)
        }
        // start installing prisma ORM software packages support
        sendToTerminal(`cd ${rootPath}`)
 
        // outputChannel.appendLine('sendToTerminal cd rootPath'); outputChannel.show()
        sendToTerminal([`${pm} install bcrypt @types/bcrypt  @prisma/client@7.3.0 @prisma/adapter-pg pg;`,
         `${pm} install typescript ts-node @types/node globals -D;`,
         `${pm} i -D prisma ; ${ex} prisma init --datasource-provider postgresql`].join(' ')
        )
        
        const prismaPath = path.join(rootPath, '/prisma/schema.prisma')
        // installation is in progress so wait to see that schema.prisma is installed
        for (let i = 0; i < 30; i++) {
          await sleep(1000)
          if (fs.existsSync(prismaPath)) {
            break
          }
        }
        await sleep(1000)  // to be sure it is completed
        createPendingFile()

        // await sleep(1000)
        // panel.dispose()

        // read created /prisma/schema.prisma and display it in a new Tab
        try {
          // Get workspace root (assume first folder)
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
          if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open')
            // TODO send to output how to make a Workspace
            return
          }

          // Construct absolute file path
          const schemaPath = path.join(workspaceFolder.uri.fsPath, '/prisma/schema.prisma')
          if (!fs.existsSync(schemaPath)) {
            fs.writeFileSync(schemaPath, '', 'utf-8')
          }
          fs.appendFileSync(schemaPath, schemaWhatToDo, 'utf-8')
          // Create path for the VS Code Editor page
          let uri = vscode.Uri.file(schemaPath)
          // Open in a new tab (beside current editor)
          await vscode.window.showTextDocument(uri, {
            viewColumn: vscode.ViewColumn.Beside, // Opens it beside active editor
            preview: false // Optional: Force a new tab (not preview mode)
          })

          const envPath = path.join(rootPath, '/.env')
          uri = vscode.Uri.file(envPath)

          const dblink = `DATABASE_URL=postgresql://${db_.owner}:${db_.password}@localhost:${db_.port}/${db_.name}?schema=public`
          // insert or append newly created link
          if (fs.existsSync(envPath)){
          	fs.renameSync(envPath,`${envPath}-renamed`);
          }else{
          	fs.writeFileSync(envPath, dblink, 'utf-8')
          }

          await vscode.window.showTextDocument(uri, {
            viewColumn: vscode.ViewColumn.Beside, // Opens beside active editor
            preview: false // Optional: Force a new tab (not preview mode)
          })

        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          // Handle errors (e.g., file not found)
          console.error('Failed to open file:', err)
          panel.webview.postMessage({
            command: 'fileError',
            error: (err as Error).message
          })
        }
        
        // create database
        // create a template string and replace placeholders with correct values
        info(`Creaating database ${db_.name} ...`)
  			let sql = `psql -X -v ON_ERROR_STOP=1 <<'EOF'
					-- Create the role if it doesn't exist
					DO $$
					BEGIN
						IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DBOWNER') THEN
							BEGIN
								CREATE ROLE "$DBOWNER" LOGIN CREATEDB;
							EXCEPTION WHEN duplicate_object THEN  -- SQLSTATE '42710'
								RAISE NOTICE 'Role % already exists (created concurrently)', '$DBOWNER';
							END;
						ELSE
							-- Change the role's password (optional, only if you want it to match '$DBPASSWORD')
							ALTER ROLE "\$DBOWNER" WITH ENCRYPTED PASSWORD '\$DBPASSWORD';

							-- Create the database if it doesn't exist, owned by \$DBOWNER
							CREATE DATABASE "\$DBNAME" OWNER "\$DBOWNER" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0;

							-- Connect to the new database and give the owner full rights (usually already true, but explicit)

							\\c "\$DBNAME"

							GRANT ALL PRIVILEGES ON DATABASE "\$DBNAME" TO "\$DBOWNER";
							REVOKE CONNECT ON DATABASE "\$DBNAME" FROM PUBLIC;        -- optional: disallow public connect
							GRANT CONNECT ON DATABASE "\$DBNAME" TO "\$DBOWNER";
						END IF;
					END
					$$; 

					EOF`.replace(/\$DBNAME/mg, `${db_.name}`)
							.replace(/\$DBOWNER/mg, `${db_.owner}`)
							.replace(/\$DBPASSWORD/mg, `${db_.password}`)
							.replace(/\$HOST/mg, `${db_.host}`)
							.replace(/\$PORT/mg, `${db_.port}`)

    			sendToTerminal(sql)
        
        // after installing database check whether .pgpass-remain exists
        if (fs.existsSync(pgPassRenamedPath)){
        		try {
        			fs.unlinkSync(pgPassRenamedPath);
							fs.renameSync(pgPassRenamedPath, pgPassPath );
						} catch (err) {
							console.error('restoring renamed .pgpass-renamed failed',err);
						}
				}
				info(info(`Database ${db_.name} created`))
        panel.webview.postMessage({
          command: "installPartOneDone"
        })
      }
	}

