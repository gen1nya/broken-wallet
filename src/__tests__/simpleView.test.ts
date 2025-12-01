import { describe, expect, it } from 'vitest';
import { BlockbookTransaction } from '../blockbookClient';
import { DerivedAddress } from '../bitcoin';
import { findFirstCleanReceiveAddress } from '../simpleMode';

const makeAddress = (address: string, type: 'receive' | 'change', format: 'p2wpkh' | 'p2pkh', index: number): DerivedAddress => ({
  address,
  path: `m/84'/0'/0'/${type === 'receive' ? 0 : 1}/${index}`,
  publicKey: '02'.padEnd(66, '0'),
  type,
  format,
  index,
});

const makeTxTouching = (address: string, txid: string): BlockbookTransaction => ({
  txid,
  vin: [{ txid: `${txid}-vin`, vout: 0, n: 0, value: '0', addresses: [address] }],
  vout: [{ n: 0, value: '0', addresses: [address] }],
  value: '0',
  valueIn: '0',
  fees: '0',
});

describe('findFirstCleanReceiveAddress', () => {
  const segwitReceive = [makeAddress('bc1clean0', 'receive', 'p2wpkh', 0), makeAddress('bc1clean1', 'receive', 'p2wpkh', 1)];
  const legacyReceive = [makeAddress('1legacy0', 'receive', 'p2pkh', 0)];
  const segwitChange = [makeAddress('bc1change0', 'change', 'p2wpkh', 0)];

  const segwitAddresses = [...segwitReceive, ...segwitChange];
  const legacyAddresses = [...legacyReceive];
  const addressMap = new Map<string, DerivedAddress>([...segwitAddresses, ...legacyAddresses].map((addr) => [addr.address, addr]));

  it('returns the first unused segwit receive address when available', () => {
    const txs: BlockbookTransaction[] = [makeTxTouching('bc1clean0', 'tx1')];

    const result = findFirstCleanReceiveAddress(segwitAddresses, legacyAddresses, txs, addressMap);

    expect(result?.address).toBe('bc1clean1');
  });

  it('falls back to legacy receive when segwit addresses are used', () => {
    const txs: BlockbookTransaction[] = [makeTxTouching('bc1clean0', 'tx1'), makeTxTouching('bc1clean1', 'tx2')];

    const result = findFirstCleanReceiveAddress(segwitAddresses, legacyAddresses, txs, addressMap);

    expect(result?.address).toBe('1legacy0');
  });

  it('returns the first receive address when there is no history', () => {
    const result = findFirstCleanReceiveAddress(segwitAddresses, legacyAddresses, [], addressMap);

    expect(result?.address).toBe('bc1clean0');
  });
});
