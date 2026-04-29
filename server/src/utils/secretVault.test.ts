import test from 'node:test'
import assert from 'node:assert/strict'
import { decryptSecret, encryptSecret, isEncryptedSecret } from './secretVault.js'

test('secret vault encrypts and decrypts secrets', () => {
  const raw = 'wx-private-key'
  const encrypted = encryptSecret(raw)

  assert.notEqual(encrypted, raw)
  assert.equal(isEncryptedSecret(encrypted), true)
  assert.equal(decryptSecret(encrypted), raw)
})

test('secret vault keeps plaintext backward compatible', () => {
  assert.equal(decryptSecret('legacy-token'), 'legacy-token')
})
