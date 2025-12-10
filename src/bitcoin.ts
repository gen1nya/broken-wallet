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
  // Network-specific extended public key prefixes for display/detection
  extPubKeyPrefix?: string; // e.g., 'dgub', 'Ltub', 'drkp'
  extPubKeyPrefixSegwit?: string; // e.g., 'Mtub' for Litecoin segwit
}

// Extended public key version bytes for different networks
// Standard xpub: 0x0488b21e (mainnet), 0x043587cf (testnet)
// zpub (BTC segwit): 0x04b24746
// dgub (DOGE): 0x02facafd
// Ltub (LTC legacy): 0x019da462
// Mtub (LTC segwit): 0x01b26ef6
// drkp (DASH): 0x02fe52cc
const EXTENDED_KEY_VERSIONS = {
  // Bitcoin
  xpub: new Uint8Array([0x04, 0x88, 0xb2, 0x1e]),
  zpub: new Uint8Array([0x04, 0xb2, 0x47, 0x46]),
  // Dogecoin
  dgub: new Uint8Array([0x02, 0xfa, 0xca, 0xfd]),
  // Litecoin
  Ltub: new Uint8Array([0x01, 0x9d, 0xa4, 0x62]),
  Mtub: new Uint8Array([0x01, 0xb2, 0x6e, 0xf6]),
  // Dash
  drkp: new Uint8Array([0x02, 0xfe, 0x52, 0xcc]),
};

// Network configurations
export const NETWORKS: Record<string, NetworkConfig> = {
  btc: {
    bech32Prefix: 'bc',
    p2pkhVersion: 0x00,
    coinType: 0,
    zpubPrefix: EXTENDED_KEY_VERSIONS.zpub,
    xpubPrefix: EXTENDED_KEY_VERSIONS.xpub,
    extPubKeyPrefix: 'xpub',
    extPubKeyPrefixSegwit: 'zpub',
  },
  ltc: {
    bech32Prefix: 'ltc',
    p2pkhVersion: 0x30,
    coinType: 2,
    zpubPrefix: EXTENDED_KEY_VERSIONS.Mtub,
    xpubPrefix: EXTENDED_KEY_VERSIONS.Ltub,
    extPubKeyPrefix: 'Ltub',
    extPubKeyPrefixSegwit: 'Mtub',
  },
  doge: {
    p2pkhVersion: 0x1e,
    coinType: 3,
    xpubPrefix: EXTENDED_KEY_VERSIONS.dgub,
    extPubKeyPrefix: 'dgub',
  },
  dash: {
    p2pkhVersion: 0x4c,
    coinType: 5,
    xpubPrefix: EXTENDED_KEY_VERSIONS.drkp,
    extPubKeyPrefix: 'drkp',
  },
};

export { EXTENDED_KEY_VERSIONS };

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

export type XpubType = 'segwit' | 'legacy' | 'unknown';

export interface ExtendedKeyInfo {
  type: XpubType;
  network: string | null;
  prefix: string;
  isTestnet: boolean;
}

// Map of extended key prefixes to their network and type
const EXTENDED_KEY_PREFIX_MAP: Record<string, { network: string; type: XpubType; isTestnet: boolean }> = {
  // Bitcoin mainnet
  'xpub': { network: 'btc', type: 'legacy', isTestnet: false },
  'zpub': { network: 'btc', type: 'segwit', isTestnet: false },
  // Bitcoin testnet
  'tpub': { network: 'btc', type: 'legacy', isTestnet: true },
  'vpub': { network: 'btc', type: 'segwit', isTestnet: true },
  // Litecoin
  'Ltub': { network: 'ltc', type: 'legacy', isTestnet: false },
  'Mtub': { network: 'ltc', type: 'segwit', isTestnet: false },
  // Dogecoin
  'dgub': { network: 'doge', type: 'legacy', isTestnet: false },
  // Dash
  'drkp': { network: 'dash', type: 'legacy', isTestnet: false },
};

/**
 * Detects the type and network of an extended public key based on its prefix
 */
export function detectExtendedKeyInfo(key: string): ExtendedKeyInfo {
  for (const [prefix, info] of Object.entries(EXTENDED_KEY_PREFIX_MAP)) {
    if (key.startsWith(prefix)) {
      return {
        type: info.type,
        network: info.network,
        prefix,
        isTestnet: info.isTestnet,
      };
    }
  }
  return { type: 'unknown', network: null, prefix: '', isTestnet: false };
}

/**
 * Detects the type of extended public key based on its prefix (legacy function)
 */
