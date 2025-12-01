import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  Icon,
  Input,
  NumberInput,
  NumberInputField,
  Progress,
  Stack,
  Text,
  useColorModeValue,
  VStack,
  Divider,
  Spacer,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Textarea,
} from '@chakra-ui/react';
import { useMemo, useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { FaArrowDown, FaArrowUp, FaClock, FaHistory, FaPaperPlane } from 'react-icons/fa';
import { BlockbookTransaction, BlockbookUtxo, NetworkSymbol, broadcastTransaction, getRawTransaction } from './blockbookClient';
import { DerivedAddress } from './bitcoin';
import { isOwnAddress } from './addressDiscovery';
import { useNetwork } from './NetworkContext';
import { TxBuildResult, buildSignedTransaction, detectAddressType } from './transactionBuilder';
import { fetchFeeEstimate } from './blockbookClient';
import { findFirstCleanReceiveAddress } from './simpleMode';

interface SimpleViewProps {
  mnemonic: string;
  utxos: BlockbookUtxo[];
  transactions: BlockbookTransaction[];
  addressMap: Map<string, DerivedAddress>;
  segwitAddresses: DerivedAddress[];
  legacyAddresses: DerivedAddress[];
  walletBalance: bigint;
  onTransactionClick: (transaction: BlockbookTransaction) => void;
  onRefresh: () => Promise<void>;
}

type TxDirection = 'sent' | 'received' | 'internal' | 'external';
type TxStatus = 'pending' | 'confirming' | 'sent' | 'received';

interface SimplifiedTx {
  tx: BlockbookTransaction;
  status: TxStatus;
  direction: TxDirection;
  walletImpact: bigint;
}

const formatCrypto = (value: bigint, ticker: string) => {
  const btc = Number(value) / 1e8;
  return `${btc.toFixed(8)} ${ticker}`;
};

const simplifyTransaction = (
  tx: BlockbookTransaction,
  addressMap: Map<string, DerivedAddress>,
): SimplifiedTx => {
  const walletInputs = tx.vin.filter((input) => {
    const address = input.addresses?.[0];
    return address ? isOwnAddress(address, input.isOwn, addressMap) : false;
  });

  const walletOutputs = tx.vout.filter((output) => {
    const address = output.addresses?.[0];
    return address ? isOwnAddress(address, output.isOwn, addressMap) : false;
  });

  const walletInputsSum = walletInputs.reduce((sum, input) => sum + BigInt(input.value), 0n);
  const walletOutputsSum = walletOutputs.reduce((sum, output) => sum + BigInt(output.value), 0n);
  const walletImpact = walletOutputsSum - walletInputsSum;

  let direction: TxDirection = 'external';
  const totalInputsCount = tx.vin.length;
  const totalOutputsCount = tx.vout.length;
  const walletInputsCount = walletInputs.length;
  const walletOutputsCount = walletOutputs.length;

  const allInputsAreWallet = walletInputsCount === totalInputsCount && walletInputsCount > 0;
  const allOutputsAreWallet = walletOutputsCount === totalOutputsCount && walletOutputsCount > 0;

  if (allInputsAreWallet && allOutputsAreWallet) {
    direction = 'internal';
  } else if (walletInputsCount > 0 && walletOutputsCount === 0) {
    direction = 'sent';
  } else if (walletOutputsCount > 0 && walletInputsCount === 0) {
    direction = 'received';
  } else if (walletInputsCount > 0 && walletOutputsCount > 0) {
    direction = walletImpact >= 0n ? 'received' : 'sent';
  }

  const confirmations = tx.confirmations ?? 0;
  let status: TxStatus = 'pending';
  if (confirmations === 0) {
    status = 'pending';
  } else if (confirmations < 6) {
    status = 'confirming';
  } else {
    status = direction === 'received' ? 'received' : 'sent';
  }

  return { tx, direction, status, walletImpact };
};

const estimateInputWeight = (type: 'p2wpkh' | 'p2pkh') => (type === 'p2wpkh' ? 68 : 148);
const estimateOutputWeight = (type: 'p2wpkh' | 'p2pkh') => (type === 'p2wpkh' ? 31 : 34);

const getBlockExplorerUrl = (network: NetworkSymbol, txid: string): string => {
  const map: Record<NetworkSymbol, string> = {
    btc: 'bitcoin',
    ltc: 'litecoin',
    doge: 'dogecoin',
    dash: 'dash',
  };
  const chain = map[network] ?? 'bitcoin';
  return `https://blockchair.com/${chain}/transaction/${txid}`;
};

const formatTxidShort = (txid: string) => {
  if (txid.length <= 16) return txid;
  return `${txid.slice(0, 8)}…${txid.slice(-8)}`;
};

const estimateFee = (
  utxos: BlockbookUtxo[],
  outputTypes: ('p2wpkh' | 'p2pkh')[],
  changeType: 'p2wpkh' | 'p2pkh',
  feeRate: number,
  network: NetworkSymbol,
) => {
  const inputWeight = utxos.reduce((weight, utxo) => {
    const type = detectAddressType(utxo.address ?? '', network) ?? 'p2wpkh';
    return weight + estimateInputWeight(type);
  }, 0);

  const outputWeight = outputTypes.reduce((weight, type) => weight + estimateOutputWeight(type), 0);
  const totalWeight = 10 + inputWeight + outputWeight + estimateOutputWeight(changeType);
  return BigInt(Math.ceil(totalWeight * feeRate));
};

export default function SimpleView({
  mnemonic,
  utxos,
  transactions,
  addressMap,
  segwitAddresses,
  legacyAddresses,
  walletBalance,
  onTransactionClick,
  onRefresh,
}: SimpleViewProps) {
  const { network, networkInfo } = useNetwork();
  const panelBg = useColorModeValue('gray.50', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [feeRate, setFeeRate] = useState(5);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastTxId, setLastTxId] = useState<string | null>(null);
  const [pendingTx, setPendingTx] = useState<TxBuildResult | null>(null);
  const [pendingAmount, setPendingAmount] = useState<bigint | null>(null);
  const [pendingDestination, setPendingDestination] = useState<string | null>(null);
  const [hexCache, setHexCache] = useState<Record<string, string>>({});
  const [fetchingHex, setFetchingHex] = useState(false);
  const [hexProgress, setHexProgress] = useState({ current: 0, total: 0 });
  const [loadingFee, setLoadingFee] = useState(false);
  const { isOpen: isConfirmOpen, onOpen: onConfirmOpen, onClose: onConfirmClose } = useDisclosure();

  useEffect(() => {
    setDestination('');
    setAmount('');
    setSendError(null);
    setLastTxId(null);
    setPendingTx(null);
    setPendingAmount(null);
    setPendingDestination(null);
    setFeeRate(5);
  }, [mnemonic]);

  useEffect(() => {
    handleFillFee();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  const receiveAddress = useMemo(
    () => findFirstCleanReceiveAddress(segwitAddresses, legacyAddresses, transactions, addressMap),
    [segwitAddresses, legacyAddresses, transactions, addressMap],
  );

  const changeAddress = useMemo(() => {
    const segwitChange = segwitAddresses.find((addr) => addr.type === 'change');
    const legacyChange = legacyAddresses.find((addr) => addr.type === 'change');
    return segwitChange?.address ?? legacyChange?.address ?? receiveAddress?.address ?? '';
  }, [segwitAddresses, legacyAddresses, receiveAddress]);

  const history = useMemo(
    () => transactions.map((tx) => simplifyTransaction(tx, addressMap)),
    [transactions, addressMap],
  );

  const prepareUtxosWithHex = async (selected: BlockbookUtxo[]) => {
    const legacyNeedingHex = selected.filter((utxo) => {
      const type = detectAddressType(utxo.address ?? '', network);
      return type === 'p2pkh' && !utxo.hex && !hexCache[utxo.txid];
    });

    let cache = hexCache;

    if (legacyNeedingHex.length) {
      setFetchingHex(true);
      setHexProgress({ current: 0, total: legacyNeedingHex.length });
      const nextCache = { ...hexCache };

      for (let i = 0; i < legacyNeedingHex.length; i++) {
        const utxo = legacyNeedingHex[i];
        const hex = await getRawTransaction(utxo.txid, network);
        nextCache[utxo.txid] = hex;
        setHexProgress({ current: i + 1, total: legacyNeedingHex.length });
      }

      setHexCache(nextCache);
      cache = nextCache;
      setFetchingHex(false);
    }

    return selected.map((utxo) => ({
      ...utxo,
      hex: utxo.hex || cache[utxo.txid],
    }));
  };

  const pickUtxos = (
    amountSats: bigint,
    destinationType: 'p2wpkh' | 'p2pkh',
    changeType: 'p2wpkh' | 'p2pkh',
  ) => {
    const sorted = [...utxos].sort((a, b) => Number(BigInt(b.value) - BigInt(a.value)));
    const outputs = [destinationType];

    const selection: BlockbookUtxo[] = [];
    let total = 0n;

    for (const utxo of sorted) {
      selection.push(utxo);
      total += BigInt(utxo.value);

      const feeEstimate = estimateFee(selection, outputs, changeType, feeRate, network);
      if (total >= amountSats + feeEstimate) {
        break;
      }
    }

    return selection;
  };

  const handleSend = async () => {
    setSendError(null);
    setLastTxId(null);
    setPendingTx(null);
    setPendingAmount(null);
    setPendingDestination(null);

    if (!destination.trim() || !amount.trim()) {
      setSendError('Enter destination and amount');
      return;
    }

    if (!utxos.length) {
      setSendError('No spendable UTXOs found');
      return;
    }

    const destType = detectAddressType(destination.trim(), network);
    if (!destType) {
      setSendError('Destination must be a valid p2wpkh or p2pkh address');
      return;
    }

    const changeType = detectAddressType(changeAddress, network);
    if (!changeType) {
      setSendError('Change address is not valid for this network');
      return;
    }

    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setSendError('Amount must be a positive number');
      return;
    }

    const amountSats = BigInt(Math.round(amountNumber * 1e8));
    if (amountSats > walletBalance) {
      setSendError('Insufficient balance');
      return;
    }

    setSending(true);
    let builtTx: TxBuildResult | null = null;

    try {
      const selection = pickUtxos(amountSats, destType, changeType);
      const outputs = [{ address: destination.trim(), amountSats }];

      const attemptBuild = async (inputs: BlockbookUtxo[]) => {
        const prepared = await prepareUtxosWithHex(inputs);
        const tx = await buildSignedTransaction(
          mnemonic,
          prepared,
          outputs,
          addressMap,
          changeAddress,
          feeRate,
          network,
        );
        builtTx = tx;
        setPendingTx(tx);
      };

      try {
        await attemptBuild(selection);
      } catch (err) {
        if (selection.length !== utxos.length) {
          await attemptBuild(utxos);
        } else {
          throw err;
        }
      }

      if (!builtTx) {
        throw new Error('Failed to prepare transaction');
      }

      const requiredFee = BigInt(Math.ceil(builtTx.vsize * feeRate));
      if (builtTx.feeSats < requiredFee) {
        const bump = Math.max(1, Math.ceil(Number(requiredFee - builtTx.feeSats) / builtTx.vsize));
        const bumpedTx = await buildSignedTransaction(
          mnemonic,
          await prepareUtxosWithHex(selection.length ? selection : utxos),
          outputs,
          addressMap,
          changeAddress,
          feeRate + bump,
          network,
        );
        builtTx = bumpedTx;
        setPendingTx(bumpedTx);
      }

      setPendingAmount(amountSats);
      setPendingDestination(destination.trim());
      onConfirmOpen();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send transaction');
    } finally {
      setSending(false);
      setFetchingHex(false);
    }
  };

  const handleConfirmSend = async () => {
    if (!pendingTx) return;

    setConfirming(true);
    setSendError(null);
    try {
      const txid = await broadcastTransaction(pendingTx.hex, network);
      setLastTxId(txid);
      onConfirmClose();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await onRefresh();
      setDestination('');
      setAmount('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send transaction');
    } finally {
      setConfirming(false);
    }
  };

  const handleFillFee = async () => {
    setLoadingFee(true);
    setSendError(null);
    try {
      const estimate = await fetchFeeEstimate(network, 2);
      setFeeRate(estimate);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to fetch fee');
    } finally {
      setLoadingFee(false);
    }
  };

  const handleCloseConfirm = () => {
    onConfirmClose();
    setPendingTx(null);
    setPendingAmount(null);
    setPendingDestination(null);
  };

  return (
    <Stack spacing={6}>
      <Box
        p={6}
        rounded="lg"
        bg={useColorModeValue('purple.50', 'gray.700')}
        borderWidth="1px"
        borderColor={borderColor}
        shadow="md"
      >
        <Stack spacing={2}>
          <Text fontSize="sm" color="gray.600" textTransform="uppercase" letterSpacing="widest">
            Balance
          </Text>
          <Heading size="lg" color={useColorModeValue('purple.700', 'purple.200')}>
            {formatCrypto(walletBalance, networkInfo.ticker)}
          </Heading>
        </Stack>
      </Box>

      <Grid templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap={4} alignItems="stretch">
        <GridItem>
          <Box
            p={6}
            rounded="lg"
            bg={panelBg}
            shadow="md"
            borderWidth="1px"
            borderColor={borderColor}
            h="100%"
            display="flex"
            flexDirection="column"
          >
            <Stack spacing={4} flex="1">
              <Heading size="md">Receive</Heading>
              {receiveAddress ? (
                <>
                  <Flex justify="center">
                    <Box
                      borderWidth="1px"
                      borderColor={borderColor}
                      borderRadius="md"
                      p={4}
                      bg="white"
                      display="inline-flex"
                      justifyContent="center"
                      alignItems="center"
                    >
                      <QRCodeSVG value={receiveAddress.address} size={170} />
                    </Box>
                  </Flex>
                  <VStack align="stretch" spacing={1}>
                    <Text fontSize="xs" color="gray.500">Address</Text>
                    <Text fontFamily="mono" wordBreak="break-all">{receiveAddress.address}</Text>
                  </VStack>
                </>
              ) : (
                <Text color="gray.500">No address available.</Text>
              )}
            </Stack>
          </Box>
        </GridItem>

        <GridItem>
          <Box
            p={6}
            rounded="lg"
            bg={panelBg}
            shadow="md"
            borderWidth="1px"
            borderColor={borderColor}
            h="100%"
            display="flex"
            flexDirection="column"
          >
            <Stack spacing={4} flex="1">
              <Heading size="md">Send</Heading>
              <Stack spacing={3}>
                <Input placeholder="Destination address" value={destination} onChange={(e) => setDestination(e.target.value)} />
                <Input placeholder={`Amount (${networkInfo.ticker})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
                <Box>
                  <Text fontSize="xs" color="gray.500" mb={1}>Fee rate (sat/vB)</Text>
                  <HStack align="flex-end">
                    <NumberInput value={feeRate} min={1} onChange={(value) => setFeeRate(Number(value) || 1)} flex={1}>
                      <NumberInputField placeholder="Fee rate" />
                    </NumberInput>
                    <Button size="sm" variant="ghost" onClick={handleFillFee} isLoading={loadingFee}>
                      Use suggested
                    </Button>
                  </HStack>
                  <Text fontSize="sm" color="gray.500" mt={1}>Commission per byte.</Text>
                </Box>
              </Stack>
              {fetchingHex && (
                <Box>
                  <Text fontSize="sm" color="gray.500" mb={1}>
                    Fetching raw transactions for legacy inputs... ({hexProgress.current}/{hexProgress.total})
                  </Text>
                  <Progress value={(hexProgress.current / (hexProgress.total || 1)) * 100} colorScheme="purple" size="sm" hasStripe isAnimated />
                </Box>
              )}
              {sendError && (
                <Alert status="error" borderRadius="md">
                  <AlertIcon />
                  <AlertDescription>{sendError}</AlertDescription>
                </Alert>
              )}
              {lastTxId && (
                <Alert status="success" borderRadius="md" flexDir="column" alignItems="flex-start" gap={2}>
                  <HStack alignItems="flex-start">
                    <AlertIcon />
                    <AlertDescription>Broadcasted: {formatTxidShort(lastTxId)}</AlertDescription>
                  </HStack>
                  <Button
                    size="sm"
                    colorScheme="blue"
                    variant="outline"
                    alignSelf="flex-start"
                    onClick={() => window.open(getBlockExplorerUrl(network, lastTxId), '_blank')}
                  >
                    View in explorer
                  </Button>
                </Alert>
              )}
              <Spacer />
            </Stack>
            <Button
              colorScheme="purple"
              leftIcon={<Icon as={FaPaperPlane} />}
              onClick={handleSend}
              isLoading={sending}
              mt={4}
            >
              Send
            </Button>
          </Box>
        </GridItem>
      </Grid>

      <Box p={6} rounded="lg" bg={panelBg} shadow="md" borderWidth="1px" borderColor={borderColor}>
        <Stack spacing={4}>
          <HStack justify="space-between">
            <Heading size="md">History (simple)</Heading>
            <Icon as={FaHistory} color="gray.500" />
          </HStack>
          {!history.length && <Text color="gray.500">No transactions yet.</Text>}
          <Stack spacing={3}>
            {history.map((entry) => {
              const { tx, status, direction, walletImpact } = entry;
              const isPositive = walletImpact >= 0n;
              const amountText = `${isPositive ? '+' : '-'}${formatCrypto(isPositive ? walletImpact : -walletImpact, networkInfo.ticker)}`;

              const statusColor =
                status === 'pending' ? 'yellow' :
                status === 'confirming' ? 'blue' :
                status === 'received' ? 'green' :
                'purple';

              return (
                <Box
                  key={tx.txid}
                  borderWidth="1px"
                  borderColor={borderColor}
                  borderRadius="lg"
                  p={4}
                  cursor="pointer"
                  onClick={() => onTransactionClick(tx)}
                  _hover={{ borderColor: 'purple.400' }}
                >
                  <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
                    <HStack spacing={2}>
                      {(status === 'pending' || status === 'confirming') && (
                        <Badge colorScheme={statusColor}>{status}</Badge>
                      )}
                      <Badge colorScheme={direction === 'received' ? 'green' : direction === 'sent' ? 'red' : 'gray'}>
                        {direction}
                      </Badge>
                    </HStack>
                    <HStack spacing={2}>
                      <Icon as={status === 'pending' ? FaClock : isPositive ? FaArrowDown : FaArrowUp} />
                      <Text fontWeight="bold" color={isPositive ? 'green.500' : 'red.500'}>
                        {amountText}
                      </Text>
                    </HStack>
                  </Flex>
                  <Divider my={3} />
                  <VStack align="stretch" spacing={1} fontSize="sm">
                    <Text color="gray.500">TXID</Text>
                    <Text fontFamily="mono" wordBreak="break-all">{tx.txid}</Text>
                  </VStack>
                </Box>
              );
            })}
          </Stack>
        </Stack>
      </Box>

      <Modal isOpen={isConfirmOpen} onClose={handleCloseConfirm} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Confirm send</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={3}>
              <Box>
                <Text fontSize="xs" color="gray.500">Destination</Text>
                <Text fontFamily="mono" wordBreak="break-all">{pendingDestination ?? '—'}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="gray.500">Amount</Text>
                <Text fontWeight="semibold">
                  {pendingAmount !== null ? formatCrypto(pendingAmount, networkInfo.ticker) : '—'}
                </Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="gray.500">Fee rate</Text>
                <Text>{feeRate} sat/vB</Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="gray.500">Network fee</Text>
                <Text fontWeight="semibold">
                  {pendingTx ? formatCrypto(pendingTx.feeSats, networkInfo.ticker) : '—'}
                </Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="gray.500">Total cost</Text>
                <Text fontWeight="bold">
                  {pendingTx && pendingAmount !== null
                    ? formatCrypto(pendingAmount + pendingTx.feeSats, networkInfo.ticker)
                    : '—'}
                </Text>
              </Box>
              <Alert status="warning" borderRadius="md">
                <AlertIcon />
                <AlertDescription>Review before broadcasting. Transaction will be sent via backend.</AlertDescription>
              </Alert>
              <Box>
                <Text fontSize="xs" color="gray.500">Raw hex (temporary for debug)</Text>
                <Textarea value={pendingTx?.hex ?? ''} readOnly fontFamily="mono" rows={4} />
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleCloseConfirm}>
              Cancel
            </Button>
            <Button colorScheme="purple" onClick={handleConfirmSend} isLoading={confirming} isDisabled={!pendingTx}>
              Broadcast
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Stack>
  );
}
