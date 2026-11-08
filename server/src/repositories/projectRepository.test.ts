import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeEnvironments } from './projectRepository.js'

test('mergeEnvironments keeps fields that are not in the patch', () => {
  const base = { buildCommand: 'npm run build:weapp', dev: { robot: 3, setting: { es6: true, minifyJS: true } } }
  const merged = mergeEnvironments(base, { dev: { setting: { es6: false } }, installCommand: 'pnpm i' })
  assert.deepEqual(merged, {
    buildCommand: 'npm run build:weapp',
    installCommand: 'pnpm i',
    dev: { robot: 3, setting: { es6: false, minifyJS: true } },
  })
})

test('mergeEnvironments clears fields set to empty string or null', () => {
  const merged = mergeEnvironments({ buildCommand: 'x', miniprogramRoot: 'dist' }, { buildCommand: '', miniprogramRoot: null })
  assert.deepEqual(merged, { buildCommand: '' })
})
