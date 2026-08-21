import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const hostPath = join(root, 'src', 'dynamic', 'host.js')
const clientPath = join(root, 'src', 'dynamic', 'client.js')
const dist = join(root, 'dist')
const host = readFileSync(hostPath, 'utf8').trimEnd()
const client = readFileSync(clientPath, 'utf8').trimEnd()

function validateBody(name, source, globals) {
  if (!source.startsWith('return {')) throw new Error(`${name} must be a plain function body beginning with return {`)
  if (/^\s*(?:import|export)\s/m.test(source)) throw new Error(`${name} cannot contain import or export statements`)
  if (/\brequire\s*\(/.test(source)) throw new Error(`${name} cannot contain require()`)
  new Function(...globals, source)
}

validateBody('Host source', host, ['harness'])
validateBody('Client source', client, ['React', 'styles', 'host'])

const definition = {
  plugin: { kind: 'new', idPrefix: 'sshman' },
  name: 'SSH Connection Health',
  purpose: '让 Agent 通过逻辑 SSH 会话执行远端 Bash，并向人类提供按会话下钻的只读连接健康和命令结果看板。',
  code: { host, client },
}

mkdirSync(dist, { recursive: true })
const packageText = `${JSON.stringify(definition, null, 2)}\n`
writeFileSync(join(dist, 'cordis-package.json'), packageText, 'utf8')

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const checksums = {
  algorithm: 'sha256',
  files: {
    'src/dynamic/host.js': sha256(`${host}\n`),
    'src/dynamic/client.js': sha256(`${client}\n`),
    'dist/cordis-package.json': sha256(packageText),
  },
}
writeFileSync(join(dist, 'checksums.json'), `${JSON.stringify(checksums, null, 2)}\n`, 'utf8')
console.log(`Built ${join(dist, 'cordis-package.json')}`)
