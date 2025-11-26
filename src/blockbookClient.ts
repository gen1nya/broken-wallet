export interface BlockbookUtxo {
  txid: string;
  vout: number;
  value: string;
  confirmations?: number;
  height?: number;
  address?: string;
  path?: string;
  hex?: string; // Full previous transaction hex (needed for P2PKH signing)
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

// Use backend API in both dev and production
const API_BASE = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api';

export async function fetchUtxos(
  xpub: string,
  network: NetworkSymbol = 'btc',
  pageSize: number = 200
): Promise<BlockbookUtxo[]> {
  const response = await fetch(`${API_BASE}/${network}/utxo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ xpub, pageSize }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Failed to load UTXOs (${response.status}): ${error.message || error.error}`);
  }

  const data = await response.json();
  if (!Array.isArray(data.utxos)) {
    throw new Error('Unexpected UTXO response');
  }

  return data.utxos as BlockbookUtxo[];
}

export async function broadcastTransaction(
  hex: string,
  network: NetworkSymbol = 'btc'
): Promise<string> {
  const response = await fetch(`${API_BASE}/${network}/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ hex }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Broadcast failed (${response.status}): ${error.message || error.error}`);
  }

  const data = await response.json();
  if (data?.txid) {
    return data.txid as string;
  }

  throw new Error('Unexpected broadcast response');
}

export async function fetchTransactions(
  xpub: string,
  network: NetworkSymbol = 'btc',
  pageSize: number = 20,
  page: number = 1
): Promise<TransactionsResponse> {
  const response = await fetch(`${API_BASE}/${network}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ xpub, pageSize, page }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Failed to load transactions (${response.status}): ${error.message || error.error}`);
  }

  const data = await response.json();
  return data as TransactionsResponse;
}

/**
 * Fetches ALL transactions for an xpub by paginating through all pages.
 * Returns a combined response with all transactions.
 */
export async function fetchAllTransactions(
  xpub: string,
  network: NetworkSymbol = 'btc',
  pageSize: number = 1000,
  onProgress?: (current: number, total: number) => void
): Promise<TransactionsResponse> {
  // Fetch first page to get total page count
  const firstPage = await fetchTransactions(xpub, network, pageSize, 1);

  if (!firstPage.totalPages || firstPage.totalPages <= 1) {
    // Only one page, return as is
    onProgress?.(1, 1);
    return firstPage;
  }

  // Fetch remaining pages in parallel (but limit concurrency to avoid overwhelming the server)
  const totalPages = firstPage.totalPages;
  const allTransactions: BlockbookTransaction[] = [...(firstPage.transactions ?? [])];

  // Fetch pages in batches of 5 to avoid too many concurrent requests
  const batchSize = 5;
  for (let startPage = 2; startPage <= totalPages; startPage += batchSize) {
    const endPage = Math.min(startPage + batchSize - 1, totalPages);
    const pagePromises = [];

    for (let page = startPage; page <= endPage; page++) {
      pagePromises.push(fetchTransactions(xpub, network, pageSize, page));
    }

    const results = await Promise.all(pagePromises);
    results.forEach(result => {
      if (result.transactions) {
        allTransactions.push(...result.transactions);
      }
    });

    onProgress?.(endPage, totalPages);
  }

  // Return combined response
  return {
    ...firstPage,
    transactions: allTransactions,
    page: 1,
    totalPages: totalPages,
  };
}
