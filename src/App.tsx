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
  Input,
  InputGroup,
  InputLeftAddon,
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
import { FaMoon, FaSun, FaWallet, FaKey } from 'react-icons/fa';
import { BlockbookUtxo, fetchUtxos } from './blockbookClient';
import { DerivedAddress, createRandomMnemonic, deriveWalletFromMnemonic } from './bitcoin';
import TransactionBuilderView from './TransactionBuilderView';
import AddressModal from './AddressModal';

function ColorModeToggle() {
  const { colorMode, toggleColorMode } = useColorMode();
  const label = colorMode === 'light' ? 'Switch to dark mode' : 'Switch to light mode';

  return (
    <Button onClick={toggleColorMode} variant="ghost" aria-label={label} leftIcon={<Icon as={colorMode === 'light' ? FaMoon : FaSun} />}>
      {colorMode === 'light' ? 'Dark' : 'Light'}
    </Button>
  );
}

const formatBtc = (value: string | number) => {
  const sats = typeof value === 'string' ? BigInt(value) : BigInt(value);
  const btc = Number(sats) / 1e8;
  return `${btc.toFixed(8)} BTC (${sats.toString()} sats)`;
};

function CompactAddressPreview({ addresses }: { addresses: DerivedAddress[] }) {
  const badgeColor = useColorModeValue('purple.600', 'purple.300');

  // Show first 2 addresses from each type/format combination
  const preview = addresses.slice(0, 4);

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

function UtxoList({ utxos, pathLookup }: { utxos: BlockbookUtxo[]; pathLookup: Map<string, DerivedAddress> }) {
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
                {formatBtc(utxo.value)}
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
  const panelBg = useColorModeValue('gray.50', 'gray.800');
  const accent = useColorModeValue('purple.600', 'purple.300');
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [mnemonic, setMnemonic] = useState('');
  const [accountZpub, setAccountZpub] = useState('');
  const [accountXpub, setAccountXpub] = useState('');
  const [segwitAddresses, setSegwitAddresses] = useState<DerivedAddress[]>([]);
  const [legacyAddresses, setLegacyAddresses] = useState<DerivedAddress[]>([]);
  const [utxos, setUtxos] = useState<BlockbookUtxo[]>([]);
  const [loadingUtxo, setLoadingUtxo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAddresses = useMemo(() => [...segwitAddresses, ...legacyAddresses], [segwitAddresses, legacyAddresses]);
  const addressMap = useMemo(() => new Map(allAddresses.map((addr) => [addr.address, addr])), [allAddresses]);

  const refreshMnemonic = (value?: string) => {
    try {
      const nextMnemonic = value ?? createRandomMnemonic();
      const derived = deriveWalletFromMnemonic(nextMnemonic, 6);
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

  useEffect(() => {
    refreshMnemonic();
  }, []);

  const handleFetchUtxos = async () => {
    setLoadingUtxo(true);
    setError(null);
    try {
      // Fetch UTXOs for both segwit and legacy accounts
      const [segwitResults, legacyResults] = await Promise.all([
        fetchUtxos(accountZpub, 'btc'),
        fetchUtxos(accountXpub, 'btc'),
      ]);
      setUtxos([...segwitResults, ...legacyResults]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch UTXOs');
    } finally {
      setLoadingUtxo(false);
    }
  };

  const onMnemonicChange = (value: string) => {
    setMnemonic(value);
    try {
      refreshMnemonic(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid mnemonic');
    }
  };

  return (
    <Container maxW="5xl" py={12}>
      <Flex justify="space-between" align="center" mb={10}>
        <HStack spacing={3}>
          <Icon as={FaWallet} boxSize={8} color={accent} />
          <Heading size="lg">Broken Wallet</Heading>
        </HStack>
        <ColorModeToggle />
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
                  <Heading size="md">Wallet seed</Heading>
                  <Text color="gray.500">
                    We derive both BIP84 (native segwit, p2wpkh) and BIP44 (legacy, p2pkh) accounts from the same seed.
                  </Text>
                  <Textarea value={mnemonic} onChange={(e) => onMnemonicChange(e.target.value)} rows={3} />
                  <HStack>
                    <Button colorScheme="purple" onClick={() => refreshMnemonic()}>Generate new mnemonic</Button>
                  </HStack>
                </Stack>
              </Box>

              <Box p={6} rounded="lg" bg={panelBg} shadow="md">
                <Stack spacing={4}>
                  <Heading size="md">Account Keys</Heading>
                  <Grid templateColumns="auto 1fr" gap={3} alignItems="center">
                    <Text fontSize="sm" fontWeight="semibold">Segwit (BIP84):</Text>
                    <Code fontFamily="mono" fontSize="xs" p={2} isTruncated>
                      {accountZpub}
                    </Code>

                    <Text fontSize="sm" fontWeight="semibold">Legacy (BIP44):</Text>
                    <Code fontFamily="mono" fontSize="xs" p={2} isTruncated>
                      {accountXpub}
                    </Code>
                  </Grid>
                  <Text fontSize="xs" color="gray.500">
                    zpub for P2WPKH (bc1...) • xpub for P2PKH (1...)
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
                    Preview of derived addresses (showing first 4)
                  </Text>
                  <CompactAddressPreview addresses={allAddresses} />
                </Stack>
              </Box>

              <Box p={6} rounded="lg" bg={panelBg} shadow="md">
                <Stack spacing={4}>
                  <Heading size="md">UTXO lookup (via Backend)</Heading>
                  <Text color="gray.500">
                    Query UTXOs for both segwit (zpub) and legacy (xpub) accounts. API calls are proxied through our backend server.
                  </Text>
                  <Button colorScheme="purple" onClick={handleFetchUtxos} isLoading={loadingUtxo} alignSelf="flex-start">
                    Fetch UTXOs for both accounts
                  </Button>
                  {error && (
                    <Alert status="error" borderRadius="md">
                      <AlertIcon />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <UtxoList utxos={utxos} pathLookup={addressMap} />
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
    </Container>
  );
}

export default App;
