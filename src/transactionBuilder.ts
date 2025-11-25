import { Buffer } from 'buffer';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { BlockbookUtxo } from './blockbookClient';
import { DerivedAddress } from './bitcoin';

const ACCOUNT_PATH = "m/84'/0'/0'";

const ECPair = ECPairFactory(ecc);

export type AddressEncoding = 'p2wpkh' | 'p2pkh';

export interface TxOutputRequest {
  address: string;
  amountSats: bigint;
}

export interface TxBuildResult {
  hex: string;
  feeSats: bigint;
  vsize: number;
  txId: string;
  totalInput: bigint;
  totalOutput: bigint;
  changeOutput?: TxOutputRequest;
  outputs: TxOutputRequest[];
  effectiveFeeRate: number;
}

function getNetwork() {
  return bitcoin.networks.bitcoin;
}

function fingerprintBuffer(node: HDKey): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(node.fingerprint); // already 4-byte
  return buffer;
}

export function detectAddressType(address: string): AddressEncoding | null {
  try {
    const decoded = bitcoin.address.fromBech32(address);
    if (decoded.version === 0 && decoded.data.length === 20) {
      return 'p2wpkh';
    }
  } catch {
    // ignore
  }

  try {
    const decoded = bitcoin.address.fromBase58Check(address);
    if (decoded.version === bitcoin.networks.bitcoin.pubKeyHash) {
      return 'p2pkh';
    }
  } catch {
    // ignore
  }

  return null;
}

function estimateOutputWeight(type: AddressEncoding): number {
  return type === 'p2wpkh' ? 31 : 34;
}

function estimateInputWeight(type: AddressEncoding): number {
  return type === 'p2wpkh' ? 68 : 148;
}

function buildPayments(address: string, pubkey?: Buffer) {
  const network = getNetwork();
  const type = detectAddressType(address);
  if (!type) {
    throw new Error(`Unsupported address format: ${address}`);
  }

  if (type !== 'p2wpkh') {
    throw new Error('Currently only native segwit UTXOs are supported for signing');
  }

  if (type === 'p2wpkh') {
    const payment = bitcoin.payments.p2wpkh({ address, pubkey, network });
    if (!payment.output) {
      throw new Error('Failed to derive p2wpkh payment');
    }
    return { type, payment };
  }

  const payment = bitcoin.payments.p2pkh({ address, pubkey, network });
  if (!payment.output) {
    throw new Error('Failed to derive p2pkh payment');
  }
  return { type, payment };
}

function deriveChildFromPath(mnemonic: string, path: string): HDKey {
  const seed = mnemonicToSeedSync(mnemonic, '');
  const master = HDKey.fromMasterSeed(seed);
  return master.derive(path);
}

function deriveAccountNode(mnemonic: string) {
  const seed = mnemonicToSeedSync(mnemonic, '');
  const master = HDKey.fromMasterSeed(seed);
  return master.derive(ACCOUNT_PATH);
}

export function buildSignedTransaction(
  mnemonic: string,
  utxos: BlockbookUtxo[],
  outputs: TxOutputRequest[],
  addressMap: Map<string, DerivedAddress>,
  changeAddress: string | null,
  feeRate: number,
): TxBuildResult {
  if (!utxos.length) {
    throw new Error('Select at least one UTXO');
  }

  if (!outputs.length) {
    throw new Error('Add at least one output');
  }

  const network = getNetwork();
  const account = deriveAccountNode(mnemonic);
  const psbt = new bitcoin.Psbt({ network });
  const inputTotal = utxos.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n);

  const outputWithTypes = outputs.map((output) => {
    const type = detectAddressType(output.address);
    if (!type) {
      throw new Error(`Unsupported output address: ${output.address}`);
    }
    return { ...output, type };
  });

  const prospectiveOutputs: TxOutputRequest[] = [...outputs];
  let changeValue = 0n;

  if (changeAddress) {
    const changeType = detectAddressType(changeAddress);
    if (!changeType) {
      throw new Error('Change address must be p2pkh or p2wpkh');
    }

    const inputTypes = utxos.map((utxo) => detectAddressType(utxo.address ?? ''));
    const estimatedVsize =
      10 +
      inputTypes.reduce((total, t) => total + estimateInputWeight(t ?? 'p2wpkh'), 0) +
      outputWithTypes.reduce((total, o) => total + estimateOutputWeight(o.type), 0) +
      estimateOutputWeight(changeType);

    const feeEstimate = BigInt(Math.ceil(estimatedVsize * feeRate));
    const targetOutputs = outputs.reduce((sum, o) => sum + o.amountSats, 0n);
    changeValue = inputTotal - targetOutputs - feeEstimate;

    if (changeValue < 0n) {
      throw new Error('Selected inputs cannot cover outputs and fee');
    }

    if (changeValue > 0n) {
      prospectiveOutputs.push({ address: changeAddress, amountSats: changeValue });
    }
  }

  const totalPlannedOutput = prospectiveOutputs.reduce((sum, output) => sum + output.amountSats, 0n);
  if (totalPlannedOutput > inputTotal) {
    throw new Error('Outputs exceed selected input value');
  }

  prospectiveOutputs.forEach((output) => {
    psbt.addOutput({ address: output.address, value: Number(output.amountSats) });
  });

  utxos.forEach((utxo) => {
    const derivation = utxo.path || addressMap.get(utxo.address ?? '')?.path;
    if (!derivation) {
      throw new Error(`No derivation path found for ${utxo.address ?? 'unknown address'}`);
    }

    const node = deriveChildFromPath(mnemonic, derivation);
    if (!node.privateKey || !node.publicKey) {
      throw new Error(`Missing key material for ${derivation}`);
    }

    const { payment } = buildPayments(utxo.address ?? '', Buffer.from(node.publicKey));

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: payment.output!,
        value: Number(utxo.value),
      },
      bip32Derivation: [
        {
          masterFingerprint: fingerprintBuffer(account),
          path: derivation,
          pubkey: Buffer.from(node.publicKey),
        },
      ],
    });

    const keyPair = ECPair.fromPrivateKey(Buffer.from(node.privateKey));
    psbt.signInput(psbt.inputCount - 1, keyPair);
  });

  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();

  const totalOutput = prospectiveOutputs.reduce((sum, o) => sum + o.amountSats, 0n);
  const feeSats = inputTotal - totalOutput;
  const vsize = tx.virtualSize();

  return {
    hex: tx.toHex(),
    feeSats,
    vsize,
    txId: tx.getId(),
    totalInput: inputTotal,
    totalOutput,
    changeOutput: changeValue > 0n ? { address: changeAddress!, amountSats: changeValue } : undefined,
    outputs: prospectiveOutputs,
    effectiveFeeRate: Number(feeSats) / vsize,
  };
}
