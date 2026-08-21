import assert from 'node:assert/strict'
import test from 'node:test'
import { loadHostRuntime } from './helpers/dynamic-runtime.mjs'

// Helper: build a task runtime with the right subprocess plans
function taskRuntime(plans = []) {
  return loadHostRuntime(plans)
}

test('Case 1: task still running + metadata file does not exist => RUNNING', async (t) => {
  // Plan 1: start command succeeds (nohup style)
  // Plan 2: poll returns PID_ALIVE but no result file
  const runtime = taskRuntime([
    { exitCode: 0, stdout: '12345\n', stderr: '' },
    { exitCode: 0, stdout: 'PID_ALIVE=yes\nPID=12345\nRESULT_READY=no\n', stderr: '' },
  ])
  t.after(() => runtime.dispose())

  await runtime.open()
  const startResult = await runtime.tools.get('ssh_task_start').execute({
    session: 'test-session',
    task_id: 'benchmark-1',
    command: 'nohup bash run.sh > /tmp/log.txt 2>&1 & echo $! > /tmp/task.pid',
    pid_file: '/tmp/task.pid',
    result_file: '/tmp/run_metadata.csv',
    log_file: '/tmp/log.txt',
  })
  assert.equal(startResult.status, 'pending')

  const status = await runtime.tools.get('ssh_task_status').execute({
    session: 'test-session',
    task_id: 'benchmark-1',
  })
  assert.equal(status.status, 'running')
  assert.equal(status.pidAlive, true)
  assert.equal(status.resultReady, false)
})

test('Case 2: task completed + exit_code=0 => SUCCESS', async (t) => {
  const runtime = taskRuntime([
    { exitCode: 0, stdout: '12345\n', stderr: '' },
    { exitCode: 0, stdout: 'PID_DEAD=yes\nPID=12345\nRESULT_READY=yes\nRESULT_EXIT_CODE=0\n', stderr: '' },
  ])
  t.after(() => runtime.dispose())

  await runtime.open()
  await runtime.tools.get('ssh_task_start').execute({
    session: 'test-session',
    task_id: 'benchmark-2',
    command: 'nohup bash run.sh > /tmp/log.txt 2>&1 & echo $! > /tmp/task.pid',
    pid_file: '/tmp/task.pid',
    result_file: '/tmp/run_metadata.csv',
  })
  const status = await runtime.tools.get('ssh_task_status').execute({
    session: 'test-session',
    task_id: 'benchmark-2',
  })
  assert.equal(status.status, 'success')
  assert.equal(status.exitCode, 0)
  assert.equal(status.resultReady, true)
})

test('Case 3: task completed + exit_code!=0 => FAILED', async (t) => {
  const runtime = taskRuntime([
    { exitCode: 0, stdout: '12345\n', stderr: '' },
    { exitCode: 0, stdout: 'PID_DEAD=yes\nPID=12345\nRESULT_READY=yes\nRESULT_EXIT_CODE=1\n', stderr: 'some error' },
  ])
  t.after(() => runtime.dispose())

  await runtime.open()
  await runtime.tools.get('ssh_task_start').execute({
    session: 'test-session',
    task_id: 'benchmark-3',
    command: 'nohup bash run.sh > /tmp/log.txt 2>&1 & echo $! > /tmp/task.pid',
    pid_file: '/tmp/task.pid',
    result_file: '/tmp/run_metadata.csv',
  })
  const status = await runtime.tools.get('ssh_task_status').execute({
    session: 'test-session',
    task_id: 'benchmark-3',
  })
  assert.equal(status.status, 'failed')
  assert.equal(status.exitCode, 1)
})

test('Case 4: task completed + metadata does not exist => FAILED', async (t) => {
  const runtime = taskRuntime([
    { exitCode: 0, stdout: '12345\n', stderr: '' },
    { exitCode: 0, stdout: 'PID_DEAD=yes\nPID=12345\nRESULT_READY=no\n', stderr: '' },
  ])
  t.after(() => runtime.dispose())

  await runtime.open()
  await runtime.tools.get('ssh_task_start').execute({
    session: 'test-session',
    task_id: 'benchmark-4',
    command: 'nohup bash run.sh > /tmp/log.txt 2>&1 & echo $! > /tmp/task.pid',
    pid_file: '/tmp/task.pid',
    result_file: '/tmp/run_metadata.csv',
  })
  const status = await runtime.tools.get('ssh_task_status').execute({
    session: 'test-session',
    task_id: 'benchmark-4',
  })
  assert.equal(status.status, 'failed')
  assert.ok(status.message.indexOf('结果文件') >= 0 || status.message.indexOf('结束') >= 0)
})

