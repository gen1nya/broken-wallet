export interface BlockbookUtxo {
  txid: string;
  vout: number;
  value: string;
  confirmations?: number;
  height?: number;
  address?: string;
  path?: string;
}

export const BLOCKBOOK_BASE = import.meta.env.DEV ? '/nownodes/api/v2' : 'https://btcbook.nownodes.io/api/v2';

export async function fetchUtxos(zpub: string, apiKey?: string): Promise<BlockbookUtxo[]> {
  const response = await fetch(`${BLOCKBOOK_BASE}/utxo/${encodeURIComponent(zpub)}?pageSize=200`, {
    headers: apiKey ? { 'api-key': apiKey } : undefined,
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

export async function broadcastTransaction(hex: string, apiKey?: string): Promise<string> {
  const response = await fetch(`${BLOCKBOOK_BASE}/tx/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'api-key': apiKey } : {}),
    },
    body: JSON.stringify({ hex }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Broadcast failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  if (typeof data === 'string') {
    return data;
  }

  if (data?.txid || data?.result) {
    return (data.txid as string) || (data.result as string);
  }

  throw new Error('Unexpected broadcast response');
}
