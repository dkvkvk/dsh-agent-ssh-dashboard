import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const hostSource = readFileSync(join(root, 'src', 'dynamic', 'host.js'), 'utf8')
const clientSource = readFileSync(join(root, 'src', 'dynamic', 'client.js'), 'utf8')

test('dynamic Host and Client sources parse as plain function bodies', () => {
  assert.doesNotThrow(() => new Function('harness', hostSource))
  assert.doesNotThrow(() => new Function('React', 'styles', 'host', clientSource))
  assert.equal(/^\s*(?:import|export)\s/m.test(hostSource), false)
  assert.equal(/^\s*(?:import|export)\s/m.test(clientSource), false)
})

test('Client registers all intended UI slots without direct DOM access', () => {
  const registrations = []
  const slots = {
    inject(_name, mount) {
      return mount()
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  }
  const effects = []
  const ctx = {
    get(name) {
      return name === 'slots' ? slots : undefined
    },
    effect(factory) {
      const dispose = factory()
      effects.push(dispose)
      return dispose
    },
    interval() {
      return () => {}
    },
  }
  const React = {
    createElement() {
      return null
    },
    useState(initial) {
      return [initial, () => {}]
    },
    useEffect() {},
  }
  const styles = { insert: () => () => {} }
  const host = { call: async () => ({}) }
  const plugin = new Function('React', 'styles', 'host', clientSource)(React, styles, host)
  plugin.apply(ctx)

  assert.deepEqual(
    registrations.map(({ options }) => options.name).sort(),
    [
      'conversation.session.header.actions',
      'settings.section',
      'shell.overlay',
      'tool.call.toolview',
    ],
  )
  assert.equal(clientSource.includes('document.'), false)
  for (const dispose of effects.reverse()) if (typeof dispose === 'function') dispose()
})

test('built artifact is a direct cordis_define payload', () => {
  const artifact = JSON.parse(readFileSync(join(root, 'dist', 'cordis-package.json'), 'utf8'))
  assert.deepEqual(artifact.plugin, { kind: 'new', idPrefix: 'sshman' })
  assert.equal(artifact.name, 'SSH Connection Health')
  assert.equal(artifact.code.host, hostSource.trimEnd())
  assert.equal(artifact.code.client, clientSource.trimEnd())
})
