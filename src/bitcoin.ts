import { mnemonicToSeedSync, generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { base58check, bech32 } from '@scure/base';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { sha256 } from '@noble/hashes/sha256';

export type AddressType = 'receive' | 'change';
export type AddressFormat = 'p2wpkh' | 'p2pkh';

export interface DerivedAddress {
  address: string;
  path: string;
  publicKey: string;
  type: AddressType;
  format: AddressFormat;
}

export interface WalletDerivation {
  mnemonic: string;
  segwitAccount: {
    zpub: string;
    addresses: DerivedAddress[];
  };
  legacyAccount: {
    xpub: string;
    addresses: DerivedAddress[];
  };
}

const NETWORK_PREFIX = 'bc';
const NETWORK_VERSION_P2PKH = 0x00;
const SEGWIT_ACCOUNT_PATH = "m/84'/0'/0'";
const LEGACY_ACCOUNT_PATH = "m/44'/0'/0'";
const ZPUB_PREFIX = new Uint8Array([0x04, 0xb2, 0x47, 0x46]);
const XPUB_PREFIX = new Uint8Array([0x04, 0x88, 0xb2, 0x1e]);
const base58checkCodec = base58check(sha256);

function hash160(publicKey: Uint8Array): Uint8Array {
  return ripemd160(sha256(publicKey));
}

function toBech32Address(hash: Uint8Array): string {
  const words = bech32.toWords(hash);
  words.unshift(0); // witness version 0
  return bech32.encode(NETWORK_PREFIX, words);
}

function toBase58Address(hash: Uint8Array, version: number): string {
  const payload = new Uint8Array(21);
  payload[0] = version;
  payload.set(hash, 1);
  return base58checkCodec.encode(payload);
}

function deriveSegwitAddress(account: HDKey, chain: number, index: number, type: AddressType): DerivedAddress {
  const node = account.deriveChild(chain).deriveChild(index);
  if (!node.publicKey) {
    throw new Error('Unable to derive public key');
  }

  const hash = hash160(node.publicKey);
  const address = toBech32Address(hash);

  return {
    address,
    path: `${SEGWIT_ACCOUNT_PATH}/${chain}/${index}`,
    publicKey: Array.from(node.publicKey)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(''),
    type,
    format: 'p2wpkh',
  };
}

function deriveLegacyAddress(account: HDKey, chain: number, index: number, type: AddressType): DerivedAddress {
  const node = account.deriveChild(chain).deriveChild(index);
  if (!node.publicKey) {
    throw new Error('Unable to derive public key');
  }

  const hash = hash160(node.publicKey);
  const address = toBase58Address(hash, NETWORK_VERSION_P2PKH);

  return {
    address,
    path: `${LEGACY_ACCOUNT_PATH}/${chain}/${index}`,
    publicKey: Array.from(node.publicKey)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(''),
    type,
    format: 'p2pkh',
  };
}

export function deriveWalletFromMnemonic(mnemonic: string, addressCount = 5): WalletDerivation {
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Invalid mnemonic');
  }
  const seed = mnemonicToSeedSync(mnemonic);
  const master = HDKey.fromMasterSeed(seed);

  // Derive segwit account (BIP84)
  const segwitAccount = master.derive(SEGWIT_ACCOUNT_PATH);
  if (!segwitAccount.publicExtendedKey) {
    throw new Error('Unable to derive segwit account xpub');
  }

  const segwitReceive: DerivedAddress[] = Array.from({ length: addressCount }, (_, index) =>
    deriveSegwitAddress(segwitAccount, 0, index, 'receive'),
  );
  const segwitChange: DerivedAddress[] = Array.from({ length: Math.max(2, Math.floor(addressCount / 2)) }, (_, index) =>
    deriveSegwitAddress(segwitAccount, 1, index, 'change'),
  );

  // Derive legacy account (BIP44)
  const legacyAccount = master.derive(LEGACY_ACCOUNT_PATH);
  if (!legacyAccount.publicExtendedKey) {
    throw new Error('Unable to derive legacy account xpub');
  }

  const legacyReceive: DerivedAddress[] = Array.from({ length: addressCount }, (_, index) =>
    deriveLegacyAddress(legacyAccount, 0, index, 'receive'),
  );
  const legacyChange: DerivedAddress[] = Array.from({ length: Math.max(2, Math.floor(addressCount / 2)) }, (_, index) =>
    deriveLegacyAddress(legacyAccount, 1, index, 'change'),
  );

  return {
    mnemonic,
    segwitAccount: {
      zpub: convertToZpub(segwitAccount.publicExtendedKey),
      addresses: [...segwitReceive, ...segwitChange],
    },
    legacyAccount: {
      xpub: legacyAccount.publicExtendedKey,
      addresses: [...legacyReceive, ...legacyChange],
    },
  };
}

export function createRandomMnemonic(): string {
  return generateMnemonic(wordlist, 128);
}

function convertToZpub(xpub: string): string {
  const decoded = base58checkCodec.decode(xpub);
  const zpubBytes = new Uint8Array(decoded.length);
  zpubBytes.set(ZPUB_PREFIX, 0);
  zpubBytes.set(decoded.slice(ZPUB_PREFIX.length), ZPUB_PREFIX.length);
  return base58checkCodec.encode(zpubBytes);
}
