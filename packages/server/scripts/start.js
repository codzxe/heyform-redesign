#!/usr/bin/env node

const { existsSync } = require('fs')
const { spawnSync } = require('child_process')
const { join } = require('path')

const args = process.argv.slice(2)
const isWorker = args[0] === 'worker' || args.includes('--worker')

// `main.js` boots the HTTP server, `worker.js` boots the background
// worker (queues + cron schedules) without the HTTP layer.
const entryFile = isWorker ? 'worker.js' : 'main.js'

const candidates = [
  join(__dirname, '..', 'dist', entryFile),
  join(__dirname, '..', 'dist', 'src', entryFile),
  join(__dirname, '..', 'dist', 'packages', 'server', entryFile)
]

const entry = candidates.find(file => existsSync(file))

if (!entry) {
  process.stderr.write(
    `Unable to locate the built ${isWorker ? 'worker' : 'server'} entrypoint in dist/.\n`
  )
  process.exit(1)
}

const result = spawnSync(process.execPath, ['--enable-source-maps', entry], {
  stdio: 'inherit'
})

if (result.error) {
  process.stderr.write(String(result.error) + '\n')
  process.exit(1)
}

process.exit(result.status === null ? 0 : result.status)
