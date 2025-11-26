// Network configuration types
export interface NetworkConfig {
  name: string;
  symbol: string;
  coinType: number;
  prefixes: {
    legacy: number;
    bech32?: string;
  };
  paths: {
    legacy: string;
    segwit?: string;
  };
  blockbookUrl: string;
  supportsSegwit: boolean;
}

// Blockbook API types
export interface BlockbookUtxo {
  txid: string;
  vout: number;
  value: string;
  confirmations?: number;
  height?: number;
  address?: string;
  path?: string;
}

export interface BroadcastResponse {
  txid: string;
}

// API request/response types
export interface UtxoRequest {
  xpub: string;
  pageSize?: number;
}

export interface BroadcastRequest {
  hex: string;
}

export type NetworkSymbol = 'btc' | 'doge' | 'ltc' | 'dash';
