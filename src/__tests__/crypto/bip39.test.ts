import { describe, it, expect } from 'vitest';
import { createRandomMnemonic, deriveWalletFromMnemonic } from '../../bitcoin';

describe('BIP39 Mnemonic Generation', () => {
  it('should generate a valid 12-word mnemonic', () => {
    const mnemonic = createRandomMnemonic();
    const words = mnemonic.split(' ');

    expect(words).toHaveLength(12);
    expect(mnemonic).toMatch(/^[a-z ]+$/); // Only lowercase letters and spaces
  });

  it('should generate different mnemonics each time', () => {
    const mnemonic1 = createRandomMnemonic();
    const mnemonic2 = createRandomMnemonic();

    expect(mnemonic1).not.toBe(mnemonic2);
  });

  it('should accept a valid mnemonic', () => {
    const validMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    expect(() => {
      deriveWalletFromMnemonic(validMnemonic);
    }).not.toThrow();
  });

  it('should reject an invalid mnemonic', () => {
    const invalidMnemonic = 'invalid mnemonic with random words that are not in bip39 wordlist';

    expect(() => {
      deriveWalletFromMnemonic(invalidMnemonic);
    }).toThrow('Invalid mnemonic');
  });

  it('should reject a mnemonic with wrong word count', () => {
    const shortMnemonic = 'abandon abandon abandon';

    expect(() => {
      deriveWalletFromMnemonic(shortMnemonic);
    }).toThrow('Invalid mnemonic');
  });
});
