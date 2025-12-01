import { BlockbookTransaction } from './blockbookClient';
import { DerivedAddress } from './bitcoin';

const buildUsedAddressSet = (transactions: BlockbookTransaction[], addressMap: Map<string, DerivedAddress>) => {
  const used = new Set<string>();
  transactions.forEach((tx) => {
    tx.vin.forEach((input) => {
      input.addresses?.forEach((addr) => {
        if (addressMap.has(addr)) {
          used.add(addr);
        }
      });
    });
    tx.vout.forEach((output) => {
      output.addresses?.forEach((addr) => {
        if (addressMap.has(addr)) {
          used.add(addr);
        }
      });
    });
  });
  return used;
};

export const findFirstCleanReceiveAddress = (
  segwitAddresses: DerivedAddress[],
  legacyAddresses: DerivedAddress[],
  transactions: BlockbookTransaction[],
  addressMap: Map<string, DerivedAddress>,
): DerivedAddress | undefined => {
  const used = buildUsedAddressSet(transactions, addressMap);

  const segwitReceive = segwitAddresses.filter((addr) => addr.type === 'receive');
  const legacyReceive = legacyAddresses.filter((addr) => addr.type === 'receive');

  const cleanSegwit = segwitReceive.find((addr) => !used.has(addr.address));
  if (cleanSegwit) return cleanSegwit;

  const cleanLegacy = legacyReceive.find((addr) => !used.has(addr.address));
  if (cleanLegacy) return cleanLegacy;

  return segwitReceive[0] || legacyReceive[0];
};

