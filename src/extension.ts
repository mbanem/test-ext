import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
// to find the work folder path, not quite sure it is the best way...
import * as os from 'os'
// to find the work folder path
import * as childProcess from 'child_process'
import { parsePrismaSchema } from './parse-prisma-schema.js'

export let panel: vscode.WebviewPanel

interface IStrKeyStrVal {
	[key: string]: string
}
let db_: IStrKeyStrVal = {}
let rootPath = ''
const pgPassPath = path.join(os.homedir(), '.pgpass')
// Lot of a working code was implemented as an HTML markup templated string
// and some fields as part of the current parts of the migration so be
// avare they are not involved in the following code
let routeName_ = ''
let fields_: string[] = []
let embellishments_: string[] = []
let terminal: vscode.Terminal | undefined

let noPrismaSchema = false
let installPartTwoPending = false
let pm = 'unknown'
let ex = 'unknown'

// Not quite sure I need this for building OrmOne.svelte page
const envWhatToDo = `# Environment variables declared in this file are automatically made available to Prisma.
# See the documentation for more detail: https://pris.ly/d/prisma-schema#accessing-environment-variables-from-the-schema

# Prisma supports the native connection string format for PostgreSQL, MySQL, SQLite, SQL Server, MongoDB and CockroachDB.
# See the documentation for all the connection string options: https://pris.ly/d/connection-strings

# example is for PostgreSQL, change values wrapped in < >
# <username> is a Role in PostgreSQL
# <password> is username's db password
# <dbName> is database name to connect to
DATABASE_URL="postgresql://<username>:<password>@localhost:5432/<dbName>?schema=public"

# see docs for how to use SECRET_API_KEYs
SECRET_APT_KEY="kiki:kiki@localhost:5432
SECRET_APT_ENV=development
SECRET_API_KEY=1234567890
`

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

type ManifestURIs = { uri: string, css: string[], src: string }
type ManifestValue = {
	key: string
	file: string
	name: string,
	src?: string
	isEntry?: boolean
	imports?: string[]
	css?: string[]
}
type Manifest = {
	key: string
	value: ManifestValue
} | {}
let parsedManifest = ''

function getParsedManifest(context: vscode.ExtensionContext) {
	if (parsedManifest) {
		return parsedManifest as Manifest
	}
	// every coonstructed path gets property fsPath
	const manifestPath = vscode.Uri.joinPath(
		context.extensionUri,
		'out',
		'webview-assets',
		'.vite',
		'manifest.json'
	).fsPath
	try {
		const content = fs.readFileSync(manifestPath, 'utf-8')
		parsedManifest = JSON.parse(content)
		return parsedManifest
	} catch (err) {
		console.error('Failed to load /out/webview-assts/.vite/manifest', err)
		return {}
	}
}

function getAssetUris(context: vscode.ExtensionContext, pageName: string): ManifestURIs | {} {
	const manifest = getParsedManifest(context)
	for (const value of Object.values(manifest) as ManifestValue[]) {
		if ((value as ManifestValue).name === pageName) {
			return { uri: value.file.slice(7), css: value.css, imports: value.imports }	// css is string[]
		}
	}
	return {}
}

