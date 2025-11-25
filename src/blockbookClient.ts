export interface BlockbookUtxo {
  txid: string;
  vout: number;
  value: string;
  confirmations?: number;
  height?: number;
  address?: string;
  path?: string;
}

const BLOCKBOOK_BASE = 'https://btcbook.nownodes.io/api/v2';

export async function fetchUtxos(xpub: string, apiKey?: string): Promise<BlockbookUtxo[]> {
  const response = await fetch(`${BLOCKBOOK_BASE}/utxo/${encodeURIComponent(xpub)}?pageSize=200`, {
    headers: apiKey ? { apiKey } : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to load UTXOs (${response.status}): ${text}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Unexpected UTXO response');
  }

  return data as BlockbookUtxo[];
}
