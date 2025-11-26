import { describe, it, expect } from 'vitest';
import { detectAddressType } from '../../transactionBuilder';

describe('Transaction Builder', () => {
  describe('detectAddressType', () => {
    it('should detect P2WPKH (native segwit) addresses', () => {
      const address = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
      expect(detectAddressType(address)).toBe('p2wpkh');
    });

    it('should detect legacy P2PKH addresses', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'; // Genesis block address
      expect(detectAddressType(address)).toBe('p2pkh');
    });

    it('should return null for invalid addresses', () => {
      const address = 'invalid_address';
      expect(detectAddressType(address)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(detectAddressType('')).toBeNull();
    });

    it('should detect multiple P2WPKH addresses correctly', () => {
      const addresses = [
        'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
        'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g',
        'bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el',
      ];

      addresses.forEach(addr => {
        expect(detectAddressType(addr)).toBe('p2wpkh');
      });
    });

    it('should detect legacy addresses with different prefixes', () => {
      // Note: These might not be valid addresses, but testing the detection logic
      const legacyAddress = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
      expect(detectAddressType(legacyAddress)).toBe('p2pkh');
    });
  });

  describe('Address format validation', () => {
    it('should only accept bc1 prefix for native segwit', () => {
      const validSegwit = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
      const invalidPrefix = 'tb1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'; // testnet

      expect(detectAddressType(validSegwit)).toBe('p2wpkh');
      // Testnet addresses should either be detected as p2wpkh or null depending on implementation
      // For mainnet-only, it should be null
      expect(detectAddressType(invalidPrefix)).toBeNull();
    });

    it('should handle bech32 addresses (case-insensitive)', () => {
      // Bech32 addresses can be uppercase or lowercase
      const address = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
      const upperCase = address.toUpperCase();

      expect(detectAddressType(address)).toBe('p2wpkh');
      // Bech32 supports both cases
      expect(detectAddressType(upperCase)).toBe('p2wpkh');
    });
  });
});
