import { HDKey } from '@scure/bip32';
import { sha256 } from '@noble/hashes/sha256';
import bs58 from 'bs58';

/**
 * Password Manager Derivation Scheme
 *
 * This module implements deterministic password generation based on BIP32 key derivation.
 *
 * Derivation path: m/128'/0'/{index}
 * - 128' - Non-standard purpose (outside BIP44/84 range) to avoid conflicts with cryptocurrency paths
 * - 0' - Password manager instance
 * - {index} - Derived from hash of login
 *
 * Password generation process:
 * 1. Hash the login string using SHA-256
 * 2. First 4 bytes of hash → derivation index (uint32)
 * 3. Next 32 bytes of hash → additional salt for key mixing
 * 4. Derive key at m/128'/0'/{index}
 * 5. Mix private key with salt using SHA-256
 * 6. Encode result as base58
 */

const PASSWORD_DERIVATION_BASE = "m/128'/0'";

/**
 * Generates a deterministic password from login and master seed
 * @param login - The login/username/service identifier
 * @param hdRoot - HD root key derived from mnemonic
 * @param nonce - Password version/nonce for rotation (default 0)
 * @param length - Desired password length (default 32, max 43 for base58 of 32 bytes)
 * @returns Base58-encoded password
 */
export function derivePasswordFromLogin(
  login: string,
  hdRoot: HDKey,
  nonce: number = 0,
  length: number = 32
): string {
  try {
    // Step 1: Hash the login + nonce to get deterministic data
    const loginWithNonce = `${login}:${nonce}`;
    const loginHash = sha256(new TextEncoder().encode(loginWithNonce));

    // Step 2: Extract index from first 4 bytes of hash
    const indexBytes = loginHash.slice(0, 4);
    const index = new DataView(indexBytes.buffer).getUint32(0, false);

    // Step 3: Extract salt from next 32 bytes (re-hash to get full 32 bytes)
    const saltInput = loginHash.slice(4);
    const salt = sha256(saltInput);

    // Step 4: Derive key at m/128'/0'/{index}
    // Note: Need to use hardened derivation for the base path
    const derivedKey = hdRoot
      .deriveChild(128 + 0x80000000) // 128' (hardened)
      .deriveChild(0 + 0x80000000)   // 0' (hardened)
      .deriveChild(index);            // index (normal)

    if (!derivedKey.privateKey) {
      throw new Error('Failed to derive private key for password generation');
    }

    // Step 5: Mix private key with salt
    const mixed = new Uint8Array(64);
    mixed.set(derivedKey.privateKey, 0);
    mixed.set(salt, 32);
    const passwordHash = sha256(mixed);

    // Step 6: Encode as base58 and truncate to desired length
    const base58Password = bs58.encode(passwordHash);

    // Ensure we don't exceed available length
    const finalLength = Math.min(length, base58Password.length);
    return base58Password.slice(0, finalLength);
  } catch (err) {
    console.error('Password derivation error:', err);
    throw new Error(`Failed to derive password: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Generates multiple passwords for a list of logins
 * @param logins - Array of login identifiers
 * @param hdRoot - HD root key derived from mnemonic
 * @param length - Desired password length
 * @returns Map of login → password
 */
export function derivePasswordsForLogins(
  logins: Array<{ login: string; nonce?: number }>,
  hdRoot: HDKey,
  length: number = 32
): Map<string, string> {
  const passwords = new Map<string, string>();

  for (const item of logins) {
    const password = derivePasswordFromLogin(item.login, hdRoot, item.nonce || 0, length);
    passwords.set(item.login, password);
  }

  return passwords;
}

/**
 * Validates login string (basic sanitization)
 * @param login - Login to validate
 * @returns True if login is valid
 */
export function isValidLogin(login: string): boolean {
  return login.trim().length > 0 && login.length <= 256;
}
