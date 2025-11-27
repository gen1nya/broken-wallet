/**
 * Secure wallet storage using Web Crypto API
 *
 * Encrypts mnemonics with AES-GCM using keys derived from user passwords via PBKDF2.
 * Storage format is versioned JSON in localStorage.
 */

// Constants for cryptographic operations
const PBKDF2_ITERATIONS = 100000; // OWASP recommended minimum
const SALT_LENGTH = 16; // 128 bits
const IV_LENGTH = 12; // 96 bits for AES-GCM
const KEY_LENGTH = 256; // AES-256

// Storage key in localStorage
const STORAGE_KEY = 'broken-wallet-storage';

/**
 * Encrypted wallet metadata and ciphertext
 */
export interface EncryptedWallet {
  id: string;
  name: string;
  createdAt: string;
  crypto: {
    cipher: 'aes-256-gcm';
    kdf: 'pbkdf2';
    kdfParams: {
      iterations: number;
      hash: 'SHA-256';
      salt: string; // hex-encoded
    };
    iv: string; // hex-encoded
    ciphertext: string; // hex-encoded
  };
}

/**
 * Storage format in localStorage
 */
export interface WalletStorage {
  version: number;
  wallets: Record<string, EncryptedWallet>;
}

/**
 * Generates a random hex string of specified byte length
 */
function randomHex(byteLength: number): string {
  const buffer = new Uint8Array(byteLength);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  // Ensure proper ArrayBuffer type
  return new Uint8Array(bytes.buffer);
}

/**
 * Converts Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derives an AES-GCM key from password and salt using PBKDF2
 */
async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const passwordBuffer = new TextEncoder().encode(password);

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-GCM key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a mnemonic with a password
 *
 * @param mnemonic - BIP39 mnemonic phrase to encrypt
 * @param password - User password for encryption
 * @param name - Display name for the wallet
 * @returns Encrypted wallet object ready for storage
 */
export async function encryptWallet(
  mnemonic: string,
  password: string,
  name: string
): Promise<EncryptedWallet> {
  // Generate random salt and IV
  const salt = hexToBytes(randomHex(SALT_LENGTH));
  const iv = hexToBytes(randomHex(IV_LENGTH));

  // Derive key from password
  const key = await deriveKey(password, salt);

  // Encrypt mnemonic
  const plaintextBuffer = new TextEncoder().encode(mnemonic);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    plaintextBuffer
  );

  // Build encrypted wallet object
  return {
    id: randomHex(16), // 128-bit UUID
    name,
    createdAt: new Date().toISOString(),
    crypto: {
      cipher: 'aes-256-gcm',
      kdf: 'pbkdf2',
      kdfParams: {
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
        salt: bytesToHex(salt),
      },
      iv: bytesToHex(iv),
      ciphertext: bytesToHex(new Uint8Array(ciphertextBuffer)),
    },
  };
}

/**
 * Decrypts an encrypted wallet with a password
 *
 * @param wallet - Encrypted wallet object from storage
 * @param password - User password for decryption
 * @returns Decrypted mnemonic phrase
 * @throws Error if password is incorrect or decryption fails
 */
export async function decryptWallet(
  wallet: EncryptedWallet,
  password: string
): Promise<string> {
  // Parse crypto parameters
  const salt = hexToBytes(wallet.crypto.kdfParams.salt);
  const iv = hexToBytes(wallet.crypto.iv);
  const ciphertext = hexToBytes(wallet.crypto.ciphertext);

  // Derive key from password
  const key = await deriveKey(password, salt);

  // Decrypt mnemonic
  try {
    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );
    return new TextDecoder().decode(plaintextBuffer);
  } catch (error) {
    throw new Error('Incorrect password or corrupted wallet data');
  }
}

/**
 * Loads wallet storage from localStorage
 * Returns empty storage if not found
 */
export function loadWalletStorage(): WalletStorage {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return { version: 1, wallets: {} };
  }

  try {
    return JSON.parse(stored) as WalletStorage;
  } catch (error) {
    console.error('Failed to parse wallet storage:', error);
    return { version: 1, wallets: {} };
  }
}

/**
 * Saves wallet storage to localStorage
 */
export function saveWalletStorage(storage: WalletStorage): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
}

/**
 * Saves an encrypted wallet to localStorage
 */
export function saveWallet(wallet: EncryptedWallet): void {
  const storage = loadWalletStorage();
  storage.wallets[wallet.id] = wallet;
  saveWalletStorage(storage);
}

/**
 * Deletes a wallet from localStorage
 */
export function deleteWallet(walletId: string): void {
  const storage = loadWalletStorage();
  delete storage.wallets[walletId];
  saveWalletStorage(storage);
}

/**
 * Lists all saved wallet metadata (without decrypting)
 */
export function listWallets(): EncryptedWallet[] {
  const storage = loadWalletStorage();
  return Object.values(storage.wallets).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Gets a specific wallet by ID
 */
export function getWallet(walletId: string): EncryptedWallet | undefined {
  const storage = loadWalletStorage();
  return storage.wallets[walletId];
}
