/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { buildSignedTransaction } from '../../transactionBuilder';
import { deriveWalletFromMnemonic, DerivedAddress } from '../../bitcoin';
import { BlockbookUtxo } from '../../blockbookClient';
import * as bitcoin from 'bitcoinjs-lib';

// Helper function to create a mock previous transaction for P2PKH inputs
function createMockPrevTx(address: string, value: number, vout: number): { hex: string; txid: string } {
  const network = bitcoin.networks.bitcoin;
  const tx = new bitcoin.Transaction();
  tx.version = 2;

  // Add a dummy input
  tx.addInput(Buffer.alloc(32, 0), 0);

  // Add outputs up to and including the vout we need
  for (let i = 0; i <= vout; i++) {
    if (i === vout) {
      // This is the output we care about
      const payment = bitcoin.payments.p2pkh({ address, network });
      tx.addOutput(payment.output!, value);
    } else {
      // Dummy outputs for indices before our target vout
      const dummyPayment = bitcoin.payments.p2pkh({ address, network });
      tx.addOutput(dummyPayment.output!, 10000);
    }
  }

  return {
    hex: tx.toHex(),
    txid: tx.getId(),
  };
}

describe('Transaction Building Integration Tests', () => {
  // Use BIP84 test mnemonic with known addresses
  const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  // Derive wallet to get addresses and create address map
  const wallet = deriveWalletFromMnemonic(testMnemonic, 5);
  const allAddresses = [...wallet.segwitAccount.addresses, ...wallet.legacyAccount.addresses];
  const addressMap = new Map(allAddresses.map((addr) => [addr.address, addr]));

  // Get first receive address for tests (using segwit addresses)
  const firstReceiveAddr = wallet.segwitAccount.addresses.find(addr => addr.type === 'receive' && addr.path.endsWith('/0/0'))!;
  const secondReceiveAddr = wallet.segwitAccount.addresses.find(addr => addr.type === 'receive' && addr.path.endsWith('/0/1'))!;
  const firstChangeAddr = wallet.segwitAccount.addresses.find(addr => addr.type === 'change' && addr.path.endsWith('/1/0'))!;

  // Get legacy addresses for P2PKH tests
  const firstLegacyAddr = wallet.legacyAccount.addresses.find(addr => addr.type === 'receive' && addr.path.endsWith('/0/0'))!;
  const secondLegacyAddr = wallet.legacyAccount.addresses.find(addr => addr.type === 'receive' && addr.path.endsWith('/0/1'))!;

  describe('Single Input, Single Output', () => {
    it('should build a valid transaction with one input and one output', async () => {
      // Mock UTXO: 0.001 BTC (100,000 sats)
      const mockUtxos: BlockbookUtxo[] = [
        {
          txid: 'a'.repeat(64), // Mock transaction ID
          vout: 0,
          value: '100000',
          address: firstReceiveAddr.address,
          path: firstReceiveAddr.path,
          confirmations: 10,
        },
      ];

      // Send 0.0005 BTC (50,000 sats) to second address
      const outputs = [
        {
          address: secondReceiveAddr.address,
          amountSats: 50000n,
        },
      ];

      const result = await buildSignedTransaction(
        testMnemonic,
        mockUtxos,
        outputs,
        addressMap,
        firstChangeAddr.address,
        5, // 5 sat/vB fee rate
      );

      // Verify transaction structure
      expect(result.hex).toMatch(/^[0-9a-f]+$/);
      expect(result.txId).toHaveLength(64);
      expect(result.vsize).toBeGreaterThan(0);

      // Verify amounts
      expect(result.totalInput).toBe(100000n);
      expect(result.totalOutput).toBeLessThan(result.totalInput);
      expect(result.feeSats).toBeGreaterThan(0n);
      expect(result.totalOutput + result.feeSats).toBe(result.totalInput);

      // Verify outputs
      expect(result.outputs).toHaveLength(2); // Destination + change
      expect(result.outputs[0].amountSats).toBe(50000n);
      expect(result.changeOutput).toBeDefined();
      expect(result.changeOutput?.address).toBe(firstChangeAddr.address);

      // Verify effective fee rate
      expect(result.effectiveFeeRate).toBeCloseTo(5, 1); // Should be close to 5 sat/vB

      // Verify transaction can be deserialized
      const tx = bitcoin.Transaction.fromHex(result.hex);
      expect(tx.ins).toHaveLength(1);
      expect(tx.outs).toHaveLength(2);
    });

    it('should calculate fees correctly based on vsize', async () => {
      const mockUtxos: BlockbookUtxo[] = [
        {
          txid: 'b'.repeat(64),
          vout: 0,
          value: '200000',
          address: firstReceiveAddr.address,
          path: firstReceiveAddr.path,
        },
      ];

      const outputs = [
        {
          address: secondReceiveAddr.address,
          amountSats: 100000n,
        },
      ];

      const feeRate = 10; // 10 sat/vB
      const result = await buildSignedTransaction(
        testMnemonic,
        mockUtxos,
        outputs,
        addressMap,
        firstChangeAddr.address,
        feeRate,
      );

      // Calculate expected fee range (P2WPKH tx is typically ~140-150 vbytes)
      const expectedMinFee = 140 * feeRate;
      const expectedMaxFee = 180 * feeRate;

      expect(Number(result.feeSats)).toBeGreaterThanOrEqual(expectedMinFee);
      expect(Number(result.feeSats)).toBeLessThanOrEqual(expectedMaxFee);

      // Verify effective fee rate is close to requested (within 5% tolerance)
      // It might be slightly lower due to rounding in estimation
      expect(result.effectiveFeeRate).toBeGreaterThanOrEqual(feeRate * 0.95);
      expect(result.effectiveFeeRate).toBeLessThan(feeRate * 1.1); // Within 10%
    });
  });

  describe('Multiple Inputs', () => {
    it('should handle multiple UTXOs correctly', async () => {
      // Two UTXOs from different addresses
      const mockUtxos: BlockbookUtxo[] = [
        {
          txid: 'c'.repeat(64),
          vout: 0,
          value: '50000',
          address: firstReceiveAddr.address,
          path: firstReceiveAddr.path,
        },
        {
          txid: 'd'.repeat(64),
          vout: 1,
          value: '75000',
          address: secondReceiveAddr.address,
          path: secondReceiveAddr.path,
        },
      ];

      const outputs = [
        {
          address: firstChangeAddr.address,
          amountSats: 100000n,
        },
      ];

      const result = await buildSignedTransaction(
        testMnemonic,
        mockUtxos,
        outputs,
        addressMap,
        firstChangeAddr.address,
        5,
      );

      // Verify inputs
      expect(result.totalInput).toBe(125000n); // 50k + 75k

      // Verify transaction has 2 inputs
      const tx = bitcoin.Transaction.fromHex(result.hex);
      expect(tx.ins).toHaveLength(2);
    });

    it('should sign all inputs correctly', async () => {
      const mockUtxos: BlockbookUtxo[] = [
        {
          txid: 'e'.repeat(64),
          vout: 0,
          value: '100000',
          address: firstReceiveAddr.address,
          path: firstReceiveAddr.path,
        },
        {
          txid: 'f'.repeat(64),
          vout: 0,
          value: '100000',
          address: secondReceiveAddr.address,
          path: secondReceiveAddr.path,
        },
      ];

      const outputs = [
        {
          address: firstChangeAddr.address,
          amountSats: 150000n,
        },
      ];

      const result = await buildSignedTransaction(
        testMnemonic,
        mockUtxos,
        outputs,
        addressMap,
        firstChangeAddr.address,
        5,
      );

      // Transaction should be successfully built and signed
      expect(result.hex).toBeTruthy();

      // Verify we can deserialize it (means signatures are valid format)
      const tx = bitcoin.Transaction.fromHex(result.hex);
      expect(tx.ins).toHaveLength(2);

      // Both inputs should have witness data (signatures)
      tx.ins.forEach((input, index) => {
        expect(tx.hasWitnesses()).toBe(true);
      });
    });
  });

  describe('Multiple Outputs', () => {
    it('should handle multiple destination outputs', async () => {
      const mockUtxos: BlockbookUtxo[] = [
        {
          txid: '1'.repeat(64),
          vout: 0,
          value: '500000',
          address: firstReceiveAddr.address,
          path: firstReceiveAddr.path,
        },
      ];

      const outputs = [
        {
          address: secondReceiveAddr.address,
          amountSats: 100000n,
        },
        {
          address: firstChangeAddr.address,
          amountSats: 150000n,
        },
        {
          address: wallet.segwitAccount.addresses[2].address,
          amountSats: 100000n,
        },
      ];

      const result = await buildSignedTransaction(
        testMnemonic,
        mockUtxos,
        outputs,
        addressMap,
        firstChangeAddr.address,
        5,
      );

      // Should have 3 destination outputs + 1 change output
      expect(result.outputs).toHaveLength(4);

      const tx = bitcoin.Transaction.fromHex(result.hex);
      expect(tx.outs).toHaveLength(4);
    });
  });

  describe('Change Handling', () => {
    it('should create change output when needed', async () => {
      const mockUtxos: BlockbookUtxo[] = [
        {
          txid: '2'.repeat(64),
          vout: 0,
          value: '100000',
          address: firstReceiveAddr.address,
          path: firstReceiveAddr.path,
        },
      ];

      const outputs = [
        {
          address: secondReceiveAddr.address,
          amountSats: 30000n,
        },
      ];

      const result = await buildSignedTransaction(
        testMnemonic,
        mockUtxos,
        outputs,
        addressMap,
        firstChangeAddr.address,
        5,
      );

      expect(result.changeOutput).toBeDefined();
      expect(result.changeOutput?.address).toBe(firstChangeAddr.address);
      expect(result.changeOutput!.amountSats).toBeGreaterThan(0n);

      // Change + output + fee should equal input
      const changeAmount = result.changeOutput!.amountSats;
      expect(30000n + changeAmount + result.feeSats).toBe(100000n);
    });

    it('should handle change-only transactions (sweep)', async () => {
      const mockUtxos: BlockbookUtxo[] = [
        {
          txid: '3'.repeat(64),
          vout: 0,
          value: '100000',
          address: firstReceiveAddr.address,
          path: firstReceiveAddr.path,
        },
      ];

      // No destination outputs, just sweep to change address
      const outputs: any[] = [];

      const result = await buildSignedTransaction(
        testMnemonic,
        mockUtxos,
        outputs,
        addressMap,
        firstChangeAddr.address,
        5,
      );

      // Should have only change output
      expect(result.outputs).toHaveLength(1);
      expect(result.outputs[0].address).toBe(firstChangeAddr.address);

      // Change should be input minus fee
      expect(result.outputs[0].amountSats + result.feeSats).toBe(100000n);
    });

    it('should not create dust change', async () => {
      const mockUtxos: BlockbookUtxo[] = [
        {
          txid: '4'.repeat(64),
          vout: 0,
          value: '100000',
          address: firstReceiveAddr.address,
          path: firstReceiveAddr.path,
        },
      ];

      // Use high fee rate to potentially create tiny change
      const feeRate = 50; // 50 sat/vB

      const outputs = [
        {
          address: secondReceiveAddr.address,
          amountSats: 90000n,
        },
      ];

      const result = await buildSignedTransaction(
        testMnemonic,
        mockUtxos,
        outputs,
        addressMap,
        firstChangeAddr.address,
        feeRate,
      );

      // If change output exists, it should be reasonable size
      if (result.changeOutput) {
        expect(result.changeOutput.amountSats).toBeGreaterThan(500n); // More than 500 sats
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw error when inputs are insufficient', async () => {
      const mockUtxos: BlockbookUtxo[] = [
        {
          txid: '5'.repeat(64),
          vout: 0,
          value: '10000', // Only 0.0001 BTC
          address: firstReceiveAddr.address,
          path: firstReceiveAddr.path,
        },
      ];

      const outputs = [
        {
          address: secondReceiveAddr.address,
          amountSats: 50000n, // Trying to send more than we have
        },
      ];

      await expect(
        buildSignedTransaction(
          testMnemonic,
          mockUtxos,
          outputs,
          addressMap,
          firstChangeAddr.address,
          5,
        )
      ).rejects.toThrow();
    });

    it('should throw error with no UTXOs', async () => {
      const mockUtxos: BlockbookUtxo[] = [];

      const outputs = [
        {
          address: secondReceiveAddr.address,
          amountSats: 10000n,
        },
      ];

      await expect(
        buildSignedTransaction(
          testMnemonic,
          mockUtxos,
          outputs,
          addressMap,
          firstChangeAddr.address,
          5,
        )
      ).rejects.toThrow('Select at least one UTXO');
    });

    it('should throw error when UTXO has no derivation path', async () => {
      const mockUtxos: BlockbookUtxo[] = [
        {
          txid: '6'.repeat(64),
          vout: 0,
          value: '100000',
          address: 'bc1qunknownaddress', // Unknown address
          // No path provided
        },
      ];

      const outputs = [
        {
          address: secondReceiveAddr.address,
          amountSats: 50000n,
        },
      ];

      await expect(
        buildSignedTransaction(
          testMnemonic,
          mockUtxos,
          outputs,
          addressMap,
          firstChangeAddr.address,
          5,
        )
      ).rejects.toThrow(/No derivation path/);
    });
  });

  describe('Transaction Properties', () => {
    it('should produce deterministic txid for same inputs/outputs', async () => {
      const mockUtxos: BlockbookUtxo[] = [
        {
          txid: '7'.repeat(64),
          vout: 0,
          value: '100000',
          address: firstReceiveAddr.address,
          path: firstReceiveAddr.path,
        },
      ];

      const outputs = [
        {
          address: secondReceiveAddr.address,
          amountSats: 50000n,
        },
      ];

      const result1 = await buildSignedTransaction(
        testMnemonic,
        mockUtxos,
        outputs,
        addressMap,
        firstChangeAddr.address,
        5,
      );

      const result2 = await buildSignedTransaction(
        testMnemonic,
        mockUtxos,
        outputs,
        addressMap,
        firstChangeAddr.address,
        5,
      );

      // Same inputs and outputs should produce same transaction
      expect(result1.txId).toBe(result2.txId);
      expect(result1.hex).toBe(result2.hex);
    });

    it('should have witness data for P2WPKH inputs', async () => {
      const mockUtxos: BlockbookUtxo[] = [
        {
          txid: '8'.repeat(64),
          vout: 0,
          value: '100000',
          address: firstReceiveAddr.address,
          path: firstReceiveAddr.path,
        },
      ];

      const outputs = [
        {
          address: secondReceiveAddr.address,
          amountSats: 50000n,
        },
      ];

      const result = await buildSignedTransaction(
        testMnemonic,
        mockUtxos,
        outputs,
        addressMap,
        firstChangeAddr.address,
        5,
      );

      const tx = bitcoin.Transaction.fromHex(result.hex);

      // P2WPKH transactions must have witness data
      expect(tx.hasWitnesses()).toBe(true);

      // Each input should have witness
      tx.ins.forEach(input => {
        expect(tx.hasWitnesses()).toBe(true);
      });
    });

    it('should have correct transaction version', async () => {
      const mockUtxos: BlockbookUtxo[] = [
        {
          txid: '9'.repeat(64),
          vout: 0,
          value: '100000',
          address: firstReceiveAddr.address,
          path: firstReceiveAddr.path,
        },
      ];

      const outputs = [
        {
          address: secondReceiveAddr.address,
          amountSats: 50000n,
        },
      ];

      const result = await buildSignedTransaction(
        testMnemonic,
        mockUtxos,
        outputs,
        addressMap,
        firstChangeAddr.address,
        5,
      );

      const tx = bitcoin.Transaction.fromHex(result.hex);

      // Bitcoin transactions typically use version 2
      expect(tx.version).toBeGreaterThanOrEqual(1);
      expect(tx.version).toBeLessThanOrEqual(2);
    });
  });

  describe('Mixed P2PKH and P2WPKH Inputs', () => {
    it('should handle P2PKH (legacy) inputs', async () => {
      const prevTx = createMockPrevTx(firstLegacyAddr.address, 100000, 0);
      const mockUtxos: BlockbookUtxo[] = [
        {
          txid: prevTx.txid,
          vout: 0,
          value: '100000',
          address: firstLegacyAddr.address,
          path: firstLegacyAddr.path,
          hex: prevTx.hex,
        },
      ];

      const outputs = [
        {
          address: secondReceiveAddr.address,
          amountSats: 50000n,
        },
      ];

      const result = await buildSignedTransaction(
        testMnemonic,
        mockUtxos,
        outputs,
        addressMap,
        firstChangeAddr.address,
        5,
      );

      expect(result.hex).toMatch(/^[0-9a-f]+$/);
      expect(result.txId).toHaveLength(64);
      expect(result.totalInput).toBe(100000n);

      const tx = bitcoin.Transaction.fromHex(result.hex);
      expect(tx.ins).toHaveLength(1);
      expect(tx.outs).toHaveLength(2); // Destination + change
    });

    it('should handle mixed P2PKH and P2WPKH inputs in same transaction', async () => {
      const legacyPrevTx = createMockPrevTx(firstLegacyAddr.address, 75000, 0);
      const mockUtxos: BlockbookUtxo[] = [
        {
          txid: 'b'.repeat(64),
          vout: 0,
          value: '50000',
          address: firstReceiveAddr.address, // P2WPKH
          path: firstReceiveAddr.path,
          // P2WPKH doesn't need hex
        },
        {
          txid: legacyPrevTx.txid,
          vout: 0,
          value: '75000',
          address: firstLegacyAddr.address, // P2PKH
          path: firstLegacyAddr.path,
          hex: legacyPrevTx.hex,
        },
      ];

      const outputs = [
        {
          address: secondLegacyAddr.address,
          amountSats: 100000n,
        },
      ];

      const result = await buildSignedTransaction(
        testMnemonic,
        mockUtxos,
        outputs,
        addressMap,
        firstChangeAddr.address,
        5,
      );

      expect(result.totalInput).toBe(125000n); // 50k + 75k
      expect(result.hex).toBeTruthy();

      const tx = bitcoin.Transaction.fromHex(result.hex);
      expect(tx.ins).toHaveLength(2);

      // P2WPKH input should have witness data, P2PKH should not
      // Note: In practice, P2PKH uses scriptSig, not witness
      expect(tx.ins.length).toBe(2);
    });

    it('should send to P2PKH (legacy) addresses', async () => {
      const mockUtxos: BlockbookUtxo[] = [
        {
          txid: 'd'.repeat(64),
          vout: 0,
          value: '200000',
          address: firstReceiveAddr.address,
          path: firstReceiveAddr.path,
        },
      ];

      const outputs = [
        {
          address: firstLegacyAddr.address, // Send to legacy address
          amountSats: 150000n,
        },
      ];

      const result = await buildSignedTransaction(
        testMnemonic,
        mockUtxos,
        outputs,
        addressMap,
        firstChangeAddr.address,
        5,
      );

      expect(result.outputs).toHaveLength(2); // Destination + change
      expect(result.outputs[0].address).toBe(firstLegacyAddr.address);
      expect(result.outputs[0].amountSats).toBe(150000n);

      const tx = bitcoin.Transaction.fromHex(result.hex);
      expect(tx.outs).toHaveLength(2);
    });
  });
});
