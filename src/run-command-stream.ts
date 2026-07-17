import * as vscode from 'vscode'
import { spawn, ChildProcess } from 'child_process'
import { CommandResultTracker } from './extension'

export interface CommandResult {
  success: boolean
  code: number
  stdout: string
  stderr: string
  command: string
  args: string[]
  error?: Error
}

export interface ProgressInfo {
  resolved?: number
  reused?: number
  downloaded?: number
  added?: number
  total?: number
  percent?: number
  done: boolean
  rawLine: string
  // ndjson fields when available
  status?: string
  packageCount?: number
}

export function runCommandStream(
  command: string,
  args: string[] = [],
  options: {
    cwd?: string
    title?: string
    timeoutMs?: number // e.g. 300000 = 5 minutes
    token?: vscode.CancellationToken // VS Code cancellation
    useNdjson?: boolean // More structured output
    onStdout?: (data: string) => void
    onStderr?: (data: string) => void
    onProgress?: (progress: ProgressInfo) => void
    terminal?: vscode.Terminal
  } = {},
): Promise<CommandResultTracker<boolean>> {
  // let result = new CommandResultTracker<boolean>(false)
  return new Promise((resolve) => {
    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []
    let proc: ChildProcess | null = null
    let timeoutId: NodeJS.Timeout | null = null

    const finalArgs = [...args]

    try {
      // Configure pnpm reporter NOTE what for other package managers?
      if (command === 'pnpm' || command.endsWith('pnpm')) {
        const reporter = options.useNdjson
          ? '--reporter=ndjson'
          : '--reporter=append-only'
        if (!finalArgs.some((a) => a.startsWith('--reporter'))) {
          finalArgs.push(reporter)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(
        `[runCommandStream] Error configuring reporter for command ${command}: ${msg}`,
      )
    }

    proc = spawn(command, finalArgs, {
      cwd: options.cwd,
      shell: false,
    })

    // attaches an event listener to the standard output stream (stdout),
    // which executes a callback function whenever the child process prints
    // text or data
    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      stdoutChunks.push(text)
      options.onStdout?.(text)
      if (options.terminal) options.terminal.sendText(text, false)

      if (!options.onProgress) {
        return
      }

      const lines = text.split(/\r?\n/)
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          continue
        }

        const progress: ProgressInfo = { done: false, rawLine: trimmed }

        // ==================== NDJSON ====================
        if (
          options.useNdjson &&
          trimmed.startsWith('{') &&
          trimmed.endsWith('}')
        ) {
          try {
            const json = JSON.parse(trimmed)

            // Only treat it as progress if it has progress-related fields
            if (
              json.status === 'progress' ||
              json.data?.added !== undefined ||
              json.status === 'done'
            ) {
              progress.status = json.status
              progress.added = json.data?.added ?? 0
              progress.total = json.data?.total ?? json.data?.resolved ?? 1
              progress.done = json.status === 'done' || json.data?.done === true
            }
          } catch (e) {}
        }
        // ==================== append-only fallback ====================
        else {
          const match = trimmed.match(
            /Progress:\s+resolved\s+(\d+)[^,]*?added\s+(\d+)/i,
          )
          if (match) {
            const resolved = parseInt(match[1], 10)
            const added = parseInt(match[2], 10)
            progress.resolved = resolved
            progress.added = added
            progress.total = Math.max(resolved, added, 1)
            progress.done = trimmed.toLowerCase().includes(', done')
          } else if (
            trimmed.includes('done') ||
            trimmed.match(/Packages:\s*\+\d+/)
          ) {
            progress.done = true
            progress.percent = 100
          }
        }

        // Calculate percentage
        if (
          progress.total &&
          progress.total > 0 &&
          progress.added !== undefined
        ) {
          progress.percent = Math.min(
            Math.round((progress.added / progress.total) * 100),
            100,
          )
        }
        if (progress.done) {
          progress.percent = 100
        }

        options.onProgress(progress)
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      stderrChunks.push(text)
      options.onStderr?.(text)
      if (options.terminal) {
        options.terminal.sendText(text, false)
      }
    })

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }

    // Timeout
    if (options.timeoutMs) {
      timeoutId = setTimeout(() => {
        if (proc) {
          proc.kill('SIGTERM')
          setTimeout(() => proc?.kill('SIGKILL'), 2000)
        }
      }, options.timeoutMs)
    }

    // Cancellation
    const disposable = options.token?.onCancellationRequested(() => {
      if (proc) {
        proc.kill('SIGTERM')
        setTimeout(() => proc?.kill('SIGKILL'), 1500)
      }
    })

    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup()
      disposable?.dispose()

      const stdout = stdoutChunks.join('')
      const stderr = stderrChunks.join('')

      const success = code === 0 && !signal

      let result = new CommandResultTracker<boolean>(success)
      result.args = finalArgs

      if (!success) {
        result.error = new Error(
          `Command failed: ${command} ${args.join(' ')}\n` +
            `Exit code: ${code}${signal ? ` (signal: ${signal})` : ''}\n` +
            `${stderr ? `Stderr: ${stderr}` : ''}`,
        )
      }

      resolve(result)
    }

    proc.on('error', (err) => {
      cleanup()
      disposable?.dispose()

      let result = new CommandResultTracker<boolean>(false)
      result.error = err
      result.stderr = err.message
      result.code = 1
      result.stdout = stdoutChunks.join('')
      result.stderr = stderrChunks.join('')
      result.command = command
      result.args = finalArgs

      resolve(result)
    })

    proc.on('close', finish)
  })
}
