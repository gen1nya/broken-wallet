import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Code,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  HStack,
  Heading,
  Icon,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Progress,
  Stack,
  Text,
  Textarea,
  Tooltip,
  VStack,
  Wrap,
  WrapItem,
  useColorModeValue,
} from '@chakra-ui/react';
import { useState, useMemo, useCallback } from 'react';
import { FaSearch, FaSync } from 'react-icons/fa';
import { DerivedAddress, deriveAddressesFromXpub, detectExtendedKeyInfo, ExtendedKeyInfo, XpubType, NETWORKS } from './bitcoin';
import { BlockbookTransaction, BlockbookUtxo, fetchAllTransactions, fetchUtxos, NetworkSymbol } from './blockbookClient';
import { useNetwork } from './NetworkContext';
import { QRCodeSVG } from 'qrcode.react';
import TransactionList from './TransactionList';
import TransactionDetailsModal from './TransactionDetailsModal';

type AddressState = 'empty' | 'with-balance' | 'spent';

interface AddressInfo {
  address: DerivedAddress;
  state: AddressState;
  balance: bigint;
  txCount: number;
}

interface DiscoveryStatus {
  phase: 'idle' | 'deriving' | 'fetching' | 'analyzing' | 'expanding' | 'done';
  message: string;
  iteration?: number;
  currentCount?: number;
  maxUsedIndex?: { receive: number; change: number };
}

function AddressBlock({ info, ticker }: { info: AddressInfo; ticker: string }) {
  const stateColors = {
    empty: useColorModeValue('gray.300', 'gray.600'),
    'with-balance': useColorModeValue('green.400', 'green.500'),
    spent: useColorModeValue('red.400', 'red.500'),
  };

  const bg = stateColors[info.state];
  const hoverBg = useColorModeValue('purple.400', 'purple.500');

  return (
    <Tooltip
      label={
        <VStack align="stretch" spacing={2}>
          <Box bg="white" p={2} borderRadius="md" alignSelf="center">
            <QRCodeSVG
              value={info.address.address}
              size={120}
              level="M"
              includeMargin={false}
            />
          </Box>
          <Text fontSize="xs" fontWeight="bold">
            Index: {info.address.index}
          </Text>
          <Text fontSize="xs" wordBreak="break-all">
            {info.address.address}
          </Text>
          <Text fontSize="xs">
            Balance: {(Number(info.balance) / 1e8).toFixed(8)} {ticker}
          </Text>
          <Text fontSize="xs">
            Transactions: {info.txCount}
          </Text>
          <Text fontSize="xs" color="gray.400">
            {info.address.path}
          </Text>
        </VStack>
      }
      placement="top"
      hasArrow
    >
      <Box
        w="16px"
        h="16px"
        bg={bg}
        borderRadius="sm"
        cursor="pointer"
        transition="all 0.2s"
        _hover={{
          bg: hoverBg,
          transform: 'scale(1.2)',
        }}
      />
    </Tooltip>
  );
}

