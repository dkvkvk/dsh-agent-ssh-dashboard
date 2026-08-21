import assert from 'node:assert/strict'
import test from 'node:test'
import { loadHostRuntime } from './helpers/dynamic-runtime.mjs'

test('remote command failures do not mark a session connection as unhealthy', async (t) => {
  const runtime = loadHostRuntime([{
    exitCode: 9,
    stderr: 'ordinary command failure\n',
  }])
  t.after(() => runtime.dispose())

  await runtime.open()
  const result = await runtime.bash("printf 'ordinary command failure\\n' >&2; exit 9")
  assert.equal(result.valid, false)
  assert.equal(result.exitCode, 9)
  assert.equal(result.processExitCode, 9)
  assert.deepEqual(result.failure, {
    kind: 'remote-exit',
    scope: 'command',
    label: '远端命令失败',
    message: 'ordinary command failure',
  })

  const [session] = (await runtime.sessions()).sessions
  assert.equal(session.status, 'healthy')
  assert.equal(session.connectionFailure, null)
  assert.equal(session.lastCommandStatus, 'invalid')
  assert.equal(session.invalidCount, 1)
})

test('timeout separates remote and local SSH process exit codes', async (t) => {
  const runtime = loadHostRuntime([{
    kind: 'timeout',
    stdout: 'before-timeout\n',
    processExitCode: 1,
  }], { instantTimeout: true })
  t.after(() => runtime.dispose())

  await runtime.open()
  const result = await runtime.bash('sleep 5', 1_000)
  assert.equal(result.valid, false)
  assert.equal(result.timedOut, true)
  assert.equal(result.exitCode, null)
  assert.equal(result.processExitCode, 1)
  assert.equal(result.failure.kind, 'timeout')
  assert.equal(result.failure.scope, 'command')
  assert.equal((await runtime.sessions()).sessions[0].status, 'healthy')
})

test('explicit SSH transport evidence marks the connection as error', async (t) => {
  const runtime = loadHostRuntime([{
    exitCode: 255,
    stderr: 'ssh: Could not resolve hostname example.test: Name or service not known\n',
  }])
  t.after(() => runtime.dispose())

  await runtime.open()
  const result = await runtime.bash('true')
  assert.equal(result.failure.kind, 'dns')
  assert.equal(result.failure.scope, 'connection')

  const [session] = (await runtime.sessions()).sessions
  assert.equal(session.status, 'error')
  assert.equal(session.connectionFailure.kind, 'dns')
})

test('normal close wins over command history and preserves counts', async (t) => {
  const runtime = loadHostRuntime([{ exitCode: 127, stderr: 'bash: missing: command not found\n' }])
  t.after(() => runtime.dispose())

  await runtime.open()
  await runtime.bash('missing')
  const closed = await runtime.close()
  assert.equal(closed.session.status, 'closed')
  assert.equal(closed.session.connectionFailure, null)
  assert.equal(closed.session.invalidCount, 1)
  assert.equal(closed.session.latestCommandFailure.kind, 'command-not-found')
})
