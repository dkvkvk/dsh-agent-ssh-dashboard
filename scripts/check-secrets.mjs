import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('..', import.meta.url)))
const ignoredDirectories = new Set(['.git', 'node_modules', 'coverage'])
const ignoredFiles = new Set(['package-lock.json'])
const findings = []
const rules = [
  {
    name: 'private key material',
    pattern: /-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----/g,
  },
  {
    name: 'GitHub access token',
    pattern: /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  },
  {
    name: 'generic bearer token',
    pattern: /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._~+\/-]{20,}/gi,
  },
  {
    name: 'cloud secret assignment',
    pattern: /(?:SECRET_KEY|SECRETKEY)\s*[:=]\s*["'][^"'\s]{12,}["']/gi,
  },
]

function visit(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      if (!ignoredDirectories.has(entry)) visit(path)
      continue
    }
    if (ignoredFiles.has(entry) || stat.size > 2_000_000) continue
    let text
    try {
      text = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    for (const rule of rules) {
      rule.pattern.lastIndex = 0
      if (rule.pattern.test(text)) findings.push(`${relative(root, path)}: ${rule.name}`)
    }
  }
}

visit(root)
if (findings.length > 0) {
  console.error('Potential secrets found:')
  for (const finding of findings) console.error(`- ${finding}`)
  process.exitCode = 1
} else {
  console.log(`No credential patterns found under ${basename(root)}`)
}