function createWebview(context: vscode.ExtensionContext, pageName: string) {
	const panel = vscode.window.createWebviewPanel(
		`crud${pageName}`,
		'CRUD Generator',
		vscode.ViewColumn.One,
		{ enableScripts: true }
	)

	const { uri, css } = getAssetUris(context, 'OrmOne') as ManifestURIs
	if (!uri || !css) {
		panel.webview.html = `<h1>Error: Assets for ${pageName} not found</h1>`
		return
	}

	const jsUri = panel.webview.asWebviewUri(vscode.Uri.file(uri))
	const cssUris = (css).map(c => panel.webview.asWebviewUri(vscode.Uri.file(c)))

	panel.webview.html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${cssUris.map(uri => `<link rel="stylesheet" href="${uri}">`).join('\n')}
    </head>
    <body>
      <div id="app"></div>
      <script type="module" src="${jsUri}"></script>
    </body>
    </html>
  `
}

const getModels = () => {
	const schema_path = path.join(rootPath, 'prisma', 'schema.prisma')
	const schema = fs.readFileSync(
		schema_path,
		'utf-8'
	)
	if (schema) {
		return parsePrismaSchema(schema)
	} else {
		throw new Error('Failed to parse /prisma/schema.prisma')
	}
}

const sleep = async (ms: number) => {
	return new Promise((resolve) => {
		setTimeout(() => {
			// ms here is a dummy but required by
			// resolve to send out some value
			resolve(ms)
		}, ms)
	})
}

// After install ORM part one users have to prepare schema.prisma and the connect string
// but if they close the extension then on restart the extension will start with the part two
function createPendingFile() {
	const pendingFile = path.join(rootPath, '/prisma/installPartTwo.pending')
	if (!fs.existsSync(pendingFile)) {
		fs.writeFileSync(pendingFile, 'install Prisma PartOne is done.\nInstallPartTwo is pending but may be already done by User.')
	}
}
// When install ORM part two is done we clear the pending file flag
function deletePendingFile() {
	const pendingFile = path.join(rootPath, '/prisma/installPartTwo.pending')
	if (fs.existsSync(pendingFile)) {
		fs.unlink(pendingFile, (err) => {
			if (err) {
				vscode.window.showInformationMessage('Could not delete installPartTwo.pending file at App Root. Delete it yourself')
			}
		})
	}
}
// Find what Package Manager is installed to carry on installation of NPM packages
type PMErr = { err: string }
function detectPackageManager(): 'npm' | 'pnpm' | 'yarn' | 'bun' | PMErr {

	if (fs.existsSync(path.join(rootPath, 'pnpm-lock.yaml'))) return pm = 'pnpm'
	if (fs.existsSync(path.join(rootPath, 'yarn.lock'))) return pm = 'yarn'
	if (fs.existsSync(path.join(rootPath, 'bun.lockb'))) return pm = 'bun'
	if (fs.existsSync(path.join(rootPath, 'package-lock.json'))) return pm = 'npm'

	return { err: 'unknown' }
}
function xPackageManager(pm: string): 'npx' | 'pnpx' | 'yarn dlx' | 'bunx' | 'unknown' {
	switch (pm) {
		case 'npm': return ex = 'npx'
		case 'pnpm': return ex = 'pnpx'		// as pnpx is deprecated how to use pnpm ext below?
		case 'bun': return ex = 'bunx'
		case 'yarn': return ex = 'yarn dlx'
		default: return ex = 'unknown'
	}
}

// Promise wrapper for child_process.exec. Just for finding App root path.
// If there is a better way please apply it
function execShell(cmd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		childProcess.exec(cmd, { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath }, (err, stdout, stderr) => {
			if (err) {
				reject(new Error(`Command failed: ${stderr}`))
				return
			}
			resolve(stdout)
		})
	})
}

// All NPM package installations commands are issued from here
function sendToTerminal(cmd: string) {
	if (!terminal) {
		terminal = vscode.window.createTerminal(`WebView Terminal`)
	}
	terminal.show(true) // reveal the terminal
	terminal.sendText(cmd)
}

// I had separate functions for WebviewContent dev/production but was mistaken 
// using vscode.Uri.joinPath instead of src="http://localhost:5173/src/main.ts"
// for dev so you already remedy that in some earlier conversation
function getWebviewContent(
	panel: vscode.WebviewPanel,
	context: vscode.ExtensionContext
) {
	vscode.window.showInformationMessage('getWebviewContent entry point')
	const isDev =
		context.extensionMode === vscode.ExtensionMode.Development

	if (isDev) {
		return /* html */ `
      <!DOCTYPE html>
      <html>
				<head>
					<meta
						http-equiv="Content-Security-Policy"
						content="default-src 'none';
						script-src 'unsafe-eval' 'unsafe-inline' http://localhost:5173;
						style-src 'unsafe-inline' http://localhost:5173;
						connect-src http://localhost:5173 ws://localhost:5173;
						img-src https: data:;
					">
				</head>
        <body>
          <div id="app"></div>
					<script>
						const vscode = acquireVsCodeApi();
						vscode.postMessage({ command: 'log', text: 'inside the Dev HTML page that loads main.ts App loader' });
					</script>
          <script type="module" src="http://localhost:5173/src/main.ts"></script>
        </body>
      </html>
    `
	}

	// production
	const scriptUri = panel.webview.asWebviewUri(
		vscode.Uri.joinPath(
			context.extensionUri,
			'webview-ui',
			'dist',
			'assets',
			'main.js'
		)
	)

	return /* html */ `
    <!DOCTYPE html>
    <html>
			<head>
					<meta
						http-equiv="Content-Security-Policy"
						content="default-src 'none';
						script-src 'unsafe-eval' 'unsafe-inline' http://localhost:5173;
						style-src 'unsafe-inline' http://localhost:5173;
						connect-src http://localhost:5173 ws://localhost:5173;
						img-src https: data:;
					">
				</head>
      <body>
        <div id="app"></div>
        <script type="module" src="${scriptUri}"></script>
      </body>
    </html>
  `
}
// added a rectangle for testing
function getHtml() {
	return `
    <!DOCTYPE html>
    <html>
		<head>
			<style lang='scss'>
				.rectangle{
					@include container($head: 'Rectangle Caption', $head-color: navy);
					width:25rem;
					height:3rem;
					color:white;
					background-color: navy;
					text-align:center;
					line-height:2.8rem;
					margin:4rem 0 0 12rem;
				}
				.box {
					color: $primary;
					padding: 10px;
					width:5rem;
					height:5rem;
					background-color: white;
					text-align:center;
					margin:3rem 10rem;
					&:hover {
						background-color: $primary;
						color: white;
					}
				}
			</style>
		</head>

    <body>
      <div id="app"></div>
			<div class='box'>BOX <span style='color:red'>RED BOX</span></div>
			<div class='rectangle'>EXTEST MINIMAL EXTENSION PAGE</div>
      <script type="module" src="http://localhost:5173/src/main.ts"></script>
    </body>
    </html>
  `
}
export async function activate(context: vscode.ExtensionContext) {

	vscode.window.showInformationMessage(`CRUD TEST-EXT -- activated`)
	const workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders
	// Is there a better way for getting App root path?
	rootPath = await execShell('pwd')
	rootPath = rootPath.replace(/\n$/, '')

	const outputChannel = vscode.window.createOutputChannel('WebView Logs')

	const prismaSchemaRoot = path.join(rootPath, "prisma", "schema.prisma")

	if (!prismaSchemaRoot) {
		noPrismaSchema = true		// flag in earlier code to inform getWebviewContent to start with OrmOne.svelte
	}

	let pendingFile = path.join(rootPath, '/prisma/installPartTwo.pending')
	installPartTwoPending = fs.existsSync(pendingFile)

	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('test-ext.crudTest', () => {

		// vscode.window.showInformationMessage(`CRUD TEST-EXT -- registered`)
		panel = vscode.window.createWebviewPanel(
			'crCrudSupport',
			'CRUD Support',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		)
		// vscode.window.showInformationMessage(`panel created type: ${typeof panel}`)
		panel.webview.html = getHtml()

		let includeTypes = ''
		// const msg1 = noPrismaSchema ? 'EXT: NO PRISMA SCHEMA' : 'PRISMA SCHEMA FOUND'
		// vscode.window.showInformationMessage(msg1)

		// we should revive nonce
		// const nonce = getNonce();
		let schemaModels = ''
		if (!noPrismaSchema && !installPartTwoPending) {
			schemaModels = JSON.stringify(getModels())
		}
		vscode.window.showInformationMessage(`panel created type: ${schemaModels.slice(0, 60)}`)
		// panel.webview.html = getWebviewContent(panel, context)

		panel.webview.onDidReceiveMessage(async (msg) => {
			// Should individaul case blocks refactor in functions? This is clumsy
			switch (msg.command) {
				case 'createCRUDSupport':
					vscode.window.showInformationMessage(`Creating CRUD support for model: ${msg.modelName}`)
					console.log('Creating CRUD support for model: ', msg.modelName, 'with payload: ', msg.payload)
					break
				case 'input':	// TEST
					vscode.window.showInformationMessage(`Input: ${msg.payload}`)
					panel.webview.postMessage({
						command: 'showPage',
						page: 'OrmThree'
					})
				// OrmOne.html should collect and return db_ params as payload object or stringified?
				case 'installPrismaPartOne':
					// user could ignore setting db_ parameters, but wants to instal ORM (now we deal with Prisma only)
					db_ = msg.payload
					vscode.window.showInformationMessage('db/owner params ' + JSON.stringify(db_))
					if (db_.name && db_.owner && db_.password) {
						const content = db_.host + ':' + db_.port + ':' + db_.name + ':' + db_.owner + ':' + db_.password
						fs.writeFileSync(pgPassPath, content, {
							encoding: 'utf-8',
							mode: 0o600   // important for .pgpass! PostgreSQL requires 0600
						})
					} else {
						db_ = { name: '<dbname>', owner: '<dbowner>', password: '<owner-password>', host: 'localhost', port: '5173' }
					}
					panel.webview.postMessage({
						command: "db params received"
					})

					// install just the necessary NPM packages. 
					const pm = detectPackageManager()
					if (typeof pm === 'object') {
						vscode.window.showInformationMessage('detectPackageManager err:' + pm.err)
					} else {
						xPackageManager(pm)	// set ex = pnpx -- but is deprecated. How to use pmpn ext instead?
					}
					sendToTerminal(`cd ${rootPath}`)
					// outputChannel.appendLine('sendToTerminal cd rootPath'); outputChannel.show()
					sendToTerminal(`${pm} install bcrypt @types/bcrypt @prisma/client; ${pm} install typescript ts-node @types/node globals -D; ${pm} i -D prisma ; ${ex} prisma init --datasource-provider postgresql`)
					const prismaPath = path.join(rootPath, '/prisma/schema.prisma')
					// installation is in progress so wait to see that schema.prisma gets installed
					for (let i = 0; i < 30; i++) {
						await sleep(1000)
						if (fs.existsSync(prismaPath)) {
							break
						}
					}
					await sleep(1000)
					createPendingFile()

					// read created sample /prisma/schema.prisma and display it in a new Tab
					// along with the connection string from .env file
					try {
						// Get workspace root (assume first folder)
						// const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
						// if (!workspaceFolder) {
						// 	vscode.window.showErrorMessage('No workspace folder open')
						// 	// TODO send to output how to make a Workspace
						// 	return
						// }

						// Could rootPath be used instead of the constructed absolute file path?
						// const schemaPath = path.join(workspaceFolder.uri.fsPath, '/prisma/schema.prisma')
						const schemaPath = path.join(rootPath, '/prisma/schema.prisma')
						if (!fs.existsSync(schemaPath)) {
							fs.writeFileSync(schemaPath, '', 'utf-8')
						}
						// maybe additional info could help, so append it to the sample schema.prisma
						fs.appendFileSync(schemaPath, schemaWhatToDo, 'utf-8')
						// Create path for the file. Is this specific for VsCode so rootPath is not acceptable?
						let uri = vscode.Uri.file(schemaPath)
						// Open in a new tab (beside current editor)
						await vscode.window.showTextDocument(uri, {
							viewColumn: vscode.ViewColumn.Beside, // Opens beside active editor
							preview: false // Optional: Force a new tab (not preview mode)
						})

						const envPath = path.join(rootPath, '/.env')
						uri = vscode.Uri.file(envPath)

						// if there is an .env file append connection string or create one otherwise
						const dblink = `DATABASE_URL=postgresql://${db_.owner}:${db_.password}@localhost:${db_.port}/${db_.name}?schema=public`
						fs.appendFileSync(envPath, dblink, 'utf-8')

						await vscode.window.showTextDocument(uri, {
							viewColumn: vscode.ViewColumn.Beside, // Opens beside active editor
							preview: false 												// Optional: Force a new tab (not preview mode)
						})

					} catch (err: unknown) {
						const msg = err instanceof Error ? err.message : String(err)
						// Handle errors (e.g., file not found)
						vscode.window.showErrorMessage(`opening scheme and connection string failed: ${err}`)
						panel.webview.postMessage({
							command: 'fileError',
							error: (err as Error).message
						})
					}
					panel.webview.postMessage({
						command: "installPartOneDone"
					})
					break
				case 'InstallPrismaPartTwo':
					// Waiting for user to press the continue button -- after schema.prisma & connection string is set
					// if user did not supplied db_ details read them from .env if any
					let psqlConnect = ''
					if (!(db_.name || db_.owner || db_.password)) {
						try {
							const envPath = path.join(rootPath as string, '.env')
							const connStr = fs.readFileSync(envPath, 'utf-8')
							const [, dbowner, dbpassword, host, port, dbname] = 'postgresql://rony:rony@localhost:5432/ronydb?schema=public'.match(/\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([-a-zA-Z_0-9]+)/) as string[]

							const db_: IStrKeyStrVal = { name: dbname, owner: dbowner, password: dbpassword, host: host, port: port }
							psqlConnect = `psql -h ${host} -U ${dbowner} -d postgres -p ${port}`
						} catch (err: unknown) {
							const msg = err instanceof Error ? err.message : String(err)
							vscode.window.showErrorMessage('Handling .pgpass permission err: ' + msg)
						}
					}

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
						END IF;
					END
					$$; 
					-- Change the role's password (optional, only if you want it to match '$DBPASSWORD')
					ALTER ROLE "\$DBOWNER" WITH ENCRYPTED PASSWORD '\$DBPASSWORD';

					-- Create the database if it doesn't exist, owned by \$DBOWNER
					CREATE DATABASE "\$DBNAME" OWNER "\$DBOWNER" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0;

					-- Connect to the new database and give the owner full rights (usually already true, but explicit)

					\\c "\$DBNAME"

					GRANT ALL PRIVILEGES ON DATABASE "\$DBNAME" TO "\$DBOWNER";
					REVOKE CONNECT ON DATABASE "\$DBNAME" FROM PUBLIC;        -- optional: disallow public connect
					GRANT CONNECT ON DATABASE "\$DBNAME" TO "\$DBOWNER";
					EOF`.replace(/\$DBNAME/mg, `${db_.name}`)
						.replace(/\$DBOWNER/mg, `${db_.owner}`)
						.replace(/\$DBPASSWORD/mg, `${db_.password}`)
						.replace(/\$HOST/mg, `${db_.host}`)
						.replace(/\$PORT/mg, `${db_.port}`)

					sendToTerminal(sql)

					await sleep(2000)
					sendToTerminal(`${ex} prisma migrate dev --name init; ${ex} prisma generate`)

					deletePendingFile()

					panel.webview.postMessage({
						command: "installPartTwoDone"
					})

					break
				case 'getSchemaModels':

					break
				case 'log':
					// vscode.window.showInformationMessage(`Bane command log ${msg.text}`);
					vscode.window.showInformationMessage(`log ${msg.text}`)
					// log should have at least a text property
					// Or log to output channel
					outputChannel.appendLine(`[WebView log outputChannel ${msg.text}] `)
					outputChannel.show(true) // false = don't preserve focus
					break
				default:
					throw new Error('msg.command not specified')
			}

		})

		context.subscriptions.push(disposable)
	})
}
// This method is called when your extension is deactivated
export function deactivate() { }
