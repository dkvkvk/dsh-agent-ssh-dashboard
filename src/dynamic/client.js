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

    // ── CSS ──────────────────────────────────────────────────────────
    ctx.effect(() => styles.insert(`
      .cx-root,.cx-tool{box-sizing:border-box;color:#24292f;font-family:'SF Mono','JetBrains Mono','Cascadia Code','Consolas',monospace;letter-spacing:-0.01em}
      .cx-root *,.cx-tool *{box-sizing:border-box;font-family:inherit}
      .cx-root{width:100%;max-width:1200px;margin:0 auto;padding:20px;font-size:12px;line-height:1.5}

      /* overlay */
      .cx-overlay{position:fixed;inset:0;z-index:1300;display:grid;place-items:center;padding:16px;background:rgba(140,150,165,.35);backdrop-filter:blur(4px);pointer-events:auto}
      .cx-dialog{position:relative;width:min(1240px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:#fff;border:1px solid #d0d7de;border-radius:8px;box-shadow:0 1px 0 rgba(27,31,36,.04),0 8px 24px rgba(140,149,159,.2)}
      .cx-close{position:sticky;z-index:4;top:10px;float:right;width:28px;height:28px;margin:8px 8px -36px 0;padding:0;color:#656d76;background:#f6f8fa;border:1px solid #d0d7de;border-radius:4px;font-size:15px;line-height:1;cursor:pointer;font-family:inherit}
      .cx-close:hover{color:#cf222e;border-color:#cf222e;background:#fff}

      /* header */
      .cx-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;min-height:52px;padding:0 40px 14px 0;border-bottom:1px solid #d0d7de}
      .cx-title-row{display:flex;align-items:flex-start;gap:10px;min-width:0}
      .cx-title{margin:0;font-size:14px;font-weight:600;color:#1f2328;line-height:1.3}
      .cx-sub{margin-top:4px;color:#656d76;font-size:11px}
      .cx-back{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;color:#656d76;background:#f6f8fa;border:1px solid #d0d7de;border-radius:4px;font-size:13px;cursor:pointer;flex:0 0 auto}
      .cx-back:hover{color:#0969da;border-color:#0969da;background:#fff}

      /* toolbar */
      .cx-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0}
      .cx-detail-summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid #d0d7de}

      /* badge */
      .cx-badge{display:inline-flex;align-items:center;min-height:22px;padding:2px 7px;color:#656d76;background:#f6f8fa;border:1px solid #d0d7de;border-radius:3px;font-size:10px;font-weight:600;white-space:nowrap;text-transform:uppercase;letter-spacing:.03em}
      .cx-badge.s-ok{color:#1a7f37;border-color:#b3e0c0;background:#dafbe1}
      .cx-badge.s-err{color:#cf222e;border-color:#f7b3b8;background:#ffebe9}
      .cx-badge.s-run{color:#9a6700;border-color:#e5cc90;background:#fff8c5}
      .cx-badge.s-dim{color:#656d76;background:#f6f8fa;border-color:#d0d7de}

      /* segments */
      .cx-segments{display:inline-flex;overflow:hidden;border:1px solid #d0d7de;border-radius:4px}
      .cx-segments button{min-height:28px;padding:3px 10px;color:#656d76;background:transparent;border:0;border-right:1px solid #d0d7de;font:inherit;font-size:11px;cursor:pointer}
      .cx-segments button:last-child{border-right:0}
      .cx-segments button.on{color:#1f2328;background:#eaeef2;font-weight:600}

      /* buttons */
      .cx-btn{display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:3px 10px;color:#24292f;background:#f6f8fa;border:1px solid #d0d7de;border-radius:4px;font:inherit;font-size:11px;cursor:pointer;gap:5px;transition:all .15s}
      .cx-btn:hover{background:#eaeef2;border-color:#8c959f}
      .cx-btn.primary{font-weight:600;color:#0969da;border-color:#b6d9fc}
      .cx-btn.primary:hover{color:#0969da;border-color:#0969da;background:#ddf4ff}
      .cx-btn.dl{color:#1a7f37;border-color:#b3e0c0}
      .cx-btn.dl:hover{color:#1a7f37;border-color:#1a7f37;background:#dafbe1}

      /* session grid */
      .cx-session-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:stretch}

      /* session card */
      .cx-card{display:flex;min-width:0;min-height:130px;flex-direction:column;justify-content:space-between;padding:14px;background:#fff;border:1px solid #d0d7de;border-radius:6px;font:inherit;text-align:left;cursor:pointer;transition:all .15s;position:relative;overflow:hidden}
      .cx-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:#d0d7de;border-radius:0 3px 3px 0}
      .cx-card:hover{border-color:#8c959f;box-shadow:0 1px 3px rgba(140,149,159,.15)}
      .cx-card.s-healthy::before{background:#1a7f37}
      .cx-card.s-error::before{background:#cf222e}
      .cx-card.s-running::before{background:#9a6700}
      .cx-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      .cx-card-name{min-width:0;font-size:13px;font-weight:600;color:#1f2328}
      .cx-card-target{margin-top:4px;color:#656d76;font-size:11px}
      .cx-card-stats{margin-top:14px;color:#656d76;font-size:10px}
      .cx-card-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid #eaeef2}
      .cx-card-preview{min-width:0;overflow:hidden;color:#656d76;font-size:10px;text-overflow:ellipsis;white-space:nowrap}
      .cx-card-arrow{flex:0 0 auto;color:#8c959f;font-size:16px}

      /* task card */
      .cx-task{margin:6px 0;padding:10px 12px;background:#fff;border:1px solid #d0d7de;border-radius:6px;position:relative;overflow:hidden}
      .cx-task::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:#d0d7de;border-radius:0 3px 3px 0}
      .cx-task.s-run::before{background:#9a6700}
      .cx-task.s-ok::before{background:#1a7f37}
      .cx-task.s-err::before{background:#cf222e}
      .cx-task-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .cx-task-name{font-size:12px;font-weight:600;color:#1f2328}
      .cx-task-meta{margin-top:6px;color:#656d76;font-size:10px;display:flex;flex-wrap:wrap;gap:8px}
      .cx-task-msg{margin-top:6px;padding:6px 8px;background:#f6f8fa;border:1px solid #eaeef2;border-radius:4px;font-size:10px;line-height:1.4;color:#656d76}

      /* dialogue turn */
      .cx-turn{padding:16px 0;border-bottom:1px solid #eaeef2}
      .cx-turn:last-child{border-bottom:0}
      .cx-turn-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
      .cx-turn-num{color:#656d76;font-size:10px;font-weight:600}
      .cx-turn-arrow{padding:8px 0;color:#8c959f;text-align:center;font-size:13px}
      .cx-turn-meta{margin-top:8px;color:#8c959f;font-size:9px;display:flex;align-items:center;flex-wrap:wrap;gap:6px}

      /* message bubbles */
      .cx-msg{width:min(92%,900px);padding:10px 12px;border-radius:6px;font-size:11px}
      .cx-msg.agent{margin-left:auto;background:#f0f7ff;border:1px solid #b6d9fc}
      .cx-msg.remote{margin-right:auto;background:#f6f8fa;border:1px solid #d0d7de}
      .cx-msg.error{border-color:#f7b3b8;background:#ffebe9}
      .cx-msg-role{margin-bottom:6px;color:#656d76;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
      .cx-msg-body{margin:0;color:#1f2328;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}

      /* stream output */
      .cx-stream{max-height:260px;overflow:auto;background:#f6f8fa;padding:8px;border-radius:4px;border:1px solid #eaeef2}
      .cx-stream-label{margin:8px 0 4px;color:#656d76;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}

      /* failure */
      .cx-fail{margin-bottom:8px;padding:8px;color:#cf222e;background:#ffebe9;border:1px solid #f7b3b8;border-radius:4px;font-size:10px}
      .cx-fail-title{font-weight:700}
      .cx-fail-msg{margin-top:3px;line-height:1.4;opacity:.85}

      /* alerts */
      .cx-alert{margin:10px 0 0;padding:8px 10px;color:#cf222e;background:#ffebe9;border:1px solid #f7b3b8;border-radius:4px;font-size:10px}
      .cx-error-banner{margin-bottom:10px;padding:8px 10px;color:#cf222e;background:#ffebe9;border:1px solid #f7b3b8;border-radius:4px;font-size:10px}
      .cx-empty{padding:48px 12px;color:#8c959f;border-top:1px solid #eaeef2;border-bottom:1px solid #eaeef2;text-align:center;font-size:11px}

      /* tool card */
      .cx-tool{margin:4px 0;overflow:hidden;background:#fff;border:1px solid #d0d7de;border-radius:6px}
      .cx-tool.s-ok{border-color:#b3e0c0}
      .cx-tool.s-err{border-color:#f7b3b8}
      .cx-tool.s-run{border-color:#e5cc90}
      .cx-tool-head{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:40px;gap:8px;padding:8px 10px;color:inherit;background:transparent;border:0;font:inherit;text-align:left;cursor:pointer}
      .cx-tool-body{padding:10px;border-top:1px solid #eaeef2}

      /* flow */
      .cx-flow{display:flex;align-items:center;flex-wrap:wrap;gap:5px}
      .cx-stage{min-width:0;max-width:160px;padding:2px 6px;color:#656d76;background:#f6f8fa;border:1px solid #eaeef2;border-radius:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}
      .cx-arrow{color:#8c959f;font-size:11px}

      /* pulse */
      .cx-pulse{display:inline-block;width:7px;height:7px;margin-right:5px;background:#9a6700;border-radius:50%;animation:cx-pulse 1.2s ease-in-out infinite;vertical-align:middle}
      @keyframes cx-pulse{0%,100%{opacity:1}50%{opacity:.35}}

      /* inline / counts */
      .cx-inline{display:flex;align-items:center;flex-wrap:wrap;gap:6px}

      /* section title */
      .cx-section-title{margin:18px 0 6px;font-size:12px;font-weight:600;color:#656d76;text-transform:uppercase;letter-spacing:.05em}

      @media(max-width:840px){.cx-overlay{padding:0}.cx-dialog{width:100vw;min-height:100vh;max-height:100vh;border:0;border-radius:0}.cx-root{padding:14px}.cx-header,.cx-toolbar,.cx-detail-summary{align-items:flex-start;flex-direction:column}.cx-session-grid{grid-template-columns:1fr}.cx-msg{width:96%}.cx-stage{max-width:120px}}
    `), 'ssh-dashboard styles')

    // ── helpers ───────────────────────────────────────────────────────

    function messageOf(error) {
      if (error && typeof error.message === 'string') return error.message
      return String(error)
    }

    function downloadText(filename, text) {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }

    function timeText(value) {
      if (!value) return '—'
      try { return new Date(value).toLocaleString() } catch (_) { return String(value) }
    }

    function elapsedStr(ms) {
      const s = Math.floor(ms / 1000)
      if (s < 60) return s + '秒'
      if (s < 3600) return Math.floor(s / 60) + '分' + (s % 60) + '秒'
      return Math.floor(s / 3600) + '时' + Math.floor((s % 3600) / 60) + '分'
    }

    function failureFor(cmd) {
      if (cmd && cmd.failure && typeof cmd.failure === 'object') return cmd.failure
      if (cmd && cmd.valid === false) return { kind: 'unknown', scope: 'command', label: '失败', message: cmd.error || '命令未成功完成' }
      return null
    }

    function stateClass(status) {
      if (status === 'running') return 's-run'
      if (status === 'healthy' || status === 'valid' || status === 'success') return 's-ok'
      if (status === 'error' || status === 'invalid' || status === 'failed' || status === 'timeout') return 's-err'
      return 's-dim'
    }

    function statusLabel(status) {
      const map = { running: '执行中', healthy: '连接正常', error: '连接异常', closed: '已断开' }
      return map[status] || '待连接'
    }

    function taskLabel(status) {
      const map = { pending: '等待中', running: '执行中', success: '已完成', failed: '已失败', timeout: '已超时', cancelled: '已取消' }
      return map[status] || '未知'
    }

    function Badge(props) {
      return h('span', { className: 'cx-badge ' + stateClass(props.state) }, props.children)
    }

    // ── components ────────────────────────────────────────────────────

    function Flow(props) {
      const kids = []
      for (let i = 0; i < props.stages.length; i++) {
        if (i > 0) kids.push(h('span', { className: 'cx-arrow', key: 'a' + i }, '▸'))
        kids.push(h('span', { className: 'cx-stage', key: 's' + i, title: props.stages[i] }, props.stages[i]))
      }
      return h('div', { className: 'cx-flow' }, kids)
    }

    function RemoteBubble(props) {
      const cmd = props.command
      const fail = failureFor(cmd)
      const kids = [h('div', { className: 'cx-msg-role', key: 'r' }, '远端')]
      if (fail) kids.push(h('div', { className: 'cx-fail', key: 'f' }, h('div', { className: 'cx-fail-title' }, fail.label), h('div', { className: 'cx-fail-msg' }, fail.message)))
      if (cmd.stdout) kids.push(h('div', { className: 'cx-stream-label', key: 'ol' }, '标准输出' + (cmd.stdoutTruncated ? '（已截断）' : '')), h('pre', { className: 'cx-stream cx-msg-body', key: 'o' }, cmd.stdout))
      if (cmd.stderr) kids.push(h('div', { className: 'cx-stream-label', key: 'el' }, '标准错误' + (cmd.stderrTruncated ? '（已截断）' : '')), h('pre', { className: 'cx-stream cx-msg-body', key: 'e' }, cmd.stderr))
      if (!cmd.stdout && !cmd.stderr && !fail) kids.push(h('div', { className: 'cx-card-target', key: 'empty' }, '（无输出）'))
      return h('div', { className: 'cx-msg remote' + (fail ? ' error' : '') }, kids)
    }

    function AgentBubble(props) {
      return h('div', { className: 'cx-msg agent' },
        h('div', { className: 'cx-msg-role' }, 'Agent'),
        h('pre', { className: 'cx-msg-body' }, props.text)
      )
    }

    function DialogueTurn(props) {
      const cmd = props.command
      const streaming = cmd._streaming === true
      const fail = streaming ? null : failureFor(cmd)
      const s = streaming ? 'running' : (cmd.valid ? 'valid' : 'invalid')
      const meta = streaming
        ? [h('span', { key: 'r' }, h('span', { className: 'cx-pulse' }), '流式输出中…'), h('span', { key: 'd' }, cmd.durationMs + 'ms')]
        : [h('span', { key: 'e' }, '退出码=' + (cmd.exitCode === null ? '—' : cmd.exitCode)), h('span', { key: 'd' }, cmd.durationMs + 'ms')]
      if (!streaming && (cmd.timedOut || cmd.aborted || cmd.signal) && cmd.processExitCode !== null) meta.push(h('span', { key: 'p' }, 'SSH进程=' + cmd.processExitCode))
      if (!streaming && cmd.signal) meta.push(h('span', { key: 's' }, cmd.signal))

      return h('section', { className: 'cx-turn' },
        h('div', { className: 'cx-turn-head' },
          h('div', { className: 'cx-inline' },
            h('span', { className: 'cx-turn-num' }, '#' + (props.index + 1) + ' · ' + timeText(cmd.startedAt)),
            h(Badge, { state: s }, streaming ? '流式' : (cmd.valid ? '成功' : (fail ? fail.label : '失败')))
          ),
          streaming ? null : h('button', { className: 'cx-btn dl', type: 'button', title: '下载输入输出', onClick: function(e) { e.stopPropagation(); downloadText('ssh-cmd-' + cmd.commandId + '.txt', formatDownload(cmd)) } }, '⬇ 下载')
        ),
        h(AgentBubble, { text: cmd.command }),
        h('div', { className: 'cx-turn-arrow' }, '↓'),
        h(RemoteBubble, { command: cmd }),
        h('div', { className: 'cx-turn-meta' }, meta)
      )
    }

    function formatDownload(cmd) {
      const L = []
      L.push('SSH 命令记录')
      L.push('────────────────────────────────')
      L.push('时间：' + cmd.startedAt)
      L.push('耗时：' + cmd.durationMs + ' ms')
      L.push('结果：' + (cmd.valid ? '成功' : '失败') + ' | 退出码=' + (cmd.exitCode === null ? 'N/A' : cmd.exitCode))
      if (cmd.failure) L.push('错误：' + cmd.failure.label + ' - ' + cmd.failure.message)
      L.push('────────────────────────────────')
      L.push('')
      L.push('>>> Agent 输入 >>>')
      L.push(cmd.command)
      L.push('')
      if (cmd.stdout) { L.push('<<< 标准输出 <<<'); L.push(cmd.stdout); L.push('') }
      if (cmd.stderr) { L.push('<<< 标准错误 <<<'); L.push(cmd.stderr); L.push('') }
      return L.join('\n')
    }

    function SessionCard(props) {
      const s = props.session
      const latest = s.commands.length > 0 ? s.commands[0] : null
      const streaming = latest && latest._streaming === true
      const fail = latest ? failureFor(latest) : null
      let preview = '尚未执行命令'
      if (streaming) preview = '▸ 流式输出中… ' + (latest.stdout ? latest.stdout.slice(0, 50) : '等待输出')
      else if (s.connectionFailure) preview = s.connectionFailure.label
      else if (latest) preview = (latest.valid ? '✓' : '✕') + ' 最近命令' + (latest.valid ? '成功' : '失败')

      return h('button', { className: 'cx-card ' + stateClass(s.status), type: 'button', onClick: props.onOpen },
        h('div', null,
          h('div', { className: 'cx-card-head' },
            h('div', null,
              h('div', { className: 'cx-card-name' }, s.id, streaming ? h('span', { className: 'cx-pulse', style: { marginLeft: 6 } }) : null),
              h('div', { className: 'cx-card-target' }, s.target + (s.port === null ? '' : ':' + s.port))
            ),
            h(Badge, { state: s.status }, statusLabel(s.status))
          ),
          h('div', { className: 'cx-card-stats' },
            h('div', { className: 'cx-inline' },
              h('span', null, '命令:' + s.commandCount),
              h('span', null, '成功:' + s.validCount),
              h('span', null, '失败:' + s.invalidCount)
            )
          )
        ),
        h('div', { className: 'cx-card-footer' },
          h('span', { className: 'cx-card-preview' }, preview),
          h('span', { className: 'cx-card-arrow' }, '›')
        )
      )
    }

    function TaskCard(props) {
      const t = props.task
      const sc = stateClass(t.status)
      return h('div', { className: 'cx-task ' + sc },
        h('div', { className: 'cx-task-head' },
          h('div', { className: 'cx-task-name' }, t.taskId, t.status === 'running' ? h('span', { className: 'cx-pulse', style: { marginLeft: 6 } }) : null),
          h(Badge, { state: t.status }, taskLabel(t.status))
        ),
        h('div', { className: 'cx-task-meta' },
          h('span', null, '会话:' + t.sessionId),
          h('span', null, '已运行:' + elapsedStr(t.elapsedMs)),
          t.pid !== null ? h('span', null, 'PID:' + t.pid) : null
        ),
        t.message ? h('div', { className: 'cx-task-msg' }, t.message) : null
      )
    }

    function SessionDetail(props) {
      const s = props.session
      const cmds = s.commands.slice().reverse()
      const [dl, setDl] = React.useState(false)

      async function downloadAll() {
        setDl(true)
        try {
          const r = await host.call('dashboard.downloadSession', s.id)
          downloadText(r.filename, r.text)
        } catch (_) {
          const L = []
          L.push('SSH 会话：' + s.id)
          L.push('目标：' + s.target + (s.port === null ? '' : ':' + s.port))
          L.push('状态：' + s.status)
          L.push('导出时间：' + new Date().toISOString())
          L.push('')
          for (let i = 0; i < cmds.length; i++) {
            if (cmds[i]._streaming) continue
            L.push('── 命令 ' + (i + 1) + '/' + cmds.length + ' ──')
            L.push(formatDownload(cmds[i]))
          }
          downloadText('ssh-session-' + s.id + '.txt', L.join('\n'))
        } finally { setDl(false) }
      }

      return h('div', null,
        h('div', { className: 'cx-detail-summary' },
          h('div', { className: 'cx-inline' },
            h(Badge, { state: s.status }, statusLabel(s.status)),
            h('span', { className: 'cx-card-target' }, s.authMode === 'identity-file' ? '密钥' : 'Agent'),
            h('span', { className: 'cx-card-target' }, '最近 ' + timeText(s.lastActivityAt))
          ),
          h('div', { className: 'cx-inline' },
            h(Badge, { state: 'ready' }, '命令:' + s.commandCount),
            h(Badge, { state: 'valid' }, '成功:' + s.validCount),
            h(Badge, { state: 'invalid' }, '失败:' + s.invalidCount)
          )
        ),
        s.connectionFailure ? h('div', { className: 'cx-alert' }, h('strong', null, s.connectionFailure.label), ' · ', s.connectionFailure.message) : null,
        cmds.length > 0 ? h('div', { className: 'cx-toolbar' }, h('span', null), h('button', { className: 'cx-btn dl', type: 'button', disabled: dl, onClick: downloadAll }, dl ? '…' : '⬇ 下载全部')) : null,
        cmds.length === 0 ? h('div', { className: 'cx-empty' }, '等待 Agent 执行命令') : h('div', null, cmds.map(function(cmd, i) { return h(DialogueTurn, { command: cmd, index: i, key: cmd.commandId }) }))
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
        try { setState(await host.call('dashboard.state', {})); setError('') } catch (e) { setError(messageOf(e)) } finally { setRefreshing(false) }
      }

      React.useEffect(function() {
        var alive = true
        async function tick() {
          try { var next = await host.call('dashboard.state', {}); if (alive) { setState(next); setError('') } } catch (e) { if (alive) setError(messageOf(e)) }
        }
        tick()
        var dispose = ctx.interval(tick, 1000)
        return function() { alive = false; dispose() }
      }, [])

      var selected = selectedId === null ? null : state.sessions.find(function(s) { return s.id === selectedId }) || null
      var visible = state.sessions.filter(function(s) { return filter === 'all' || (filter === 'active' && s.status !== 'closed') || s.status === filter })

      return h('main', { className: 'cx-root' },
        h('header', { className: 'cx-header' },
          h('div', { className: 'cx-title-row' },
            selected ? h('button', { className: 'cx-back', type: 'button', title: '返回', onClick: function() { setSelectedId(null) } }, '←') : null,
            h('div', null,
              h('h1', { className: 'cx-title' }, selected ? selected.id : 'SSH 会话管理'),
              h('div', { className: 'cx-sub' }, selected ? selected.target + (selected.port === null ? '' : ':' + selected.port) : '连接健康 · 命令历史 · 异步任务')
            )
          ),
          h('div', { className: 'cx-inline' },
            selected ? h(Badge, { state: selected.status }, statusLabel(selected.status)) : h(Badge, { state: 'ready' }, '会话:' + state.counts.total),
            h(Badge, { state: 'error' }, '异常:' + (selected ? (selected.status === 'error' ? 1 : 0) : state.counts.connectionErrors)),
            h(Badge, { state: 'valid' }, '成功:' + (selected ? selected.validCount : state.counts.valid)),
            h(Badge, { state: 'invalid' }, '失败:' + (selected ? selected.invalidCount : state.counts.invalid))
          )
        ),
        selected === null
          ? h('div', null,
              h('div', { className: 'cx-toolbar' },
                h('div', { className: 'cx-segments' },
                  h('button', { type: 'button', className: filter === 'all' ? 'on' : '', onClick: function() { setFilter('all') } }, '全部'),
                  h('button', { type: 'button', className: filter === 'active' ? 'on' : '', onClick: function() { setFilter('active') } }, '活动'),
                  h('button', { type: 'button', className: filter === 'running' ? 'on' : '', onClick: function() { setFilter('running') } }, '执行中'),
                  h('button', { type: 'button', className: filter === 'error' ? 'on' : '', onClick: function() { setFilter('error') } }, '异常')
                ),
                h('button', { className: 'cx-btn', type: 'button', title: '刷新', disabled: refreshing, onClick: refresh }, '↻')
              ),
              error ? h('div', { className: 'cx-error-banner' }, error) : null,
              visible.length === 0
                ? h('div', { className: 'cx-empty' }, state.sessions.length === 0 ? '暂无 SSH 会话 — 请使用 ssh_session_open 创建' : '没有匹配的会话')
                : h('div', { className: 'cx-session-grid' }, visible.map(function(s) { return h(SessionCard, { session: s, key: s.id, onOpen: function() { setSelectedId(s.id) } }) })),
              state.tasks && state.tasks.length > 0
                ? h('div', null,
                    h('div', { className: 'cx-section-title' }, '异步任务（' + state.tasks.length + '）'),
                    state.tasks.map(function(t) { return h(TaskCard, { task: t, key: t.taskId }) })
                  )
                : null
            )
          : h('div', null,
              h('div', { className: 'cx-toolbar' },
                h('span', { className: 'cx-sub' }, 'Agent 命令 · 远端响应'),
                h('button', { className: 'cx-btn', type: 'button', title: '刷新', disabled: refreshing, onClick: refresh }, '↻')
              ),
              error ? h('div', { className: 'cx-error-banner' }, error) : null,
              h(SessionDetail, { session: selected })
            )
      )
    }

    function ToolCard(props) {
      var args = parseArgs(props.block)
      var result = parseResult(props.block)
      var done = props.block && props.block.kind === 'tool-result'
      var s = !done ? 'running' : (result && result.valid ? 'valid' : 'invalid')
      var fail = result ? failureFor(result) : null
      var label = s === 'running' ? '执行中' : (s === 'valid' ? '成功' : (fail ? fail.label : '失败'))
      var session = typeof args.session === 'string' ? args.session : '未知'
      var command = typeof args.command === 'string' ? args.command : ''
      var target = result && result.target ? result.target : session
      var [expanded, setExpanded] = React.useState(false)

      return h('article', { className: 'cx-tool ' + stateClass(s) },
        h('button', { className: 'cx-tool-head', type: 'button', onClick: function() { setExpanded(function(v) { return !v }) } },
          h(Flow, { stages: ['Agent', target, 'Bash', label] }),
          h(Badge, { state: s }, label)
        ),
        expanded ? h('div', { className: 'cx-tool-body' },
          h(AgentBubble, { text: command || '（参数不可用）' }),
          result ? h('div', null, h('div', { className: 'cx-turn-arrow' }, '↓'), h(RemoteBubble, { command: result })) : h('div', { className: 'cx-card-target' }, '等待远端返回…')
        ) : null
      )
    }

    function parseArgs(block) {
      var raw = block && block.kind === 'tool-result' ? (block.call && block.call.argsRaw || '') : (block && block.argsRaw || '')
      try { var v = JSON.parse(raw || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {} } catch (_) { return {} }
    }

    function parseResult(block) {
      if (!block || block.kind !== 'tool-result' || !Array.isArray(block.content)) return null
      var text = ''
      for (var i = 0; i < block.content.length; i++) { var p = block.content[i]; if (p && p.type === 'text' && typeof p.text === 'string') text += p.text }
      try { var v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? v : null } catch (_) { return null }
    }

    function Overlay() {
      var open = useOverlayOpen()
      if (!open) return null
      return h('div', { className: 'cx-overlay', onMouseDown: function(e) { if (e.target === e.currentTarget) setOverlayOpen(false) } },
        h('div', { className: 'cx-dialog', role: 'dialog', 'aria-modal': true },
          h('button', { className: 'cx-close', type: 'button', title: '关闭', onClick: function() { setOverlayOpen(false) } }, '×'),
          h(Dashboard)
        )
      )
    }

    function HeaderAction() {
      return h('button', { className: 'cx-btn primary', type: 'button', title: 'SSH 会话', onClick: function() { setOverlayOpen(true) } }, '>_ SSH')
    }

    slots.inject('settings.section', function() { return slots.register({ name: 'settings.section', id: 'ssh-dashboard', order: 12, label: 'SSH 会话' }, function() { return h(Dashboard) }) })
    slots.inject('tool.call.toolview', function() { return slots.register({ name: 'tool.call.toolview', key: 'ssh_bash' }, function(props) { return h(ToolCard, props) }) })
    slots.inject('shell.overlay', function() { return slots.register({ name: 'shell.overlay', id: 'agent-ssh-dashboard', order: 5, label: 'SSH 会话' }, function() { return h(Overlay) }) })
    slots.inject('conversation.session.header.actions', function() { return slots.register({ name: 'conversation.session.header.actions', id: 'agent-ssh-dashboard', order: 15, label: 'SSH 会话' }, function() { return h(HeaderAction) }) })
  }
}