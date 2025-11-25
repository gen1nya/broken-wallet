import {
  Alert,
  AlertDescription,
  AlertIcon,
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
  useColorMode,
  useColorModeValue,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { FaMoon, FaSun, FaWallet } from 'react-icons/fa';
import { BlockbookUtxo, fetchUtxos } from './blockbookClient';
import { DerivedAddress, createRandomMnemonic, deriveWalletFromMnemonic } from './bitcoin';

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

function AddressTable({ addresses }: { addresses: DerivedAddress[] }) {
  const badgeColor = useColorModeValue('purple.600', 'purple.300');
  return (
    <Box borderWidth="1px" borderRadius="lg" overflow="hidden">
      <Table size="sm">
        <Thead>
          <Tr>
            <Th>Type</Th>
            <Th>Path</Th>
            <Th>Address</Th>
            <Th>PubKey</Th>
          </Tr>
        </Thead>
        <Tbody>
          {addresses.map((addr) => (
            <Tr key={addr.path}>
              <Td>
                <Text fontWeight="semibold" color={badgeColor} textTransform="capitalize">
                  {addr.type}
                </Text>
              </Td>
              <Td fontFamily="mono" fontSize="sm">
                {addr.path}
              </Td>
              <Td fontFamily="mono" fontSize="sm" wordBreak="break-all">
                {addr.address}
              </Td>
              <Td fontFamily="mono" fontSize="xs" wordBreak="break-all">
                {addr.publicKey}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
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

  const [mnemonic, setMnemonic] = useState('');
  const [accountZpub, setAccountZpub] = useState('');
  const [addresses, setAddresses] = useState<DerivedAddress[]>([]);
  const [utxos, setUtxos] = useState<BlockbookUtxo[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [loadingUtxo, setLoadingUtxo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addressMap = useMemo(() => new Map(addresses.map((addr) => [addr.address, addr])), [addresses]);

  const refreshMnemonic = (value?: string) => {
    try {
      const nextMnemonic = value ?? createRandomMnemonic();
      const derived = deriveWalletFromMnemonic(nextMnemonic, 6);
      setMnemonic(nextMnemonic);
      setAccountZpub(derived.accountXpub);
      setAddresses(derived.addresses);
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
      const results = await fetchUtxos(accountZpub, apiKey || undefined);
      setUtxos(results);
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

      <Stack spacing={8}>
        <Box p={6} rounded="lg" bg={panelBg} shadow="md">
          <Stack spacing={4}>
            <Heading size="md">Wallet seed</Heading>
            <Text color="gray.500">
              We derive a BIP84 account (native segwit, p2wpkh) and preview a handful of addresses.
            </Text>
            <Textarea value={mnemonic} onChange={(e) => onMnemonicChange(e.target.value)} rows={3} />
            <HStack>
              <Button colorScheme="purple" onClick={() => refreshMnemonic()}>Generate new mnemonic</Button>
            </HStack>
          </Stack>
        </Box>

        <Box p={6} rounded="lg" bg={panelBg} shadow="md">
          <Stack spacing={3}>
            <Heading size="md">Account zpub (BIP84 m/84&#39;/0&#39;/0&#39;)</Heading>
            <Textarea value={accountZpub} isReadOnly fontFamily="mono" rows={2} />
          </Stack>
        </Box>

        <Box p={6} rounded="lg" bg={panelBg} shadow="md">
          <Stack spacing={4}>
            <Heading size="md">Derived addresses</Heading>
            <AddressTable addresses={addresses} />
          </Stack>
        </Box>

        <Box p={6} rounded="lg" bg={panelBg} shadow="md">
          <Stack spacing={4}>
            <Heading size="md">UTXO lookup (NowNodes Blockbook)</Heading>
            <Text color="gray.500">
              Provide an optional NowNodes API key to avoid rate limiting. We query UTXOs using the account zpub to stay in the p2wpkh scope.
            </Text>
            <InputGroup>
              <InputLeftAddon>API key</InputLeftAddon>
              <Input
                placeholder="Optional NowNodes api-key header (sent via dev proxy)"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </InputGroup>
            <Button colorScheme="purple" onClick={handleFetchUtxos} isLoading={loadingUtxo} alignSelf="flex-start">
              Fetch UTXOs for zpub
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
    </Container>
  );
}

export default App;
