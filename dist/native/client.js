window.__ModuleLoader__.load({
  id: 'dsh-agent-ssh-dashboard',
  factory: function (require) {
    var module = { exports: {} }
    var React = require('react')
    var styles = {
      insert: function (css) {
        var element = document.createElement('style')
        element.setAttribute('data-dsh-agent-ssh-dashboard', '')
        element.textContent = css
        document.head.appendChild(element)
        return function () { element.remove() }
      },
    }
    var host = {
      call: async function (name) {
        if (name !== 'dashboard.state') throw new Error('unsupported dashboard call: ' + name)
        var response = await fetch('/dsh-agent-ssh-dashboard/api/state', { cache: 'no-store' })
        var value = await response.json()
        if (!response.ok) throw new Error(value && value.error ? value.error : 'dashboard request failed')
        return value
      },
    }
    function createPlugin() {
      return {
        name: 'agent-ssh-connection-health-client',
        inject: ['timer'],
        apply(ctx) {
          const slots = ctx.get('slots')
          if (slots === undefined) return
          const h = React.createElement
          let overlayOpen = true
          const overlayListeners = new Set()
      
          function setOverlayOpen(next) {
            overlayOpen = next
            for (const listener of overlayListeners) listener(next)
          }
      
          function useOverlayOpen() {
            const [open, setOpen] = React.useState(overlayOpen)
            React.useEffect(() => {
              overlayListeners.add(setOpen)
              return () => overlayListeners.delete(setOpen)
            }, [])
            return open
          }
      
          ctx.effect(() => styles.insert(`
            /* ── Codex Light Aesthetic ──────────────────────────────────── */
            .cx-root,.cx-tool{box-sizing:border-box;color:#24292f;font-family:'SF Mono','JetBrains Mono','Cascadia Code','Consolas',monospace;letter-spacing:-0.01em}
            .cx-root *,.cx-tool *{box-sizing:border-box;font-family:inherit}
            .cx-root{width:100%;max-width:1200px;margin:0 auto;padding:20px;font-size:12px;line-height:1.5}
      
            /* Overlay */
            .cx-overlay{position:fixed;inset:0;z-index:1300;display:grid;place-items:center;padding:16px;background:rgba(140,150,165,.35);backdrop-filter:blur(4px);pointer-events:auto}
            .cx-dialog{position:relative;width:min(1240px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:#fff;border:1px solid #d0d7de;border-radius:8px;box-shadow:0 1px 0 rgba(27,31,36,.04),0 8px 24px rgba(140,149,159,.2)}
            .cx-close{position:sticky;z-index:4;top:10px;float:right;width:28px;height:28px;margin:8px 8px -36px 0;padding:0;color:#656d76;background:#f6f8fa;border:1px solid #d0d7de;border-radius:4px;font-size:15px;line-height:1;cursor:pointer;font-family:inherit}
            .cx-close:hover{color:#cf222e;border-color:#cf222e;background:#fff}
      
            /* Header */
            .cx-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;min-height:52px;padding:0 40px 14px 0;border-bottom:1px solid #d0d7de}
            .cx-title-row{display:flex;align-items:flex-start;gap:10px;min-width:0}
            .cx-title{margin:0;font-size:14px;font-weight:600;color:#1f2328;line-height:1.3}
            .cx-sub,.cx-target{margin-top:4px;color:#656d76;font-size:11px}
            .cx-back{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;color:#656d76;background:#f6f8fa;border:1px solid #d0d7de;border-radius:4px;font-size:13px;cursor:pointer;flex:0 0 auto}
            .cx-back:hover{color:#0969da;border-color:#0969da;background:#fff}
      
            /* Toolbar */
            .cx-toolbar,.cx-detail-summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0}
            .cx-detail-summary{border-bottom:1px solid #d0d7de}
      
            /* Badges */
            .cx-badge{display:inline-flex;align-items:center;min-height:22px;padding:2px 7px;color:#656d76;background:#f6f8fa;border:1px solid #d0d7de;border-radius:3px;font-size:10px;font-weight:600;white-space:nowrap;text-transform:uppercase;letter-spacing:.03em}
            .cx-badge[data-state='healthy'],.cx-badge[data-state='valid'],.cx-badge[data-state='success']{color:#1a7f37;border-color:#b3e0c0;background:#dafbe1}
            .cx-badge[data-state='error'],.cx-badge[data-state='invalid'],.cx-badge[data-state='failed']{color:#cf222e;border-color:#f7b3b8;background:#ffebe9}
            .cx-badge[data-state='running']{color:#9a6700;border-color:#e5cc90;background:#fff8c5}
            .cx-badge[data-state='closed'],.cx-badge[data-state='ready']{color:#656d76;background:#f6f8fa;border-color:#d0d7de}
      
            /* Segments */
            .cx-segments{display:inline-flex;overflow:hidden;border:1px solid #d0d7de;border-radius:4px}
            .cx-segments button{min-height:28px;padding:3px 10px;color:#656d76;background:transparent;border:0;border-right:1px solid #d0d7de;font:inherit;font-size:11px;cursor:pointer}
            .cx-segments button:last-child{border-right:0}
            .cx-segments button[data-active='true']{color:#1f2328;background:#eaeef2;font-weight:600}
      
            /* Buttons */
            .cx-btn,.cx-open-btn,.cx-dl-btn{display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:3px 10px;color:#24292f;background:#f6f8fa;border:1px solid #d0d7de;border-radius:4px;font:inherit;font-size:11px;cursor:pointer;gap:5px;transition:all .15s}
            .cx-btn:hover,.cx-open-btn:hover,.cx-dl-btn:hover{background:#eaeef2;border-color:#8c959f}
            .cx-dl-btn{color:#1a7f37;border-color:#b3e0c0}
            .cx-dl-btn:hover{color:#1a7f37;border-color:#1a7f37;background:#dafbe1}
            .cx-open-btn{font-weight:600;color:#0969da;border-color:#b6d9fc}
            .cx-open-btn:hover{color:#0969da;border-color:#0969da;background:#ddf4ff}
      
            /* Session Grid */
            .cx-session-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:stretch}
            .cx-session-card{display:flex;min-width:0;min-height:130px;flex-direction:column;justify-content:space-between;padding:14px;color:inherit;background:#fff;border:1px solid #d0d7de;border-radius:6px;font:inherit;text-align:left;cursor:pointer;transition:all .15s;position:relative;overflow:hidden}
            .cx-session-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:#d0d7de;border-radius:0 3px 3px 0}
            .cx-session-card:hover{border-color:#8c959f;box-shadow:0 1px 3px rgba(140,149,159,.15)}
            .cx-session-card[data-state='healthy']::before{background:#1a7f37}
            .cx-session-card[data-state='error']::before{background:#cf222e}
            .cx-session-card[data-state='running']::before{background:#9a6700}
            .cx-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
            .cx-session-name{min-width:0;font-size:13px;font-weight:600;color:#1f2328}
            .cx-card-stats{margin-top:14px;color:#656d76;font-size:10px}
            .cx-latest{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid #eaeef2}
            .cx-latest-text{min-width:0;overflow:hidden;color:#656d76;font-size:10px;text-overflow:ellipsis;white-space:nowrap}
            .cx-enter{flex:0 0 auto;color:#8c959f;font-size:16px}
      
            /* Connection Alert */
            .cx-connection-alert{margin:10px 0 0;padding:8px 10px;color:#cf222e;background:#ffebe9;border:1px solid #f7b3b8;border-radius:4px;font-size:10px}
      
            /* Dialogue Turns */
            .cx-turn{padding:16px 0;border-bottom:1px solid #eaeef2}
            .cx-turn:last-child{border-bottom:0}
            .cx-turn-index{color:#656d76;font-size:10px;font-weight:600}
            .cx-turn-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
      
            /* Messages */
            .cx-message{width:min(92%,900px);padding:10px 12px;border-radius:6px;font-size:11px}
            .cx-message[data-role='agent']{margin-left:auto;background:#f0f7ff;border:1px solid #b6d9fc}
            .cx-message[data-role='remote']{margin-right:auto;background:#f6f8fa;border:1px solid #d0d7de}
            .cx-message[data-error='true']{border-color:#f7b3b8;background:#ffebe9}
            .cx-role{margin-bottom:6px;color:#656d76;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
            .cx-turn-arrow{padding:8px 0;color:#8c959f;text-align:center;font-size:13px}
            .cx-command,.cx-stream{margin:0;color:#1f2328;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
            .cx-stream{max-height:260px;overflow:auto;background:#f6f8fa;padding:8px;border-radius:4px;border:1px solid #eaeef2}
            .cx-stream-label{margin:8px 0 4px;color:#656d76;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
            .cx-failure{margin-bottom:8px;padding:8px;color:#cf222e;background:#ffebe9;border:1px solid #f7b3b8;border-radius:4px}
            .cx-failure-title{font-size:10px;font-weight:700}
            .cx-failure-message{margin-top:3px;font-size:10px;line-height:1.4;color:#cf222e;opacity:.85}
            .cx-meta{margin-top:8px;color:#8c959f;font-size:9px;display:flex;align-items:center;flex-wrap:wrap;gap:6px}
      
            /* Empty / Error */
            .cx-empty{padding:48px 12px;color:#8c959f;border-top:1px solid #eaeef2;border-bottom:1px solid #eaeef2;text-align:center;font-size:11px}
            .cx-error-banner{margin-bottom:10px;padding:8px 10px;color:#cf222e;background:#ffebe9;border:1px solid #f7b3b8;border-radius:4px;font-size:10px}
      
            /* Tool Cards */
            .cx-tool{margin:4px 0;overflow:hidden;background:#fff;border:1px solid #d0d7de;border-radius:6px}
            .cx-tool[data-state='valid']{border-color:#b3e0c0}
            .cx-tool[data-state='invalid']{border-color:#f7b3b8}
            .cx-tool[data-state='running']{border-color:#e5cc90}
            .cx-tool-head{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:40px;gap:8px;padding:8px 10px;color:inherit;background:transparent;border:0;font:inherit;text-align:left;cursor:pointer}
            .cx-tool-body{padding:10px;border-top:1px solid #eaeef2}
            .cx-stage{min-width:0;max-width:160px;padding:2px 6px;color:#656d76;background:#f6f8fa;border:1px solid #eaeef2;border-radius:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}
            .cx-arrow{color:#8c959f;font-size:11px}
            .cx-flow{display:flex;align-items:center;flex-wrap:wrap;gap:5px}
      
            /* Task Cards */
            .cx-task-card{margin:6px 0;padding:10px 12px;background:#fff;border:1px solid #d0d7de;border-radius:6px;position:relative;overflow:hidden}
            .cx-task-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:#d0d7de;border-radius:0 3px 3px 0}
            .cx-task-card[data-state='running']::before{background:#9a6700}
            .cx-task-card[data-state='success']::before{background:#1a7f37}
            .cx-task-card[data-state='failed']::before,.cx-task-card[data-state='timeout']::before{background:#cf222e}
            .cx-task-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
            .cx-task-name{font-size:12px;font-weight:600;color:#1f2328}
            .cx-task-meta{margin-top:6px;color:#656d76;font-size:10px;display:flex;flex-wrap:wrap;gap:8px}
            .cx-task-message{margin-top:6px;padding:6px 8px;background:#f6f8fa;border:1px solid #eaeef2;border-radius:4px;font-size:10px;line-height:1.4;color:#656d76}
      
            /* Streaming Pulse */
            .cx-pulse{display:inline-block;width:7px;height:7px;margin-right:5px;background:#9a6700;border-radius:50%;animation:cx-pulse 1.2s ease-in-out infinite;vertical-align:middle}
            @keyframes cx-pulse{0%,100%{opacity:1}50%{opacity:.35}}
      
            /* Inline / Counts */
            .cx-inline,.cx-counts{display:flex;align-items:center;flex-wrap:wrap;gap:6px}
      
            /* Section Titles */
            .cx-section-title{margin:18px 0 6px;font-size:12px;font-weight:600;color:#656d76;text-transform:uppercase;letter-spacing:.05em}
      
            /* Responsive */
            @media(max-width:840px){.cx-overlay{padding:0}.cx-dialog{width:100vw;min-height:100vh;max-height:100vh;border:0;border-radius:0}.cx-root{padding:14px}.cx-header,.cx-toolbar,.cx-detail-summary{align-items:flex-start;flex-direction:column}.cx-session-grid{grid-template-columns:1fr}.cx-message{width:96%}.cx-stage{max-width:120px}}
          `), 'codex ssh styles')
      
          function messageOf(error) {
            if (error && typeof error.message === 'string') return error.message
            return String(error)
          }
      
          function downloadText(filename, text) {
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = filename
            document.body.appendChild(anchor)
            anchor.click()
            document.body.removeChild(anchor)
            URL.revokeObjectURL(url)
          }
      
          function formatCommandDownload(command) {
            const lines = []
            lines.push('SSH Command Record')
            lines.push('──────────────────────────────────────────────')
            lines.push('Time    : ' + command.startedAt)
            lines.push('Duration: ' + String(command.durationMs) + ' ms')
            lines.push('Result  : ' + (command.valid ? 'SUCCESS' : 'FAILED') + ' | exit=' + (command.exitCode === null ? 'N/A' : String(command.exitCode)))
            if (command.failure) lines.push('Error   : ' + command.failure.label + ' - ' + command.failure.message)
            lines.push('──────────────────────────────────────────────')
            lines.push('')
            lines.push('>>> AGENT INPUT >>>')
            lines.push(command.command)
            lines.push('')
            if (command.stdout) {
              lines.push('<<< STDOUT <<<')
              lines.push(command.stdout)
              lines.push('')
            }
            if (command.stderr) {
              lines.push('<<< STDERR <<<')
              lines.push(command.stderr)
              lines.push('')
            }
            return lines.join('\n')
          }
      
          function Badge(props) {
            return h('span', { className: 'cx-badge', 'data-state': props.state }, props.children)
          }
      
          function statusLabel(status) {
            if (status === 'running') return 'RUNNING'
            if (status === 'healthy') return 'CONNECTED'
            if (status === 'error') return 'ERROR'
            if (status === 'closed') return 'CLOSED'
            return 'READY'
          }
      
          function taskStatusLabel(status) {
            if (status === 'pending') return 'PENDING'
            if (status === 'running') return 'RUNNING'
            if (status === 'success') return 'SUCCESS'
            if (status === 'failed') return 'FAILED'
            if (status === 'timeout') return 'TIMEOUT'
            if (status === 'cancelled') return 'CANCELLED'
            return 'UNKNOWN'
          }
      
          function taskStatusColor(status) {
            if (status === 'running') return 'running'
            if (status === 'success') return 'success'
            if (status === 'failed' || status === 'timeout') return 'failed'
            if (status === 'cancelled') return 'closed'
            return 'ready'
          }
      
          function timeText(value) {
            if (!value) return '—'
            try { return new Date(value).toLocaleString() } catch (_error) { return String(value) }
          }
      
          function failureFor(command) {
            if (command && command.failure && typeof command.failure === 'object') return command.failure
            if (command && command.valid === false) return { kind: 'unknown', scope: 'command', label: 'FAILED', message: command.error || 'command did not complete successfully' }
            return null
          }
      
          function Flow(props) {
            const children = []
            for (let index = 0; index < props.stages.length; index += 1) {
              if (index > 0) children.push(h('span', { className: 'cx-arrow', key: 'a' + String(index) }, '▸'))
              children.push(h('span', { className: 'cx-stage', key: 's' + String(index), title: props.stages[index] }, props.stages[index]))
            }
            return h('div', { className: 'cx-flow' }, children)
          }
      
          function RemoteResponse(props) {
            const command = props.command
            const failure = failureFor(command)
            const children = [h('div', { className: 'cx-role', key: 'role' }, 'REMOTE')]
            if (failure !== null) children.push(h('div', { className: 'cx-failure', key: 'failure' }, h('div', { className: 'cx-failure-title' }, failure.label), h('div', { className: 'cx-failure-message' }, failure.message)))
            if (command.stdout) children.push(h('div', { className: 'cx-stream-label', key: 'ol' }, 'stdout' + (command.stdoutTruncated ? ' (truncated)' : '')), h('pre', { className: 'cx-stream', key: 'o' }, command.stdout))
            if (command.stderr) children.push(h('div', { className: 'cx-stream-label', key: 'el' }, 'stderr' + (command.stderrTruncated ? ' (truncated)' : '')), h('pre', { className: 'cx-stream', key: 'e' }, command.stderr))
            if (!command.stdout && !command.stderr && failure === null) children.push(h('div', { className: 'cx-target', key: 'empty' }, '(no output)'))
            return h('div', { className: 'cx-message', 'data-role': 'remote', 'data-error': failure === null ? undefined : 'true' }, children)
          }
      
          function DialogueTurn(props) {
            const command = props.command
            const isStreaming = command._streaming === true
            const failure = isStreaming ? null : failureFor(command)
            const state = isStreaming ? 'running' : (command.valid ? 'valid' : 'invalid')
            const meta = isStreaming ? [h('span', { key: 'running' }, h('span', { className: 'cx-pulse' }), 'streaming…'), h('span', { key: 'duration' }, String(command.durationMs) + 'ms')] : [h('span', { key: 'remote' }, 'exit=' + (command.exitCode === null ? '—' : String(command.exitCode))), h('span', { key: 'duration' }, String(command.durationMs) + 'ms')]
            if (!isStreaming && (command.timedOut || command.aborted || command.signal) && command.processExitCode !== null) meta.push(h('span', { key: 'process' }, 'ssh=' + String(command.processExitCode)))
            if (!isStreaming && command.signal) meta.push(h('span', { key: 'signal' }, String(command.signal)))
            const dlButton = isStreaming ? null : h('button', { className: 'cx-dl-btn', type: 'button', title: 'Download I/O', onClick: (e) => { e.stopPropagation(); downloadText('ssh-cmd-' + command.commandId + '.txt', formatCommandDownload(command)) } }, '↓ DL')
            return h('section', { className: 'cx-turn' },
              h('div', { className: 'cx-turn-head' }, h('div', { className: 'cx-inline' }, h('span', { className: 'cx-turn-index' }, '#' + String(props.index + 1) + ' · ' + timeText(command.startedAt)), h(Badge, { state }, isStreaming ? 'STREAMING' : (command.valid ? 'OK' : (failure ? failure.label : 'FAILED')))), dlButton),
              h('div', { className: 'cx-message', 'data-role': 'agent' }, h('div', { className: 'cx-role' }, 'AGENT'), h('pre', { className: 'cx-command' }, command.command)),
              h('div', { className: 'cx-turn-arrow' }, '↓'),
              h(RemoteResponse, { command }),
              h('div', { className: 'cx-meta' }, meta)
            )
          }
      
          function SessionCard(props) {
            const session = props.session
            const latest = session.commands.length > 0 ? session.commands[0] : null
            const isStreaming = latest !== null && latest._streaming === true
            const latestFailure = latest === null ? null : failureFor(latest)
            let preview = 'no commands executed'
            if (isStreaming) preview = '▸ streaming… ' + (latest.stdout ? latest.stdout.slice(0, 50) : 'waiting for output')
            else if (session.connectionFailure) preview = session.connectionFailure.label
            else if (latest !== null) preview = (latest.valid ? '✓' : '✕') + ' last command ' + (latest.valid ? 'succeeded' : 'failed')
            return h('button', { className: 'cx-session-card', 'data-state': session.status, type: 'button', onClick: props.onOpen },
              h('div', null,
                h('div', { className: 'cx-card-head' }, h('div', null, h('div', { className: 'cx-session-name' }, session.id, isStreaming ? h('span', { className: 'cx-pulse', style: { marginLeft: '6px' } }) : null), h('div', { className: 'cx-target' }, session.target + (session.port === null ? '' : ':' + String(session.port)))), h(Badge, { state: session.status }, statusLabel(session.status))),
                h('div', { className: 'cx-card-stats' }, h('div', { className: 'cx-inline' }, h('span', null, 'cmds:' + String(session.commandCount)), h('span', null, 'ok:' + String(session.validCount)), h('span', null, 'err:' + String(session.invalidCount))))
              ),
              h('div', { className: 'cx-latest' }, h('span', { className: 'cx-latest-text' }, preview), h('span', { className: 'cx-enter' }, '›'))
            )
          }
      
          function TaskCard(props) {
            const task = props.task
            const elapsed = Math.floor(task.elapsedMs / 1000)
            const elapsedStr = elapsed < 60 ? String(elapsed) + 's' : (elapsed < 3600 ? String(Math.floor(elapsed / 60)) + 'm ' + String(elapsed % 60) + 's' : String(Math.floor(elapsed / 3600)) + 'h ' + String(Math.floor((elapsed % 3600) / 60)) + 'm')
            const color = taskStatusColor(task.status)
            return h('div', { className: 'cx-task-card', 'data-state': color },
              h('div', { className: 'cx-task-head' },
                h('div', { className: 'cx-task-name' }, task.taskId, task.status === 'running' ? h('span', { className: 'cx-pulse', style: { marginLeft: '6px' } }) : null),
                h(Badge, { state: color }, taskStatusLabel(task.status))
              ),
              h('div', { className: 'cx-task-meta' },
                h('span', null, 'session:' + task.sessionId),
                h('span', null, 'elapsed:' + elapsedStr),
                task.pid !== null ? h('span', null, 'pid:' + String(task.pid)) : null
              ),
              task.message ? h('div', { className: 'cx-task-message' }, task.message) : null
            )
          }
      
          function SessionDetail(props) {
            const session = props.session
            const commands = session.commands.slice().reverse()
            const [downloading, setDownloading] = React.useState(false)
            async function downloadAll() {
              setDownloading(true)
              try {
                const result = await host.call('dashboard.downloadSession', session.id)
                downloadText(result.filename, result.text)
              } catch (_error) {
                const lines = []
                lines.push('SSH Session: ' + session.id)
                lines.push('Target: ' + session.target + (session.port === null ? '' : ':' + String(session.port)))
                lines.push('Status: ' + session.status)
                lines.push('Exported: ' + new Date().toISOString())
                lines.push('')
                for (let i = 0; i < commands.length; i += 1) {
                  const cmd = commands[i]
                  if (cmd._streaming) continue
                  lines.push('── Command ' + String(i + 1) + '/' + String(commands.length) + ' ──')
                  lines.push(formatCommandDownload(cmd))
                }
                downloadText('ssh-session-' + session.id + '.txt', lines.join('\n'))
              } finally {
                setDownloading(false)
              }
            }
            return h('div', null,
              h('div', { className: 'cx-detail-summary' },
                h('div', { className: 'cx-inline' }, h(Badge, { state: session.status }, statusLabel(session.status)), h('span', { className: 'cx-target' }, session.authMode === 'identity-file' ? 'key' : 'agent'), h('span', { className: 'cx-target' }, 'last ' + timeText(session.lastActivityAt))),
                h('div', { className: 'cx-counts' }, h(Badge, { state: 'ready' }, 'cmds:' + String(session.commandCount)), h(Badge, { state: 'valid' }, 'ok:' + String(session.validCount)), h(Badge, { state: 'invalid' }, 'err:' + String(session.invalidCount)))
              ),
              session.connectionFailure ? h('div', { className: 'cx-connection-alert' }, h('strong', null, session.connectionFailure.label), ' · ', session.connectionFailure.message) : null,
              commands.length > 0 ? h('div', { className: 'cx-toolbar', style: { padding: '10px 0 4px' } }, h('span', null), h('button', { className: 'cx-dl-btn', type: 'button', disabled: downloading, onClick: downloadAll }, downloading ? '…' : '↓ Download All')) : null,
              commands.length === 0 ? h('div', { className: 'cx-empty' }, 'no commands executed yet') : h('div', null, commands.map((command, index) => h(DialogueTurn, { command, index, key: command.commandId })))
            )
          }
      
          function Dashboard() {
            const empty = { sessions: [], tasks: [], counts: { total: 0, active: 0, running: 0, connectionErrors: 0, valid: 0, invalid: 0, taskCount: 0 } }
            const [state, setState] = React.useState(empty)
            const [filter, setFilter] = React.useState('all')
            const [selectedId, setSelectedId] = React.useState(null)
            const [error, setError] = React.useState('')
            const [refreshing, setRefreshing] = React.useState(false)
            async function refresh() {
              setRefreshing(true)
              try { setState(await host.call('dashboard.state', {})); setError('') } catch (nextError) { setError(messageOf(nextError)) } finally { setRefreshing(false) }
            }
            React.useEffect(() => {
              let alive = true
              const tick = async () => {
                try { const next = await host.call('dashboard.state', {}); if (alive) { setState(next); setError('') } } catch (nextError) { if (alive) setError(messageOf(nextError)) }
              }
              tick()
              const dispose = ctx.interval(tick, 1000)
              return () => { alive = false; dispose() }
            }, [])
            const selected = selectedId === null ? null : state.sessions.find((session) => session.id === selectedId) || null
            const visible = state.sessions.filter((session) => filter === 'all' || (filter === 'active' && session.status !== 'closed') || session.status === filter)
            return h('main', { className: 'cx-root' },
              h('header', { className: 'cx-header' },
                h('div', { className: 'cx-title-row' }, selected ? h('button', { className: 'cx-back', type: 'button', title: 'Back', onClick: () => setSelectedId(null) }, '←') : null, h('div', null, h('h1', { className: 'cx-title' }, selected ? selected.id : 'SSH Agent Sessions'), h('div', { className: 'cx-sub' }, selected ? selected.target + (selected.port === null ? '' : ':' + String(selected.port)) : 'connection health · command history · async tasks'))),
                h('div', { className: 'cx-counts' }, selected ? h(Badge, { state: selected.status }, statusLabel(selected.status)) : h(Badge, { state: 'ready' }, 'sessions:' + String(state.counts.total)), h(Badge, { state: 'error' }, 'err:' + String(selected ? (selected.status === 'error' ? 1 : 0) : state.counts.connectionErrors)), h(Badge, { state: 'valid' }, 'ok:' + String(selected ? selected.validCount : state.counts.valid)), h(Badge, { state: 'invalid' }, 'fail:' + String(selected ? selected.invalidCount : state.counts.invalid)))
              ),
              selected === null ? h('div', null,
                h('div', { className: 'cx-toolbar' }, h('div', { className: 'cx-segments' }, h('button', { type: 'button', 'data-active': filter === 'all' ? 'true' : undefined, onClick: () => setFilter('all') }, 'ALL'), h('button', { type: 'button', 'data-active': filter === 'active' ? 'true' : undefined, onClick: () => setFilter('active') }, 'ACTIVE'), h('button', { type: 'button', 'data-active': filter === 'running' ? 'true' : undefined, onClick: () => setFilter('running') }, 'RUNNING'), h('button', { type: 'button', 'data-active': filter === 'error' ? 'true' : undefined, onClick: () => setFilter('error') }, 'ERROR')), h('button', { className: 'cx-btn', type: 'button', title: 'Refresh', disabled: refreshing, onClick: refresh }, '↻')),
                error ? h('div', { className: 'cx-error-banner' }, error) : null,
                visible.length === 0 ? h('div', { className: 'cx-empty' }, state.sessions.length === 0 ? 'no ssh sessions — use ssh_session_open to create one' : 'no matching sessions') : h('div', { className: 'cx-session-grid' }, visible.map((session) => h(SessionCard, { session, key: session.id, onOpen: () => setSelectedId(session.id) }))),
                state.tasks && state.tasks.length > 0 ? h('div', null, h('div', { className: 'cx-section-title' }, 'async tasks (' + String(state.tasks.length) + ')'), state.tasks.map((task) => h(TaskCard, { task, key: task.taskId }))) : null
              ) : h('div', null, h('div', { className: 'cx-toolbar' }, h('span', { className: 'cx-sub' }, 'agent commands · remote responses'), h('button', { className: 'cx-btn', type: 'button', title: 'Refresh', disabled: refreshing, onClick: refresh }, '↻')), error ? h('div', { className: 'cx-error-banner' }, error) : null, h(SessionDetail, { session: selected }))
            )
          }
      
          function parseArgs(block) {
            const raw = block && block.kind === 'tool-result' ? (block.call && block.call.argsRaw || '') : (block && block.argsRaw || '')
            try { const value = JSON.parse(raw || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch (_error) { return {} }
          }
      
          function parseResult(block) {
            if (!block || block.kind !== 'tool-result' || !Array.isArray(block.content)) return null
            let text = ''
            for (const part of block.content) if (part && part.type === 'text' && typeof part.text === 'string') text += part.text
            try { const value = JSON.parse(text); return value && typeof value === 'object' && !Array.isArray(value) ? value : null } catch (_error) { return null }
          }
      
          function ToolCard(props) {
            const args = parseArgs(props.block)
            const result = parseResult(props.block)
            const done = props.block && props.block.kind === 'tool-result'
            const state = !done ? 'running' : (result && result.valid ? 'valid' : 'invalid')
            const failure = result ? failureFor(result) : null
            const label = state === 'running' ? 'RUNNING' : (state === 'valid' ? 'OK' : (failure ? failure.label : 'FAILED'))
            const session = typeof args.session === 'string' ? args.session : '?'
            const command = typeof args.command === 'string' ? args.command : ''
            const target = result && result.target ? result.target : session
            const [expanded, setExpanded] = React.useState(false)
            return h('article', { className: 'cx-tool', 'data-state': state }, h('button', { className: 'cx-tool-head', type: 'button', onClick: () => setExpanded((value) => !value) }, h(Flow, { stages: ['AGENT', target, 'BASH', label] }), h(Badge, { state }, label)), expanded ? h('div', { className: 'cx-tool-body' }, h('div', { className: 'cx-message', 'data-role': 'agent' }, h('div', { className: 'cx-role' }, 'AGENT'), h('pre', { className: 'cx-command' }, command || '(args unavailable)')), result ? h('div', null, h('div', { className: 'cx-turn-arrow' }, '↓'), h(RemoteResponse, { command: result })) : h('div', { className: 'cx-target' }, 'waiting for remote…')) : null)
          }
      
          function Overlay() {
            const open = useOverlayOpen()
            if (!open) return null
            return h('div', { className: 'cx-overlay', onMouseDown: (event) => { if (event.target === event.currentTarget) setOverlayOpen(false) } }, h('div', { className: 'cx-dialog', role: 'dialog', 'aria-modal': true }, h('button', { className: 'cx-close', type: 'button', title: 'Close', onClick: () => setOverlayOpen(false) }, '×'), h(Dashboard)))
          }
      
          function HeaderAction() {
            return h('button', { className: 'cx-open-btn', type: 'button', title: 'SSH Sessions', onClick: () => setOverlayOpen(true) }, '>_ SSH')
          }
      
          slots.inject('settings.section', () => slots.register({ name: 'settings.section', id: 'ssh-dashboard', order: 12, label: 'SSH Sessions' }, () => h(Dashboard)))
          slots.inject('tool.call.toolview', () => slots.register({ name: 'tool.call.toolview', key: 'ssh_bash' }, (props) => h(ToolCard, props)))
          slots.inject('shell.overlay', () => slots.register({ name: 'shell.overlay', id: 'agent-ssh-dashboard', order: 5, label: 'SSH Sessions' }, () => h(Overlay)))
          slots.inject('conversation.session.header.actions', () => slots.register({ name: 'conversation.session.header.actions', id: 'agent-ssh-dashboard', order: 15, label: 'SSH Sessions' }, () => h(HeaderAction)))
        }
      }
    }
    module.exports = createPlugin()
    return module.exports
  },
})
