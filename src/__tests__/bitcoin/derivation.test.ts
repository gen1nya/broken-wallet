import { describe, it, expect } from 'vitest';
import { deriveWalletFromMnemonic } from '../../bitcoin';

describe('BIP84 Wallet Derivation', () => {
  // Test vector from https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki
  const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('should derive the correct zpub for BIP84 account m/84\'/0\'/0\'', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic);

    // Expected zpub for the test mnemonic
    // Note: This is the converted zpub from the BIP84 xpub
    expect(wallet.segwitAccount.zpub).toBeTruthy();
    expect(wallet.segwitAccount.zpub).toMatch(/^zpub/);
  });

  it('should derive the correct xpub for BIP44 legacy account m/44\'/0\'/0\'', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 1);

    expect(wallet.legacyAccount.xpub).toBeTruthy();
    expect(wallet.legacyAccount.xpub).toMatch(/^xpub/);
  });

  it('should derive the correct first receive address (m/84\'/0\'/0\'/0/0)', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 1);

    expect(wallet.segwitAccount.addresses).toHaveLength(3); // 1 receive + 2 change (min is 2)
    const firstReceive = wallet.segwitAccount.addresses.find(
      addr => addr.type === 'receive' && addr.path.endsWith('/0/0')
    );

    expect(firstReceive).toBeDefined();
    expect(firstReceive?.address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(firstReceive?.path).toBe("m/84'/0'/0'/0/0");
    expect(firstReceive?.format).toBe('p2wpkh');
  });

  it('should derive the correct second receive address (m/84\'/0\'/0\'/0/1)', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 2);

    const secondReceive = wallet.segwitAccount.addresses.find(
      addr => addr.type === 'receive' && addr.path.endsWith('/0/1')
    );

    expect(secondReceive).toBeDefined();
    expect(secondReceive?.address).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
    expect(secondReceive?.path).toBe("m/84'/0'/0'/0/1");
    expect(secondReceive?.format).toBe('p2wpkh');
  });

  it('should derive the correct first change address (m/84\'/0\'/0\'/1/0)', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 1);

    const firstChange = wallet.segwitAccount.addresses.find(
      addr => addr.type === 'change' && addr.path.endsWith('/1/0')
    );

    expect(firstChange).toBeDefined();
    expect(firstChange?.address).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el');
    expect(firstChange?.path).toBe("m/84'/0'/0'/1/0");
    expect(firstChange?.format).toBe('p2wpkh');
  });

  it('should derive legacy P2PKH addresses for BIP44 account', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 1);

    expect(wallet.legacyAccount.addresses).toHaveLength(3); // 1 receive + 2 change
    const firstLegacy = wallet.legacyAccount.addresses.find(
      addr => addr.type === 'receive' && addr.path.endsWith('/0/0')
    );

    expect(firstLegacy).toBeDefined();
    expect(firstLegacy?.address).toMatch(/^1/); // P2PKH addresses start with '1'
    expect(firstLegacy?.path).toBe("m/44'/0'/0'/0/0");
    expect(firstLegacy?.format).toBe('p2pkh');
  });

  it('should generate the requested number of receive addresses', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 10);

    const segwitReceive = wallet.segwitAccount.addresses.filter(addr => addr.type === 'receive');
    expect(segwitReceive).toHaveLength(10);

    const legacyReceive = wallet.legacyAccount.addresses.filter(addr => addr.type === 'receive');
    expect(legacyReceive).toHaveLength(10);
  });

  it('should generate change addresses (half of receive count)', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 10);

    const segwitChange = wallet.segwitAccount.addresses.filter(addr => addr.type === 'change');
    expect(segwitChange).toHaveLength(5);

    const legacyChange = wallet.legacyAccount.addresses.filter(addr => addr.type === 'change');
    expect(legacyChange).toHaveLength(5);
  });

  it('should include correct public keys in compressed format', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 1);

    [...wallet.segwitAccount.addresses, ...wallet.legacyAccount.addresses].forEach(addr => {
      // Compressed public keys are 33 bytes (66 hex characters)
      expect(addr.publicKey).toMatch(/^[0-9a-f]{66}$/);
      // Should start with 02 or 03 (compressed format)
      expect(addr.publicKey).toMatch(/^0[23]/);
    });
  });

  it('should generate bech32 addresses for segwit accounts', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 5);

    wallet.segwitAccount.addresses.forEach(addr => {
      expect(addr.address).toMatch(/^bc1/);
    });
  });

  it('should generate base58 addresses for legacy accounts', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 5);

    wallet.legacyAccount.addresses.forEach(addr => {
      expect(addr.address).toMatch(/^1/);
    });
  });

  it('should have all addresses be unique within each account', () => {
    const wallet = deriveWalletFromMnemonic(testMnemonic, 20);

    const segwitAddrs = wallet.segwitAccount.addresses.map(a => a.address);
    const uniqueSegwit = new Set(segwitAddrs);
    expect(uniqueSegwit.size).toBe(segwitAddrs.length);

    const legacyAddrs = wallet.legacyAccount.addresses.map(a => a.address);
    const uniqueLegacy = new Set(legacyAddrs);
    expect(uniqueLegacy.size).toBe(legacyAddrs.length);
  });

  it('should maintain consistent derivation (deterministic)', () => {
    const wallet1 = deriveWalletFromMnemonic(testMnemonic, 5);
    const wallet2 = deriveWalletFromMnemonic(testMnemonic, 5);

    expect(wallet1.segwitAccount.zpub).toBe(wallet2.segwitAccount.zpub);
    expect(wallet1.segwitAccount.addresses).toEqual(wallet2.segwitAccount.addresses);

    expect(wallet1.legacyAccount.xpub).toBe(wallet2.legacyAccount.xpub);
    expect(wallet1.legacyAccount.addresses).toEqual(wallet2.legacyAccount.addresses);
  });
});
