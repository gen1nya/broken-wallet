export interface BlockbookUtxo {
  txid: string;
  vout: number;
  value: string;
  confirmations?: number;
  height?: number;
  address?: string;
  path?: string;
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
