import * as vscode from 'vscode'
import * as ts from 'typescript' // TypeScript for AST

const MOUSE_EVENTS = new Set([
  'click',
  'mouseover',
  'mouseout',
  'mouseenter',
  'mouseleave',
  'mousedown',
  'mouseup',
  'dblclick',
])
const DRAG_EVENTS = new Set([
  'dragstart',
  'dragover',
  'dragenter',
  'dragleave',
  'drop',
  'dragend',
])

type TRegistryInfo = {
  start: number
  end: number
  names: string[]
}

/**
 * Registers the "Generate/Update Event Handlers Registry" command,
 * Code Action (lightbulb), and save listener.
 * Returns a single Disposable that should be added to context.subscriptions.
 */
export function registerGenerateEventHandlers(): vscode.Disposable {
  const disposables: vscode.Disposable[] = []

  // ====================== MAIN COMMAND ======================
  const commandDisposable = vscode.commands.registerCommand(
    'prisma.generateEventHandlers',
    async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor || !editor.document.fileName.endsWith('.svelte')) {
        vscode.window.showWarningMessage(
          'This command only works on .svelte files',
        )
        return
      }

      const handlerNames = await getCurrentHandlerNames(editor.document)
      if (handlerNames.length === 0) {
        vscode.window.showInformationMessage('No handler functions found.')
        return
      }

      const existingRegistry = findExistingRegistryWithAST(editor.document)

      if (existingRegistry) {
        if (isRegistryInSync(existingRegistry.names, handlerNames)) {
          vscode.window.showInformationMessage(
            '✅ Event handlers registry is already up to date',
          )
          return
        }

        // Select the old registry so the user can see what will be replaced
        const range = new vscode.Range(
          editor.document.positionAt(existingRegistry.start),
          editor.document.positionAt(existingRegistry.end),
        )
        editor.selection = new vscode.Selection(range.start, range.end)

        const answer = await vscode.window.showInformationMessage(
          'Event handlers registry is out of sync. Update it now?',
          'Yes, update',
          'Cancel',
        )

        if (answer !== 'Yes, update') {
          return
        }

        await replaceRegistry(
          editor,
          handlerNames,
          existingRegistry.start,
          existingRegistry.end,
        )
      } else {
        await insertRegisterCall(editor, handlerNames)
      }
    },
  )

  disposables.push(commandDisposable)

  // ====================== CODE ACTION (Lightbulb) ======================
  const codeActionDisposable = vscode.languages.registerCodeActionsProvider(
    'svelte',
    {
      provideCodeActions(document) {
        if (!document.getText().includes('globalEH.registerHandlers')) {
          return undefined
        }

        const action = new vscode.CodeAction(
          '🔧 Update Event Handlers Registry',
          vscode.CodeActionKind.QuickFix,
        )
        action.command = {
          command: 'prisma.generateEventHandlers',
          title: 'Update Event Handlers Registry',
        }
        return [action]
      },
    },
  )

  disposables.push(codeActionDisposable)

  /*  ====================== ON SAVE CHECK ======================
    The following commands returns Desposable
    vscode.commands.registerCommand()
    vscode.languages.registerCodeActionsProvider()
    vscode.workspace.onDidSaveTextDocument()
*/

  const saveDisposable = vscode.workspace.onDidSaveTextDocument(
    async (document) => {
      if (!document.fileName.endsWith('.svelte')) {
        return
      }

      const existing = findExistingRegistryWithAST(document)
      if (!existing) {
        return
      }

      const currentNames = await getCurrentHandlerNames(document)

      if (!isRegistryInSync(existing.names, currentNames)) {
        const answer = await vscode.window.showInformationMessage(
          'Event handlers registry is out of sync.',
          'Update now',
          'Ignore',
        )

        if (answer === 'Update now') {
          const editor = await vscode.window.showTextDocument(document)
          await replaceRegistry(
            editor,
            currentNames,
            existing.start,
            existing.end,
          )
        }
      }
    },
  )

  disposables.push(saveDisposable)

  return vscode.Disposable.from(...disposables)
}

// ====================== HELPER FUNCTIONS ======================

async function getCurrentHandlerNames(
  document: vscode.TextDocument,
): Promise<string[]> {
  const code = document.getText()
  const scriptBlocks = extractScriptBlocks(code)

  let all: string[] = []
  for (const block of scriptBlocks) {
    all.push(...extractFunctionNamesWithAST(block))
  }

  return [...new Set(all)].filter(
    (name) =>
      !name.startsWith('_') &&
      ![
        'onMount',
        'onDestroy',
        'onBeforeUpdate',
        'beforeNavigate',
        'afterNavigate',
        'createEventDispatcher',
      ].includes(name),
  )
}

function extractScriptBlocks(code: string): string[] {
  const regex = /<script(\s+[^>]*?)?>([\s\S]*?)<\/script>/gi
  const blocks: string[] = []
  let match
  while ((match = regex.exec(code)) !== null) {
    if (!/\bmodule\b/.test(match[1] || '')) {
      blocks.push(match[2] || '')
    }
  }
  return blocks
}

function extractFunctionNamesWithAST(scriptContent: string): string[] {
  const functions = new Set<string>()
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    scriptContent,
    ts.ScriptTarget.Latest,
    true,
  )

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      functions.add(node.name.text)
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer)) &&
      ts.isIdentifier(node.name)
    ) {
      functions.add(node.name.text)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return Array.from(functions)
}