test('Case 5: SSH connection failure => transport=failed', async (t) => {
  const runtime = taskRuntime([
    { exitCode: 0, stdout: '12345\n', stderr: '' },
    { kind: 'spawn-error', message: 'SSH connection timed out' },
  ])
  t.after(() => runtime.dispose())

  await runtime.open()
  await runtime.tools.get('ssh_task_start').execute({
    session: 'test-session',
    task_id: 'benchmark-5',
    command: 'nohup bash run.sh > /tmp/log.txt 2>&1 & echo $! > /tmp/task.pid',
    pid_file: '/tmp/task.pid',
    result_file: '/tmp/run_metadata.csv',
  })
  const status = await runtime.tools.get('ssh_task_status').execute({
    session: 'test-session',
    task_id: 'benchmark-5',
  })
  assert.equal(status.status, 'unknown')
  assert.ok(status.message.indexOf('SSH') >= 0 || status.message.indexOf('失败') >= 0)
})

test('Case 6: metadata delayed generation => RUNNING during delay', async (t) => {
  // Simulate 3 polls: first 2 show RUNNING, 3rd shows SUCCESS
  const runtime = taskRuntime([
    { exitCode: 0, stdout: '12345\n', stderr: '' },
    { exitCode: 0, stdout: 'PID_ALIVE=yes\nPID=12345\nRESULT_READY=no\n', stderr: '' },
    { exitCode: 0, stdout: 'PID_ALIVE=yes\nPID=12345\nRESULT_READY=no\n', stderr: '' },
    { exitCode: 0, stdout: 'PID_DEAD=yes\nPID=12345\nRESULT_READY=yes\nRESULT_EXIT_CODE=0\n', stderr: '' },
  ])
  t.after(() => runtime.dispose())

  await runtime.open()
  await runtime.tools.get('ssh_task_start').execute({
    session: 'test-session',
    task_id: 'benchmark-6',
    command: 'nohup bash run.sh > /tmp/log.txt 2>&1 & echo $! > /tmp/task.pid',
    pid_file: '/tmp/task.pid',
    result_file: '/tmp/run_metadata.csv',
  })

  // Poll 1: still running
  const s1 = await runtime.tools.get('ssh_task_status').execute({
    session: 'test-session',
    task_id: 'benchmark-6',
  })
  assert.equal(s1.status, 'running')
  assert.equal(s1.resultReady, false)

  // Poll 2: still running
  const s2 = await runtime.tools.get('ssh_task_status').execute({
    session: 'test-session',
    task_id: 'benchmark-6',
  })
  assert.equal(s2.status, 'running')

  // Poll 3: success
  const s3 = await runtime.tools.get('ssh_task_status').execute({
    session: 'test-session',
    task_id: 'benchmark-6',
  })
  assert.equal(s3.status, 'success')
})

test('Case 7: task timeout', async (t) => {
  const runtime = taskRuntime([
    { exitCode: 0, stdout: '12345\n', stderr: '' },
  ])
  t.after(() => runtime.dispose())

  await runtime.open()
  // Start with a very short hard timeout (1ms will trigger immediately)
  await runtime.tools.get('ssh_task_start').execute({
    session: 'test-session',
    task_id: 'benchmark-7',
    command: 'nohup bash run.sh > /tmp/log.txt 2>&1 & echo $! > /tmp/task.pid',
    pid_file: '/tmp/task.pid',
    result_file: '/tmp/run_metadata.csv',
    hard_timeout_ms: 1,
  })
  const status = await runtime.tools.get('ssh_task_status').execute({
    session: 'test-session',
    task_id: 'benchmark-7',
  })
  assert.equal(status.status, 'timeout')
})

