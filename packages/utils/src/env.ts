import dotenv from 'dotenv'
import { expand } from 'dotenv-expand'
import { existsSync } from 'fs'
import { basename, join, normalize, posix } from 'path'

const WINDOWS_SLASH_REGEX = /\\/g

function slash(p: string): string {
  return p.replace(WINDOWS_SLASH_REGEX, '/')
}

function normalizePath(id: string): string {
  return posix.normalize(process.platform === 'win32' ? slash(id) : id)
}

/**
 * Env files are loaded in a fixed order; variables already present in the
 * process environment when a file is read are never overwritten, so more
 * specific files (.env.<mode>.local) win over generic ones (.env).
 */
function getEnvFilesForMode(mode: string, envDir: string): string[] {
  return [
    // default file
    '.env',
    // local file
    '.env.local',
    // mode file
    `.env.${mode}`,
    // mode local file
    `.env.${mode}.local`
  ].map(file => normalizePath(join(envDir, file)))
}

function loadEnv(mode: string, envDir: string): void {
  const envFiles = getEnvFilesForMode(mode, envDir)

  for (const filePath of envFiles) {
    if (existsSync(filePath)) {
      expand(dotenv.config({ path: filePath }))
      console.log('[Env] load env from %s', basename(filePath))
    }
  }
}

export { getEnvFilesForMode, loadEnv, normalizePath, slash }