// ====================== AST-BASED REGISTRY FINDER ======================

function findExistingRegistryWithAST(
  document: vscode.TextDocument,
): TRegistryInfo | null {
  const code = document.getText()
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    code,
    ts.ScriptTarget.Latest,
    true,
  )

  let registryInfo: TRegistryInfo | null = null

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression
      if (
        ts.isPropertyAccessExpression(expr) &&
        ts.isIdentifier(expr.expression) &&
        expr.expression.text === 'globalEH' &&
        expr.name.text === 'registerHandlers'
      ) {
        const arg = node.arguments[0]
        if (arg && ts.isObjectLiteralExpression(arg)) {
          const names: string[] = []

          for (const prop of arg.properties) {
            if (
              ts.isShorthandPropertyAssignment(prop) &&
              ts.isIdentifier(prop.name)
            ) {
              names.push(prop.name.text)
            } else if (
              ts.isPropertyAssignment(prop) &&
              ts.isIdentifier(prop.name)
            ) {
              names.push(prop.name.text)
            }
          }

          registryInfo = {
            start: node.getStart(),
            end: node.getEnd(),
            names,
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return registryInfo
}

// ====================== GROUPING & SORTING ======================

function groupAndSortHandlers(handlerNames: string[]): {
  mouse: string[]
  drag: string[]
  other: string[]
} {
  const mouse: string[] = []
  const drag: string[] = []
  const other: string[] = []

  for (const name of handlerNames) {
    const lower = name.toLowerCase()
    if (
      DRAG_EVENTS.has(lower) ||
      lower.includes('drag') ||
      lower.includes('drop')
    ) {
      drag.push(name)
    } else if (
      MOUSE_EVENTS.has(lower) ||
      lower.includes('mouse') ||
      lower.includes('click')
    ) {
      mouse.push(name)
    } else {
      other.push(name)
    }
  }

  mouse.sort()
  drag.sort()
  other.sort()

  return { mouse, drag, other }
}

function isRegistryInSync(
  existingNames: string[],
  currentNames: string[],
): boolean {
  const sortedExisting = [...existingNames].sort()
  const sortedCurrent = [...currentNames].sort()
  return (
    sortedExisting.length === sortedCurrent.length &&
    sortedExisting.every((name, i) => name === sortedCurrent[i])
  )
}

// ====================== REGISTRY UPDATE / INSERT ======================

async function replaceRegistry(
  editor: vscode.TextEditor,
  handlerNames: string[],
  start: number,
  end: number,
) {
  const groups = groupAndSortHandlers(handlerNames)

  let registryCode = `// Auto-generated by Prisma Extension - do not edit manually\n\n`
  registryCode += `globalEH.registerHandlers({\n`

  if (groups.mouse.length > 0) {
    registryCode += `  // Mouse Events\n`
    registryCode +=
      groups.mouse.map((name) => `  ${name}`).join(',\n') + ',\n\n'
  }

  if (groups.drag.length > 0) {
    registryCode += `  // Drag & Drop Events\n`
    registryCode += groups.drag.map((name) => `  ${name}`).join(',\n') + ',\n\n'
  }

  if (groups.other.length > 0) {
    registryCode += `  // Other Events\n`
    registryCode += groups.other.map((name) => `  ${name}`).join(',\n') + '\n'
  }

  registryCode += `});\n`

  const edit = new vscode.WorkspaceEdit()
  const range = new vscode.Range(
    editor.document.positionAt(start),
    editor.document.positionAt(end),
  )
  edit.replace(editor.document.uri, range, registryCode)

  await vscode.workspace.applyEdit(edit)
  vscode.window.showInformationMessage(
    `✅ Registry updated (${handlerNames.length} handlers)`,
  )
}

async function insertRegisterCall(
  editor: vscode.TextEditor,
  handlerNames: string[],
) {
  const groups = groupAndSortHandlers(handlerNames)

  let registryCode = `// Auto-generated by Prisma Extension - do not edit manually\n\n`
  registryCode += `globalEH.registerHandlers({\n`

  if (groups.mouse.length > 0) {
    registryCode += `  // Mouse Events\n`
    registryCode +=
      groups.mouse.map((name) => `  ${name}`).join(',\n') + ',\n\n'
  }

  if (groups.drag.length > 0) {
    registryCode += `  // Drag & Drop Events\n`
    registryCode += groups.drag.map((name) => `  ${name}`).join(',\n') + ',\n\n'
  }

  if (groups.other.length > 0) {
    registryCode += `  // Other Events\n`
    registryCode += groups.other.map((name) => `  ${name}`).join(',\n') + '\n'
  }

  registryCode += `});\n`

  const text = editor.document.getText()
  const onMountMatch = text.match(/onMount\s*\(\s*\(\s*\)\s*=>?\s*\{/)
  let position: vscode.Position

  if (onMountMatch) {
    const closing = text.indexOf(
      '}',
      onMountMatch.index! + onMountMatch[0].length,
    )
    position = editor.document.positionAt(closing + 1)
  } else {
    const lastScript = text.lastIndexOf('</script>')
    position = editor.document.positionAt(lastScript)
  }

  const edit = new vscode.WorkspaceEdit()
  edit.insert(editor.document.uri, position, '\n\n' + registryCode + '\n')

  await vscode.workspace.applyEdit(edit)
  vscode.window.showInformationMessage(
    `✅ Registry created (${handlerNames.length} handlers)`,
  )
}
