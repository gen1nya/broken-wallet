import { BlockbookTransaction } from './blockbookClient';
import { DerivedAddress, deriveWalletFromMnemonic } from './bitcoin';

interface MaxIndices {
  segwitReceive: number;
  segwitChange: number;
  legacyReceive: number;
  legacyChange: number;
}

/**
 * Analyzes transactions to find the maximum used address index for each chain.
 * This helps us derive enough addresses to cover all wallet activity.
 */
export function findMaxUsedIndices(
  transactions: BlockbookTransaction[],
  currentAddresses: DerivedAddress[]
): MaxIndices {
  const indices: MaxIndices = {
    segwitReceive: -1,
    segwitChange: -1,
    legacyReceive: -1,
    legacyChange: -1,
  };

  // Build a map of known addresses
  const addressMap = new Map<string, DerivedAddress>();
  currentAddresses.forEach(addr => {
    addressMap.set(addr.address, addr);
  });

  // Scan all transactions for owned addresses
  transactions.forEach(tx => {
    // Check inputs
    tx.vin.forEach(input => {
      if (input.addresses) {
        input.addresses.forEach(address => {
          const knownAddr = addressMap.get(address);
          if (knownAddr || input.isOwn) {
            if (knownAddr) {
              updateMaxIndex(indices, knownAddr);
            }
          }
        });
      }
    });

    // Check outputs
    tx.vout.forEach(output => {
      if (output.addresses) {
        output.addresses.forEach(address => {
          const knownAddr = addressMap.get(address);
          if (knownAddr || output.isOwn) {
            if (knownAddr) {
              updateMaxIndex(indices, knownAddr);
            }
          }
        });
      }
    });
  });

  return indices;
}

function updateMaxIndex(indices: MaxIndices, addr: DerivedAddress) {
  if (addr.format === 'p2wpkh') {
    if (addr.type === 'receive') {
      indices.segwitReceive = Math.max(indices.segwitReceive, addr.index);
    } else {
      indices.segwitChange = Math.max(indices.segwitChange, addr.index);
    }
  } else if (addr.format === 'p2pkh') {
    if (addr.type === 'receive') {
      indices.legacyReceive = Math.max(indices.legacyReceive, addr.index);
    } else {
      indices.legacyChange = Math.max(indices.legacyChange, addr.index);
    }
  }
}

/**
 * Derives wallet addresses with automatic discovery based on transaction history.
 * Uses BIP44 gap limit concept: derives up to max_used_index + gap addresses.
 */
export function deriveWalletWithDiscovery(
  mnemonic: string,
  transactions: BlockbookTransaction[],
  gapLimit: number = 20,
  minAddresses: number = 5
): {
  segwitAddresses: DerivedAddress[];
  legacyAddresses: DerivedAddress[];
} {
  // First pass: derive minimum addresses
  const initial = deriveWalletFromMnemonic(mnemonic, {
    receiveCount: minAddresses,
    changeCount: minAddresses,
  });

  const initialAddresses = [
    ...initial.segwitAccount.addresses,
    ...initial.legacyAccount.addresses,
  ];

  // Find max used indices
  const maxIndices = findMaxUsedIndices(transactions, initialAddresses);

  // Calculate how many addresses we need for each chain
  const segwitReceiveCount = Math.max(
    minAddresses,
    maxIndices.segwitReceive + gapLimit + 1
  );
  const segwitChangeCount = Math.max(
    minAddresses,
    maxIndices.segwitChange + gapLimit + 1
  );
  const legacyReceiveCount = Math.max(
    minAddresses,
    maxIndices.legacyReceive + gapLimit + 1
  );
  const legacyChangeCount = Math.max(
    minAddresses,
    maxIndices.legacyChange + gapLimit + 1
  );

  // Derive full address set
  const segwitWallet = deriveWalletFromMnemonic(mnemonic, {
    receiveCount: segwitReceiveCount,
    changeCount: segwitChangeCount,
  });

  const legacyWallet = deriveWalletFromMnemonic(mnemonic, {
    receiveCount: legacyReceiveCount,
    changeCount: legacyChangeCount,
  });

  return {
    segwitAddresses: segwitWallet.segwitAccount.addresses,
    legacyAddresses: legacyWallet.legacyAccount.addresses,
  };
}

/**
 * Checks if an address belongs to the wallet using combined approach:
 * 1. Check isOwn field from API (most reliable)
 * 2. Check against derived address map (fallback)
 */
export function isOwnAddress(
  address: string,
  isOwnFromApi: boolean | undefined,
  addressMap: Map<string, DerivedAddress>
): boolean {
  // Priority 1: Use API's isOwn field if available
  if (isOwnFromApi !== undefined) {
    return isOwnFromApi;
  }

  // Priority 2: Check local address map
  return addressMap.has(address);
}
