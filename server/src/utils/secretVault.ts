import crypto from 'crypto'

const PREFIX = 'enc:v1:'

function getSecretKey(): Buffer {
  const key = process.env.APP_ENCRYPTION_KEY
  if (!key && process.env.NODE_ENV === 'production') {
    throw new Error('APP_ENCRYPTION_KEY must be configured in production')
  }
  return crypto.createHash('sha256').update(key || 'we-deploy-dev-encryption-key').digest()
}

export function isEncryptedSecret(value?: string): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

export function encryptSecret(value?: string): string {
  if (!value) return ''
  if (isEncryptedSecret(value)) return value

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecretKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    PREFIX.slice(0, -1),
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

export function decryptSecret(value?: string): string {
  if (!value) return ''
  if (!isEncryptedSecret(value)) return value

  const [, version, ivRaw, tagRaw, ciphertextRaw] = value.split(':')
  if (version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error('Invalid encrypted secret format')
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getSecretKey(),
    Buffer.from(ivRaw, 'base64url')
  )
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
