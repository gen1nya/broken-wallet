import { mnemonicToSeedSync, generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { bech32 } from '@scure/base';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { sha256 } from '@noble/hashes/sha256';

export type AddressType = 'receive' | 'change';

export interface DerivedAddress {
  address: string;
  path: string;
  publicKey: string;
  type: AddressType;
}

export interface WalletDerivation {
  mnemonic: string;
  accountXpub: string;
  addresses: DerivedAddress[];
}

const NETWORK_PREFIX = 'bc';
const ACCOUNT_PATH = "m/84'/0'/0'";

function hash160(publicKey: Uint8Array): Uint8Array {
  return ripemd160(sha256(publicKey));
}

function toBech32Address(hash: Uint8Array): string {
  const words = bech32.toWords(hash);
  words.unshift(0); // witness version 0
  return bech32.encode(NETWORK_PREFIX, words);
}

function deriveAddress(account: HDKey, chain: number, index: number, type: AddressType): DerivedAddress {
  const node = account.deriveChild(chain).deriveChild(index);
  if (!node.publicKey) {
    throw new Error('Unable to derive public key');
  }

  const hash = hash160(node.publicKey);
  const address = toBech32Address(hash);

  return {
    address,
    path: `${ACCOUNT_PATH}/${chain}/${index}`,
    publicKey: Array.from(node.publicKey)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(''),
    type,
  };
}

export function deriveWalletFromMnemonic(mnemonic: string, addressCount = 5): WalletDerivation {
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Invalid mnemonic');
  }
  const seed = mnemonicToSeedSync(mnemonic);
  const master = HDKey.fromMasterSeed(seed);
  const account = master.derive(ACCOUNT_PATH);

  if (!account.publicExtendedKey) {
    throw new Error('Unable to derive account xpub');
  }

  const receive: DerivedAddress[] = Array.from({ length: addressCount }, (_, index) =>
    deriveAddress(account, 0, index, 'receive'),
  );
  const change: DerivedAddress[] = Array.from({ length: Math.max(2, Math.floor(addressCount / 2)) }, (_, index) =>
    deriveAddress(account, 1, index, 'change'),
  );

  return {
    mnemonic,
    accountXpub: account.publicExtendedKey,
    addresses: [...receive, ...change],
  };
}

export function createRandomMnemonic(): string {
  return generateMnemonic(wordlist, 128);
}
