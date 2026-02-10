import { safeStorage } from 'electron'

export function encryptKey(plaintext: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS keychain encryption not available')
  }
  const encrypted = safeStorage.encryptString(plaintext)
  return encrypted.toString('base64')
}

export function decryptKey(encryptedBase64: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS keychain encryption not available')
  }
  const buffer = Buffer.from(encryptedBase64, 'base64')
  return safeStorage.decryptString(buffer)
}