export function detectXpubType(key: string): XpubType {
  const info = detectExtendedKeyInfo(key);
  return info.type;
}

export interface XpubDerivationResult {
  xpub: string;
  xpubType: XpubType;
  keyInfo: ExtendedKeyInfo;
  addresses: DerivedAddress[];
}

// Standard xpub version bytes (used for HDKey parsing)
const STANDARD_XPUB_PREFIX = new Uint8Array([0x04, 0x88, 0xb2, 0x1e]);

/**
 * Normalizes any extended public key to standard xpub format for HDKey parsing.
 * HDKey only understands standard xpub format, so we need to convert
 * network-specific formats (dgub, Ltub, Mtub, drkp, zpub) to xpub.
 */
function normalizeToStandardXpub(key: string): string {
  const decoded = base58checkCodec.decode(key);
  const xpubBytes = new Uint8Array(decoded.length);
  xpubBytes.set(STANDARD_XPUB_PREFIX, 0);
  xpubBytes.set(decoded.slice(4), 4);
  return base58checkCodec.encode(xpubBytes);
}

/**
 * Derives addresses from an extended public key without needing the mnemonic.
 * Supports various formats: xpub, zpub (BTC), dgub (DOGE), Ltub/Mtub (LTC), drkp (DASH).
 * This is useful for watch-only wallets or exploring external xpubs.
 *
 * @param xpub - Extended public key in any supported format
 * @param options - Address generation options
 * @param networkSymbol - Network symbol (auto-detected from key if not provided)
 */
export function deriveAddressesFromXpub(
  xpub: string,
  options: AddressGenerationOptions = {},
  networkSymbol?: string
): XpubDerivationResult {
  const keyInfo = detectExtendedKeyInfo(xpub);

  // Use auto-detected network if not provided
  const effectiveNetwork = networkSymbol || keyInfo.network || 'btc';

  const network = NETWORKS[effectiveNetwork];
  if (!network) {
    throw new Error(`Unsupported network: ${effectiveNetwork}`);
  }

  const receiveCount = options.receiveCount ?? 20;
  const changeCount = options.changeCount ?? 20;

  const xpubType = keyInfo.type;

  // Convert any extended key format to standard xpub for HDKey parsing
  let normalizedXpub = xpub;
  if (xpub.startsWith('xpub')) {
    // Already in standard format
    normalizedXpub = xpub;
  } else if (keyInfo.type !== 'unknown') {
    // Convert network-specific format to standard xpub
    normalizedXpub = normalizeToStandardXpub(xpub);
  }

  // Parse the xpub as HDKey
  const hdKey = HDKey.fromExtendedKey(normalizedXpub);

  const addresses: DerivedAddress[] = [];

  // Determine address format based on xpub type
  const isSegwit = xpubType === 'segwit';
  const accountPath = isSegwit
    ? `m/84'/${network.coinType}'/0'`
    : `m/44'/${network.coinType}'/0'`;

  // Generate receive addresses (chain 0)
  for (let i = 0; i < receiveCount; i++) {
    const node = hdKey.deriveChild(0).deriveChild(i);
    if (!node.publicKey) {
      throw new Error('Unable to derive public key');
    }

    const hash = hash160(node.publicKey);
    let address: string;
    let format: AddressFormat;

    if (isSegwit && network.bech32Prefix) {
      address = toBech32Address(hash, network.bech32Prefix);
      format = 'p2wpkh';
    } else {
      address = toBase58Address(hash, network.p2pkhVersion);
      format = 'p2pkh';
    }

    addresses.push({
      address,
      path: `${accountPath}/0/${i}`,
      publicKey: Array.from(node.publicKey)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
      type: 'receive',
      format,
      index: i,
    });
  }

  // Generate change addresses (chain 1)
  for (let i = 0; i < changeCount; i++) {
    const node = hdKey.deriveChild(1).deriveChild(i);
    if (!node.publicKey) {
      throw new Error('Unable to derive public key');
    }

    const hash = hash160(node.publicKey);
    let address: string;
    let format: AddressFormat;

    if (isSegwit && network.bech32Prefix) {
      address = toBech32Address(hash, network.bech32Prefix);
      format = 'p2wpkh';
    } else {
      address = toBase58Address(hash, network.p2pkhVersion);
      format = 'p2pkh';
    }

    addresses.push({
      address,
      path: `${accountPath}/1/${i}`,
      publicKey: Array.from(node.publicKey)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
      type: 'change',
      format,
      index: i,
    });
  }

  return {
    xpub,
    xpubType,
    keyInfo,
    addresses,
  };
}
