const DASHBOARD_STATE_PATH = '/dsh-agent-ssh-dashboard/api/state'
const DASHBOARD_TASKS_PATH = '/dsh-agent-ssh-dashboard/api/tasks'
const DASHBOARD_DOWNLOAD_SESSION_PATH = '/dsh-agent-ssh-dashboard/api/download-session'
const DASHBOARD_DOWNLOAD_TASK_PATH = '/dsh-agent-ssh-dashboard/api/download-task'

function defineTool(options) {
  const properties = {}
  const required = []
  for (const [key, value] of Object.entries(options.parameters)) {
    const { required: isRequired, ...schema } = value
    properties[key] = schema
    if (isRequired) required.push(key)
  }
  return {
    ...options,
    parameters: { type: 'object', properties, required, additionalProperties: false },
  }
}

function createPlugin(harness) {
  return {
    name: 'agent-ssh-connection-health-host',
    inject: ['tools', 'subprocess', 'shell', 'timer'],
    apply(ctx) {
      const sessions = new Map()
      const activeProcesses = new Set()
      const localCwd = ctx.shell.resolve({ command: 'ssh' }).workdir
      let nextCommandId = 0
      let sshExecutable = null
      const pendingCommands = new Map()
      const POLL_INTERVAL_MS = 400
  
      function errorMessage(error) {
        if (error && typeof error.message === 'string') return error.message
        return String(error)
      }
  
      function firstLine(value) {
        if (value === undefined || value === null) return ''
        const text = String(value).trim()
        if (text === '') return ''
        const index = text.indexOf('\n')
        const line = (index < 0 ? text : text.slice(0, index)).trim()
        return line.length > 300 ? line.slice(0, 300) + '…' : line
      }
  
      function cleanDetail(value) {
        return firstLine(value).replace(/\\[0-7]{3}/g, '').replace(/\s+/g, ' ').trim()
      }
  
      function requiredText(value, label, maxLength) {
        const text = value === undefined || value === null ? '' : String(value).trim()
        if (text === '') throw new Error(label + '不能为空')
        if (text.length > maxLength) throw new Error(label + '过长')
        if (text.indexOf('\u0000') >= 0 || text.indexOf('\n') >= 0 || text.indexOf('\r') >= 0) throw new Error(label + '不能包含换行或空字符')
        return text
      }
  
      function optionalText(value, label, maxLength) {
        if (value === undefined || value === null || String(value).trim() === '') return ''
        return requiredText(value, label, maxLength)
      }
  
      function normalizeSessionId(value) {
        return requiredText(value, '会话名称', 64)
      }
  
      function normalizeConnection(args) {
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('SSH 会话参数无效')
        const id = normalizeSessionId(args.session)
        const host = requiredText(args.host, '主机或 SSH 别名', 255)
        const user = optionalText(args.user, '用户名', 64)
        const identityFile = optionalText(args.identity_file, '私钥路径', 1024)
        const hostKeyPolicy = args.host_key_policy === undefined ? 'accept-new' : String(args.host_key_policy)
        const connectTimeoutSec = Number(args.connect_timeout_sec === undefined ? 10 : args.connect_timeout_sec)
        let port = null
        if (args.port !== undefined && args.port !== null) port = Number(args.port)
        if (host.charAt(0) === '-' || !/^[A-Za-z0-9._:%\[\]-]+$/.test(host)) throw new Error('主机或 SSH 别名格式无效')
        if (user !== '' && !/^[A-Za-z0-9._-]+$/.test(user)) throw new Error('用户名格式无效')
        if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) throw new Error('端口必须是 1 到 65535 的整数')
        if (!Number.isInteger(connectTimeoutSec) || connectTimeoutSec < 3 || connectTimeoutSec > 60) throw new Error('连接超时必须是 3 到 60 秒的整数')
        if (hostKeyPolicy !== 'strict' && hostKeyPolicy !== 'accept-new') throw new Error('主机密钥策略无效')
        return { id, host, user, port, identityFile, hostKeyPolicy, connectTimeoutSec }
      }
  
      function targetOf(session) {
        return session.user === '' ? session.host : session.user + '@' + session.host
      }
  
      function sessionSummary(session, includeCommands) {
        const latest = session.commands.length > 0 ? session.commands[0] : null
        const summary = {
          id: session.id,
          target: targetOf(session),
          host: session.host,
          user: session.user,
          port: session.port,
          authMode: session.identityFile === '' ? 'ssh-agent-or-config' : 'identity-file',
          hostKeyPolicy: session.hostKeyPolicy,
          connectTimeoutSec: session.connectTimeoutSec,
          status: session.status,
          connectionState: session.status,
          connectionFailure: session.connectionFailure,
          lastCommandStatus: session.lastCommandStatus,
          latestCommandFailure: latest !== null && latest.valid === false ? latest.failure : null,
          activeCount: session.activeCount,
          commandCount: session.commandCount,
          validCount: session.validCount,
          invalidCount: session.invalidCount,
          createdAt: session.createdAt,
          lastActivityAt: session.lastActivityAt,
          lastConnectedAt: session.lastConnectedAt,
          lastConnectionErrorAt: session.lastConnectionErrorAt,
          closedAt: session.closedAt
        }
        if (includeCommands) {
          const pending = pendingCommands.get(session.id)
          const all = session.commands.slice(0, 30)
          if (pending !== undefined) {
            all.unshift({
              commandId: pending.commandId,
              session: pending.session,
              target: pending.target,
              command: pending.command,
              valid: true,
              classification: 'valid',
              failure: null,
              exitCode: null,
              processExitCode: null,
              signal: null,
              timedOut: false,
              aborted: false,
              durationMs: pending.durationMs,
              startedAt: pending.startedAt,
              stdout: pending.stdout.slice(0, 12000),
              stderr: pending.stderr.slice(0, 12000),
              stdoutTruncated: pending.stdoutTruncated || pending.stdout.length > 12000,
              stderrTruncated: pending.stderrTruncated || pending.stderr.length > 12000,
              error: null,
              _streaming: true
            })
          }
          summary.commands = all
        }
        return summary
      }
  
      function openSession(args) {
        const connection = normalizeConnection(args)
        const now = new Date().toISOString()
        const existing = sessions.get(connection.id)
        if (existing !== undefined) {
          if (existing.activeCount > 0) throw new Error('SSH 会话正在执行命令，暂时不能重新打开：' + connection.id)
          existing.host = connection.host
          existing.user = connection.user
          existing.port = connection.port
          existing.identityFile = connection.identityFile
          existing.hostKeyPolicy = connection.hostKeyPolicy
          existing.connectTimeoutSec = connection.connectTimeoutSec
          existing.status = 'ready'
          existing.connectionFailure = null
          existing.closedAt = null
          existing.lastActivityAt = now
          return { created: false, session: sessionSummary(existing, false) }
        }
        const session = {
          id: connection.id,
          host: connection.host,
          user: connection.user,
          port: connection.port,
          identityFile: connection.identityFile,
          hostKeyPolicy: connection.hostKeyPolicy,
          connectTimeoutSec: connection.connectTimeoutSec,
          status: 'ready',
          connectionFailure: null,
          lastCommandStatus: null,
          activeCount: 0,
          commandCount: 0,
          validCount: 0,
          invalidCount: 0,
          createdAt: now,
          lastActivityAt: now,
          lastConnectedAt: null,
          lastConnectionErrorAt: null,
          closedAt: null,
          commands: []
        }
        sessions.set(session.id, session)
        return { created: true, session: sessionSummary(session, false) }
      }
  
      function closeSession(value) {
        const id = normalizeSessionId(value)
        const session = sessions.get(id)
        if (session === undefined) throw new Error('未找到 SSH 会话：' + id)
        if (session.activeCount > 0) throw new Error('SSH 会话仍有命令在运行：' + id)
        const now = new Date().toISOString()
        session.status = 'closed'
        session.connectionFailure = null
        session.closedAt = now
        session.lastActivityAt = now
        return { closed: true, session: sessionSummary(session, false) }
      }
  
      function normalizeCommand(value) {
        const command = value === undefined || value === null ? '' : String(value)
        if (command.trim() === '') throw new Error('Bash 命令不能为空')
        if (command.length > 65536) throw new Error('Bash 命令不能超过 65536 个字符')
        if (command.indexOf('\u0000') >= 0) throw new Error('Bash 命令不能包含空字符')
        return command
      }
  
      function normalizeTimeout(value) {
        if (value === undefined || value === null) return 30000
        const timeout = Number(value)
        if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) throw new Error('执行超时必须是 1000 到 120000 毫秒的整数')
        return timeout
      }
  
      async function resolveSsh(signal) {
        if (sshExecutable !== null) return sshExecutable
        sshExecutable = await ctx.subprocess.resolveExecutable('ssh', undefined, signal)
        return sshExecutable
      }
  
      function classifyFailure(fields) {
        const detail = cleanDetail(fields.stderr) || cleanDetail(fields.error)
        const combined = (String(fields.stderr || '') + '\n' + String(fields.error || '')).toLowerCase()
        if (fields.timedOut) return { kind: 'timeout', scope: 'command', label: '执行超时', message: detail || '远端命令在设定时间内未完成' }
        if (fields.aborted) return { kind: 'cancelled', scope: 'command', label: '执行已取消', message: detail || 'Agent 或调用方取消了这次执行' }
        if (fields.signal !== null) return { kind: 'signal', scope: 'connection', label: 'SSH 异常终止', message: detail || 'SSH 进程被信号 ' + String(fields.signal) + ' 终止' }
        if (fields.exitCode === 127) return { kind: 'command-not-found', scope: 'command', label: '命令不存在', message: detail || '远端 Bash 找不到要执行的命令' }
        if (fields.exitCode === 126) return { kind: 'not-executable', scope: 'command', label: '命令无法执行', message: detail || '命令存在，但权限不足或不可执行' }
        if (fields.exitCode === 255) {
          if (combined.indexOf('permission denied (') >= 0 || combined.indexOf('permission denied, please try again') >= 0) return { kind: 'authentication', scope: 'connection', label: 'SSH 认证失败', message: '用户名、密钥或 SSH Agent 未通过目标主机认证' }
          if (combined.indexOf('host key verification failed') >= 0 || combined.indexOf('remote host identification has changed') >= 0) return { kind: 'host-key', scope: 'connection', label: '主机密钥错误', message: '主机密钥校验失败，请检查 known_hosts 和目标主机身份' }
          if (combined.indexOf('could not resolve hostname') >= 0 || combined.indexOf('name or service not known') >= 0) return { kind: 'dns', scope: 'connection', label: '主机名解析失败', message: '无法解析 SSH 主机名，请检查 host 或 OpenSSH Config' }
          if (combined.indexOf('connection refused') >= 0) return { kind: 'connection-refused', scope: 'connection', label: '连接被拒绝', message: '已到达目标地址，但 SSH 端口拒绝连接' }
          if (combined.indexOf('connection timed out') >= 0 || combined.indexOf('operation timed out') >= 0) return { kind: 'connection-timeout', scope: 'connection', label: '连接超时', message: '在连接超时内未能到达 SSH 服务' }
          if (combined.indexOf('no route to host') >= 0 || combined.indexOf('network is unreachable') >= 0) return { kind: 'no-route', scope: 'connection', label: '网络不可达', message: '当前网络没有到目标主机的可用路由' }
          if (combined.indexOf('connection closed by') >= 0 || combined.indexOf('connection reset by peer') >= 0 || combined.indexOf('broken pipe') >= 0 || combined.indexOf('kex_exchange_identification') >= 0 || combined.indexOf('banner exchange') >= 0) return { kind: 'transport-disconnect', scope: 'connection', label: '连接异常断开', message: detail || 'SSH 传输连接被非正常关闭' }
        }
        if (fields.exitCode === 1) {
          if (combined.indexOf('no such file') >= 0 || combined.indexOf('cannot access') >= 0 || combined.indexOf('not found') >= 0) return { kind: 'file-not-found', scope: 'command', label: '文件或资源不存在', message: detail || '目标文件或资源暂不存在（可能任务仍在运行中）' }
          if (combined.indexOf('permission denied') >= 0) return { kind: 'permission-denied', scope: 'command', label: '权限不足', message: detail || '没有权限访问目标文件或执行命令' }
          return { kind: 'command-error', scope: 'command', label: '命令执行出错', message: detail || '远端 Bash 以退出码 1 结束' }
        }
        if (fields.exitCode !== null && fields.exitCode !== 0) return { kind: 'remote-exit', scope: 'command', label: '远端命令失败', message: detail || '远端 Bash 以退出码 ' + String(fields.exitCode) + ' 结束' }
        return { kind: 'infrastructure', scope: 'connection', label: 'SSH 启动失败', message: detail || 'SSH 进程无法正常启动或结束' }
      }
  
      function isConnectionFailure(failure) {
        return failure !== null && failure.scope === 'connection'
      }
  
      function finishCommand(session, fields) {
        nextCommandId += 1
        const failure = fields.valid ? null : classifyFailure(fields)
        const commandId = 'cmd-' + String(nextCommandId)
        const full = {
          commandId,
          session: session.id,
          target: targetOf(session),
          command: fields.command,
          valid: fields.valid,
          classification: fields.valid ? 'valid' : 'invalid',
          failure,
          exitCode: fields.exitCode,
          processExitCode: fields.processExitCode,
          signal: fields.signal,
          timedOut: fields.timedOut,
          aborted: fields.aborted,
          durationMs: fields.durationMs,
          startedAt: fields.startedAt,
          stdout: fields.stdout,
          stderr: fields.stderr,
          stdoutTruncated: fields.stdoutTruncated,
          stderrTruncated: fields.stderrTruncated,
          error: fields.error || (failure === null ? null : failure.message)
        }
        const stored = {
          commandId: full.commandId,
          session: full.session,
          target: full.target,
          command: full.command,
          valid: full.valid,
          classification: full.classification,
          failure: full.failure,
          exitCode: full.exitCode,
          processExitCode: full.processExitCode,
          signal: full.signal,
          timedOut: full.timedOut,
          aborted: full.aborted,
          durationMs: full.durationMs,
          startedAt: full.startedAt,
          stdout: full.stdout.slice(0, 12000),
          stderr: full.stderr.slice(0, 12000),
          stdoutTruncated: full.stdoutTruncated || full.stdout.length > 12000,
          stderrTruncated: full.stderrTruncated || full.stderr.length > 12000,
          error: full.error
        }
        session.commands.unshift(stored)
        if (session.commands.length > 30) session.commands.length = 30
        session.commandCount += 1
        session.lastCommandStatus = full.valid ? 'valid' : 'invalid'
        if (full.valid) session.validCount += 1
        else session.invalidCount += 1
        const now = new Date().toISOString()
        session.lastActivityAt = now
        if (isConnectionFailure(failure)) {
          session.connectionFailure = failure
          session.lastConnectionErrorAt = now
          session.status = session.activeCount > 0 ? 'running' : 'error'
        } else {
          session.connectionFailure = null
          session.lastConnectedAt = now
          session.status = session.activeCount > 0 ? 'running' : 'healthy'
        }
        return full
      }
  
      async function runRemote(sessionValue, commandValue, timeoutValue, signal) {
        const sessionId = normalizeSessionId(sessionValue)
        const command = normalizeCommand(commandValue)
        const timeoutMs = normalizeTimeout(timeoutValue)
        const session = sessions.get(sessionId)
        if (session === undefined) throw new Error('未找到 SSH 会话：' + sessionId + '。请先调用 ssh_session_open。')
        if (session.status === 'closed') throw new Error('SSH 会话已正常断开：' + sessionId + '。请先重新调用 ssh_session_open。')
        const startedAtMs = Date.now()
        const startedAt = new Date(startedAtMs).toISOString()
        let handle = null
        let cancelTimer = null
        let pollTimer = null
        let timedOut = false
        let fields = null
        session.activeCount += 1
        session.status = 'running'
        session.lastActivityAt = startedAt
        try {
          const executable = await resolveSsh(signal)
          const argv = [
            executable, '-T',
            '-o', 'BatchMode=yes',
            '-o', 'LogLevel=ERROR',
            '-o', 'ConnectTimeout=' + String(session.connectTimeoutSec),
            '-o', 'ServerAliveInterval=15',
            '-o', 'ServerAliveCountMax=2',
            '-o', 'StrictHostKeyChecking=' + (session.hostKeyPolicy === 'strict' ? 'yes' : 'accept-new')
          ]
          if (session.port !== null) argv.push('-p', String(session.port))
          if (session.identityFile !== '') argv.push('-i', session.identityFile, '-o', 'IdentitiesOnly=yes')
          argv.push(targetOf(session), 'bash', '-s', '--')
          handle = ctx.subprocess.spawn({
            argv,
            cwd: localCwd,
            stdio: {
              stdin: { data: command.endsWith('\n') ? command : command + '\n' },
              stdout: { maxBytes: 65536 },
              stderr: { maxBytes: 65536 }
            },
            graceMs: 1500,
            signal
          })
          activeProcesses.add(handle)
          const pendingCmdId = 'cmd-' + String(nextCommandId + 1)
          const pending = {
            commandId: pendingCmdId,
            session: session.id,
            target: targetOf(session),
            command,
            startedAt,
            stdout: '',
            stderr: '',
            stdoutTruncated: false,
            stderrTruncated: false,
            durationMs: 0
          }
          pendingCommands.set(session.id, pending)
          const pollOutput = () => {
            if (handle === null || pendingCommands.get(session.id) !== pending) return
            try {
              const outRead = handle.collected.stdout === undefined ? null : handle.collected.stdout.readFrom(0)
              const errRead = handle.collected.stderr === undefined ? null : handle.collected.stderr.readFrom(0)
              pending.stdout = outRead === null ? '' : outRead.text
              pending.stderr = errRead === null ? '' : errRead.text
              pending.stdoutTruncated = outRead === null ? false : outRead.lossy
              pending.stderrTruncated = errRead === null ? false : errRead.lossy
              pending.durationMs = Date.now() - startedAtMs
            } catch (_unreadableDuringExecution) { /* collector may not be ready yet */ }
            pollTimer = setTimeout(pollOutput, POLL_INTERVAL_MS)
          }
          pollOutput()
          const timeoutReached = new Promise((resolve) => {
            cancelTimer = ctx.timeout(() => { timedOut = true; resolve(null) }, timeoutMs)
          })
          let outcome = await Promise.race([handle.done, timeoutReached])
          if (cancelTimer !== null) { cancelTimer(); cancelTimer = null }
          if (timedOut) { handle.terminate(); outcome = await handle.done }
          const stdoutRead = handle.collected.stdout === undefined ? null : handle.collected.stdout.readFrom(0)
          const stderrRead = handle.collected.stderr === undefined ? null : handle.collected.stderr.readFrom(0)
          const stdout = stdoutRead === null ? '' : stdoutRead.text
          const stderr = stderrRead === null ? '' : stderrRead.text
          const processExitCode = outcome === null ? null : outcome.exitCode
          const exitSignal = outcome === null ? null : outcome.signal
          const aborted = signal !== undefined && signal.aborted === true
          const exitCode = timedOut || aborted || exitSignal !== null ? null : processExitCode
          const valid = !timedOut && !aborted && exitSignal === null && exitCode === 0
          let error = null
          if (timedOut) error = '远程命令执行超时'
          else if (aborted) error = '远程命令执行已取消'
          else if (exitSignal !== null) error = 'SSH 进程被信号终止：' + String(exitSignal)
          else if (exitCode !== 0) error = '远程 Bash 退出码：' + String(exitCode)
          fields = {
            command,
            valid,
            exitCode,
            processExitCode,
            signal: exitSignal,
            timedOut,
            aborted,
            durationMs: Date.now() - startedAtMs,
            startedAt,
            stdout,
            stderr,
            stdoutTruncated: stdoutRead === null ? false : stdoutRead.lossy,
            stderrTruncated: stderrRead === null ? false : stderrRead.lossy,
            error
          }
        } catch (error) {
          const aborted = signal !== undefined && signal.aborted === true
          fields = {
            command,
            valid: false,
            exitCode: null,
            processExitCode: null,
            signal: null,
            timedOut,
            aborted,
            durationMs: Date.now() - startedAtMs,
            startedAt,
            stdout: '',
            stderr: '',
            stdoutTruncated: false,
            stderrTruncated: false,
            error: errorMessage(error)
          }
        } finally {
          if (pollTimer !== null) clearTimeout(pollTimer)
          pendingCommands.delete(session.id)
          if (cancelTimer !== null) cancelTimer()
          if (handle !== null) activeProcesses.delete(handle)
          session.activeCount -= 1
        }
        return finishCommand(session, fields)
      }
  
      function dashboardSnapshot() {
        const values = []
        let activeCount = 0
        let runningCount = 0
        let connectionErrors = 0
        let validCount = 0
        let invalidCount = 0
        for (const session of sessions.values()) {
          values.push(sessionSummary(session, true))
          if (session.status !== 'closed') activeCount += 1
          if (session.status === 'running') runningCount += 1
          if (session.status === 'error') connectionErrors += 1
          validCount += session.validCount
          invalidCount += session.invalidCount
        }
        values.sort((a, b) => String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)))
        const taskList = []
        for (const task of tasks.values()) taskList.push(taskSummary(task))
        taskList.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
        return { sessions: values, tasks: taskList, counts: { total: values.length, active: activeCount, running: runningCount, connectionErrors, valid: validCount, invalid: invalidCount, taskCount: taskList.length } }
      }
  
      ctx.effect(() => () => {
        for (const handle of activeProcesses) handle.terminate()
        activeProcesses.clear()
      }, 'agent ssh process cleanup')
  
      harness.handle('dashboard.state', () => dashboardSnapshot())
  
  
      // ── Task lifecycle management ──────────────────────────────────────────
  
      const tasks = new Map()
      const TASK_POLL_INTERVAL_MS = 5000
  
      const TASK_STATUS = {
        PENDING: 'pending',
        RUNNING: 'running',
        SUCCESS: 'success',
        FAILED: 'failed',
        TIMEOUT: 'timeout',
        CANCELLED: 'cancelled',
        UNKNOWN: 'unknown'
      }
  
      function normalizeTaskId(value) {
        return requiredText(value, '任务标识', 128)
      }
  
      function taskSummary(task) {
        return {
          taskId: task.taskId,
          sessionId: task.sessionId,
          status: task.status,
          command: task.command.slice(0, 200),
          pid: task.pid,
          pidAlive: task.pidAlive,
          resultReady: task.resultReady,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
          elapsedMs: Date.now() - new Date(task.startedAt).getTime(),
          exitCode: task.exitCode,
          softTimeoutMs: task.softTimeoutMs,
          hardTimeoutMs: task.hardTimeoutMs,
          pollIntervalMs: task.pollIntervalMs,
          lastPollAt: task.lastPollAt,
          message: task.message,
          resultData: task.resultData,
          logTail: task.logTail
        }
      }
  
      function taskDiagnostic(task) {
        const lines = []
        lines.push('任务 ID：' + task.taskId)
        lines.push('会话：' + task.sessionId)
        lines.push('状态：' + task.status)
        lines.push('启动时间：' + task.startedAt)
        lines.push('已运行：' + String(Math.floor((Date.now() - new Date(task.startedAt).getTime()) / 1000)) + ' 秒')
        if (task.pid !== null) lines.push('PID：' + String(task.pid))
        if (task.completedAt !== null) lines.push('完成时间：' + task.completedAt)
        if (task.exitCode !== null) lines.push('退出码：' + String(task.exitCode))
        if (task.message !== null) lines.push('消息：' + task.message)
        return lines.join('\n')
      }
  
      async function executeRemoteCommand(session, command, timeoutMs, signal) {
        const startedAtMs = Date.now()
        const startedAt = new Date(startedAtMs).toISOString()
        let handle = null
        let cancelTimer = null
        let timedOut = false
        try {
          const executable = await resolveSsh(signal)
          const argv = [
            executable, '-T',
            '-o', 'BatchMode=yes',
            '-o', 'LogLevel=ERROR',
            '-o', 'ConnectTimeout=' + String(session.connectTimeoutSec),
            '-o', 'ServerAliveInterval=15',
            '-o', 'ServerAliveCountMax=2',
            '-o', 'StrictHostKeyChecking=' + (session.hostKeyPolicy === 'strict' ? 'yes' : 'accept-new')
          ]
          if (session.port !== null) argv.push('-p', String(session.port))
          if (session.identityFile !== '') argv.push('-i', session.identityFile, '-o', 'IdentitiesOnly=yes')
          argv.push(targetOf(session), 'bash', '-s', '--')
          handle = ctx.subprocess.spawn({
            argv,
            cwd: localCwd,
            stdio: {
              stdin: { data: command.endsWith('\n') ? command : command + '\n' },
              stdout: { maxBytes: 65536 },
              stderr: { maxBytes: 65536 }
            },
            graceMs: 1500,
            signal
          })
          const timeoutReached = new Promise((resolve) => {
            cancelTimer = ctx.timeout(() => { timedOut = true; resolve(null) }, timeoutMs)
          })
          let outcome = await Promise.race([handle.done, timeoutReached])
          if (cancelTimer !== null) { cancelTimer(); cancelTimer = null }
          if (timedOut) { handle.terminate(); outcome = await handle.done }
          const stdoutRead = handle.collected.stdout === undefined ? null : handle.collected.stdout.readFrom(0)
          const stderrRead = handle.collected.stderr === undefined ? null : handle.collected.stderr.readFrom(0)
          const stdout = stdoutRead === null ? '' : stdoutRead.text
          const stderr = stderrRead === null ? '' : stderrRead.text
          const processExitCode = outcome === null ? null : outcome.exitCode
          const exitSignal = outcome === null ? null : outcome.signal
          const aborted = signal !== undefined && signal.aborted === true
          const exitCode = timedOut || aborted || exitSignal !== null ? null : processExitCode
          return {
            transport: 'ok',
            command,
            exitCode,
            processExitCode,
            signal: exitSignal,
            timedOut,
            aborted,
            durationMs: Date.now() - startedAtMs,
            startedAt,
            stdout,
            stderr,
            stdoutTruncated: stdoutRead === null ? false : stdoutRead.lossy,
            stderrTruncated: stderrRead === null ? false : stderrRead.lossy,
            error: timedOut ? '远程命令执行超时' : (aborted ? '远程命令执行已取消' : (exitSignal !== null ? 'SSH 进程被信号终止：' + String(exitSignal) : null))
          }
        } catch (error) {
          return {
            transport: 'failed',
            command,
            exitCode: null,
            processExitCode: null,
            signal: null,
            timedOut: false,
            aborted: signal !== undefined && signal.aborted === true,
            durationMs: Date.now() - startedAtMs,
            startedAt,
            stdout: '',
            stderr: '',
            stdoutTruncated: false,
            stderrTruncated: false,
            error: 'SSH 传输失败：' + errorMessage(error)
          }
        } finally {
          if (cancelTimer !== null) cancelTimer()
        }
      }
  
      function classifyTaskStatus(transportResult, task) {
        if (transportResult.transport === 'failed') {
          return { status: TASK_STATUS.UNKNOWN, message: 'SSH 连接失败，无法获取任务状态：' + (transportResult.error || '未知错误') }
        }
  
        if (transportResult.timedOut) {
          return { status: TASK_STATUS.UNKNOWN, message: '状态探测超时，任务可能仍在运行' }
        }
  
        const stdout = transportResult.stdout || ''
        const stderr = transportResult.stderr || ''
  
        // Parse structured status output if available
        let parsed = null
        try {
          if (stdout.trim().startsWith('{')) parsed = JSON.parse(stdout.trim())
        } catch (_ignore) { /* not JSON */ }
  
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          if (parsed.taskStatus) return { status: parsed.taskStatus, message: parsed.message || '', resultData: parsed }
          if (parsed.exitCode !== undefined && parsed.resultReady) {
            return {
              status: parsed.exitCode === 0 ? TASK_STATUS.SUCCESS : TASK_STATUS.FAILED,
              message: parsed.message || '',
              exitCode: parsed.exitCode,
              resultData: parsed
            }
          }
        }
  
        // Check PID file for process liveness
        if (task.pid !== null) {
          const pidFile = task.pidFile
          if (pidFile !== '') {
            // Check if PID file exists and process is alive
            const pidCheck = stdout.indexOf('PID_ALIVE=yes') >= 0 || stdout.indexOf('PID_ALIVE=true') >= 0
            const pidDead = stdout.indexOf('PID_DEAD=yes') >= 0 || stdout.indexOf('PID_DEAD=true') >= 0
            const pidFileMissing = stdout.indexOf('PID_FILE_MISSING=yes') >= 0
            if (pidCheck) return { status: TASK_STATUS.RUNNING, message: '任务进程仍在运行' }
            if (pidDead) {
              // Process is dead, check for results
              if (task.resultFile !== '') {
                const resultReady = stdout.indexOf('RESULT_READY=yes') >= 0
                const resultCode = (stdout.match(/RESULT_EXIT_CODE=(-?\d+)/) || [])[1]
                if (resultReady) {
                  const code = resultCode !== undefined ? Number(resultCode) : null
                  return {
                    status: code === 0 ? TASK_STATUS.SUCCESS : TASK_STATUS.FAILED,
                    message: code === 0 ? '任务完成' : '任务以退出码 ' + String(code) + ' 结束',
                    exitCode: code
                  }
                }
                return { status: TASK_STATUS.FAILED, message: '任务进程已结束但未生成结果文件' }
              }
              return { status: TASK_STATUS.FAILED, message: '任务进程已结束' }
            }
            if (pidFileMissing) return { status: TASK_STATUS.UNKNOWN, message: 'PID 文件丢失，无法确定任务状态' }
          }
        }
  
        // Check result file
        if (task.resultFile !== '') {
          const resultReady = stdout.indexOf('RESULT_READY=yes') >= 0
          const resultCode = (stdout.match(/RESULT_EXIT_CODE=(-?\d+)/) || [])[1]
          if (resultReady && resultCode !== undefined) {
            const code = Number(resultCode)
            return {
              status: code === 0 ? TASK_STATUS.SUCCESS : TASK_STATUS.FAILED,
              message: code === 0 ? '任务完成' : '任务以退出码 ' + String(code) + ' 结束',
              exitCode: code
            }
          }
        }
  
        // Default: if transport is OK but no clear status, check running indicators
        if (stdout.indexOf('RUNNING') >= 0 || stdout.indexOf('running') >= 0) {
          return { status: TASK_STATUS.RUNNING, message: '任务正在运行' }
        }
  
        // If we can't determine status, return UNKNOWN with diagnostics
        return {
          status: TASK_STATUS.UNKNOWN,
          message: '无法确定任务状态',
          diagnostic: {
            stdout: stdout.slice(0, 500),
            stderr: stderr.slice(0, 500)
          }
        }
      }
  
      function buildTaskPollCommand(task) {
        const lines = []
        lines.push('set -e')
        // Check PID
        if (task.pidFile !== '') {
          lines.push('if [ -f "' + task.pidFile.replace(/"/g, '\\"') + '" ]; then')
          lines.push('  _pid=$(cat "' + task.pidFile.replace(/"/g, '\\"') + '" 2>/dev/null)')
          lines.push('  if [ -n "$_pid" ] && kill -0 "$_pid" 2>/dev/null; then')
          lines.push('    echo "PID_ALIVE=yes"')
          lines.push('    echo "PID=$_pid"')
          lines.push('  else')
          lines.push('    echo "PID_DEAD=yes"')
          lines.push('    echo "PID=$_pid"')
          lines.push('  fi')
          lines.push('else')
          lines.push('  echo "PID_FILE_MISSING=yes"')
          lines.push('fi')
        }
        // Check result file
        if (task.resultFile !== '') {
          lines.push('if [ -f "' + task.resultFile.replace(/"/g, '\\"') + '" ]; then')
          lines.push('  echo "RESULT_READY=yes"')
          lines.push('  _rc=$(grep -oP "exit_code[=:]\\s*\\K\\d+" "' + task.resultFile.replace(/"/g, '\\"') + '" 2>/dev/null || echo "")')
          lines.push('  if [ -n "$_rc" ]; then echo "RESULT_EXIT_CODE=$_rc"; fi')
          lines.push('else')
          lines.push('  echo "RESULT_READY=no"')
          lines.push('fi')
        }
        // Check log tail
        if (task.logFile !== '') {
          lines.push('if [ -f "' + task.logFile.replace(/"/g, '\\"') + '" ]; then')
          lines.push('  echo "---LOG_TAIL---"')
          lines.push('  tail -20 "' + task.logFile.replace(/"/g, '\\"') + '" 2>/dev/null || true')
          lines.push('  echo "---END_LOG_TAIL---"')
          lines.push('fi')
        }
        return lines.join('\n')
      }
  
      async function pollTask(task) {
        const now = Date.now()
        const elapsed = now - new Date(task.startedAt).getTime()
  
        // Check hard timeout
        if (task.hardTimeoutMs > 0 && elapsed >= task.hardTimeoutMs) {
          task.status = TASK_STATUS.TIMEOUT
          task.completedAt = new Date().toISOString()
          task.message = '任务超过硬超时时间（' + String(Math.floor(task.hardTimeoutMs / 1000)) + ' 秒），已强制终止'
          return taskSummary(task)
        }
  
        // Check soft timeout
        if (task.softTimeoutMs > 0 && elapsed >= task.softTimeoutMs && task.status === TASK_STATUS.RUNNING) {
          task.status = TASK_STATUS.RUNNING
          task.message = '任务运行时间超过预期（' + String(Math.floor(task.softTimeoutMs / 1000)) + ' 秒），仍在执行中'
        }
  
        const session = sessions.get(task.sessionId)
        if (session === undefined) {
          task.status = TASK_STATUS.UNKNOWN
          task.message = '关联的 SSH 会话已不存在'
          return taskSummary(task)
        }
  
        const pollCmd = buildTaskPollCommand(task)
        const result = await executeRemoteCommand(session, pollCmd, 15000, undefined)
  
        task.lastPollAt = new Date().toISOString()
  
        if (result.transport === 'failed') {
          task.status = TASK_STATUS.UNKNOWN
          task.message = 'SSH 传输失败，无法探测任务状态：' + (result.error || '')
          return taskSummary(task)
        }
  
        const classified = classifyTaskStatus(result, task)
        const prevStatus = task.status
  
        if (classified.status === TASK_STATUS.SUCCESS || classified.status === TASK_STATUS.FAILED) {
          task.status = classified.status
          task.completedAt = new Date().toISOString()
          task.exitCode = classified.exitCode !== undefined ? classified.exitCode : null
          task.message = classified.message
          task.resultData = classified.resultData || null
        } else if (classified.status === TASK_STATUS.RUNNING) {
          task.status = TASK_STATUS.RUNNING
          task.pidAlive = true
          task.message = classified.message
        } else if (classified.status === TASK_STATUS.UNKNOWN) {
          if (prevStatus === TASK_STATUS.RUNNING || prevStatus === TASK_STATUS.PENDING) {
            task.status = TASK_STATUS.RUNNING
            task.message = '任务状态未知，但 SSH 连接正常，假设仍在运行'
          } else {
            task.status = TASK_STATUS.UNKNOWN
            task.message = classified.message
          }
        }
  
        // Extract log tail if present
        const logMatch = result.stdout.match(/---LOG_TAIL---\n([\s\S]*?)\n---END_LOG_TAIL---/)
        if (logMatch !== null) task.logTail = logMatch[1].slice(0, 2000)
  
        return taskSummary(task)
      }
  
      // ── Task dashboard handlers ────────────────────────────────────────────
  
      harness.handle('dashboard.tasks', (sessionId) => {
        const result = []
        for (const task of tasks.values()) {
          if (sessionId !== undefined && task.sessionId !== sessionId) continue
          result.push(taskSummary(task))
        }
        result.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
        return result
      })
  
      harness.handle('dashboard.downloadTask', (taskId) => {
        const id = normalizeTaskId(taskId)
        const task = tasks.get(id)
        if (task === undefined) throw new Error('未找到任务：' + id)
        const lines = []
        lines.push('# SSH 任务记录')
        lines.push(taskDiagnostic(task))
        lines.push('')
        lines.push('## 启动命令')
        lines.push(task.command)
        lines.push('')
        if (task.logTail !== null) {
          lines.push('## 日志尾部')
          lines.push(task.logTail)
        }
        if (task.resultData !== null) {
          lines.push('## 结果数据')
          lines.push(JSON.stringify(task.resultData, null, 2))
        }
        return { text: lines.join('\n'), filename: 'ssh-task-' + task.taskId + '.txt' }
      })
  
      harness.handle('dashboard.downloadSession', (sessionId) => {
        const id = normalizeSessionId(sessionId)
        const session = sessions.get(id)
        if (session === undefined) throw new Error('未找到 SSH 会话：' + id)
        const lines = []
        lines.push('# SSH 会话：' + session.id)
        lines.push('# 目标：' + targetOf(session) + (session.port !== null ? ':' + String(session.port) : ''))
        lines.push('# 状态：' + session.status)
        lines.push('# 命令总数：' + String(session.commandCount) + ' | 成功：' + String(session.validCount) + ' | 失败：' + String(session.invalidCount))
        lines.push('# 导出时间：' + new Date().toISOString())
        lines.push('')
        const all = session.commands.slice().reverse()
        for (let i = 0; i < all.length; i += 1) {
          const cmd = all[i]
          lines.push('--- 命令 ' + String(i + 1) + ' / ' + String(all.length) + ' ---')
          lines.push('时间：' + cmd.startedAt)
          lines.push('耗时：' + String(cmd.durationMs) + ' ms')
          lines.push('结果：' + (cmd.valid ? '成功' : '失败') + ' | 退出码：' + (cmd.exitCode === null ? 'N/A' : String(cmd.exitCode)))
          if (cmd.failure) lines.push('错误：' + cmd.failure.label + ' - ' + cmd.failure.message)
          lines.push('')
          lines.push('>>> AGENT 输入 >>>')
          lines.push(cmd.command)
          lines.push('')
          if (cmd.stdout) {
            lines.push('<<< STDOUT <<<')
            lines.push(cmd.stdout)
            lines.push('')
          }
          if (cmd.stderr) {
            lines.push('<<< STDERR <<<')
            lines.push(cmd.stderr)
            lines.push('')
          }
        }
        return { text: lines.join('\n'), filename: 'ssh-session-' + session.id + '-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.txt' }
      })
  
      harness.registerTool(ctx, harness.defineTool({
        name: 'ssh_session_open',
        description: '【推荐使用】为 Agent 创建或重新打开一个逻辑 SSH 会话。所有远程操作请优先通过此工具和 ssh_bash 完成，这样可以在看板中实时查看输入输出。打开后状态为 ready；首次命令将验证连接。相同名称始终对应看板中的同一个会话框。',
        parameters: {
          session: { type: 'string', required: true, description: '稳定且可读的逻辑会话名称。' },
          host: { type: 'string', required: true, description: '远程主机、IP 地址或 OpenSSH Config 别名。' },
          user: { type: 'string', description: 'SSH 用户名；使用 OpenSSH Config 时可省略。' },
          port: { type: 'integer', description: 'SSH 端口；省略时使用配置或默认端口。' },
          identity_file: { type: 'string', description: '本地私钥完整路径；省略时使用 SSH Agent 或 OpenSSH Config。不会展示在看板中。' },
          host_key_policy: { type: 'string', enum: ['strict', 'accept-new'], description: '主机密钥策略，默认 accept-new。' },
          connect_timeout_sec: { type: 'integer', description: '连接超时，3 到 60 秒；默认 10。' }
        },
        output: { schema: { type: 'object', additionalProperties: true }, render(_args, value) { return [{ type: 'text', text: JSON.stringify(value, null, 2) }] } },
        async execute(args) { return openSession(args) }
      }))
  
      harness.registerTool(ctx, harness.defineTool({
        name: 'ssh_sessions',
        description: '列出逻辑 SSH 会话的连接状态和命令统计。status 只表示连接生命周期；命令失败通过 validCount、invalidCount 和 latestCommandFailure 单独表示。',
        parameters: {},
        output: { schema: { type: 'object', additionalProperties: true }, render(_args, value) { return [{ type: 'text', text: JSON.stringify(value, null, 2) }] } },
        async execute() {
          const view = dashboardSnapshot()
          return { sessions: view.sessions.map((session) => ({
            id: session.id,
            target: session.target,
            port: session.port,
            authMode: session.authMode,
            status: session.status,
            connectionFailure: session.connectionFailure,
            lastCommandStatus: session.lastCommandStatus,
            commandCount: session.commandCount,
            validCount: session.validCount,
            invalidCount: session.invalidCount,
            latestCommandFailure: session.latestCommandFailure,
            lastActivityAt: session.lastActivityAt
          })) }
        }
      }))
  
      harness.registerTool(ctx, harness.defineTool({
        name: 'ssh_session_close',
        description: '正常断开一个逻辑 SSH 会话。看板状态变为 closed，已有命令记录和成功/失败统计继续保留。',
        parameters: { session: { type: 'string', required: true, description: '要正常断开的精确会话名称。' } },
        output: { schema: { type: 'object', additionalProperties: true }, render(_args, value) { return [{ type: 'text', text: JSON.stringify(value, null, 2) }] } },
        async execute(args) { return closeSession(args.session) }
      }))
  
      harness.registerTool(ctx, harness.defineTool({
        name: 'ssh_bash',
        description: '【推荐使用】在逻辑 SSH 会话中执行远端 Bash，这是执行远程命令的首选方式。命令执行过程中输出会实时流式显示在看板中，并支持一键下载全部输入输出。命令失败只影响该命令记录；只有明确的 SSH 认证、网络、主机密钥或异常传输故障才把会话状态设为 error。超时时 exitCode 为 null，processExitCode 单独记录本地 SSH 进程结果。',
        parameters: {
          session: { type: 'string', required: true, description: '精确逻辑会话名称。' },
          command: { type: 'string', required: true, description: '交给远端 bash -s 执行的 Bash 命令或多行脚本。' },
          timeout_ms: { type: 'integer', description: '执行超时，1000 到 120000 毫秒；默认 30000。' }
        },
        output: { schema: { type: 'object', additionalProperties: true }, render(_args, value) { return [{ type: 'text', text: JSON.stringify(value, null, 2) }] } },
        timeoutMs: 125000,
        async execute(args, exec) { return runRemote(args.session, args.command, args.timeout_ms, exec.signal) }
      }))
  
      // ── Task tools ────────────────────────────────────────────────────────
  
      harness.registerTool(ctx, harness.defineTool({
        name: 'ssh_task_start',
        description: '【异步任务】在 SSH 会话中启动一个后台长时间任务，返回 task_id 用于后续轮询。插件会跟踪 PID、结果文件和超时，区分"任务仍在运行"与"任务失败"。启动命令必须包含 nohup + & 并写入 PID 文件。例如：nohup bash script.sh > log.txt 2>&1 & echo $! > /tmp/task.pid',
        parameters: {
          session: { type: 'string', required: true, description: 'SSH 会话名称。' },
          task_id: { type: 'string', required: true, description: '唯一任务标识符，用于后续轮询和停止。' },
          command: { type: 'string', required: true, description: '启动后台任务的完整 Bash 命令，必须后台运行（&）并记录 PID。' },
          pid_file: { type: 'string', description: 'PID 文件路径，用于跟踪进程状态。' },
          result_file: { type: 'string', description: '结果文件路径，用于判断任务是否完成。' },
          log_file: { type: 'string', description: '日志文件路径，用于采集诊断信息。' },
          soft_timeout_ms: { type: 'integer', description: '软超时（毫秒），超过后标记为运行超预期但不终止。' },
          hard_timeout_ms: { type: 'integer', description: '硬超时（毫秒），超过后标记为 TIMEOUT。默认 900000（15 分钟）。' },
          poll_interval_ms: { type: 'integer', description: '建议轮询间隔（毫秒），默认 30000。' }
        },
        output: { schema: { type: 'object', additionalProperties: true }, render(_args, value) { return [{ type: 'text', text: JSON.stringify(value, null, 2) }] } },
        async execute(args) {
          const sessionId = normalizeSessionId(args.session)
          const session = sessions.get(sessionId)
          if (session === undefined) throw new Error('未找到 SSH 会话：' + sessionId + '。请先调用 ssh_session_open。')
          if (session.status === 'closed') throw new Error('SSH 会话已正常断开：' + sessionId)
          const taskId = normalizeTaskId(args.task_id)
          if (tasks.has(taskId)) throw new Error('任务 ID 已存在：' + taskId)
          const command = normalizeCommand(args.command)
          const pidFile = optionalText(args.pid_file, 'PID 文件路径', 1024)
          const resultFile = optionalText(args.result_file, '结果文件路径', 1024)
          const logFile = optionalText(args.log_file, '日志文件路径', 1024)
          const softTimeoutMs = args.soft_timeout_ms !== undefined ? Number(args.soft_timeout_ms) : 0
          const hardTimeoutMs = args.hard_timeout_ms !== undefined ? Number(args.hard_timeout_ms) : 900000
          const pollIntervalMs = args.poll_interval_ms !== undefined ? Number(args.poll_interval_ms) : 30000
          if (hardTimeoutMs < 1000 || hardTimeoutMs > 3600000) throw new Error('硬超时必须是 1000 到 3600000 毫秒')
          if (softTimeoutMs > 0 && softTimeoutMs < 1000) throw new Error('软超时不能小于 1000 毫秒')
          if (pollIntervalMs < 1000 || pollIntervalMs > 300000) throw new Error('轮询间隔必须是 1000 到 300000 毫秒')
          const result = await runRemote(sessionId, command, 30000, undefined)
          if (!result.valid) {
            return { taskId, status: TASK_STATUS.FAILED, message: '任务启动失败：' + (result.error || '未知错误'), transport: 'ok' }
          }
          const now = new Date().toISOString()
          const task = {
            taskId, sessionId, command, pidFile, resultFile, logFile,
            status: TASK_STATUS.PENDING, pid: null, pidAlive: false, resultReady: false,
            startedAt: now, completedAt: null, exitCode: null,
            softTimeoutMs, hardTimeoutMs, pollIntervalMs, lastPollAt: null,
            message: '任务已启动，等待首次状态检查', resultData: null, logTail: null
          }
          tasks.set(taskId, task)
          return taskSummary(task)
        }
      }))
  
      harness.registerTool(ctx, harness.defineTool({
        name: 'ssh_task_status',
        description: '【异步任务】轮询 SSH 任务状态。插件自动检查 PID 存活、结果文件、日志尾部，返回结构化状态。区分 transport=failed（SSH 连接失败）和 taskStatus=running（任务正常运行中）。不要因为探测命令返回非零退出码就认为任务失败——文件暂不存在不等于任务失败。',
        parameters: {
          session: { type: 'string', required: true, description: 'SSH 会话名称。' },
          task_id: { type: 'string', required: true, description: '任务标识符。' }
        },
        output: { schema: { type: 'object', additionalProperties: true }, render(_args, value) { return [{ type: 'text', text: JSON.stringify(value, null, 2) }] } },
        async execute(args) {
          const sessionId = normalizeSessionId(args.session)
          const session = sessions.get(sessionId)
          if (session === undefined) throw new Error('未找到 SSH 会话：' + sessionId)
          const taskId = normalizeTaskId(args.task_id)
          const task = tasks.get(taskId)
          if (task === undefined) throw new Error('未找到任务：' + taskId + '。请先调用 ssh_task_start。')
          if (task.sessionId !== sessionId) throw new Error('任务不属于此会话')
          if (task.status === TASK_STATUS.SUCCESS || task.status === TASK_STATUS.FAILED || task.status === TASK_STATUS.TIMEOUT || task.status === TASK_STATUS.CANCELLED) {
            return taskSummary(task)
          }
          return pollTask(task)
        }
      }))
  
      harness.registerTool(ctx, harness.defineTool({
        name: 'ssh_task_stop',
        description: '【异步任务】停止 SSH 后台任务。先尝试 SIGTERM 优雅终止，等待 3 秒后若无响应则使用 SIGKILL。只终止指定 task_id 对应的 PID，不会误杀其他实验。终止后记录原因和 PID。',
        parameters: {
          session: { type: 'string', required: true, description: 'SSH 会话名称。' },
          task_id: { type: 'string', required: true, description: '任务标识符。' },
          force: { type: 'boolean', description: '跳过 SIGTERM 直接使用 SIGKILL。默认 false。' }
        },
        output: { schema: { type: 'object', additionalProperties: true }, render(_args, value) { return [{ type: 'text', text: JSON.stringify(value, null, 2) }] } },
        async execute(args) {
          const sessionId = normalizeSessionId(args.session)
          const session = sessions.get(sessionId)
          if (session === undefined) throw new Error('未找到 SSH 会话：' + sessionId)
          const taskId = normalizeTaskId(args.task_id)
          const task = tasks.get(taskId)
          if (task === undefined) throw new Error('未找到任务：' + taskId)
          if (task.sessionId !== sessionId) throw new Error('任务不属于此会话')
          if (task.status === TASK_STATUS.SUCCESS || task.status === TASK_STATUS.FAILED || task.status === TASK_STATUS.TIMEOUT || task.status === TASK_STATUS.CANCELLED) {
            return { taskId, status: task.status, message: '任务已处于终态，无需停止', stopped: false }
          }
          const force = args.force === true
          let stopCmd = ''
          if (task.pidFile !== '') {
            const escaped = task.pidFile.replace(/"/g, '\\"')
            if (force) {
              stopCmd = 'PIDFILE="' + escaped + '"; if [ -f "$PIDFILE" ]; then PID=$(cat "$PIDFILE"); kill -9 "$PID" 2>/dev/null; rm -f "$PIDFILE"; echo "KILLED_PID=$PID"; else echo "NO_PID_FILE"; fi'
            } else {
              stopCmd = 'PIDFILE="' + escaped + '"; if [ -f "$PIDFILE" ]; then PID=$(cat "$PIDFILE"); kill -15 "$PID" 2>/dev/null; sleep 3; kill -0 "$PID" 2>/dev/null && kill -9 "$PID" 2>/dev/null; rm -f "$PIDFILE"; echo "KILLED_PID=$PID"; else echo "NO_PID_FILE"; fi'
            }
          } else {
            stopCmd = 'echo "NO_PID_FILE"'
          }
          const result = await runRemote(sessionId, stopCmd, 15000, undefined)
          task.status = TASK_STATUS.CANCELLED
          task.completedAt = new Date().toISOString()
          task.message = '任务已被 Agent 取消'
          return { taskId, status: TASK_STATUS.CANCELLED, message: '任务已停止', stopped: true, stopOutput: result.stdout || '', stopError: result.error || null }
        }
      }))
  
      harness.registerTool(ctx, harness.defineTool({
        name: 'ssh_task_list',
        description: '列出所有 SSH 异步任务及其状态。可按会话过滤。',
        parameters: { session: { type: 'string', description: '可选的会话名称过滤。' } },
        output: { schema: { type: 'object', additionalProperties: true }, render(_args, value) { return [{ type: 'text', text: JSON.stringify(value, null, 2) }] } },
        async execute(args) {
          const sessionId = args.session !== undefined ? normalizeSessionId(args.session) : undefined
          const result = []
          for (const task of tasks.values()) {
            if (sessionId !== undefined && task.sessionId !== sessionId) continue
            result.push(taskSummary(task))
          }
          result.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
          return { tasks: result, count: result.length }
        }
      }))
    }
  }
}

const plugin = createPlugin({})
export const name = plugin.name
export const inject = [...new Set([...plugin.inject, 'webServer'])]

function registerRoute(ctx, path, handler, label) {
  return ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path,
    async handler(req, res) {
      if (req.method !== 'GET') {
        res.writeHead(405)
        res.end()
        return
      }
      try {
        const value = await handler()
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(value))
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
      }
    },
  }), label)
}

function registerArgRoute(ctx, path, handler, label) {
  return ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path,
    async handler(req, res) {
      if (req.method !== 'GET') {
        res.writeHead(405)
        res.end()
        return
      }
      try {
        const url = new URL(req.url, 'http://localhost')
        const arg = url.searchParams.get('id') || url.searchParams.get('session') || url.searchParams.get('task') || undefined
        const value = await handler(arg)
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(value))
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
      }
    },
  }), label)
}

export function apply(ctx) {
  const harness = {
    defineTool,
    registerTool(_context, tool) {
      return ctx.effect(() => ctx.tools.register(tool), 'dsh-agent-ssh-dashboard: tool ' + tool.name)
    },
    handle(key, handler) {
      if (key === 'dashboard.state') return registerRoute(ctx, DASHBOARD_STATE_PATH, () => handler({}), 'dsh-agent-ssh-dashboard: state')
      if (key === 'dashboard.tasks') return registerArgRoute(ctx, DASHBOARD_TASKS_PATH, (arg) => handler(arg), 'dsh-agent-ssh-dashboard: tasks')
      if (key === 'dashboard.downloadSession') return registerArgRoute(ctx, DASHBOARD_DOWNLOAD_SESSION_PATH, (arg) => handler(arg), 'dsh-agent-ssh-dashboard: downloadSession')
      if (key === 'dashboard.downloadTask') return registerArgRoute(ctx, DASHBOARD_DOWNLOAD_TASK_PATH, (arg) => handler(arg), 'dsh-agent-ssh-dashboard: downloadTask')
      throw new Error('unsupported dashboard handler: ' + key)
    },
  }
  return createPlugin(harness).apply(ctx)
}
