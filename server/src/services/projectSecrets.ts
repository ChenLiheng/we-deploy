import { toProjectResponse, parseProjectEnvironments, type ProjectRow } from '../mappers/projectMapper.js'
import { encryptSecret } from '../utils/secretVault.js'

export const DEFAULT_ENVIRONMENTS = JSON.stringify({
  dev: { robot: 1, setting: { es6: true, es7: true, minify: false } },
  prod: { robot: 2, setting: { es6: true, es7: true, minify: true } },
})

export function encryptEnvironmentSecrets(environments: any, existingRaw?: string): string {
  const next = { ...(environments || {}) }
  const existing = parseProjectEnvironments(existingRaw || '{}')

  if (next.private_key) {
    next.private_key = encryptSecret(next.private_key)
  } else if (existing.private_key) {
    next.private_key = existing.private_key
  } else {
    delete next.private_key
  }

  for (const envName of ['dev', 'prod']) {
    if (next[envName]?.private_key) {
      next[envName] = {
        ...next[envName],
        private_key: encryptSecret(next[envName].private_key),
      }
    } else if (existing[envName]?.private_key) {
      next[envName] = {
        ...(next[envName] || {}),
        private_key: existing[envName].private_key,
      }
    }
  }

  return JSON.stringify(next)
}

export { toProjectResponse, type ProjectRow }
