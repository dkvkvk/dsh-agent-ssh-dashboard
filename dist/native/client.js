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
            .ash-root,.ash-tool{box-sizing:border-box;color:var(--dsw-alias-label-primary);letter-spacing:0}.ash-root *,.ash-tool *{box-sizing:border-box;letter-spacing:0}
            .ash-root{width:100%;max-width:1160px;margin:0 auto;padding:22px}.ash-overlay{position:fixed;inset:0;z-index:1300;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.58);pointer-events:auto}.ash-dialog{position:relative;width:min(1180px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;box-shadow:0 20px 60px rgba(0,0,0,.36)}
            .ash-close{position:sticky;z-index:4;top:12px;float:right;width:34px;height:34px;margin:12px 12px -46px 0;padding:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:4px;font-size:22px;line-height:1;cursor:pointer}.ash-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;min-height:62px;padding:0 48px 18px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
            .ash-title-row{display:flex;align-items:flex-start;gap:10px;min-width:0}.ash-title{margin:0;font-size:22px;line-height:1.25;font-weight:650;overflow-wrap:anywhere}.ash-sub,.ash-target{margin-top:5px;color:var(--dsw-alias-label-secondary);font-size:12px;overflow-wrap:anywhere}.ash-toolbar,.ash-detail-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 0}.ash-detail-summary{border-bottom:1px solid var(--dsw-alias-border-l1)}
            .ash-counts,.ash-inline,.ash-flow,.ash-meta{display:flex;align-items:center;flex-wrap:wrap;gap:7px}.ash-badge{display:inline-flex;align-items:center;min-height:25px;padding:3px 8px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:4px;font-size:11px;font-weight:650;white-space:nowrap}.ash-badge[data-state='healthy'],.ash-badge[data-state='valid']{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 42%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 9%,transparent)}.ash-badge[data-state='error'],.ash-badge[data-state='invalid']{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 42%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 9%,transparent)}.ash-badge[data-state='running']{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 42%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 9%,transparent)}.ash-badge[data-state='closed'],.ash-badge[data-state='ready']{background:var(--dsw-alias-bg-layer-2)}
            .ash-segments{display:inline-flex;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:4px}.ash-segments button{min-height:30px;padding:4px 10px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base);border:0;border-right:1px solid var(--dsw-alias-border-l2);font:inherit;font-size:11px;cursor:pointer}.ash-segments button:last-child{border-right:0}.ash-segments button[data-active='true']{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);font-weight:650}
            .ash-icon-btn,.ash-open-btn,.ash-back,.ash-dl-btn{display:inline-flex;align-items:center;justify-content:center;min-height:32px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:4px;font:inherit;cursor:pointer}.ash-icon-btn,.ash-back{width:34px;padding:0;font-size:17px;flex:0 0 auto}.ash-open-btn,.ash-dl-btn{padding:5px 9px;font-size:12px;font-weight:650}.ash-icon-btn:hover,.ash-open-btn:hover,.ash-back:hover,.ash-dl-btn:hover{border-color:var(--dsw-alias-brand-primary)}.ash-dl-btn{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 35%,transparent)}
            .ash-session-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:stretch}.ash-session-card{display:flex;min-width:0;min-height:150px;flex-direction:column;justify-content:space-between;padding:14px;color:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dsw-alias-border-l2);border-radius:6px;font:inherit;text-align:left;cursor:pointer}.ash-session-card:hover{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}.ash-session-card[data-state='healthy']{border-left-color:var(--dsw-alias-state-success-primary)}.ash-session-card[data-state='error']{border-left-color:var(--dsw-alias-state-error-primary)}.ash-session-card[data-state='running']{border-left-color:var(--dsw-alias-state-warn-primary)}
            .ash-card-head,.ash-turn-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.ash-session-name{min-width:0;font-size:14px;font-weight:650;overflow-wrap:anywhere}.ash-card-stats{margin-top:16px;color:var(--dsw-alias-label-secondary);font-size:11px}.ash-latest{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:11px;border-top:1px solid var(--dsw-alias-border-l1)}.ash-latest-text{min-width:0;overflow:hidden;color:var(--dsw-alias-label-secondary);font:11px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;text-overflow:ellipsis;white-space:nowrap}.ash-enter{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-size:19px}
            .ash-connection-alert{margin:12px 0 0;padding:10px;color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent);border-left:3px solid var(--dsw-alias-state-error-primary);font-size:11px}.ash-turn{padding:18px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}.ash-turn:last-child{border-bottom:0}.ash-turn-index{color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:650}.ash-message{width:min(88%,860px);padding:11px 12px;border-radius:6px}.ash-message[data-role='agent']{margin-left:auto;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,var(--dsw-alias-bg-layer-1));border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 28%,var(--dsw-alias-border-l1))}.ash-message[data-role='remote']{margin-right:auto;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}.ash-message[data-error='true']{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,transparent)}
            .ash-role{margin-bottom:7px;color:var(--dsw-alias-label-secondary);font-size:10px;font-weight:650}.ash-turn-arrow{padding:7px 0;color:var(--dsw-alias-label-secondary);text-align:center;font-size:15px}.ash-command,.ash-stream{margin:0;color:var(--dsw-alias-label-primary);font:11px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.ash-stream{max-height:280px;overflow:auto}.ash-stream-label{margin:9px 0 5px;color:var(--dsw-alias-label-secondary);font-size:10px;font-weight:650}.ash-failure{margin-bottom:10px;padding:9px 10px;color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent);border-left:3px solid var(--dsw-alias-state-error-primary)}.ash-failure-title{font-size:11px;font-weight:700}.ash-failure-message{margin-top:4px;font-size:11px;line-height:1.45;overflow-wrap:anywhere}.ash-meta{margin-top:8px;color:var(--dsw-alias-label-secondary);font-size:10px}
            .ash-empty{padding:42px 12px;color:var(--dsw-alias-label-secondary);border-top:1px solid var(--dsw-alias-border-l1);border-bottom:1px solid var(--dsw-alias-border-l1);text-align:center;font-size:12px}.ash-error-banner{margin-bottom:12px;padding:9px 10px;color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent);border-left:3px solid var(--dsw-alias-state-error-primary);font-size:11px}.ash-streaming{display:inline-block;width:8px;height:8px;margin-right:6px;background:var(--dsw-alias-state-warn-primary);border-radius:50%;animation:ash-pulse 1.2s ease-in-out infinite}@keyframes ash-pulse{0%,100%{opacity:1}50%{opacity:.35}}.ash-task-card{margin:8px 0;padding:12px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dsw-alias-border-l2);border-radius:6px}.ash-task-card[data-state='running']{border-left-color:var(--dsw-alias-state-warn-primary)}.ash-task-card[data-state='success']{border-left-color:var(--dsw-alias-state-success-primary)}.ash-task-card[data-state='failed'],.ash-task-card[data-state='timeout']{border-left-color:var(--dsw-alias-state-error-primary)}.ash-task-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.ash-task-name{font-size:13px;font-weight:650}.ash-task-meta{margin-top:8px;color:var(--dsw-alias-label-secondary);font-size:11px}.ash-task-message{margin-top:6px;padding:6px 8px;background:var(--dsw-alias-bg-layer-2);border-radius:4px;font-size:11px;line-height:1.45}
            .ash-tool{margin:6px 0;overflow:hidden;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dsw-alias-state-warn-primary);border-radius:6px}.ash-tool[data-state='valid']{border-left-color:var(--dsw-alias-state-success-primary)}.ash-tool[data-state='invalid']{border-left-color:var(--dsw-alias-state-error-primary)}.ash-tool-head{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:45px;gap:10px;padding:9px 10px;color:inherit;background:transparent;border:0;font:inherit;text-align:left;cursor:pointer}.ash-tool-body{padding:11px;border-top:1px solid var(--dsw-alias-border-l1)}.ash-stage{min-width:0;max-width:170px;padding:3px 6px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.ash-arrow{color:var(--dsw-alias-label-secondary);font-size:12px}
            @media(max-width:840px){.ash-overlay{padding:0}.ash-dialog{width:100vw;min-height:100vh;max-height:100vh;border:0;border-radius:0}.ash-root{padding:16px}.ash-header,.ash-toolbar,.ash-detail-summary{align-items:flex-start;flex-direction:column}.ash-session-grid{grid-template-columns:1fr}.ash-message{width:94%}.ash-stage{max-width:135px}}
          `), 'agent ssh connection health styles')
      
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
            lines.push('# SSH 命令记录')
            lines.push('# 时间：' + command.startedAt)
            lines.push('# 耗时：' + String(command.durationMs) + ' ms')
            lines.push('# 结果：' + (command.valid ? '成功' : '失败') + ' | 退出码：' + (command.exitCode === null ? 'N/A' : String(command.exitCode)))
            if (command.failure) lines.push('# 错误：' + command.failure.label + ' - ' + command.failure.message)
            lines.push('')
            lines.push('>>> AGENT 输入 >>>')
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
            return h('span', { className: 'ash-badge', 'data-state': props.state }, props.children)
          }
      
          function statusLabel(status) {
            if (status === 'running') return '执行中'
            if (status === 'healthy') return '连接正常'
            if (status === 'error') return '连接异常'
            if (status === 'closed') return '正常断开'
            return '待连接'
          }
      
          function taskStatusLabel(status) {
            if (status === 'pending') return '等待启动'
            if (status === 'running') return '运行中'
            if (status === 'success') return '已完成'
            if (status === 'failed') return '已失败'
            if (status === 'timeout') return '已超时'
            if (status === 'cancelled') return '已取消'
            return '未知'
          }
      
          function taskStatusColor(status) {
            if (status === 'running') return 'running'
            if (status === 'success') return 'valid'
            if (status === 'failed' || status === 'timeout') return 'invalid'
            if (status === 'cancelled') return 'closed'
            return 'ready'
          }
      
          function timeText(value) {
            if (!value) return '—'
            try { return new Date(value).toLocaleString() } catch (_error) { return String(value) }
          }
      
          function failureFor(command) {
            if (command && command.failure && typeof command.failure === 'object') return command.failure
            if (command && command.valid === false) return { kind: 'unknown', scope: 'command', label: '命令失败', message: command.error || '命令未成功完成' }
            return null
          }
      
          function Flow(props) {
            const children = []
            for (let index = 0; index < props.stages.length; index += 1) {
              if (index > 0) children.push(h('span', { className: 'ash-arrow', key: 'a' + String(index) }, '→'))
              children.push(h('span', { className: 'ash-stage', key: 's' + String(index), title: props.stages[index] }, props.stages[index]))
            }
            return h('div', { className: 'ash-flow' }, children)
          }
      
          function RemoteResponse(props) {
            const command = props.command
            const failure = failureFor(command)
            const children = [h('div', { className: 'ash-role', key: 'role' }, '远端服务器')]
            if (failure !== null) children.push(h('div', { className: 'ash-failure', key: 'failure' }, h('div', { className: 'ash-failure-title' }, failure.label), h('div', { className: 'ash-failure-message' }, failure.message)))
            if (command.stdout) children.push(h('div', { className: 'ash-stream-label', key: 'ol' }, 'STDOUT' + (command.stdoutTruncated ? ' · 已截断' : '')), h('pre', { className: 'ash-stream', key: 'o' }, command.stdout))
            if (command.stderr) children.push(h('div', { className: 'ash-stream-label', key: 'el' }, 'STDERR' + (command.stderrTruncated ? ' · 已截断' : '')), h('pre', { className: 'ash-stream', key: 'e' }, command.stderr))
            if (!command.stdout && !command.stderr && failure === null) children.push(h('div', { className: 'ash-target', key: 'empty' }, '命令完成，无标准输出'))
            return h('div', { className: 'ash-message', 'data-role': 'remote', 'data-error': failure === null ? undefined : 'true' }, children)
          }
      
          function DialogueTurn(props) {
            const command = props.command
            const isStreaming = command._streaming === true
            const failure = isStreaming ? null : failureFor(command)
            const state = isStreaming ? 'running' : (command.valid ? 'valid' : 'invalid')
            const meta = isStreaming ? [h('span', { key: 'running' }, h('span', { className: 'ash-streaming' }), '执行中…'), h('span', { key: 'duration' }, String(command.durationMs) + ' ms')] : [h('span', { key: 'remote' }, '远端退出码 ' + (command.exitCode === null ? '—' : String(command.exitCode))), h('span', { key: 'duration' }, String(command.durationMs) + ' ms')]
            if (!isStreaming && (command.timedOut || command.aborted || command.signal) && command.processExitCode !== null) meta.push(h('span', { key: 'process' }, 'SSH 进程退出码 ' + String(command.processExitCode)))
            if (!isStreaming && command.signal) meta.push(h('span', { key: 'signal' }, String(command.signal)))
            const dlButton = isStreaming ? null : h('button', { className: 'ash-dl-btn', type: 'button', title: '下载此命令的输入输出', onClick: (e) => { e.stopPropagation(); downloadText('ssh-cmd-' + command.commandId + '.txt', formatCommandDownload(command)) }, style: { marginLeft: '8px' } }, '⬇ 下载')
            return h('section', { className: 'ash-turn' },
              h('div', { className: 'ash-turn-head' }, h('div', { className: 'ash-inline' }, h('span', { className: 'ash-turn-index' }, '第 ' + String(props.index + 1) + ' 段 · ' + timeText(command.startedAt)), h(Badge, { state }, isStreaming ? '执行中' : (command.valid ? '成功' : (failure ? failure.label : '命令失败')))), dlButton),
              h('div', { className: 'ash-message', 'data-role': 'agent' }, h('div', { className: 'ash-role' }, 'Agent'), h('pre', { className: 'ash-command' }, command.command)),
              h('div', { className: 'ash-turn-arrow' }, '↓'),
              h(RemoteResponse, { command }),
              h('div', { className: 'ash-meta' }, meta)
            )
          }
      
          function SessionCard(props) {
            const session = props.session
            const latest = session.commands.length > 0 ? session.commands[0] : null
            const isStreaming = latest !== null && latest._streaming === true
            const latestFailure = latest === null ? null : failureFor(latest)
            let preview = '尚未执行命令'
            if (isStreaming) preview = '⏳ 执行中… ' + (latest.stdout ? latest.stdout.slice(0, 60) : '等待输出')
            else if (session.connectionFailure) preview = session.connectionFailure.label + ' · ' + session.connectionFailure.message
            else if (latest !== null) preview = latest.valid ? '最近命令成功' : '最近命令失败 · ' + (latestFailure ? latestFailure.label : '未知原因')
            return h('button', { className: 'ash-session-card', 'data-state': session.status, type: 'button', onClick: props.onOpen },
              h('div', null,
                h('div', { className: 'ash-card-head' }, h('div', null, h('div', { className: 'ash-session-name' }, session.id, isStreaming ? h('span', { className: 'ash-streaming', style: { marginLeft: '6px' } }) : null), h('div', { className: 'ash-target' }, session.target + (session.port === null ? '' : ':' + String(session.port)))), h(Badge, { state: session.status }, statusLabel(session.status))),
                h('div', { className: 'ash-card-stats' }, h('div', { className: 'ash-inline' }, h('span', null, '命令 ' + String(session.commandCount)), h('span', null, '成功命令 ' + String(session.validCount)), h('span', null, '失败命令 ' + String(session.invalidCount))))
              ),
              h('div', { className: 'ash-latest' }, h('span', { className: 'ash-latest-text' }, preview), h('span', { className: 'ash-enter' }, '›'))
            )
          }
      
          function TaskCard(props) {
            const task = props.task
            const elapsed = Math.floor(task.elapsedMs / 1000)
            const elapsedStr = elapsed < 60 ? String(elapsed) + 's' : (elapsed < 3600 ? String(Math.floor(elapsed / 60)) + 'm ' + String(elapsed % 60) + 's' : String(Math.floor(elapsed / 3600)) + 'h ' + String(Math.floor((elapsed % 3600) / 60)) + 'm')
            const color = taskStatusColor(task.status)
            return h('div', { className: 'ash-task-card', 'data-state': color },
              h('div', { className: 'ash-task-head' },
                h('div', { className: 'ash-task-name' }, task.taskId, task.status === 'running' ? h('span', { className: 'ash-streaming', style: { marginLeft: '6px' } }) : null),
                h(Badge, { state: color }, taskStatusLabel(task.status))
              ),
              h('div', { className: 'ash-task-meta' },
                h('span', null, '会话：' + task.sessionId + ' · 已运行：' + elapsedStr),
                task.pid !== null ? h('span', null, ' · PID：' + String(task.pid)) : null
              ),
              task.message ? h('div', { className: 'ash-task-message' }, task.message) : null
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
                // Fallback: build from local state
                const lines = []
                lines.push('# SSH 会话：' + session.id)
                lines.push('# 目标：' + session.target + (session.port === null ? '' : ':' + String(session.port)))
                lines.push('# 状态：' + session.status)
                lines.push('# 导出时间：' + new Date().toISOString())
                lines.push('')
                for (let i = 0; i < commands.length; i += 1) {
                  const cmd = commands[i]
                  if (cmd._streaming) continue
                  lines.push('--- 命令 ' + String(i + 1) + ' / ' + String(commands.length) + ' ---')
                  lines.push(formatCommandDownload(cmd))
                }
                downloadText('ssh-session-' + session.id + '.txt', lines.join('\n'))
              } finally {
                setDownloading(false)
              }
            }
            return h('div', null,
              h('div', { className: 'ash-detail-summary' },
                h('div', { className: 'ash-inline' }, h(Badge, { state: session.status }, statusLabel(session.status)), h('span', { className: 'ash-target' }, session.authMode === 'identity-file' ? '本地密钥' : 'SSH Agent / Config'), h('span', { className: 'ash-target' }, '最近 ' + timeText(session.lastActivityAt))),
                h('div', { className: 'ash-counts' }, h(Badge, { state: 'ready' }, '命令 ' + String(session.commandCount)), h(Badge, { state: 'valid' }, '成功命令 ' + String(session.validCount)), h(Badge, { state: 'invalid' }, '失败命令 ' + String(session.invalidCount)))
              ),
              session.connectionFailure ? h('div', { className: 'ash-connection-alert' }, h('strong', null, session.connectionFailure.label), ' · ', session.connectionFailure.message) : null,
              commands.length > 0 ? h('div', { className: 'ash-toolbar', style: { padding: '12px 0 6px' } }, h('span', null), h('button', { className: 'ash-dl-btn', type: 'button', disabled: downloading, onClick: downloadAll }, downloading ? '⏳ 生成中…' : '⬇ 下载全部')) : null,
              commands.length === 0 ? h('div', { className: 'ash-empty' }, '等待 Agent 执行命令') : h('div', null, commands.map((command, index) => h(DialogueTurn, { command, index, key: command.commandId })))
            )
          }
      
          function Dashboard() {
            const empty = { sessions: [], counts: { total: 0, active: 0, running: 0, connectionErrors: 0, valid: 0, invalid: 0 } }
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
            return h('main', { className: 'ash-root' },
              h('header', { className: 'ash-header' },
                h('div', { className: 'ash-title-row' }, selected ? h('button', { className: 'ash-back', type: 'button', title: '返回会话列表', onClick: () => setSelectedId(null) }, '←') : null, h('div', null, h('h1', { className: 'ash-title' }, selected ? selected.id : 'Agent SSH 会话'), h('div', { className: 'ash-sub' }, selected ? selected.target + (selected.port === null ? '' : ':' + String(selected.port)) : '会话健康与命令结果分开显示'))),
                h('div', { className: 'ash-counts' }, selected ? h(Badge, { state: selected.status }, statusLabel(selected.status)) : h(Badge, { state: 'ready' }, '会话 ' + String(state.counts.total)), h(Badge, { state: 'error' }, '连接异常 ' + String(selected ? (selected.status === 'error' ? 1 : 0) : state.counts.connectionErrors)), h(Badge, { state: 'valid' }, '成功命令 ' + String(selected ? selected.validCount : state.counts.valid)), h(Badge, { state: 'invalid' }, '失败命令 ' + String(selected ? selected.invalidCount : state.counts.invalid)))
              ),
              selected === null ? h('div', null,
                h('div', { className: 'ash-toolbar' }, h('div', { className: 'ash-segments' }, h('button', { type: 'button', 'data-active': filter === 'all' ? 'true' : undefined, onClick: () => setFilter('all') }, '全部'), h('button', { type: 'button', 'data-active': filter === 'active' ? 'true' : undefined, onClick: () => setFilter('active') }, '活动'), h('button', { type: 'button', 'data-active': filter === 'running' ? 'true' : undefined, onClick: () => setFilter('running') }, '执行中'), h('button', { type: 'button', 'data-active': filter === 'error' ? 'true' : undefined, onClick: () => setFilter('error') }, '连接异常')), h('button', { className: 'ash-icon-btn', type: 'button', title: '刷新', disabled: refreshing, onClick: refresh }, '↻')),
                error ? h('div', { className: 'ash-error-banner' }, error) : null,
                visible.length === 0 ? h('div', { className: 'ash-empty' }, state.sessions.length === 0 ? '等待 Agent 创建 SSH 会话' : '没有匹配的会话') : h('div', { className: 'ash-session-grid' }, visible.map((session) => h(SessionCard, { session, key: session.id, onOpen: () => setSelectedId(session.id) }))),
                state.tasks && state.tasks.length > 0 ? h('div', null, h('div', { style: { margin: '18px 0 8px', fontSize: '14px', fontWeight: 650 } }, '异步任务(' + String(state.tasks.length) + ')'), state.tasks.map((task) => h(TaskCard, { task, key: task.taskId }))) : null
              ) : h('div', null, h('div', { className: 'ash-toolbar' }, h('span', { className: 'ash-sub' }, 'Agent 命令与远端响应按时间排列'), h('button', { className: 'ash-icon-btn', type: 'button', title: '刷新', disabled: refreshing, onClick: refresh }, '↻')), error ? h('div', { className: 'ash-error-banner' }, error) : null, h(SessionDetail, { session: selected }))
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
            const label = state === 'running' ? '执行中' : (state === 'valid' ? '成功' : (failure ? failure.label : '命令失败'))
            const session = typeof args.session === 'string' ? args.session : '未指定会话'
            const command = typeof args.command === 'string' ? args.command : ''
            const target = result && result.target ? result.target : session
            const [expanded, setExpanded] = React.useState(false)
            return h('article', { className: 'ash-tool', 'data-state': state }, h('button', { className: 'ash-tool-head', type: 'button', onClick: () => setExpanded((value) => !value) }, h(Flow, { stages: ['Agent', target, 'Bash', label] }), h(Badge, { state }, label)), expanded ? h('div', { className: 'ash-tool-body' }, h('div', { className: 'ash-message', 'data-role': 'agent' }, h('div', { className: 'ash-role' }, 'Agent'), h('pre', { className: 'ash-command' }, command || '(命令参数不可用)')), result ? h('div', null, h('div', { className: 'ash-turn-arrow' }, '↓'), h(RemoteResponse, { command: result })) : h('div', { className: 'ash-target' }, '等待远端返回')) : null)
          }
      
          function Overlay() {
            const open = useOverlayOpen()
            if (!open) return null
            return h('div', { className: 'ash-overlay', onMouseDown: (event) => { if (event.target === event.currentTarget) setOverlayOpen(false) } }, h('div', { className: 'ash-dialog', role: 'dialog', 'aria-modal': true }, h('button', { className: 'ash-close', type: 'button', title: '关闭', onClick: () => setOverlayOpen(false) }, '×'), h(Dashboard)))
          }
      
          function HeaderAction() {
            return h('button', { className: 'ash-open-btn', type: 'button', title: '打开 SSH 会话', onClick: () => setOverlayOpen(true) }, '>_ SSH')
          }
      
          slots.inject('settings.section', () => slots.register({ name: 'settings.section', id: 'ssh-dashboard', order: 12, label: 'SSH 会话' }, () => h(Dashboard)))
          slots.inject('tool.call.toolview', () => slots.register({ name: 'tool.call.toolview', key: 'ssh_bash' }, (props) => h(ToolCard, props)))
          slots.inject('shell.overlay', () => slots.register({ name: 'shell.overlay', id: 'agent-ssh-dashboard', order: 5, label: 'SSH 会话' }, () => h(Overlay)))
          slots.inject('conversation.session.header.actions', () => slots.register({ name: 'conversation.session.header.actions', id: 'agent-ssh-dashboard', order: 15, label: 'SSH 会话' }, () => h(HeaderAction)))
        }
      }
    }
    module.exports = createPlugin()
    return module.exports
  },
})
