import axios, { AxiosError } from 'axios';
import { getNetwork } from '../config/networks.js';
import { BlockbookUtxo, BroadcastResponse, NetworkSymbol, TransactionsResponse } from '../types';

/**
 * Service for interacting with NowNodes Blockbook API
 */
export class NowNodesService {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('NOWNODES_API_KEY is required');
    }
    this.apiKey = apiKey;
  }

  /**
   * Fetch UTXOs for a given xpub/zpub/ypub
   */
  async fetchUtxos(
    network: NetworkSymbol,
    xpub: string,
    pageSize: number = 200
  ): Promise<BlockbookUtxo[]> {
    const networkConfig = getNetwork(network);
    const url = `${networkConfig.blockbookUrl}/api/v2/utxo/${encodeURIComponent(xpub)}`;

    try {
      const response = await axios.get(url, {
        headers: {
          'api-key': this.apiKey,
        },
        params: {
          pageSize,
        },
        timeout: 30000,
      });

      if (!Array.isArray(response.data)) {
        throw new Error('Unexpected UTXO response format');
      }

      return response.data as BlockbookUtxo[];
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status || 500;
        const message = error.response?.data?.error || error.message;
        throw new Error(`NowNodes API error (${status}): ${message}`);
      }
      throw error;
    }
  }

  /**
   * Broadcast a signed transaction hex
   */
  async broadcastTransaction(
    network: NetworkSymbol,
    hex: string
  ): Promise<string> {
    const networkConfig = getNetwork(network);
    const url = `${networkConfig.blockbookUrl}/api/v2/sendtx/${encodeURIComponent(hex)}`;

    try {
      const response = await axios.get(url, {
        headers: {
          'api-key': this.apiKey,
        },
        timeout: 30000,
      });

      const data = response.data;

      // Handle different response formats
      if (typeof data === 'string') {
        return data;
      }

      if (data?.result) {
        return data.result as string;
      }

      throw new Error('Unexpected broadcast response format');
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status || 500;
        const message = error.response?.data?.error || error.message;
        throw new Error(`Broadcast failed (${status}): ${message}`);
      }
      throw error;
    }
  }

  /**
   * Fetch transactions for a given xpub/zpub/ypub
   */
  async fetchTransactions(
    network: NetworkSymbol,
    xpub: string,
    pageSize: number = 20,
    page: number = 1
  ): Promise<TransactionsResponse> {
    const networkConfig = getNetwork(network);
    const url = `${networkConfig.blockbookUrl}/api/v2/xpub/${encodeURIComponent(xpub)}`;

    try {
      const response = await axios.get(url, {
        headers: {
          'api-key': this.apiKey,
        },
        params: {
          details: 'txs',
          pageSize,
          page,
        },
        timeout: 30000,
      });

      return response.data as TransactionsResponse;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status || 500;
        const message = error.response?.data?.error || error.message;
        throw new Error(`NowNodes API error (${status}): ${message}`);
      }
      throw error;
    }
  }

  /**
   * Get network information (for health checks)
   */
  async getNetworkInfo(network: NetworkSymbol): Promise<any> {
    const networkConfig = getNetwork(network);
    const url = `${networkConfig.blockbookUrl}/api/v2`;

    try {
      const response = await axios.get(url, {
        headers: {
          'api-key': this.apiKey,
        },
        timeout: 10000,
      });

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status || 500;
        const message = error.response?.data?.error || error.message;
        throw new Error(`Network info error (${status}): ${message}`);
      }
      throw error;
    }
  }

  /**
   * Get raw transaction hex by txid
   * Required for signing P2PKH (legacy) inputs
   */
  async getRawTransaction(
    network: NetworkSymbol,
    txid: string
  ): Promise<string> {
    const networkConfig = getNetwork(network);
    const url = `${networkConfig.blockbookUrl}/api/v2/tx-specific/${encodeURIComponent(txid)}`;

    try {
      const response = await axios.get(url, {
        headers: {
          'api-key': this.apiKey,
        },
        timeout: 30000,
      });

      const data = response.data;

      // The response should contain a 'hex' field with the raw transaction
      if (data?.hex && typeof data.hex === 'string') {
        return data.hex;
      }

      throw new Error('Transaction hex not found in response');
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status || 500;
        const message = error.response?.data?.error || error.message;
        throw new Error(`Failed to fetch raw transaction (${status}): ${message}`);
      }
      throw error;
    }
  }

  /**
   * Estimate fee rate for a target confirmation window (blocks)
   * Returns sat/vB
   */
  async estimateFee(
    network: NetworkSymbol,
    blocks: number = 2,
  ): Promise<number> {
    const networkConfig = getNetwork(network);
    const url = `${networkConfig.blockbookUrl}/api/v2/estimatefee/${blocks}`;

    try {
      const response = await axios.get(url, {
        headers: {
          'api-key': this.apiKey,
        },
        timeout: 10000,
      });

      const value = response.data;

      // Blockbook returns BTC/KB as number or string. Convert to sat/vbyte.
      const feeBtcPerKb = typeof value === 'string' ? Number(value) : value;
      if (!Number.isFinite(feeBtcPerKb)) {
        throw new Error('Unexpected fee estimate response');
      }

      const satPerByte = (feeBtcPerKb * 1e8) / 1000;
      return Math.max(1, Math.ceil(satPerByte));
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status || 500;
        const message = error.response?.data?.error || error.message;
        throw new Error(`Failed to estimate fee (${status}): ${message}`);
      }
      throw error;
    }
  }
}
