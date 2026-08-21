return {
  name: 'agent-ssh-connection-health-host',
  inject: ['tools', 'subprocess', 'shell', 'timer'],
  apply(ctx) {
    const sessions = new Map()
    const activeProcesses = new Set()
    const localCwd = ctx.shell.resolve({ command: 'ssh' }).workdir
    let nextCommandId = 0
    let sshExecutable = null

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
      if (includeCommands) summary.commands = session.commands.slice(0, 30)
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
      return { sessions: values, counts: { total: values.length, active: activeCount, running: runningCount, connectionErrors, valid: validCount, invalid: invalidCount } }
    }

    ctx.effect(() => () => {
      for (const handle of activeProcesses) handle.terminate()
      activeProcesses.clear()
    }, 'agent ssh process cleanup')

    harness.handle('dashboard.state', () => dashboardSnapshot())

    harness.registerTool(ctx, harness.defineTool({
      name: 'ssh_session_open',
      description: '为 Agent 创建或重新打开一个逻辑 SSH 会话。打开后状态为 ready；首次命令将验证连接。相同名称始终对应看板中的同一个会话框。',
      parameters: {
        session: { type: 'string', required: true, description: '稳定且可读的逻辑会话名称。' },
        host: { type: 'string', required: true, description: '远程主机、IP 地址或 OpenSSH Config 别名。' },
        user: { type: 'string', description: 'SSH 用户名；使用 OpenSSH Config 时可省略。' },
        port: { type: 'integer', description: 'SSH 端口；省略时使用配置或默认端口。' },
        identity_file: { type: 'string', description: '本地私钥完整路径；省略时使用 SSH Agent 或 OpenSSH Config。不会展示在看板中。' },
        host_key_policy: { type: 'string', enum: ['strict', 'accept-new'], description: '主机密钥策略，默认 accept-new。' },
        connect_timeout_sec: { type: 'integer', description: '连接超时，3 到 60 秒；默认 10。' }
      },
      output: { schema: { type: 'json' }, render(_args, value) { return [{ type: 'text', text: JSON.stringify(value, null, 2) }] } },
      async execute(args) { return openSession(args) }
    }))

    harness.registerTool(ctx, harness.defineTool({
      name: 'ssh_sessions',
      description: '列出逻辑 SSH 会话的连接状态和命令统计。status 只表示连接生命周期；命令失败通过 validCount、invalidCount 和 latestCommandFailure 单独表示。',
      parameters: {},
      output: { schema: { type: 'json' }, render(_args, value) { return [{ type: 'text', text: JSON.stringify(value, null, 2) }] } },
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
      output: { schema: { type: 'json' }, render(_args, value) { return [{ type: 'text', text: JSON.stringify(value, null, 2) }] } },
      async execute(args) { return closeSession(args.session) }
    }))

    harness.registerTool(ctx, harness.defineTool({
      name: 'ssh_bash',
      description: '在逻辑 SSH 会话中执行远端 Bash。命令失败只影响该命令记录；只有明确的 SSH 认证、网络、主机密钥或异常传输故障才把会话状态设为 error。超时时 exitCode 为 null，processExitCode 单独记录本地 SSH 进程结果。',
      parameters: {
        session: { type: 'string', required: true, description: '精确逻辑会话名称。' },
        command: { type: 'string', required: true, description: '交给远端 bash -s 执行的 Bash 命令或多行脚本。' },
        timeout_ms: { type: 'integer', description: '执行超时，1000 到 120000 毫秒；默认 30000。' }
      },
      output: { schema: { type: 'json' }, render(_args, value) { return [{ type: 'text', text: JSON.stringify(value, null, 2) }] } },
      timeoutMs: 125000,
      async execute(args, exec) { return runRemote(args.session, args.command, args.timeout_ms, exec.signal) }
    }))
  }
}
