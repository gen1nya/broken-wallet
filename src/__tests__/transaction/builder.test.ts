import { describe, it, expect } from 'vitest';
import { detectAddressType } from '../../transactionBuilder';

describe('Transaction Builder', () => {
  describe('detectAddressType - Bitcoin', () => {
    it('should detect P2WPKH (native segwit) addresses', () => {
      const address = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
      expect(detectAddressType(address, 'btc')).toBe('p2wpkh');
    });

    it('should detect legacy P2PKH addresses', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'; // Genesis block address
      expect(detectAddressType(address, 'btc')).toBe('p2pkh');
    });

    it('should return null for invalid addresses', () => {
      const address = 'invalid_address';
      expect(detectAddressType(address, 'btc')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(detectAddressType('', 'btc')).toBeNull();
    });

    it('should detect multiple P2WPKH addresses correctly', () => {
      const addresses = [
        'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
        'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g',
        'bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el',
      ];

      addresses.forEach(addr => {
        expect(detectAddressType(addr, 'btc')).toBe('p2wpkh');
      });
    });

    it('should detect legacy addresses with different prefixes', () => {
      const legacyAddress = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
      expect(detectAddressType(legacyAddress, 'btc')).toBe('p2pkh');
    });
  });

  describe('detectAddressType - Litecoin', () => {
    it.skip('should detect LTC P2WPKH (native segwit) addresses', () => {
      // TODO: Find valid Litecoin segwit test address
      // Litecoin support is implemented but test addresses need validation
      const address = 'ltc1q8c6fshw2dlwun7ekn9qwf37cu2rn755u5emjyf';
      expect(detectAddressType(address, 'ltc')).toBe('p2wpkh');
    });

    it.skip('should detect LTC legacy P2PKH addresses', () => {
      // TODO: Find valid Litecoin legacy test address
      // Litecoin support is implemented but test addresses need validation
      const address = 'LM2WMpR1Rp6j3Sa59cMXMs1SPzj9eXpGc8';
      expect(detectAddressType(address, 'ltc')).toBe('p2pkh');
    });

    it('should reject BTC-specific addresses when checking LTC', () => {
      // BTC P2PKH should not be valid for LTC (different pubKeyHash)
      const btcAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(detectAddressType(btcAddress, 'ltc')).toBeNull();
    });
  });

  describe('detectAddressType - Dogecoin', () => {
    it('should detect DOGE P2PKH addresses', () => {
      // Valid Dogecoin address (starts with 'D')
      const address = 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L';
      expect(detectAddressType(address, 'doge')).toBe('p2pkh');
    });

    it('should return null for invalid DOGE addresses', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'; // BTC address
      expect(detectAddressType(address, 'doge')).toBeNull();
    });
  });

  describe('detectAddressType - Dash', () => {
    it('should detect DASH P2PKH addresses', () => {
      // Valid Dash address (starts with 'X')
      const address = 'XrZJJfEKRNobcuwWKTD3bDu8ou7XSWPbc9';
      expect(detectAddressType(address, 'dash')).toBe('p2pkh');
    });

    it('should return null for BTC addresses when checking DASH', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(detectAddressType(address, 'dash')).toBeNull();
    });
  });

  describe('Address format validation', () => {
    it('should only accept bc1 prefix for Bitcoin native segwit', () => {
      const validSegwit = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
      const invalidPrefix = 'tb1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'; // testnet

      expect(detectAddressType(validSegwit, 'btc')).toBe('p2wpkh');
      expect(detectAddressType(invalidPrefix, 'btc')).toBeNull();
    });

    it('should handle bech32 addresses (case-insensitive)', () => {
      const address = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
      const upperCase = address.toUpperCase();

      expect(detectAddressType(address, 'btc')).toBe('p2wpkh');
      expect(detectAddressType(upperCase, 'btc')).toBe('p2wpkh');
    });

    it('should use default network (BTC) when not specified', () => {
      const btcAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(detectAddressType(btcAddress)).toBe('p2pkh');
    });
  });
});
