import { Router, Request, Response } from 'express';
import { NowNodesService } from '../services/nownodes.js';
import { NETWORKS, isSupportedNetwork } from '../config/networks.js';
import { NetworkSymbol, UtxoRequest, BroadcastRequest, TransactionRequest } from '../types/index.js';

const router = Router();

// Initialize NowNodes service (will be lazy-loaded)
let nowNodesService: NowNodesService;

function getNowNodesService(): NowNodesService {
  if (!nowNodesService) {
    const apiKey = process.env.NOWNODES_API_KEY;
    if (!apiKey) {
      throw new Error('NOWNODES_API_KEY environment variable is required');
    }
    nowNodesService = new NowNodesService(apiKey);
  }
  return nowNodesService;
}

/**
 * GET /api/networks
 * Returns list of supported networks
 */
router.get('/networks', (req: Request, res: Response) => {
  const networks = Object.entries(NETWORKS).map(([symbol, config]) => ({
    symbol,
    name: config.name,
    coinType: config.coinType,
    supportsSegwit: config.supportsSegwit,
    paths: config.paths,
  }));

  res.json({ networks });
});

/**
 * POST /api/:network/utxo
 * Fetch UTXOs for a given xpub/zpub/ypub
 *
 * Body: { xpub: string, pageSize?: number }
 */
router.post('/:network/utxo', async (req: Request, res: Response) => {
  try {
    const { network } = req.params;
    const { xpub, pageSize = 200 } = req.body as UtxoRequest;

    if (!isSupportedNetwork(network)) {
      return res.status(400).json({
        error: 'Invalid network',
        message: `Network '${network}' is not supported`,
      });
    }

    if (!xpub || typeof xpub !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'xpub is required',
      });
    }

    const utxos = await getNowNodesService().fetchUtxos(
      network as NetworkSymbol,
      xpub,
      pageSize
    );

    res.json({ utxos, count: utxos.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to fetch UTXOs',
      message,
    });
  }
});

/**
 * POST /api/:network/broadcast
 * Broadcast a signed transaction
 *
 * Body: { hex: string }
 */
router.post('/:network/broadcast', async (req: Request, res: Response) => {
  try {
    const { network } = req.params;
    const { hex } = req.body as BroadcastRequest;

    if (!isSupportedNetwork(network)) {
      return res.status(400).json({
        error: 'Invalid network',
        message: `Network '${network}' is not supported`,
      });
    }

    if (!hex || typeof hex !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'hex is required',
      });
    }

    const txid = await getNowNodesService().broadcastTransaction(
      network as NetworkSymbol,
      hex
    );

    res.json({ txid });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Broadcast failed',
      message,
    });
  }
});

/**
 * POST /api/:network/transactions
 * Fetch transactions for a given xpub/zpub/ypub
 *
 * Body: { xpub: string, pageSize?: number, page?: number }
 */
router.post('/:network/transactions', async (req: Request, res: Response) => {
  try {
    const { network } = req.params;
    const { xpub, pageSize = 20, page = 1 } = req.body as TransactionRequest;

    if (!isSupportedNetwork(network)) {
      return res.status(400).json({
        error: 'Invalid network',
        message: `Network '${network}' is not supported`,
      });
    }

    if (!xpub || typeof xpub !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'xpub is required',
      });
    }

    const data = await getNowNodesService().fetchTransactions(
      network as NetworkSymbol,
      xpub,
      pageSize,
      page
    );

    res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to fetch transactions',
      message,
    });
  }
});

/**
 * GET /api/:network/info
 * Get network information (health check)
 */
router.get('/:network/info', async (req: Request, res: Response) => {
  try {
    const { network } = req.params;

    if (!isSupportedNetwork(network)) {
      return res.status(400).json({
        error: 'Invalid network',
        message: `Network '${network}' is not supported`,
      });
    }

    const info = await getNowNodesService().getNetworkInfo(network as NetworkSymbol);
    res.json(info);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to fetch network info',
      message,
    });
  }
});

/**
 * GET /api/:network/tx/:txid
 * Get raw transaction hex by txid
 * Required for signing P2PKH (legacy) inputs
 */
router.get('/:network/tx/:txid', async (req: Request, res: Response) => {
  try {
    const { network, txid } = req.params;

    if (!isSupportedNetwork(network)) {
      return res.status(400).json({
        error: 'Invalid network',
        message: `Network '${network}' is not supported`,
      });
    }

    if (!txid || typeof txid !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'txid is required',
      });
    }

    const hex = await getNowNodesService().getRawTransaction(
      network as NetworkSymbol,
      txid
    );

    res.json({ txid, hex });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to fetch raw transaction',
      message,
    });
  }
});

export default router;
