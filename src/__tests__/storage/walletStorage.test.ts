import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  encryptWallet,
  decryptWallet,
  saveWallet,
  deleteWallet,
  listWallets,
  getWallet,
  loadWalletStorage,
  saveWalletStorage,
  type EncryptedWallet,
  type WalletStorage,
} from '../../walletStorage';

describe('walletStorage', () => {
  // Clear localStorage before each test
  beforeEach(() => {
    localStorage.clear();
  });

  describe('encryptWallet / decryptWallet', () => {
    it('should encrypt and decrypt a mnemonic correctly', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const password = 'test-password-123';
      const name = 'Test Wallet';

      const encrypted = await encryptWallet(mnemonic, password, name);

      expect(encrypted).toMatchObject({
        id: expect.any(String),
        name,
        createdAt: expect.any(String),
        crypto: {
          cipher: 'aes-256-gcm',
          kdf: 'pbkdf2',
          kdfParams: {
            iterations: 100000,
            hash: 'SHA-256',
            salt: expect.any(String),
          },
          iv: expect.any(String),
          ciphertext: expect.any(String),
        },
      });

      // Verify salt and IV are hex strings of correct length
      expect(encrypted.crypto.kdfParams.salt).toMatch(/^[0-9a-f]{32}$/); // 16 bytes = 32 hex chars
      expect(encrypted.crypto.iv).toMatch(/^[0-9a-f]{24}$/); // 12 bytes = 24 hex chars

      // Decrypt and verify
      const decrypted = await decryptWallet(encrypted, password);
      expect(decrypted).toBe(mnemonic);
    });

    it('should throw error on incorrect password', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const password = 'correct-password';
      const wrongPassword = 'wrong-password';

      const encrypted = await encryptWallet(mnemonic, password, 'Test Wallet');

      await expect(decryptWallet(encrypted, wrongPassword)).rejects.toThrow(
        'Incorrect password or corrupted wallet data'
      );
    });

    it('should produce different ciphertexts for same mnemonic (due to random salt/IV)', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const password = 'test-password';

      const encrypted1 = await encryptWallet(mnemonic, password, 'Wallet 1');
      const encrypted2 = await encryptWallet(mnemonic, password, 'Wallet 2');

      // Different salts and IVs
      expect(encrypted1.crypto.kdfParams.salt).not.toBe(encrypted2.crypto.kdfParams.salt);
      expect(encrypted1.crypto.iv).not.toBe(encrypted2.crypto.iv);

      // Different ciphertexts
      expect(encrypted1.crypto.ciphertext).not.toBe(encrypted2.crypto.ciphertext);

      // Both decrypt to same mnemonic
      expect(await decryptWallet(encrypted1, password)).toBe(mnemonic);
      expect(await decryptWallet(encrypted2, password)).toBe(mnemonic);
    });

    it('should handle special characters in mnemonic and password', async () => {
      const mnemonic = 'test mnemonic with émojis 🔐 and ñ special çhars';
      const password = 'pässwörd-with-spëcial-çhàrs-🔑';

      const encrypted = await encryptWallet(mnemonic, password, 'Special Wallet');
      const decrypted = await decryptWallet(encrypted, password);

      expect(decrypted).toBe(mnemonic);
    });
  });

  describe('localStorage operations', () => {
    it('should save and load wallet storage', () => {
      const storage: WalletStorage = {
        version: 1,
        wallets: {},
      };

      saveWalletStorage(storage);

      const loaded = loadWalletStorage();
      expect(loaded).toEqual(storage);
    });

    it('should return empty storage if localStorage is empty', () => {
      const loaded = loadWalletStorage();

      expect(loaded).toEqual({
        version: 1,
        wallets: {},
      });
    });

    it('should handle corrupted localStorage data gracefully', () => {
      localStorage.setItem('broken-wallet-storage', 'invalid json {');

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const loaded = loadWalletStorage();

      expect(loaded).toEqual({
        version: 1,
        wallets: {},
      });
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('saveWallet / getWallet / deleteWallet', () => {
    it('should save and retrieve a wallet', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const password = 'test-password';
      const wallet = await encryptWallet(mnemonic, password, 'Test Wallet');

      saveWallet(wallet);

      const retrieved = getWallet(wallet.id);
      expect(retrieved).toEqual(wallet);
    });

    it('should save multiple wallets', async () => {
      const wallet1 = await encryptWallet('mnemonic one', 'pass1', 'Wallet 1');
      const wallet2 = await encryptWallet('mnemonic two', 'pass2', 'Wallet 2');

      saveWallet(wallet1);
      saveWallet(wallet2);

      expect(getWallet(wallet1.id)).toEqual(wallet1);
      expect(getWallet(wallet2.id)).toEqual(wallet2);
    });

    it('should delete a wallet', async () => {
      const wallet = await encryptWallet('test mnemonic', 'password', 'Test Wallet');

      saveWallet(wallet);
      expect(getWallet(wallet.id)).toBeDefined();

      deleteWallet(wallet.id);
      expect(getWallet(wallet.id)).toBeUndefined();
    });

    it('should return undefined for non-existent wallet', () => {
      const retrieved = getWallet('non-existent-id');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('listWallets', () => {
    it('should return empty array when no wallets saved', () => {
      const wallets = listWallets();
      expect(wallets).toEqual([]);
    });

    it('should list all saved wallets', async () => {
      const wallet1 = await encryptWallet('mnemonic one', 'pass1', 'Wallet 1');
      const wallet2 = await encryptWallet('mnemonic two', 'pass2', 'Wallet 2');

      saveWallet(wallet1);
      saveWallet(wallet2);

      const wallets = listWallets();
      expect(wallets).toHaveLength(2);
      expect(wallets).toContainEqual(wallet1);
      expect(wallets).toContainEqual(wallet2);
    });

    it('should sort wallets by creation date (newest first)', async () => {
      const wallet1 = await encryptWallet('mnemonic one', 'pass1', 'Wallet 1');
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      const wallet2 = await encryptWallet('mnemonic two', 'pass2', 'Wallet 2');
      await new Promise(resolve => setTimeout(resolve, 10));
      const wallet3 = await encryptWallet('mnemonic three', 'pass3', 'Wallet 3');

      saveWallet(wallet1);
      saveWallet(wallet2);
      saveWallet(wallet3);

      const wallets = listWallets();

      expect(wallets[0].id).toBe(wallet3.id); // newest
      expect(wallets[1].id).toBe(wallet2.id);
      expect(wallets[2].id).toBe(wallet1.id); // oldest
    });
  });

  describe('security properties', () => {
    it('should use PBKDF2 with 100k iterations', async () => {
      const wallet = await encryptWallet('test mnemonic', 'password', 'Test');

      expect(wallet.crypto.kdfParams.iterations).toBe(100000);
    });

    it('should use SHA-256 hash function', async () => {
      const wallet = await encryptWallet('test mnemonic', 'password', 'Test');

      expect(wallet.crypto.kdfParams.hash).toBe('SHA-256');
    });

    it('should use AES-256-GCM cipher', async () => {
      const wallet = await encryptWallet('test mnemonic', 'password', 'Test');

      expect(wallet.crypto.cipher).toBe('aes-256-gcm');
    });

    it('should generate unique wallet IDs', async () => {
      const wallet1 = await encryptWallet('mnemonic', 'password', 'Wallet 1');
      const wallet2 = await encryptWallet('mnemonic', 'password', 'Wallet 2');

      expect(wallet1.id).not.toBe(wallet2.id);
      expect(wallet1.id).toMatch(/^[0-9a-f]{32}$/); // 16 bytes = 32 hex chars
    });
  });
});
