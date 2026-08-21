import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

function collected(text = '', lossy = false) {
  return {
    readFrom() {
      return { text, lossy }
    },
  }
}

function createHandle(plan) {
  let settle
  let settled = false
  const timeoutPlan = plan.kind === 'timeout'
  const done = timeoutPlan
    ? new Promise((resolve) => { settle = resolve })
    : Promise.resolve({ exitCode: plan.exitCode ?? 0, signal: plan.signal ?? null })
  return {
    done,
    collected: {
      stdout: collected(plan.stdout ?? '', plan.stdoutTruncated ?? false),
      stderr: collected(plan.stderr ?? '', plan.stderrTruncated ?? false),
    },
    terminate() {
      if (settled || !timeoutPlan) return
      settled = true
      settle({ exitCode: plan.processExitCode ?? 1, signal: plan.signal ?? null })
    },
  }
}

export function loadHostRuntime(plans = [], options = {}) {
  const source = readFileSync(join(root, 'src', 'dynamic', 'host.js'), 'utf8')
  const tools = new Map()
  const handlers = new Map()
  const disposers = []
  const queue = [...plans]
  const harness = {
    defineTool(definition) {
      return definition
    },
    registerTool(_ctx, tool) {
      tools.set(tool.name, tool)
      return () => tools.delete(tool.name)
    },
    handle(name, handler) {
      handlers.set(name, handler)
      return () => handlers.delete(name)
    },
  }
  const ctx = {
    shell: {
      resolve() {
        return { workdir: root }
      },
    },
    subprocess: {
      async resolveExecutable() {
        return 'ssh'
      },
      spawn(spec) {
        const plan = queue.shift()
        if (plan === undefined) throw new Error('No subprocess plan queued')
        if (plan.kind === 'spawn-error') throw new Error(plan.message ?? 'spawn failed')
        plan.spec = spec
        return createHandle(plan)
      },
    },
    timeout(callback, delay) {
      const timer = setTimeout(callback, options.instantTimeout ? 0 : delay)
      return () => clearTimeout(timer)
    },
    effect(factory) {
      const dispose = factory()
      if (typeof dispose === 'function') disposers.push(dispose)
      return typeof dispose === 'function' ? dispose : () => {}
    },
  }
  const plugin = new Function('harness', source)(harness)
  plugin.apply(ctx)
  return {
    plugin,
    tools,
    handlers,
    async open(args = {}) {
      return tools.get('ssh_session_open').execute({
        session: 'test-session',
        host: 'example.test',
        user: 'ubuntu',
        port: 22,
        host_key_policy: 'accept-new',
        connect_timeout_sec: 10,
        ...args,
      })
    },
    async bash(command, timeout = 30_000) {
      return tools.get('ssh_bash').execute(
        { session: 'test-session', command, timeout_ms: timeout },
        { signal: new AbortController().signal },
      )
    },
    async sessions() {
      return tools.get('ssh_sessions').execute({})
    },
    async close() {
      return tools.get('ssh_session_close').execute({ session: 'test-session' })
    },
    dispose() {
      for (const disposer of disposers.reverse()) disposer()
    },
  }
}
