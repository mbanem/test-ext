import * as vscode from 'vscode'
import { runCommandStream } from './run-command-stream' // your file with the function
import { info } from './extension.js'

let currentWebview: vscode.Webview | undefined
let paths: TPaths = {}
function extractBuildApprovalPackages(line: string): string[] {
  const match = line.match(/Ignored build scripts:\s*(.+?)(?:\s*Run|$)/i)
  if (!match) {
    return []
  }

  return match[1]
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}
const devDeps = [
  '@eslint/compat',
  '@eslint/js',
  '@prisma/config',
  '@types/pg',
  '@types/eslint',
  '@sveltejs/vite-plugin-svelte',
  '@tsconfig/svelte',
  'tslib',
  '@types/bcrypt',
  '@types/node',
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  'eslint',
  'eslint-config-prettier',
  'eslint-plugin-svelte',
  'globals',
  'postcss',
  'postcss-load-config',
  'prettier',
  'prettier-plugin-svelte',
  'prisma',
  'sass',
  'sass-embedded',
  'svelte',
  'svelte-check',
  'svelte-preprocess',
  'ts-node',
  'typescript',
  'typescript-eslint',
  'vite',
  'vite-plugin-sass-dts',
]
const deps = [
  '@prisma/adapter-pg',
  '@prisma/client',
  '@prisma/internals',
  'bcrypt',
  'dotenv',
  'pg',
  'tslib',
]
export function setupOrmOneMessageHandler(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  thepaths: TPaths,
) {
  currentWebview = webview
  paths = thepaths
  webview.onDidReceiveMessage(async (msg) => {
    console.log('[ormOne.ts] onDidReceiveMessage', msg)
    switch (msg.command) {
      case 'prismaPartOne':
        vscode.window.showInformationMessage(
          '[ormOne.ts] got request prismaPartOne',
        )
        await installPrisma(
          webview,
          {
            useOnlyBuiltDependencies: msg.useOnlyBuiltDependencies ?? true,
          },
          devDeps,
        )
        await installPrisma(
          webview,
          {
            useOnlyBuiltDependencies: msg.useOnlyBuiltDependencies ?? true,
          },
          deps,
        )
        break

      case 'approveAllBuildPackages':
        // Run pnpm approve-builds (approves everything pending)
        await runCommandStream('pnpm', ['approve-builds'], { cwd: paths.root })
        break

      case 'approveBuildPackage':
        await runCommandStream('pnpm', ['approve-builds', msg.package], {
          cwd: paths.root,
        })
        break
    }
  })
}

// Main install function

async function installPrisma(
  webview: vscode.Webview,
  options: { useOnlyBuiltDependencies: boolean },
  packages: string[],
) {
  let installArgs = ['i', '-D', ...packages]
  // if (options.useOnlyBuiltDependencies) {
  //   installArgs.push(
  //     '--config.onlyBuiltDependencies=prisma,@prisma/client,esbuild,sharp,@swc/core,better-sqlite3',
  //   )
  // }
  console.log('[ormOne.ts] installPrisma')
  webview.postMessage({
    command: 'prismaInstallStart',
    message: `Starting Prisma at ${paths.root} dependencies installation...`,
  })

  const result = await runCommandStream('pnpm', installArgs, {
    cwd: paths.root,
    timeoutMs: 10 * 60 * 1000,

    onProgress: (p) => {
      console.log('[ormOne.ts] onProgress')
      webview.postMessage({
        command: 'prismaProgress',
        percent: p.percent ?? 0,
        added: p.added,
        total: p.total,
        message: p.done
          ? 'Finalizing installation...'
          : `Installing packages: ${p.added ?? 0}/${p.total ?? '?'}`,
        rawLine: p.rawLine, // useful for debugging
      })
    },

    onStdout: (text: string) => {
      const lines = text.split(/\r?\n/)
      const approvalPackages = new Set<string>() // local to this chunk

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          continue
        }

        // Detect approval warning
        if (
          trimmed.includes('Ignored build scripts:') ||
          trimmed.includes('approve-builds')
        ) {
          const packages = extractBuildApprovalPackages(trimmed)
          packages.forEach((pkg) => approvalPackages.add(pkg))
        }

        // Always log every line
        webview.postMessage({
          command: 'prismaLog',
          type: 'stdout',
          text: trimmed,
        })
      }

      // Send approval message ONLY ONCE per stdout chunk if we found any packages
      if (approvalPackages.size > 0) {
        webview.postMessage({
          command: 'prismaBuildApprovalNeeded',
          packages: Array.from(approvalPackages),
          message: 'Some packages require approval to run build scripts',
        })
      }
    },
    onStderr: (text: string) => {
      webview.postMessage({
        command: 'prismaLog',
        type: 'stderr',
        text: text.trim(),
      })
    },
  })

  if (result.success) {
    webview.postMessage({
      command: 'prismaInstallSuccess',
      message: '✅ Prisma and dependencies installed successfully!',
    })
  } else {
    webview.postMessage({
      command: 'prismaInstallError',
      message: '❌ Installation failed',
      error: result.error?.message || 'Unknown error',
    })
  }
}