function AddressChain({ addresses, label, transactions, ticker }: {
  addresses: DerivedAddress[];
  label: string;
  transactions: BlockbookTransaction[];
  ticker: string;
}) {
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  const addressInfos: AddressInfo[] = useMemo(() => {
    const addressSet = new Set(addresses.map(a => a.address));
    const addressTxMap = new Map<string, { balance: bigint; txCount: number }>();

    addresses.forEach(addr => {
      addressTxMap.set(addr.address, { balance: 0n, txCount: 0 });
    });

    transactions.forEach(tx => {
      const involvedAddresses = new Set<string>();

      tx.vout.forEach(output => {
        output.addresses?.forEach(address => {
          if (addressSet.has(address)) {
            involvedAddresses.add(address);
            const info = addressTxMap.get(address)!;
            if (!output.spent) {
              info.balance += BigInt(output.value);
            }
          }
        });
      });

      tx.vin.forEach(input => {
        input.addresses?.forEach(address => {
          if (addressSet.has(address)) {
            involvedAddresses.add(address);
          }
        });
      });

      involvedAddresses.forEach(address => {
        addressTxMap.get(address)!.txCount++;
      });
    });

    return addresses.map(addr => {
      const info = addressTxMap.get(addr.address)!;
      let state: AddressState = 'empty';
      if (info.balance > 0n) {
        state = 'with-balance';
      } else if (info.txCount > 0) {
        state = 'spent';
      }

      return { address: addr, state, balance: info.balance, txCount: info.txCount };
    });
  }, [addresses, transactions]);

  const totalBalance = useMemo(() =>
    addressInfos.reduce((sum, info) => sum + info.balance, 0n),
    [addressInfos]
  );

  const usedCount = useMemo(() =>
    addressInfos.filter(info => info.state !== 'empty').length,
    [addressInfos]
  );

  return (
    <VStack align="stretch" spacing={2}>
      <HStack spacing={2} flexWrap="wrap">
        <Badge colorScheme="purple" fontSize="xs" px={2}>
          {label}
        </Badge>
        <Text fontSize="xs" color="gray.500">
          {addresses.length} addresses
        </Text>
        <Text fontSize="xs" color="gray.500">
          ({usedCount} used)
        </Text>
        {totalBalance > 0n && (
          <Badge colorScheme="green" fontSize="xs">
            {(Number(totalBalance) / 1e8).toFixed(8)} {ticker}
          </Badge>
        )}
      </HStack>
      <Box
        borderWidth="1px"
        borderColor={borderColor}
        borderRadius="md"
        p={3}
        maxH="200px"
        overflowY="auto"
      >
        <Wrap spacing={1}>
          {addressInfos.map((info, idx) => (
            <WrapItem key={idx}>
              <AddressBlock info={info} ticker={ticker} />
            </WrapItem>
          ))}
        </Wrap>
      </Box>
    </VStack>
  );
}

const formatCrypto = (value: string | number | bigint, ticker: string) => {
  const sats = typeof value === 'string' ? BigInt(value) : typeof value === 'bigint' ? value : BigInt(value);
  const btc = Number(sats) / 1e8;
  return `${btc.toFixed(8)} ${ticker} (${sats.toString()} sats)`;
};