test('Case 8: multiple concurrent tasks do not interfere', async (t) => {
  const runtime = taskRuntime([
    { exitCode: 0, stdout: '111\n', stderr: '' },
    { exitCode: 0, stdout: '222\n', stderr: '' },
    { exitCode: 0, stdout: 'PID_ALIVE=yes\nPID=111\nRESULT_READY=no\n', stderr: '' },
    { exitCode: 0, stdout: 'PID_DEAD=yes\nPID=222\nRESULT_READY=yes\nRESULT_EXIT_CODE=0\n', stderr: '' },
  ])
  t.after(() => runtime.dispose())

  await runtime.open()
  await runtime.tools.get('ssh_task_start').execute({
    session: 'test-session', task_id: 'task-a',
    command: 'nohup bash run_a.sh > /tmp/log_a.txt 2>&1 & echo $! > /tmp/task_a.pid',
    pid_file: '/tmp/task_a.pid', result_file: '/tmp/result_a.csv',
  })
  await runtime.tools.get('ssh_task_start').execute({
    session: 'test-session', task_id: 'task-b',
    command: 'nohup bash run_b.sh > /tmp/log_b.txt 2>&1 & echo $! > /tmp/task_b.pid',
    pid_file: '/tmp/task_b.pid', result_file: '/tmp/result_b.csv',
  })

  const statusA = await runtime.tools.get('ssh_task_status').execute({
    session: 'test-session', task_id: 'task-a',
  })
  const statusB = await runtime.tools.get('ssh_task_status').execute({
    session: 'test-session', task_id: 'task-b',
  })

  assert.equal(statusA.status, 'running')
  assert.equal(statusB.status, 'success')
  // Ensure tasks don't cross-contaminate
  assert.notEqual(statusA.taskId, statusB.taskId)
})

test('ssh_task_stop: gracefully stops a running task', async (t) => {
  const runtime = taskRuntime([
    { exitCode: 0, stdout: '12345\n', stderr: '' },
    { exitCode: 0, stdout: 'KILLED_PID=12345\n', stderr: '' },
  ])
  t.after(() => runtime.dispose())

  await runtime.open()
  await runtime.tools.get('ssh_task_start').execute({
    session: 'test-session', task_id: 'task-stop',
    command: 'nohup bash run.sh > /tmp/log.txt 2>&1 & echo $! > /tmp/task.pid',
    pid_file: '/tmp/task.pid', result_file: '/tmp/result.csv',
  })
  const stopResult = await runtime.tools.get('ssh_task_stop').execute({
    session: 'test-session', task_id: 'task-stop',
  })
  assert.equal(stopResult.status, 'cancelled')
  assert.equal(stopResult.stopped, true)
})

test('ssh_task_list: lists all tasks', async (t) => {
  const runtime = taskRuntime([
    { exitCode: 0, stdout: '111\n', stderr: '' },
    { exitCode: 0, stdout: '222\n', stderr: '' },
  ])
  t.after(() => runtime.dispose())

  await runtime.open()
  await runtime.tools.get('ssh_task_start').execute({
    session: 'test-session', task_id: 'task-1',
    command: 'nohup bash run1.sh > /tmp/log1.txt 2>&1 & echo $! > /tmp/task1.pid',
    pid_file: '/tmp/task1.pid',
  })
  await runtime.tools.get('ssh_task_start').execute({
    session: 'test-session', task_id: 'task-2',
    command: 'nohup bash run2.sh > /tmp/log2.txt 2>&1 & echo $! > /tmp/task2.pid',
    pid_file: '/tmp/task2.pid',
  })

  const list = await runtime.tools.get('ssh_task_list').execute({})
  assert.equal(list.count, 2)
  assert.equal(list.tasks.length, 2)
})

test('exit code 1 from cat (file not found) is classified as file-not-found, not remote-exit', async (t) => {
  const runtime = loadHostRuntime([{
    exitCode: 1,
    stderr: 'cat: /tmp/run_metadata.csv: No such file or directory\n',
  }])
  t.after(() => runtime.dispose())

  await runtime.open()
  const result = await runtime.bash('cat /tmp/run_metadata.csv')
  assert.equal(result.valid, false)
  assert.equal(result.failure.kind, 'file-not-found')
  assert.equal(result.failure.scope, 'command')
  assert.ok(result.failure.message.indexOf('不存在') >= 0 || result.failure.message.indexOf('暂不存在') >= 0)

  // Session should still be healthy - file not found is not a connection error
  const [session] = (await runtime.sessions()).sessions
  assert.equal(session.status, 'healthy')
})
