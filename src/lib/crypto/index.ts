/**
 * crypto/index.ts — Public API for the ConversationOS crypto core.
 *
 * Re-exports all public functions from the crypto sub-modules.
 * Import from '@/lib/crypto' rather than from individual files.
 *
 * SECURITY NOTE: Nothing in this module touches the passphrase or derived key
 * beyond what is needed for computation. Keys are never logged or persisted.
 */

export { deriveKey, generateSalt, DEFAULT_KDF_PARAMS } from './kdf'
export { encrypt, decrypt, bytesToBase64, base64ToBytes } from './aes'
export { generateVerifier, checkVerifier } from './verifier'
