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

export interface TransactionRequest {
  xpub: string;
  pageSize?: number;
  page?: number;
}

export interface TransactionInput {
  txid: string;
  vout: number;
  sequence?: number;
  n: number;
  addresses?: string[];
  isAddress?: boolean;
  isOwn?: boolean;
  value: string;
  hex?: string;
}

export interface TransactionOutput {
  value: string;
  n: number;
  hex?: string;
  addresses?: string[];
  isAddress?: boolean;
  isOwn?: boolean;
  spent?: boolean;
}

export interface BlockbookTransaction {
  txid: string;
  version?: number;
  vin: TransactionInput[];
  vout: TransactionOutput[];
  blockHash?: string;
  blockHeight?: number;
  confirmations?: number;
  blockTime?: number;
  value: string;
  valueIn: string;
  fees: string;
  hex?: string;
}

export interface TransactionsResponse {
  page?: number;
  totalPages?: number;
  itemsOnPage?: number;
  address?: string;
  balance?: string;
  totalReceived?: string;
  totalSent?: string;
  unconfirmedBalance?: string;
  unconfirmedTxs?: number;
  txs?: number;
  transactions?: BlockbookTransaction[];
}

export type NetworkSymbol = 'btc' | 'doge' | 'ltc' | 'dash';
