import {
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Flex,
  Grid,
  GridItem,
  HStack,
  Heading,
  Icon,
  Input,
  InputGroup,
  InputLeftAddon,
  NumberInput,
  NumberInputField,
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
  useColorModeValue,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { FaCheckCircle, FaExternalLinkAlt, FaLink, FaPaperPlane } from 'react-icons/fa';
import { BlockbookUtxo, broadcastTransaction, getRawTransaction } from './blockbookClient';
import { DerivedAddress } from './bitcoin';
import { buildSignedTransaction, detectAddressType, TxBuildResult, TxOutputRequest } from './transactionBuilder';
import { useNetwork } from './NetworkContext';

interface OutputRow {
  id: string;
  address: string;
  amount: string;
}

interface Props {
  mnemonic: string;
  utxos: BlockbookUtxo[];
  addresses: DerivedAddress[];
}

const formatCrypto = (value: bigint, ticker: string) => {
  const btc = Number(value) / 1e8;
  return `${btc.toFixed(8)} ${ticker} (${value.toString()} sats)`;
};

const getBlockchairUrl = (network: string, txid: string): string => {
  // Map network symbols to blockchair network names
  const networkMap: Record<string, string> = {
    btc: 'bitcoin',
    ltc: 'litecoin',
    doge: 'dogecoin',
    dash: 'dash',
  };

  const networkName = networkMap[network] || 'bitcoin';
  return `https://blockchair.com/${networkName}/transaction/${txid}`;
};

export function TransactionBuilderView({ mnemonic, utxos, addresses }: Props) {
  const { network, networkInfo } = useNetwork();
  const panelBg = useColorModeValue('gray.50', 'gray.800');
  const accent = useColorModeValue('purple.600', 'purple.300');

  const addressMap = useMemo(() => new Map(addresses.map((addr) => [addr.address, addr])), [addresses]);
  const changeCandidate = useMemo(
    () => addresses.find((addr) => addr.type === 'change')?.address ?? addresses[0]?.address ?? '',
    [addresses],
  );

  const [selectedUtxos, setSelectedUtxos] = useState<Record<string, boolean>>({});
  const [outputs, setOutputs] = useState<OutputRow[]>([{ id: 'out-1', address: '', amount: '' }]);
  const [changeAddress, setChangeAddress] = useState(changeCandidate);
  const [feeRate, setFeeRate] = useState(5);
  const [buildResult, setBuildResult] = useState<TxBuildResult | null>(null);
  const [rawTx, setRawTx] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastedTxId, setBroadcastedTxId] = useState<string | null>(null);

  // Cache for raw transaction hex (needed for P2PKH inputs)
  const [txHexCache, setTxHexCache] = useState<Record<string, string>>({});
  const [fetchingHex, setFetchingHex] = useState(false);
  const [hexProgress, setHexProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    setChangeAddress(changeCandidate);
  }, [changeCandidate]);

  const selectedUtxoList = useMemo(
    () =>
      utxos.filter((utxo) => {
        const key = `${utxo.txid}:${utxo.vout}`;
        return selectedUtxos[key];
      }),
    [utxos, selectedUtxos],
  );

  const totalSelected = selectedUtxoList.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n);

  const addOutputRow = () => {
    setOutputs((prev) => [...prev, { id: `out-${prev.length + 1}`, address: '', amount: '' }]);
  };

  const updateOutputRow = (id: string, field: keyof OutputRow, value: string) => {
    setOutputs((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const removeOutputRow = (id: string) => {
    setOutputs((prev) => prev.filter((row) => row.id !== id));
  };

  const parseOutputs = (): TxOutputRequest[] => {
    const parsed: TxOutputRequest[] = [];
    outputs.forEach((row) => {
      if (!row.address && !row.amount) {
        return;
      }
      if (!row.address || !row.amount) {
        throw new Error('Each output needs an address and amount');
      }

      const encoding = detectAddressType(row.address, network);
      if (!encoding) {
        throw new Error(`Unsupported address ${row.address}`);
      }

      const numeric = Number(row.amount);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new Error('Output amounts must be positive numbers');
      }

      const sats = BigInt(Math.round(numeric * 1e8));
      parsed.push({ address: row.address.trim(), amountSats: sats });
    });

    return parsed;
  };

  const handleBuild = async () => {
    setError(null);
    setBroadcastedTxId(null);
    setFetchingHex(false);

    try {
      const parsedOutputs = parseOutputs();

      // Use a local variable to track the current hex cache
      let currentHexCache = txHexCache;

      // Check which selected UTXOs need hex data (legacy P2PKH without hex)
      const utxosNeedingHex = selectedUtxoList.filter((utxo) => {
        const addressType = detectAddressType(utxo.address ?? '', network);
        const isLegacy = addressType === 'p2pkh';
        const hasHex = !!utxo.hex || !!currentHexCache[utxo.txid];
        return isLegacy && !hasHex;
      });

      // Fetch hex for UTXOs that need it
      if (utxosNeedingHex.length > 0) {
        setFetchingHex(true);
        setHexProgress({ current: 0, total: utxosNeedingHex.length });

        const newHexCache: Record<string, string> = { ...currentHexCache };

        for (let i = 0; i < utxosNeedingHex.length; i++) {
          const utxo = utxosNeedingHex[i];
          try {
            const hex = await getRawTransaction(utxo.txid, network);
            newHexCache[utxo.txid] = hex;
            setHexProgress({ current: i + 1, total: utxosNeedingHex.length });
          } catch (err) {
            throw new Error(`Failed to fetch hex for ${utxo.txid}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        }

        // Update both local variable and state
        currentHexCache = newHexCache;
        setTxHexCache(newHexCache);
        setFetchingHex(false);
      }

      // Add hex to UTXOs from cache (use local variable for immediate access)
      const utxosWithHex = selectedUtxoList.map((utxo) => ({
        ...utxo,
        hex: utxo.hex || currentHexCache[utxo.txid],
      }));

      const result = await buildSignedTransaction(
        mnemonic,
        utxosWithHex,
        parsedOutputs,
        addressMap,
        changeAddress || null,
        feeRate,
        network,
      );

      setBuildResult(result);
      setRawTx(result.hex);
    } catch (err) {
      setBuildResult(null);
      setRawTx('');
      setError(err instanceof Error ? err.message : 'Unable to build transaction');
      setFetchingHex(false);
    }
  };

  const handleBroadcast = async () => {
    if (!rawTx) {
      setError('Build a transaction first');
      return;
    }
    setBroadcasting(true);
    setError(null);
    setBroadcastedTxId(null);
    try {
      const txid = await broadcastTransaction(rawTx, network);
      setBroadcastedTxId(txid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Broadcast failed');
    } finally {
      setBroadcasting(false);
    }
  };

  return (
    <Stack spacing={6}>
      <Box p={6} rounded="lg" bg={panelBg} shadow="md">
        <Stack spacing={4}>
          <Heading size="md">Coin control</Heading>
          <Text color="gray.500">Select which UTXOs you want to spend with this transaction.</Text>
          <Table size="sm" variant="simple">
            <Thead>
              <Tr>
                <Th width="50px"></Th>
                <Th>Amount</Th>
                <Th>Address</Th>
                <Th>Derivation path</Th>
                <Th>Confirmations</Th>
                <Th>Type</Th>
              </Tr>
            </Thead>
            <Tbody>
              {utxos.map((utxo) => {
                const key = `${utxo.txid}:${utxo.vout}`;
                const checked = !!selectedUtxos[key];
                const path = utxo.path || addressMap.get(utxo.address ?? '')?.path;
                const addressType = detectAddressType(utxo.address ?? '', network);
                const isLegacy = addressType === 'p2pkh';
                const hasHex = !!utxo.hex || !!txHexCache[utxo.txid];

                return (
                  <Tr key={key}>
                    <Td>
                      <Checkbox
                        isChecked={checked}
                        onChange={(e) =>
                          setSelectedUtxos((prev) => ({
                            ...prev,
                            [key]: e.target.checked,
                          }))
                        }
                        aria-label={`Select ${key}`}
                      />
                    </Td>
                    <Td>{formatCrypto(BigInt(utxo.value), networkInfo.ticker)}</Td>
                    <Td fontFamily="mono" fontSize="xs" wordBreak="break-all">
                      {utxo.address ?? 'unknown'}
                    </Td>
                    <Td fontFamily="mono" fontSize="xs" wordBreak="break-all">
                      {path ?? 'missing'}
                    </Td>
                    <Td>{utxo.confirmations ?? '—'}</Td>
                    <Td>
                      <HStack spacing={1}>
                        <Badge colorScheme={isLegacy ? 'orange' : 'green'} fontSize="xs">
                          {addressType?.toUpperCase() ?? '?'}
                        </Badge>
                        {isLegacy && hasHex && (
                          <Icon as={FaCheckCircle} color="green.500" boxSize={3} title="Raw transaction data available" />
                        )}
                      </HStack>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
          <Text fontWeight="semibold">Selected value: {formatCrypto(totalSelected, networkInfo.ticker)}</Text>
        </Stack>
      </Box>

      <Box p={6} rounded="lg" bg={panelBg} shadow="md">
        <Stack spacing={4}>
          <Heading size="md">Outputs</Heading>
          <Text color="gray.500">
            Send to p2pkh or p2wpkh addresses. Add as many outputs as you need, or leave this section empty to
            sweep the selected UTXOs to your change address.
          </Text>

          <Stack spacing={3}>
            {outputs.map((row) => (
              <Grid templateColumns={{ base: '1fr', md: '2fr 1fr auto' }} gap={3} key={row.id} alignItems="center">
                <Input
                  placeholder="Destination address"
                  value={row.address}
                  onChange={(e) => updateOutputRow(row.id, 'address', e.target.value)}
                />
                <Input
                  placeholder={`Amount (${networkInfo.ticker})`}
                  value={row.amount}
                  onChange={(e) => updateOutputRow(row.id, 'amount', e.target.value)}
                />
                <Button onClick={() => removeOutputRow(row.id)} variant="ghost">
                  Remove
                </Button>
              </Grid>
            ))}
            <Button onClick={addOutputRow} variant="outline" alignSelf="flex-start">
              Add output
            </Button>
          </Stack>

          <Divider />

          <Grid templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap={4}>
            <GridItem>
              <InputGroup>
                <InputLeftAddon>Change address</InputLeftAddon>
                <Input
                  placeholder="Optional change address"
                  value={changeAddress}
                  onChange={(e) => setChangeAddress(e.target.value)}
                />
              </InputGroup>
              <Text fontSize="sm" color="gray.500" mt={1}>
                Defaults to your first change address ({changeCandidate || 'none'}).
              </Text>
            </GridItem>
            <GridItem>
              <InputGroup>
                <InputLeftAddon>Fee rate</InputLeftAddon>
                <NumberInput value={feeRate} min={1} onChange={(value) => setFeeRate(Number(value) || 1)}>
                  <NumberInputField />
                </NumberInput>
              </InputGroup>
              <Text fontSize="sm" color="gray.500" mt={1}>
                Satoshis per vbyte. We will sign an actual transaction to confirm sizing.
              </Text>
            </GridItem>
          </Grid>

          {fetchingHex && (
            <Box>
              <Text fontSize="sm" mb={2}>
                Fetching raw transaction data for legacy inputs... ({hexProgress.current}/{hexProgress.total})
              </Text>
              <Progress
                value={(hexProgress.current / hexProgress.total) * 100}
                colorScheme="purple"
                hasStripe
                isAnimated
              />
            </Box>
          )}

          <HStack spacing={3} align="center">
            <Button
              colorScheme="purple"
              onClick={handleBuild}
              isDisabled={!selectedUtxoList.length}
              isLoading={fetchingHex}
              loadingText="Fetching hex data..."
            >
              Build transaction
            </Button>
            <Button
              colorScheme="green"
              onClick={handleBroadcast}
              leftIcon={<Icon as={FaPaperPlane} />}
              isDisabled={!rawTx}
              isLoading={broadcasting}
            >
              Broadcast via Backend
            </Button>
          </HStack>

          {error && (
            <Text color="red.400" fontWeight="semibold">
              {error}
            </Text>
          )}
          {broadcastedTxId && (
            <Stack spacing={2}>
              <Text color="green.400" fontWeight="semibold">
                Broadcasted! TXID: {broadcastedTxId}
              </Text>
              <Button
                size="sm"
                colorScheme="blue"
                leftIcon={<Icon as={FaExternalLinkAlt} />}
                onClick={() => window.open(getBlockchairUrl(network, broadcastedTxId), '_blank')}
              >
                View on Blockchair
              </Button>
            </Stack>
          )}
        </Stack>
      </Box>

      <Box p={6} rounded="lg" bg={panelBg} shadow="md">
        <Stack spacing={4}>
          <Heading size="md">Preview</Heading>
          {!buildResult && <Text color="gray.500">Build a transaction to see the preview and raw hex.</Text>}
          {buildResult && (
            <Stack spacing={3}>
              <Flex gap={3} wrap="wrap">
                <Badge colorScheme="purple">vsize: {buildResult.vsize} vbytes</Badge>
                <Badge colorScheme="purple">fee: {formatCrypto(buildResult.feeSats, networkInfo.ticker)}</Badge>
                <Badge colorScheme="purple">effective fee rate: {buildResult.effectiveFeeRate.toFixed(2)} sat/vB</Badge>
                <Badge colorScheme="purple">inputs: {buildResult.totalInput.toString()} sats</Badge>
              </Flex>
              <Text>Transaction ID: {buildResult.txId}</Text>

              <Box borderWidth="1px" borderRadius="lg" p={4}>
                <Heading size="sm" mb={2}>
                  Flow
                </Heading>
                <Stack spacing={2}>
                  {selectedUtxoList.map((utxo) => (
                    <HStack key={`${utxo.txid}:${utxo.vout}`}>
                      <Icon as={FaLink} color={accent} />
                      <Text fontFamily="mono" fontSize="sm">
                        Input {utxo.txid.slice(0, 6)}...:{utxo.vout} → {formatCrypto(BigInt(utxo.value), networkInfo.ticker)}
                      </Text>
                    </HStack>
                  ))}
                  <Divider />
                  {buildResult.outputs.map((output, index) => (
                    <HStack key={`${output.address}-${index}`}>
                      <Icon as={FaLink} color={accent} />
                      <Text fontFamily="mono" fontSize="sm">
                        Output {index + 1}: {output.address} ({formatCrypto(output.amountSats, networkInfo.ticker)})
                      </Text>
                    </HStack>
                  ))}
                </Stack>
              </Box>

              <Textarea value={rawTx} readOnly rows={6} fontFamily="mono" />
            </Stack>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}

export default TransactionBuilderView;
