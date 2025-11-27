import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Code,
  Container,
  Flex,
  Grid,
  GridItem,
  HStack,
  Heading,
  Icon,
  Progress,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  useColorMode,
  useColorModeValue,
  useDisclosure,
  VStack,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { FaMoon, FaSun, FaWallet, FaKey, FaMap, FaLock, FaSync } from 'react-icons/fa';
import { BlockbookUtxo, fetchUtxos, fetchAllTransactions, BlockbookTransaction } from './blockbookClient';
import { DerivedAddress, createRandomMnemonic, deriveWalletFromMnemonic } from './bitcoin';
import TransactionBuilderView from './TransactionBuilderView';
import AddressModal from './AddressModal';
import TransactionList from './TransactionList';
import TransactionDetailsModal from './TransactionDetailsModal';
import AddressMapModal from './AddressMapModal';
import { deriveWalletWithDiscovery } from './addressDiscovery';
import { useNetwork } from './NetworkContext';
import NetworkSwitcher from './NetworkSwitcher';
import WalletUnlockView from './WalletUnlockView';

function ColorModeToggle() {
  const { colorMode, toggleColorMode } = useColorMode();
  const label = colorMode === 'light' ? 'Switch to dark mode' : 'Switch to light mode';

  return (
    <Button onClick={toggleColorMode} variant="ghost" aria-label={label} leftIcon={<Icon as={colorMode === 'light' ? FaMoon : FaSun} />}>
      {colorMode === 'light' ? 'Dark' : 'Light'}
    </Button>
  );
}

const formatCrypto = (value: string | number, ticker: string) => {
  const sats = typeof value === 'string' ? BigInt(value) : BigInt(value);
  const btc = Number(sats) / 1e8;
  return `${btc.toFixed(8)} ${ticker} (${sats.toString()} sats)`;
};

function CompactAddressPreview({ addresses }: { addresses: DerivedAddress[] }) {
  const badgeColor = useColorModeValue('purple.600', 'purple.300');

  // Show one address from each type/format combination
  const preview = [
    addresses.find((a) => a.format === 'p2wpkh' && a.type === 'receive'),
    addresses.find((a) => a.format === 'p2wpkh' && a.type === 'change'),
    addresses.find((a) => a.format === 'p2pkh' && a.type === 'receive'),
    addresses.find((a) => a.format === 'p2pkh' && a.type === 'change'),
  ].filter((addr): addr is DerivedAddress => addr !== undefined);

  return (
    <VStack align="stretch" spacing={2}>
      {preview.map((addr) => (
        <HStack key={addr.path} spacing={3} fontSize="sm">
          <Badge colorScheme="purple" minW="60px">
            {addr.format === 'p2wpkh' ? 'Segwit' : 'Legacy'}
          </Badge>
          <Badge colorScheme={addr.type === 'receive' ? 'green' : 'blue'} minW="60px">
            {addr.type}
          </Badge>
          <Code fontFamily="mono" fontSize="xs" flex={1} isTruncated>
            {addr.address}
          </Code>
        </HStack>
      ))}
      {addresses.length > 4 && (
        <Text fontSize="xs" color="gray.500" textAlign="center">
          ... and {addresses.length - 4} more addresses
        </Text>
      )}
    </VStack>
  );
}

