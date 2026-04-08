import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { Client } from 'pg'

// NOTE: variables ending with an underscore are fubctions thatreturn
//       value of a variable with the same name without underscore
import { type DbParams, type TPaths, log, error, info } from './extension.js'
// import { log, error, info } from './extension.js'

let paths: TPaths = {}
import type { Models, FieldStrips } from './parse-prisma-schema.js'
import { ModifierFlags } from 'typescript'

// const schemaWhatToDo = `/*
// 	MAKE YOUR PRISMA SCHEMA MODELS HERE
// 	As databases could have stronger requests for naming tables and columns
// 	use Prisma modification operators for renaming TypeScript model names
// 	into new database names like
//       model User {
//         id      			String   @id @default(uuid())
//         firstName    	String   @map("first_name")
//         createdAt DateTime @default(now())   @map("created_at")
//         @@map("users")
//       }
// 	Some databases have a User table; rename it into users via @@map("users")
// 	Now in your program you use firstName but in db it is the first_name
// */`

// type TSelectBlocks = Record<string, TStrKeyStrVal>

// let selectBlocks: TSelectBlocks = {}
// let sudoName_ = ''
// let terminal: vscode.Terminal | undefined
// let pm = 'unknown'
// let ex = 'unknown'

// const sleep = async (ms: number) => {
//   return new Promise((resolve) => {
//     setTimeout(() => {
//       // ms here is a dummy but required by
//       // resolve to send out some value
//       resolve(ms)
//     }, ms)
//   })
// }

// Find what Package Manager is installed to carry on installation of NPM packages
// type PMErr = { err: string }
// function detectPackageManager(): 'npm' | 'pnpm' | 'yarn' | 'bun' | PMErr {
//   log('detectPackageManager entry point')
//   if (fs.existsSync(path.join(paths.root, 'pnpm-lock.yaml'))) {
//     return (pm = 'pnpm')
//   }
//   if (fs.existsSync(path.join(paths.root, 'yarn.lock'))) {
//     return (pm = 'yarn')
//   }
//   if (fs.existsSync(path.join(paths.root, 'bun.lockb'))) {
//     return (pm = 'bun')
//   }
//   if (fs.existsSync(path.join(paths.root, 'package-lock.json'))) {
//     return (pm = 'npm')
//   }

//   return { err: 'unknown' }
// }

// function xPackageManager(
//   pm: string,
// ): 'npx' | 'pnpm' | 'pnpm dlx' | 'yarn dlx' | 'bunx' | 'unknown' {
//   switch (pm) {
//     case 'npm':
//       return (ex = 'pnpm')
//     case 'pnpm':
//       return (ex = 'pnpm dlx') // as pnpx is deprecated how to use pnpm ext below?
//     case 'bun':
//       return (ex = 'bunx')
//     case 'yarn':
//       return (ex = 'yarn dlx')
//     default:
//       return (ex = 'unknown')
//   }
// }

// // All NPM package installations commands are issued from here
// function sendToTerminal(cmd: string) {
//   if (!terminal) {
//     terminal = vscode.window.createTerminal(`WebView Terminal`)
//   }
//   terminal.show(true) // reveal the terminal
//   terminal.sendText(cmd)
// }

// function createPendingFile() {
//   if (!fs.existsSync(paths.pending)) {
//     fs.writeFileSync(
//       paths.pending,
//       `Temporary Flag!
//       Created when install Prisma PartOne is done.
//       InstallPartTwo is pending but if already done by User
//       this file should be deleted.`,
//     )
//   }
// }
// export function deletePendingFile() {
//   if (fs.existsSync(paths.pending)) {
//     fs.unlinkSync(paths.pending)
//   }
// }
// function installNpmPackages() {
//   const pm = detectPackageManager()
//   if (typeof pm === 'object') {
//     vscode.window.showInformationMessage('detectPackageManager err:' + pm.err)
//   } else {
//     xPackageManager(pm)
//   }
//   sendToTerminal(`cd ${paths.root}`)
//   sendToTerminal(
//     `tslib -D @eslint/compat,@eslint/js,@prisma/config,@prisma/client, pg, @types/pg,
//     @sveltejs/vite-plugin-svelte,@tsconfig/svelte,tslib,@types/bcrypt,@types/node,
//     @typescript-eslint/eslint-plugin,@typescript-eslint/parser,eslint,eslint-config-prettier,
//     eslint-plugin-svelte,globals,postcss,postcss-load-config,prettier,prettier-plugin-svelte,
//     prisma,sass,svelte,svelte-check,svelte-preprocess,ts-node,@types/node,typescript,
//     typescript-eslint,vite,vite-plugin-sass-dts`,
//   )
// }
export async function installPrismaPartOne(
  panel: vscode.WebviewPanel,
  db_: DbParams,
  thePaths: TPaths,
) {
  paths = thePaths
  log([
    'installPrismaPartOne entry point',
    JSON.stringify(db_),
    JSON.stringify(paths),
  ])

  // install all required npm packages for Prisma and database client
  log('Installing NPM packages...')
  // installNpmPackages()

  // sql commands to create database and user with given params
  // const client = new Client({
  //   host: db_.host as string,
  //   port: db_.port as number,
  //   user: 'mili', // admin user
  //   password: 'kiki',
  //   database: 'postgres',
  // })
  // log('Connecting to Postgres...')
  // await client.connect()

  // log('creaating role and database...')
  // info(`Creating role ${db_.owner}...`)
  // await client.query(
  //   `
  //   DO $$
  //   BEGIN
  //     IF NOT EXISTS (
  //       SELECT FROM pg_roles WHERE rolname = $1
  //     ) THEN
  //       EXECUTE format(
  //         'CREATE ROLE %I LOGIN PASSWORD %L CREATEDB',
  //         $1, $2
  //       );
  //     END IF;
  //   END
  //   $$;
  //   `,
  //   [db_.owner, db_.password],
  // )

  // info(`Creating database ${db_.name}...`)
  // await client.query(
  //   `
  //   DO $$
  //   BEGIN
  //     IF NOT EXISTS (
  //       SELECT FROM pg_database WHERE datname = $1
  //     ) THEN
  //       EXECUTE format(
  //         'CREATE DATABASE %I OWNER %I',
  //         $1, $2
  //       );
  //     END IF;
  //   END
  //   $$;
  //   `,
  //   [db_.name, db_.owner],
  // )

  // await client.end()

  // log(`Database ${db_.name} created`)

  // createPendingFile()
  log('end of installPrismaPartOne -- return {success: true}')
  return { success: true }
}
