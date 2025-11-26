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
  index: number;
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

export interface NetworkConfig {
  bech32Prefix?: string;
  p2pkhVersion: number;
  coinType: number;
  zpubPrefix?: Uint8Array;
  xpubPrefix: Uint8Array;
}

// Network configurations
export const NETWORKS: Record<string, NetworkConfig> = {
  btc: {
    bech32Prefix: 'bc',
    p2pkhVersion: 0x00,
    coinType: 0,
    zpubPrefix: new Uint8Array([0x04, 0xb2, 0x47, 0x46]),
    xpubPrefix: new Uint8Array([0x04, 0x88, 0xb2, 0x1e]),
  },
  ltc: {
    bech32Prefix: 'ltc',
    p2pkhVersion: 0x30,
    coinType: 2,
    zpubPrefix: new Uint8Array([0x04, 0xb2, 0x47, 0x46]), // Same as BTC for segwit
    xpubPrefix: new Uint8Array([0x04, 0x88, 0xb2, 0x1e]), // Same as BTC for legacy
  },
  doge: {
    p2pkhVersion: 0x1e,
    coinType: 3,
    xpubPrefix: new Uint8Array([0x04, 0x88, 0xb2, 0x1e]),
  },
  dash: {
    p2pkhVersion: 0x4c,
    coinType: 5,
    xpubPrefix: new Uint8Array([0x04, 0x88, 0xb2, 0x1e]),
  },
};

const base58checkCodec = base58check(sha256);

function hash160(publicKey: Uint8Array): Uint8Array {
  return ripemd160(sha256(publicKey));
}

function toBech32Address(hash: Uint8Array, prefix: string): string {
  const words = bech32.toWords(hash);
  words.unshift(0); // witness version 0
  return bech32.encode(prefix, words);
}

function toBase58Address(hash: Uint8Array, version: number): string {
  const payload = new Uint8Array(21);
  payload[0] = version;
  payload.set(hash, 1);
  return base58checkCodec.encode(payload);
}

function deriveSegwitAddress(
  account: HDKey,
  chain: number,
  index: number,
  type: AddressType,
  network: NetworkConfig,
  accountPath: string
): DerivedAddress {
  const node = account.deriveChild(chain).deriveChild(index);
  if (!node.publicKey) {
    throw new Error('Unable to derive public key');
  }

  if (!network.bech32Prefix) {
    throw new Error('Network does not support segwit');
  }

  const hash = hash160(node.publicKey);
  const address = toBech32Address(hash, network.bech32Prefix);

  return {
    address,
    path: `${accountPath}/${chain}/${index}`,
    publicKey: Array.from(node.publicKey)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(''),
    type,
    format: 'p2wpkh',
    index,
  };
}

function deriveLegacyAddress(
  account: HDKey,
  chain: number,
  index: number,
  type: AddressType,
  network: NetworkConfig,
  accountPath: string
): DerivedAddress {
  const node = account.deriveChild(chain).deriveChild(index);
  if (!node.publicKey) {
    throw new Error('Unable to derive public key');
  }

  const hash = hash160(node.publicKey);
  const address = toBase58Address(hash, network.p2pkhVersion);

  return {
    address,
    path: `${accountPath}/${chain}/${index}`,
    publicKey: Array.from(node.publicKey)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(''),
    type,
    format: 'p2pkh',
    index,
  };
}

export interface AddressGenerationOptions {
  receiveCount?: number;
  changeCount?: number;
}

export function deriveWalletFromMnemonic(
  mnemonic: string,
  options: number | AddressGenerationOptions = 5,
  networkSymbol: string = 'btc'
): WalletDerivation {
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Invalid mnemonic');
  }

  const network = NETWORKS[networkSymbol];
  if (!network) {
    throw new Error(`Unsupported network: ${networkSymbol}`);
  }

  // Backwards compatibility: if options is a number, use old behavior
  let receiveCount: number;
  let changeCount: number;

  if (typeof options === 'number') {
    receiveCount = options;
    changeCount = Math.max(2, Math.floor(options / 2));
  } else {
    receiveCount = options.receiveCount ?? 5;
    changeCount = options.changeCount ?? Math.max(2, Math.floor(receiveCount / 2));
  }

  const seed = mnemonicToSeedSync(mnemonic);
  const master = HDKey.fromMasterSeed(seed);

  const segwitAccountPath = `m/84'/${network.coinType}'/0'`;
  const legacyAccountPath = `m/44'/${network.coinType}'/0'`;

  // Derive segwit account (BIP84) - only if network supports it
  let segwitAccount: { zpub: string; addresses: DerivedAddress[] } | undefined;
  if (network.bech32Prefix && network.zpubPrefix) {
    const segwitHDKey = master.derive(segwitAccountPath);
    if (!segwitHDKey.publicExtendedKey) {
      throw new Error('Unable to derive segwit account xpub');
    }

    const segwitReceive: DerivedAddress[] = Array.from({ length: receiveCount }, (_, index) =>
      deriveSegwitAddress(segwitHDKey, 0, index, 'receive', network, segwitAccountPath),
    );
    const segwitChange: DerivedAddress[] = Array.from({ length: changeCount }, (_, index) =>
      deriveSegwitAddress(segwitHDKey, 1, index, 'change', network, segwitAccountPath),
    );

    segwitAccount = {
      zpub: convertToZpub(segwitHDKey.publicExtendedKey, network.zpubPrefix),
      addresses: [...segwitReceive, ...segwitChange],
    };
  }

  // Derive legacy account (BIP44)
  const legacyHDKey = master.derive(legacyAccountPath);
  if (!legacyHDKey.publicExtendedKey) {
    throw new Error('Unable to derive legacy account xpub');
  }

  const legacyReceive: DerivedAddress[] = Array.from({ length: receiveCount }, (_, index) =>
    deriveLegacyAddress(legacyHDKey, 0, index, 'receive', network, legacyAccountPath),
  );
  const legacyChange: DerivedAddress[] = Array.from({ length: changeCount }, (_, index) =>
    deriveLegacyAddress(legacyHDKey, 1, index, 'change', network, legacyAccountPath),
  );

  return {
    mnemonic,
    segwitAccount: segwitAccount ?? {
      zpub: '',
      addresses: [],
    },
    legacyAccount: {
      xpub: legacyHDKey.publicExtendedKey,
      addresses: [...legacyReceive, ...legacyChange],
    },
  };
}

export function createRandomMnemonic(): string {
  return generateMnemonic(wordlist, 128);
}

function convertToZpub(xpub: string, zpubPrefix: Uint8Array): string {
  const decoded = base58checkCodec.decode(xpub);
  const zpubBytes = new Uint8Array(decoded.length);
  zpubBytes.set(zpubPrefix, 0);
  zpubBytes.set(decoded.slice(zpubPrefix.length), zpubPrefix.length);
  return base58checkCodec.encode(zpubBytes);
}
