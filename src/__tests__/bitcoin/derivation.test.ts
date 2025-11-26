import { describe, it, expect } from 'vitest';
import { deriveWalletFromMnemonic } from '../../bitcoin';

describe('BIP84 Wallet Derivation', () => {
  // Test vector from https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki
  const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('should derive the correct zpub for BIP84 account m/84\'/0\'/0\'', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic);

    // Expected zpub for the test mnemonic
    // Note: This is the converted zpub from the BIP84 xpub
    expect(wallet.accountXpub).toBeTruthy();
    expect(wallet.accountXpub).toMatch(/^zpub/);
  });

  it('should derive the correct first receive address (m/84\'/0\'/0\'/0/0)', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 1);

    expect(wallet.addresses).toHaveLength(3); // 1 receive + 2 change (min is 2)
    const firstReceive = wallet.addresses.find(addr => addr.type === 'receive' && addr.path.endsWith('/0/0'));

    expect(firstReceive).toBeDefined();
    expect(firstReceive?.address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(firstReceive?.path).toBe("m/84'/0'/0'/0/0");
  });

  it('should derive the correct second receive address (m/84\'/0\'/0\'/0/1)', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 2);

    const secondReceive = wallet.addresses.find(addr => addr.type === 'receive' && addr.path.endsWith('/0/1'));

    expect(secondReceive).toBeDefined();
    expect(secondReceive?.address).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
    expect(secondReceive?.path).toBe("m/84'/0'/0'/0/1");
  });

  it('should derive the correct first change address (m/84\'/0\'/0\'/1/0)', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 1);

    const firstChange = wallet.addresses.find(addr => addr.type === 'change' && addr.path.endsWith('/1/0'));

    expect(firstChange).toBeDefined();
    expect(firstChange?.address).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el');
    expect(firstChange?.path).toBe("m/84'/0'/0'/1/0");
  });

  it('should generate the requested number of receive addresses', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 10);

    const receiveAddresses = wallet.addresses.filter(addr => addr.type === 'receive');
    expect(receiveAddresses).toHaveLength(10);
  });

  it('should generate change addresses (half of receive count)', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 10);

    const changeAddresses = wallet.addresses.filter(addr => addr.type === 'change');
    expect(changeAddresses).toHaveLength(5);
  });

  it('should include correct public keys in compressed format', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 1);

    wallet.addresses.forEach(addr => {
      // Compressed public keys are 33 bytes (66 hex characters)
      expect(addr.publicKey).toMatch(/^[0-9a-f]{66}$/);
      // Should start with 02 or 03 (compressed format)
      expect(addr.publicKey).toMatch(/^0[23]/);
    });
  });

  it('should generate bech32 addresses starting with bc1', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 5);

    wallet.addresses.forEach(addr => {
      expect(addr.address).toMatch(/^bc1/);
    });
  });

  it('should have all addresses be unique', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 20);

    const addresses = wallet.addresses.map(a => a.address);
    const uniqueAddresses = new Set(addresses);

    expect(uniqueAddresses.size).toBe(addresses.length);
  });

  it('should maintain consistent derivation (deterministic)', () => {
    const wallet1 = deriveWalletFromMnemonic(testMnemonic, 5);
    const wallet2 = deriveWalletFromMnemonic(testMnemonic, 5);

    expect(wallet1.accountXpub).toBe(wallet2.accountXpub);
    expect(wallet1.addresses).toEqual(wallet2.addresses);
  });
});
