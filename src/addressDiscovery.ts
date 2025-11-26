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
 *
 * Uses iterative approach:
 * 1. Derive initial batch of addresses
 * 2. Scan transactions to find max used index
 * 3. If we found addresses near the end of our batch, derive more
 * 4. Repeat until we have enough gap after last used address
 */
export function deriveWalletWithDiscovery(
  mnemonic: string,
  transactions: BlockbookTransaction[],
  gapLimit: number = 20,
  minAddresses: number = 5,
  networkSymbol: string = 'btc'
): {
  segwitAddresses: DerivedAddress[];
  legacyAddresses: DerivedAddress[];
} {
  let currentCount = Math.max(minAddresses, 100); // Start with at least 100 addresses
  let maxIterations = 10;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    // Derive addresses for current count
    const wallet = deriveWalletFromMnemonic(mnemonic, {
      receiveCount: currentCount,
      changeCount: currentCount,
    }, networkSymbol);

    const allAddresses = [
      ...wallet.segwitAccount.addresses,
      ...wallet.legacyAccount.addresses,
    ];

    // Find max used indices
    const maxIndices = findMaxUsedIndices(transactions, allAddresses);

    // Calculate required counts based on max indices
    const requiredCounts = {
      segwitReceive: maxIndices.segwitReceive + gapLimit + 1,
      segwitChange: maxIndices.segwitChange + gapLimit + 1,
      legacyReceive: maxIndices.legacyReceive + gapLimit + 1,
      legacyChange: maxIndices.legacyChange + gapLimit + 1,
    };

    const maxRequired = Math.max(
      requiredCounts.segwitReceive,
      requiredCounts.segwitChange,
      requiredCounts.legacyReceive,
      requiredCounts.legacyChange,
      minAddresses
    );

    // If current count is sufficient, we're done
    if (currentCount >= maxRequired) {
      // Derive final address set with exact counts
      const segwitWallet = deriveWalletFromMnemonic(mnemonic, {
        receiveCount: Math.max(minAddresses, requiredCounts.segwitReceive),
        changeCount: Math.max(minAddresses, requiredCounts.segwitChange),
      }, networkSymbol);

      const legacyWallet = deriveWalletFromMnemonic(mnemonic, {
        receiveCount: Math.max(minAddresses, requiredCounts.legacyReceive),
        changeCount: Math.max(minAddresses, requiredCounts.legacyChange),
      }, networkSymbol);

      return {
        segwitAddresses: segwitWallet.segwitAccount.addresses,
        legacyAddresses: legacyWallet.legacyAccount.addresses,
      };
    }

    // Need more addresses, double the count
    currentCount = Math.min(maxRequired * 2, 10000); // Cap at 10000 to prevent infinite growth
  }

  // Fallback: return what we have
  const segwitWallet = deriveWalletFromMnemonic(mnemonic, {
    receiveCount: currentCount,
    changeCount: currentCount,
  }, networkSymbol);

  const legacyWallet = deriveWalletFromMnemonic(mnemonic, {
    receiveCount: currentCount,
    changeCount: currentCount,
  }, networkSymbol);

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
