import { randomBytes } from 'crypto'

export function generateApiKey(): string {
  // Generate a 32-byte random string and convert to hex
  const randomString = randomBytes(32).toString('hex')
  // Format it as upv_xxxx_xxxx_xxxx_xxxx for better readability
  const chunks = randomString.match(/.{1,4}/g) || []
  return `upv_${chunks.slice(0, 4).join('_')}`
}

export function validateApiKey(key: string): boolean {
  // Check if the key matches our format: upv_xxxx_xxxx_xxxx_xxxx
  const apiKeyRegex = /^upv_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}$/
  return apiKeyRegex.test(key)
} 