import { NetworkConfig, NetworkSymbol } from '../types/index.js';

/**
 * Network configurations for supported cryptocurrencies
 * Focuses on BTC-like chains with P2PKH (legacy) and P2WPKH (segwit) support
 */
export const NETWORKS: Record<NetworkSymbol, NetworkConfig> = {
  btc: {
    name: 'Bitcoin',
    symbol: 'BTC',
    coinType: 0,
    prefixes: {
      legacy: 0x00,  // Addresses start with '1'
      bech32: 'bc',  // Native segwit addresses start with 'bc1'
    },
    paths: {
      legacy: "m/44'/0'/0'",   // BIP44
      segwit: "m/84'/0'/0'",   // BIP84
    },
    blockbookUrl: 'https://btcbook.nownodes.io',
    supportsSegwit: true,
  },
  doge: {
    name: 'Dogecoin',
    symbol: 'DOGE',
    coinType: 3,
    prefixes: {
      legacy: 0x1e,  // Addresses start with 'D'
    },
    paths: {
      legacy: "m/44'/3'/0'",
    },
    blockbookUrl: 'https://dogebook.nownodes.io',
    supportsSegwit: false,
  },
  ltc: {
    name: 'Litecoin',
    symbol: 'LTC',
    coinType: 2,
    prefixes: {
      legacy: 0x30,  // Addresses start with 'L'
      bech32: 'ltc', // Native segwit addresses start with 'ltc1'
    },
    paths: {
      legacy: "m/44'/2'/0'",
      segwit: "m/84'/2'/0'",
    },
    blockbookUrl: 'https://ltcbook.nownodes.io',
    supportsSegwit: true,
  },
  dash: {
    name: 'Dash',
    symbol: 'DASH',
    coinType: 5,
    prefixes: {
      legacy: 0x4c,  // Addresses start with 'X'
    },
    paths: {
      legacy: "m/44'/5'/0'",
    },
    blockbookUrl: 'https://dashbook.nownodes.io',
    supportsSegwit: false,
  },
};

export function getNetwork(symbol: string): NetworkConfig {
  const network = NETWORKS[symbol as NetworkSymbol];
  if (!network) {
    throw new Error(`Unsupported network: ${symbol}`);
  }
  return network;
}

export function isSupportedNetwork(symbol: string): symbol is NetworkSymbol {
  return symbol in NETWORKS;
}