function UtxoList({ utxos, pathLookup, ticker }: { utxos: BlockbookUtxo[]; pathLookup: Map<string, DerivedAddress>; ticker: string }) {
  if (!utxos.length) {
    return <Text color="gray.500">No UTXOs loaded yet.</Text>;
  }

  return (
    <Stack spacing={4}>
      {utxos.map((utxo) => {
        const match = utxo.address ? pathLookup.get(utxo.address) : undefined;
        return (
          <Box key={`${utxo.txid}:${utxo.vout}`} borderWidth="1px" borderRadius="lg" p={4}>
            <Stack spacing={2}>
              <Text>
                <Text as="span" fontWeight="bold">
                  TXID
                </Text>{' '}
                <Code wordBreak="break-all">{utxo.txid}</Code> · vout {utxo.vout}
              </Text>
              <Text>
                <Text as="span" fontWeight="bold">
                  Amount
                </Text>{' '}
                {formatCrypto(utxo.value, ticker)}
              </Text>
              <Grid templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap={3}>
                <GridItem>
                  <Text fontWeight="bold">Address</Text>
                  <Text fontFamily="mono" wordBreak="break-all">{utxo.address || 'Unknown (zpub scope)'}</Text>
                </GridItem>
                <GridItem>
                  <Text fontWeight="bold">Derivation path</Text>
                  <Text fontFamily="mono" wordBreak="break-all">
                    {utxo.path || match?.path || 'Not provided by API'}
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
              {match && (
                <Alert status="info" borderRadius="md" mt={2}>
                  <AlertIcon />
                  <AlertDescription>
                    Derived locally as <Code>{match.path}</Code> ({match.type} account address)
                  </AlertDescription>
                </Alert>
              )}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}

function App() {
  const { network, networkInfo } = useNetwork();
  const panelBg = useColorModeValue('gray.50', 'gray.800');
  const accent = useColorModeValue('purple.600', 'purple.300');
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isTxModalOpen, onOpen: onTxModalOpen, onClose: onTxModalClose } = useDisclosure();
  const { isOpen: isMapModalOpen, onOpen: onMapModalOpen, onClose: onMapModalClose } = useDisclosure();

  // Wallet lock state
  const [isLocked, setIsLocked] = useState(true);
  const [currentWalletId, setCurrentWalletId] = useState<string | undefined>(undefined);
  const [currentWalletName, setCurrentWalletName] = useState<string | undefined>(undefined);

  const [mnemonic, setMnemonic] = useState('');
  const [accountZpub, setAccountZpub] = useState('');
  const [accountXpub, setAccountXpub] = useState('');
  const [segwitAddresses, setSegwitAddresses] = useState<DerivedAddress[]>([]);
  const [legacyAddresses, setLegacyAddresses] = useState<DerivedAddress[]>([]);
  const [utxos, setUtxos] = useState<BlockbookUtxo[]>([]);
  const [transactions, setTransactions] = useState<BlockbookTransaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<BlockbookTransaction | null>(null);
  const [loadingUtxo, setLoadingUtxo] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txProgress, setTxProgress] = useState<{ current: number; total: number } | null>(null);

  // Constants for transaction fetching
  const TX_PAGE_SIZE = 1000; // Max page size supported by NowNodes
  const GAP_LIMIT = 20; // BIP44 standard gap limit

  const allAddresses = useMemo(() => [...segwitAddresses, ...legacyAddresses], [segwitAddresses, legacyAddresses]);
  const addressMap = useMemo(() => new Map(allAddresses.map((addr) => [addr.address, addr])), [allAddresses]);

  // Calculate total wallet balance
  const walletBalance = useMemo(() => {
    return utxos.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n);
  }, [utxos]);

  const refreshMnemonic = (value?: string) => {
    try {
      const nextMnemonic = value ?? createRandomMnemonic();
      const derived = deriveWalletFromMnemonic(nextMnemonic, 6, network);
      setMnemonic(nextMnemonic);
      setAccountZpub(derived.segwitAccount.zpub);
      setAccountXpub(derived.legacyAccount.xpub);
      setSegwitAddresses(derived.segwitAccount.addresses);
      setLegacyAddresses(derived.legacyAccount.addresses);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to derive wallet');
    }
  };

  // Re-derive wallet when network changes
  useEffect(() => {
    if (mnemonic) {
      refreshMnemonic(mnemonic);
    }
    // Clear UTXOs and transactions when network changes
    setUtxos([]);
    setTransactions([]);
  }, [network]);

  const handleFetchUtxos = async () => {
    setLoadingUtxo(true);
    setError(null);
    try {
      // Fetch UTXOs for both segwit and legacy accounts (or just legacy for non-segwit networks)
      const promises = [fetchUtxos(accountXpub, network)];
      if (networkInfo.supportsSegwit && accountZpub) {
        promises.push(fetchUtxos(accountZpub, network));
      }
      const results = await Promise.all(promises);
      setUtxos(results.flat());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch UTXOs');
    } finally {
      setLoadingUtxo(false);
    }
  };

  const handleFetchTransactions = async () => {
    setLoadingTransactions(true);
    setError(null);
    setTxProgress(null);
    try {
      // Fetch ALL transactions for both segwit and legacy accounts (or just legacy for non-segwit networks)
      const promises = [
        fetchAllTransactions(accountXpub, network, TX_PAGE_SIZE, (current, total) => {
          setTxProgress({ current, total });
        })
      ];

      if (networkInfo.supportsSegwit && accountZpub) {
        promises.push(
          fetchAllTransactions(accountZpub, network, TX_PAGE_SIZE, (current, total) => {
            setTxProgress({ current, total });
          })
        );
      }

      const results = await Promise.all(promises);

      // Combine and deduplicate transactions by txid
      const allTxs = results.flatMap(result => result.transactions ?? []);

      const uniqueTxs = Array.from(
        new Map(allTxs.map(tx => [tx.txid, tx])).values()
      );

      // Sort by block time (newest first)
      uniqueTxs.sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));

      setTransactions(uniqueTxs);

      // Auto-expand address pool based on transaction history
      // Using BIP44 standard gap limit (20 addresses)
      if (mnemonic && uniqueTxs.length > 0) {
        const discovered = deriveWalletWithDiscovery(mnemonic, uniqueTxs, GAP_LIMIT, 5, network);
        setSegwitAddresses(discovered.segwitAddresses);
        setLegacyAddresses(discovered.legacyAddresses);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
    } finally {
      setLoadingTransactions(false);
      setTxProgress(null);
    }
  };

  const handleTransactionClick = (transaction: BlockbookTransaction) => {
    setSelectedTransaction(transaction);
    onTxModalOpen();
  };

  const handleUnlock = (unlockedMnemonic: string, walletId?: string, walletName?: string) => {
    setMnemonic(unlockedMnemonic);
    setCurrentWalletId(walletId);
    setCurrentWalletName(walletName);
    refreshMnemonic(unlockedMnemonic);
    setIsLocked(false);
  };

  // Auto-load UTXOs and transactions when wallet is unlocked
  useEffect(() => {
    if (!isLocked && mnemonic && accountXpub) {
      handleFetchUtxos();
      handleFetchTransactions();
    }
  }, [isLocked, accountXpub]);

  const handleLock = () => {
    setIsLocked(true);
    setMnemonic('');
    setCurrentWalletId(undefined);
    setCurrentWalletName(undefined);
    setAccountZpub('');
    setAccountXpub('');
    setSegwitAddresses([]);
    setLegacyAddresses([]);
    setUtxos([]);
    setTransactions([]);
    setError(null);
  };

  const handleRefresh = async () => {
    await Promise.all([handleFetchUtxos(), handleFetchTransactions()]);
  };

  // Show unlock screen if locked
  if (isLocked) {
    return <WalletUnlockView onUnlock={handleUnlock} />;
  }

  return (
    <Container maxW="5xl" py={12}>
      <Flex justify="space-between" align="center" mb={10}>
        <HStack spacing={3}>
          <Icon as={FaWallet} boxSize={8} color={accent} />
          <Heading size="lg">
            Broken Wallet
            {currentWalletName && (
              <Text as="span" fontSize="md" fontWeight="normal" ml={3} color="gray.500">
                · {currentWalletName}
              </Text>
            )}
          </Heading>
        </HStack>
        <HStack spacing={3}>
          {walletBalance > 0n && (
            <Badge colorScheme="green" fontSize="md" px={3} py={1}>
              {formatCrypto(walletBalance, networkInfo.ticker)}
            </Badge>
          )}
          <Button
            onClick={handleRefresh}
            variant="ghost"
            leftIcon={<Icon as={FaSync} />}
            isLoading={loadingUtxo || loadingTransactions}
            aria-label="Refresh UTXOs and transactions"
          >
            Refresh
          </Button>
          <NetworkSwitcher />
          <Button
            onClick={handleLock}
            variant="ghost"
            leftIcon={<Icon as={FaLock} />}
            aria-label="Lock wallet"
          >
            Lock
          </Button>
          <ColorModeToggle />
        </HStack>
      </Flex>

      <Tabs variant="enclosed" colorScheme="purple">
        <TabList>
          <Tab>Wallet</Tab>
          <Tab>Transaction builder</Tab>
        </TabList>

        <TabPanels>
          <TabPanel px={0}>
            <Stack spacing={8}>
              <Box p={6} rounded="lg" bg={panelBg} shadow="md">
                <Stack spacing={4}>
                  <Heading size="md">Account Keys</Heading>
                  <Grid templateColumns="auto 1fr" gap={3} alignItems="center">
                    {networkInfo.supportsSegwit && accountZpub && (
                      <>
                        <Text fontSize="sm" fontWeight="semibold">Segwit (BIP84):</Text>
                        <Code fontFamily="mono" fontSize="xs" p={2} isTruncated>
                          {accountZpub}
                        </Code>
                      </>
                    )}

                    <Text fontSize="sm" fontWeight="semibold">Legacy (BIP44):</Text>
                    <Code fontFamily="mono" fontSize="xs" p={2} isTruncated>
                      {accountXpub}
                    </Code>
                  </Grid>
                  <Text fontSize="xs" color="gray.500">
                    {networkInfo.supportsSegwit
                      ? `zpub for P2WPKH (${networkInfo.bech32Prefix}1...) • xpub for P2PKH`
                      : 'xpub for P2PKH'}
                  </Text>
                </Stack>
              </Box>

              <Box p={6} rounded="lg" bg={panelBg} shadow="md">
                <Stack spacing={4}>
                  <HStack justify="space-between">
                    <Heading size="md">Derived Addresses</Heading>
                    <Button size="sm" leftIcon={<Icon as={FaKey} />} colorScheme="purple" variant="outline" onClick={onOpen}>
                      Manage Addresses
                    </Button>
                  </HStack>
                  <Text fontSize="sm" color="gray.500">
                    {networkInfo.supportsSegwit
                      ? 'One address from each chain (Segwit/Legacy × Receive/Change)'
                      : 'Legacy addresses (Receive/Change)'}
                  </Text>
                  <CompactAddressPreview addresses={allAddresses} />
                </Stack>
              </Box>

              <Box p={6} rounded="lg" bg={panelBg} shadow="md">
                <Stack spacing={4}>
                  <Heading size="md">UTXO lookup (via Backend)</Heading>
                  <Text color="gray.500">
                    {networkInfo.supportsSegwit
                      ? 'Query UTXOs for both segwit (zpub) and legacy (xpub) accounts. API calls are proxied through our backend server.'
                      : 'Query UTXOs for legacy (xpub) account. API calls are proxied through our backend server.'}
                  </Text>
                  <Button colorScheme="purple" onClick={handleFetchUtxos} isLoading={loadingUtxo} alignSelf="flex-start">
                    {networkInfo.supportsSegwit ? 'Fetch UTXOs for both accounts' : 'Fetch UTXOs'}
                  </Button>
                  {error && (
                    <Alert status="error" borderRadius="md">
                      <AlertIcon />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <UtxoList utxos={utxos} pathLookup={addressMap} ticker={networkInfo.ticker} />
                </Stack>
              </Box>

              <Box p={6} rounded="lg" bg={panelBg} shadow="md">
                <Stack spacing={4}>
                  <HStack justify="space-between">
                    <Heading size="md">Transaction History</Heading>
                    <Button
                      size="sm"
                      leftIcon={<Icon as={FaMap} />}
                      colorScheme="purple"
                      variant="outline"
                      onClick={onMapModalOpen}
                      isDisabled={transactions.length === 0}
                    >
                      Address Map
                    </Button>
                  </HStack>
                  <Text color="gray.500">
                    {networkInfo.supportsSegwit
                      ? 'View transaction history for both segwit and legacy accounts. All transaction pages will be fetched automatically with BIP44 standard gap limit (20 addresses). Click on a transaction to see detailed information.'
                      : 'View transaction history for legacy account. All transaction pages will be fetched automatically with BIP44 standard gap limit (20 addresses). Click on a transaction to see detailed information.'}
                  </Text>
                  <Button colorScheme="purple" onClick={handleFetchTransactions} isLoading={loadingTransactions} alignSelf="flex-start">
                    Fetch All Transactions
                  </Button>
                  {loadingTransactions && txProgress && (
                    <Box>
                      <Text fontSize="sm" color="gray.500" mb={2}>
                        Loading page {txProgress.current} of {txProgress.total}...
                      </Text>
                      <Progress
                        value={(txProgress.current / txProgress.total) * 100}
                        colorScheme="purple"
                        size="sm"
                        hasStripe
                        isAnimated
                      />
                    </Box>
                  )}
                  {error && (
                    <Alert status="error" borderRadius="md">
                      <AlertIcon />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <TransactionList transactions={transactions} onTransactionClick={handleTransactionClick} addressMap={addressMap} />
                </Stack>
              </Box>
            </Stack>
          </TabPanel>

          <TabPanel px={0}>
            <TransactionBuilderView mnemonic={mnemonic} utxos={utxos} addresses={allAddresses} />
          </TabPanel>
        </TabPanels>
      </Tabs>

      <AddressModal isOpen={isOpen} onClose={onClose} mnemonic={mnemonic} />
      <TransactionDetailsModal
        isOpen={isTxModalOpen}
        onClose={onTxModalClose}
        transaction={selectedTransaction}
        addressMap={addressMap}
      />
      <AddressMapModal
        isOpen={isMapModalOpen}
        onClose={onMapModalClose}
        segwitAddresses={segwitAddresses}
        legacyAddresses={legacyAddresses}
        transactions={transactions}
      />
    </Container>
  );
}

export default App;