function UtxoList({ utxos, addressMap, ticker }: {
  utxos: BlockbookUtxo[];
  addressMap: Map<string, DerivedAddress>;
  ticker: string;
}) {
  if (!utxos.length) {
    return <Text color="gray.500">No UTXOs found.</Text>;
  }

  return (
    <Stack spacing={4}>
      {utxos.map((utxo) => {
        const match = utxo.address ? addressMap.get(utxo.address) : undefined;
        return (
          <Box key={`${utxo.txid}:${utxo.vout}`} borderWidth="1px" borderRadius="lg" p={4}>
            <Stack spacing={2}>
              <Text>
                <Text as="span" fontWeight="bold">TXID</Text>{' '}
                <Code wordBreak="break-all">{utxo.txid}</Code> · vout {utxo.vout}
              </Text>
              <Text>
                <Text as="span" fontWeight="bold">Amount</Text>{' '}
                {formatCrypto(utxo.value, ticker)}
              </Text>
              <Grid templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap={3}>
                <GridItem>
                  <Text fontWeight="bold">Address</Text>
                  <Text fontFamily="mono" wordBreak="break-all">
                    {utxo.address || 'Unknown'}
                  </Text>
                </GridItem>
                <GridItem>
                  <Text fontWeight="bold">Derivation path</Text>
                  <Text fontFamily="mono" wordBreak="break-all">
                    {utxo.path || match?.path || 'N/A'}
                  </Text>
                </GridItem>
              </Grid>
              <Grid templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap={3}>
                <GridItem>
                  <Text fontWeight="bold">Confirmations</Text>
                  <Text>{utxo.confirmations ?? 'N/A'}</Text>
                </GridItem>
                <GridItem>
                  <Text fontWeight="bold">Block height</Text>
                  <Text>{utxo.height ?? 'Unconfirmed'}</Text>
                </GridItem>
              </Grid>
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}

/**
 * Finds the maximum used address index in each chain based on transactions
 */
function findMaxUsedIndices(
  transactions: BlockbookTransaction[],
  addresses: DerivedAddress[]
): { receive: number; change: number } {
  const indices = { receive: -1, change: -1 };

  const addressMap = new Map<string, DerivedAddress>();
  addresses.forEach(addr => {
    addressMap.set(addr.address, addr);
  });

  transactions.forEach(tx => {
    // Check inputs
    tx.vin.forEach(input => {
      input.addresses?.forEach(address => {
        const knownAddr = addressMap.get(address);
        if (knownAddr) {
          if (knownAddr.type === 'receive') {
            indices.receive = Math.max(indices.receive, knownAddr.index);
          } else {
            indices.change = Math.max(indices.change, knownAddr.index);
          }
        }
      });
    });

    // Check outputs
    tx.vout.forEach(output => {
      output.addresses?.forEach(address => {
        const knownAddr = addressMap.get(address);
        if (knownAddr) {
          if (knownAddr.type === 'receive') {
            indices.receive = Math.max(indices.receive, knownAddr.index);
          } else {
            indices.change = Math.max(indices.change, knownAddr.index);
          }
        }
      });
    });
  });

  return indices;
}

export default function XpubExplorerView() {
  const { network, networkInfo } = useNetwork();
  const panelBg = useColorModeValue('gray.50', 'gray.800');

  const [xpubInput, setXpubInput] = useState('');
  const [gapLimit, setGapLimit] = useState(20);
  const [addresses, setAddresses] = useState<DerivedAddress[]>([]);
  const [xpubType, setXpubType] = useState<XpubType>('unknown');
  const [keyInfo, setKeyInfo] = useState<ExtendedKeyInfo | null>(null);
  const [detectedNetwork, setDetectedNetwork] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<BlockbookTransaction[]>([]);
  const [utxos, setUtxos] = useState<BlockbookUtxo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus>({ phase: 'idle', message: '' });
  const [selectedTransaction, setSelectedTransaction] = useState<BlockbookTransaction | null>(null);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);

  const addressMap = useMemo(() =>
    new Map(addresses.map(addr => [addr.address, addr])),
    [addresses]
  );

  const receiveAddresses = useMemo(() =>
    addresses.filter(a => a.type === 'receive'),
    [addresses]
  );

  const changeAddresses = useMemo(() =>
    addresses.filter(a => a.type === 'change'),
    [addresses]
  );

  const totalBalance = useMemo(() =>
    utxos.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n),
    [utxos]
  );

  // Get effective ticker based on detected network
  const effectiveTicker = useMemo(() => {
    if (detectedNetwork && NETWORKS[detectedNetwork]) {
      // Use network symbol (BTC, DOGE, LTC, DASH) as ticker
      return detectedNetwork.toUpperCase();
    }
    return networkInfo.ticker;
  }, [detectedNetwork, networkInfo.ticker]);

  const runDiscovery = useCallback(async (xpub: string, gap: number) => {
    const MAX_ITERATIONS = 20;
    const INITIAL_COUNT = Math.max(gap, 20);
    const MAX_ADDRESSES = 10000;

    let currentCount = INITIAL_COUNT;
    let iteration = 0;
    let allTransactions: BlockbookTransaction[] = [];
    let currentAddresses: DerivedAddress[] = [];

    // Detect extended key info (type and network)
    const detectedKeyInfo = detectExtendedKeyInfo(xpub);
    if (detectedKeyInfo.type === 'unknown') {
      throw new Error('Unknown key format. Supported formats: xpub, zpub (BTC), dgub (DOGE), Ltub/Mtub (LTC), drkp (DASH).');
    }
    setXpubType(detectedKeyInfo.type);
    setKeyInfo(detectedKeyInfo);
    setDetectedNetwork(detectedKeyInfo.network);

    // Use detected network for API calls
    const effectiveNetwork = (detectedKeyInfo.network || network) as NetworkSymbol;

    // First, fetch all transactions for this xpub
    setDiscoveryStatus({
      phase: 'fetching',
      message: `Fetching transactions from ${NETWORKS[effectiveNetwork]?.extPubKeyPrefix || effectiveNetwork} blockchain...`,
    });

    const txResult = await fetchAllTransactions(xpub, effectiveNetwork, 1000);
    allTransactions = txResult.transactions ?? [];

    // If no transactions, just derive gap limit addresses and stop
    if (allTransactions.length === 0) {
      setDiscoveryStatus({
        phase: 'deriving',
        message: `No transactions found. Deriving ${gap} addresses...`,
      });

      const result = deriveAddressesFromXpub(
        xpub,
        { receiveCount: gap, changeCount: gap },
        effectiveNetwork
      );

      return {
        addresses: result.addresses,
        transactions: [],
      };
    }

    // Iterative discovery
    while (iteration < MAX_ITERATIONS) {
      iteration++;

      setDiscoveryStatus({
        phase: 'deriving',
        message: `Iteration ${iteration}: Deriving ${currentCount} addresses per chain...`,
        iteration,
        currentCount,
      });

      // Derive addresses
      const result = deriveAddressesFromXpub(
        xpub,
        { receiveCount: currentCount, changeCount: currentCount },
        effectiveNetwork
      );
      currentAddresses = result.addresses;

      setDiscoveryStatus({
        phase: 'analyzing',
        message: `Analyzing ${allTransactions.length} transactions...`,
        iteration,
        currentCount,
      });

      // Find max used indices
      const maxIndices = findMaxUsedIndices(allTransactions, currentAddresses);

      setDiscoveryStatus({
        phase: 'analyzing',
        message: `Max used: receive=${maxIndices.receive}, change=${maxIndices.change}`,
        iteration,
        currentCount,
        maxUsedIndex: maxIndices,
      });

      // Calculate required counts
      const requiredReceive = maxIndices.receive + gap + 1;
      const requiredChange = maxIndices.change + gap + 1;
      const maxRequired = Math.max(requiredReceive, requiredChange);

      // Check if we have enough gap
      if (currentCount >= maxRequired) {
        // We're done! Derive final set with exact requirements
        setDiscoveryStatus({
          phase: 'done',
          message: `Discovery complete. Found gap of ${gap} after index ${Math.max(maxIndices.receive, maxIndices.change)}`,
          iteration,
          currentCount: maxRequired,
          maxUsedIndex: maxIndices,
        });

        const finalResult = deriveAddressesFromXpub(
          xpub,
          { receiveCount: maxRequired, changeCount: maxRequired },
          effectiveNetwork
        );

        return {
          addresses: finalResult.addresses,
          transactions: allTransactions,
        };
      }

      // Need more addresses
      if (currentCount >= MAX_ADDRESSES) {
        // Hit the limit, return what we have
        setDiscoveryStatus({
          phase: 'done',
          message: `Reached maximum address limit (${MAX_ADDRESSES}). Some addresses may be missing.`,
          iteration,
          currentCount,
          maxUsedIndex: maxIndices,
        });

        return {
          addresses: currentAddresses,
          transactions: allTransactions,
        };
      }

      // Expand - at least double or jump to required
      const newCount = Math.min(Math.max(currentCount * 2, maxRequired + gap), MAX_ADDRESSES);

      setDiscoveryStatus({
        phase: 'expanding',
        message: `Gap not satisfied. Expanding from ${currentCount} to ${newCount} addresses...`,
        iteration,
        currentCount: newCount,
        maxUsedIndex: maxIndices,
      });

      currentCount = newCount;
    }

    // Fallback after max iterations
    return {
      addresses: currentAddresses,
      transactions: allTransactions,
    };
  }, [network]);

  const handleExplore = async () => {
    if (!xpubInput.trim()) {
      setError('Please enter an extended public key');
      return;
    }

    setLoading(true);
    setError(null);
    setAddresses([]);
    setTransactions([]);
    setUtxos([]);
    setKeyInfo(null);
    setDetectedNetwork(null);
    setDiscoveryStatus({ phase: 'idle', message: '' });

    try {
      // Run auto-discovery (this sets keyInfo and detectedNetwork)
      const discoveryResult = await runDiscovery(xpubInput.trim(), gapLimit);

      setAddresses(discoveryResult.addresses);
      setTransactions(discoveryResult.transactions);

      // Use detected network for UTXO fetch
      const detectedKeyInfo = detectExtendedKeyInfo(xpubInput.trim());
      const effectiveNetwork = (detectedKeyInfo.network || network) as NetworkSymbol;

      // Fetch UTXOs
      setDiscoveryStatus(prev => ({
        ...prev,
        phase: 'fetching',
        message: 'Fetching UTXOs...',
      }));

      const utxoResult = await fetchUtxos(xpubInput.trim(), effectiveNetwork);
      setUtxos(utxoResult);

      setDiscoveryStatus(prev => ({
        ...prev,
        phase: 'done',
        message: `Complete! Found ${discoveryResult.addresses.length} addresses, ${discoveryResult.transactions.length} transactions, ${utxoResult.length} UTXOs`,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to explore xpub');
      setDiscoveryStatus({ phase: 'idle', message: '' });
    } finally {
      setLoading(false);
    }
  };

  const handleTransactionClick = (tx: BlockbookTransaction) => {
    setSelectedTransaction(tx);
    setIsTxModalOpen(true);
  };

  const handleRefresh = async () => {
    if (!xpubInput.trim() || addresses.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      // Re-run discovery
      const discoveryResult = await runDiscovery(xpubInput.trim(), gapLimit);

      setAddresses(discoveryResult.addresses);
      setTransactions(discoveryResult.transactions);

      // Use detected network for UTXO fetch
      const effectiveNetwork = (detectedNetwork || network) as NetworkSymbol;
      const utxoResult = await fetchUtxos(xpubInput.trim(), effectiveNetwork);
      setUtxos(utxoResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (phase: DiscoveryStatus['phase']) => {
    switch (phase) {
      case 'done': return 'green';
      case 'expanding': return 'orange';
      default: return 'purple';
    }
  };

  return (
    <Stack spacing={8}>
      <Box p={6} rounded="lg" bg={panelBg} shadow="md">
        <Stack spacing={4}>
          <Heading size="md">Explore Extended Public Key</Heading>
          <Text color="gray.500">
            Enter an extended public key to view its derived addresses, UTXOs, and transaction history.
            Supports multiple formats: xpub/zpub (BTC), dgub (DOGE), Ltub/Mtub (LTC), drkp (DASH).
            Addresses are automatically discovered using BIP44 gap limit algorithm.
          </Text>

          <FormControl>
            <FormLabel>Extended Public Key</FormLabel>
            <Textarea
              value={xpubInput}
              onChange={(e) => setXpubInput(e.target.value)}
              placeholder="xpub... / zpub... / dgub... / Ltub... / Mtub... / drkp..."
              fontFamily="mono"
              fontSize="sm"
              rows={2}
            />
          </FormControl>

          <HStack spacing={4} flexWrap="wrap">
            <FormControl maxW="200px">
              <FormLabel fontSize="sm">Gap Limit</FormLabel>
              <Tooltip label="Number of consecutive empty addresses required to stop discovery. BIP44 standard is 20.">
                <NumberInput
                  value={gapLimit}
                  onChange={(_, val) => setGapLimit(val || 20)}
                  min={1}
                  max={100}
                  size="sm"
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              </Tooltip>
            </FormControl>

            <Button
              colorScheme="purple"
              leftIcon={<Icon as={FaSearch} />}
              onClick={handleExplore}
              isLoading={loading}
              loadingText="Discovering..."
              alignSelf="flex-end"
            >
              Explore
            </Button>

            {addresses.length > 0 && (
              <Button
                variant="outline"
                leftIcon={<Icon as={FaSync} />}
                onClick={handleRefresh}
                isLoading={loading}
                alignSelf="flex-end"
              >
                Refresh
              </Button>
            )}
          </HStack>

          {loading && discoveryStatus.phase !== 'idle' && (
            <Box>
              <HStack mb={2}>
                <Badge colorScheme={getStatusColor(discoveryStatus.phase)}>
                  {discoveryStatus.phase.toUpperCase()}
                </Badge>
                <Text fontSize="sm" color="gray.500">
                  {discoveryStatus.message}
                </Text>
              </HStack>
              {discoveryStatus.maxUsedIndex && (
                <Text fontSize="xs" color="gray.400" mb={2}>
                  Max used indices: receive={discoveryStatus.maxUsedIndex.receive}, change={discoveryStatus.maxUsedIndex.change}
                </Text>
              )}
              <Progress
                isIndeterminate={discoveryStatus.phase !== 'done'}
                colorScheme="purple"
                size="sm"
                hasStripe
                isAnimated
              />
            </Box>
          )}

          {!loading && discoveryStatus.phase === 'done' && (
            <Alert status="success" borderRadius="md">
              <AlertIcon />
              <AlertDescription>{discoveryStatus.message}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </Stack>
      </Box>

      {addresses.length > 0 && (
        <>
          <Box p={6} rounded="lg" bg={panelBg} shadow="md">
            <Stack spacing={4}>
              <HStack justify="space-between" flexWrap="wrap">
                <Heading size="md">Overview</Heading>
                <HStack spacing={2} flexWrap="wrap">
                  {keyInfo && detectedNetwork && (
                    <Badge colorScheme="orange" fontSize="sm" px={2}>
                      {NETWORKS[detectedNetwork]?.extPubKeyPrefix?.toUpperCase() || detectedNetwork.toUpperCase()}
                    </Badge>
                  )}
                  <Badge colorScheme="blue" fontSize="sm" px={2}>
                    {xpubType === 'segwit' ? 'SEGWIT' : 'LEGACY'}
                  </Badge>
                  {keyInfo?.prefix && (
                    <Badge colorScheme="purple" fontSize="sm" px={2}>
                      {keyInfo.prefix}
                    </Badge>
                  )}
                  <Badge colorScheme="gray" fontSize="sm" px={2}>
                    Gap: {gapLimit}
                  </Badge>
                  {totalBalance > 0n && (
                    <Badge colorScheme="green" fontSize="md" px={3} py={1}>
                      {formatCrypto(totalBalance, effectiveTicker)}
                    </Badge>
                  )}
                </HStack>
              </HStack>

              <Grid templateColumns={{ base: '1fr', md: 'repeat(4, 1fr)' }} gap={4}>
                <Box p={4} borderWidth="1px" borderRadius="md">
                  <Text fontWeight="bold" mb={1}>Network</Text>
                  <Text fontSize="xl">{effectiveTicker}</Text>
                </Box>
                <Box p={4} borderWidth="1px" borderRadius="md">
                  <Text fontWeight="bold" mb={1}>Total Addresses</Text>
                  <Text fontSize="2xl">{addresses.length}</Text>
                </Box>
                <Box p={4} borderWidth="1px" borderRadius="md">
                  <Text fontWeight="bold" mb={1}>Transactions</Text>
                  <Text fontSize="2xl">{transactions.length}</Text>
                </Box>
                <Box p={4} borderWidth="1px" borderRadius="md">
                  <Text fontWeight="bold" mb={1}>UTXOs</Text>
                  <Text fontSize="2xl">{utxos.length}</Text>
                </Box>
              </Grid>
            </Stack>
          </Box>

          <Box p={6} rounded="lg" bg={panelBg} shadow="md">
            <Stack spacing={4}>
              <Heading size="md">Address Map</Heading>
              <Text fontSize="sm" color="gray.500">
                Visual representation of address chains. Colors indicate state:
                <Badge colorScheme="gray" mx={1}>Empty</Badge>
                <Badge colorScheme="green" mx={1}>With Balance</Badge>
                <Badge colorScheme="red" mx={1}>Spent</Badge>
              </Text>

              <Text fontSize="md" fontWeight="bold">
                {xpubType === 'segwit' ? 'Native SegWit (P2WPKH)' : 'Legacy (P2PKH)'}
              </Text>

              {(() => {
                const coinType = detectedNetwork ? NETWORKS[detectedNetwork]?.coinType ?? 0 : networkInfo.coinType ?? 0;
                const basePath = xpubType === 'segwit' ? `m/84'/${coinType}'/0'` : `m/44'/${coinType}'/0'`;
                return (
                  <>
                    <AddressChain
                      addresses={receiveAddresses}
                      label={`Receive (${basePath}/0/x)`}
                      transactions={transactions}
                      ticker={effectiveTicker}
                    />
                    <AddressChain
                      addresses={changeAddresses}
                      label={`Change (${basePath}/1/x)`}
                      transactions={transactions}
                      ticker={effectiveTicker}
                    />
                  </>
                );
              })()}
            </Stack>
          </Box>

          {utxos.length > 0 && (
            <Box p={6} rounded="lg" bg={panelBg} shadow="md">
              <Stack spacing={4}>
                <Heading size="md">UTXOs ({utxos.length})</Heading>
                <UtxoList
                  utxos={utxos}
                  addressMap={addressMap}
                  ticker={effectiveTicker}
                />
              </Stack>
            </Box>
          )}

          <Box p={6} rounded="lg" bg={panelBg} shadow="md">
            <Stack spacing={4}>
              <Heading size="md">Transaction History ({transactions.length})</Heading>
              <TransactionList
                transactions={transactions}
                onTransactionClick={handleTransactionClick}
                addressMap={addressMap}
                ticker={effectiveTicker}
              />
            </Stack>
          </Box>
        </>
      )}

      <TransactionDetailsModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        transaction={selectedTransaction}
        addressMap={addressMap}
      />
    </Stack>
  );
}
