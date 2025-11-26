import axios, { AxiosError } from 'axios';
import { getNetwork } from '../config/networks.js';
import { BlockbookUtxo, BroadcastResponse, NetworkSymbol } from '../types';

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
}
