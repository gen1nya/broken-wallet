import {
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Flex,
  Grid,
  GridItem,
  HStack,
  Icon,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  VStack,
  useColorModeValue,
} from '@chakra-ui/react';
import { FaArrowDown, FaArrowRight, FaExternalLinkAlt, FaWallet } from 'react-icons/fa';
import { BlockbookTransaction } from './blockbookClient';
import { DerivedAddress } from './bitcoin';
import { isOwnAddress } from './addressDiscovery';
import { useNetwork } from './NetworkContext';

interface TransactionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: BlockbookTransaction | null;
  addressMap: Map<string, DerivedAddress>;
}

const formatCrypto = (value: string | number) => {
  const sats = typeof value === 'string' ? BigInt(value) : BigInt(value);
  const btc = Number(sats) / 1e8;
  return btc.toFixed(8);
};

const formatSats = (value: string | number) => {
  const sats = typeof value === 'string' ? BigInt(value) : BigInt(value);
  return sats.toString();
};

const formatDate = (timestamp?: number) => {
  if (!timestamp) return 'Pending';
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
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

export default function TransactionDetailsModal({
  isOpen,
  onClose,
  transaction,
  addressMap,
}: TransactionDetailsModalProps) {
  const { network, networkInfo } = useNetwork();
  const panelBg = useColorModeValue('gray.50', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const walletBg = useColorModeValue('purple.50', 'purple.900');
  const walletBorder = useColorModeValue('purple.300', 'purple.500');

  if (!transaction) return null;

  const isConfirmed = (transaction.confirmations ?? 0) > 0;
  const totalInputValue = formatCrypto(transaction.valueIn);
  const totalOutputValue = formatCrypto(transaction.value);
  const fee = formatCrypto(transaction.fees);
  const feeSats = formatSats(transaction.fees);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Transaction Details</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <Stack spacing={6}>
            <Box p={4} bg={panelBg} borderRadius="lg">
              <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4}>
                <GridItem colSpan={{ base: 1, md: 2 }}>
                  <Text fontSize="sm" fontWeight="bold" color="gray.500" mb={1}>
                    Transaction ID
                  </Text>
                  <HStack spacing={2} align="flex-start">
                    <Code fontSize="xs" wordBreak="break-all" display="block" p={2} flex="1">
                      {transaction.txid}
                    </Code>
                    <Button
                      size="sm"
                      colorScheme="blue"
                      leftIcon={<Icon as={FaExternalLinkAlt} />}
                      onClick={() => window.open(getBlockchairUrl(network, transaction.txid), '_blank')}
                      flexShrink={0}
                    >
                      View on Blockchair
                    </Button>
                  </HStack>
                </GridItem>

                <GridItem>
                  <Text fontSize="sm" fontWeight="bold" color="gray.500" mb={1}>
                    Status
                  </Text>
                  <HStack spacing={2}>
                    <Badge colorScheme={isConfirmed ? 'green' : 'yellow'} fontSize="sm">
                      {isConfirmed ? `${transaction.confirmations} confirmations` : 'Unconfirmed'}
                    </Badge>
                  </HStack>
                </GridItem>

                <GridItem>
                  <Text fontSize="sm" fontWeight="bold" color="gray.500" mb={1}>
                    Block Height
                  </Text>
                  <Text>{transaction.blockHeight ?? 'Pending'}</Text>
                </GridItem>

                <GridItem>
                  <Text fontSize="sm" fontWeight="bold" color="gray.500" mb={1}>
                    Timestamp
                  </Text>
                  <Text>{formatDate(transaction.blockTime)}</Text>
                </GridItem>

                {transaction.blockHash && (
                  <GridItem colSpan={{ base: 1, md: 2 }}>
                    <Text fontSize="sm" fontWeight="bold" color="gray.500" mb={1}>
                      Block Hash
                    </Text>
                    <Code fontSize="xs" wordBreak="break-all" display="block" p={2}>
                      {transaction.blockHash}
                    </Code>
                  </GridItem>
                )}
              </Grid>
            </Box>

            <Box p={4} bg={panelBg} borderRadius="lg">
              <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={4}>
                <GridItem>
                  <Text fontSize="sm" fontWeight="bold" color="gray.500" mb={1}>
                    Total Input
                  </Text>
                  <VStack align="start" spacing={0}>
                    <Text fontSize="lg" fontWeight="bold">
                      {totalInputValue} {networkInfo.ticker}
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      {formatSats(transaction.valueIn)} sats
                    </Text>
                  </VStack>
                </GridItem>

                <GridItem>
                  <Text fontSize="sm" fontWeight="bold" color="gray.500" mb={1}>
                    Total Output
                  </Text>
                  <VStack align="start" spacing={0}>
                    <Text fontSize="lg" fontWeight="bold">
                      {totalOutputValue} {networkInfo.ticker}
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      {formatSats(transaction.value)} sats
                    </Text>
                  </VStack>
                </GridItem>

                <GridItem>
                  <Text fontSize="sm" fontWeight="bold" color="gray.500" mb={1}>
                    Fee
                  </Text>
                  <VStack align="start" spacing={0}>
                    <Text fontSize="lg" fontWeight="bold" color="orange.500">
                      {fee} {networkInfo.ticker}
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      {feeSats} sats
                    </Text>
                  </VStack>
                </GridItem>
              </Grid>
            </Box>

            <Divider />

            <Grid templateColumns={{ base: '1fr', md: '1fr auto 1fr' }} gap={6}>
              <GridItem>
                <Text fontSize="md" fontWeight="bold" mb={3}>
                  Inputs ({transaction.vin.length})
                </Text>
                <Stack spacing={3}>
                  {transaction.vin.map((input, index) => {
                    const address = input.addresses?.[0];
                    const isWalletAddress = address ? isOwnAddress(address, input.isOwn, addressMap) : false;
                    const walletAddr = address ? addressMap.get(address) : undefined;

                    return (
                      <Box
                        key={`${input.txid}:${input.vout}`}
                        p={3}
                        borderWidth="2px"
                        borderColor={isWalletAddress ? walletBorder : borderColor}
                        bg={isWalletAddress ? walletBg : 'transparent'}
                        borderRadius="md"
                      >
                        <Stack spacing={2}>
                          <HStack justify="space-between" flexWrap="wrap">
                            <HStack>
                              <Badge colorScheme="blue">Input #{index}</Badge>
                              {isWalletAddress && (
                                <Badge colorScheme="purple" leftIcon={<Icon as={FaWallet} />}>
                                  Your Wallet
                                </Badge>
                              )}
                            </HStack>
                            <Text fontWeight="bold" color="green.500">
                              {formatCrypto(input.value)} {networkInfo.ticker}
                            </Text>
                          </HStack>

                          {input.addresses && input.addresses.length > 0 && (
                            <Box>
                              <Text fontSize="xs" color="gray.500" mb={1}>
                                From Address
                              </Text>
                              <Code fontSize="xs" wordBreak="break-all" display="block">
                                {input.addresses[0]}
                              </Code>
                              {walletAddr && (
                                <HStack mt={2} spacing={2} fontSize="xs">
                                  <Badge colorScheme="green" variant="subtle">
                                    {walletAddr.type === 'receive' ? 'Receive' : 'Change'} chain
                                  </Badge>
                                  <Badge colorScheme="blue" variant="subtle">
                                    Index: {walletAddr.index}
                                  </Badge>
                                  <Badge colorScheme="orange" variant="subtle">
                                    {walletAddr.format === 'p2wpkh' ? 'Segwit' : 'Legacy'}
                                  </Badge>
                                  <Text color="gray.500">{walletAddr.path}</Text>
                                </HStack>
                              )}
                            </Box>
                          )}

                          <Box>
                            <Text fontSize="xs" color="gray.500" mb={1}>
                              Previous TX
                            </Text>
                            <Code fontSize="xs" wordBreak="break-all" display="block">
                              {input.txid}:{input.vout}
                            </Code>
                          </Box>
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              </GridItem>

              <GridItem display={{ base: 'none', md: 'flex' }} alignItems="center" justifyContent="center">
                <Icon as={FaArrowRight} boxSize={6} color="purple.500" />
              </GridItem>

              <GridItem display={{ base: 'flex', md: 'none' }} justifyContent="center" py={2}>
                <Icon as={FaArrowDown} boxSize={6} color="purple.500" />
              </GridItem>

              <GridItem>
                <Text fontSize="md" fontWeight="bold" mb={3}>
                  Outputs ({transaction.vout.length})
                </Text>
                <Stack spacing={3}>
                  {transaction.vout.map((output, index) => {
                    const address = output.addresses?.[0];
                    const isWalletAddress = address ? isOwnAddress(address, output.isOwn, addressMap) : false;
                    const walletAddr = address ? addressMap.get(address) : undefined;

                    return (
                      <Box
                        key={`${transaction.txid}:${output.n}`}
                        p={3}
                        borderWidth="2px"
                        borderColor={isWalletAddress ? walletBorder : borderColor}
                        bg={isWalletAddress ? walletBg : 'transparent'}
                        borderRadius="md"
                        opacity={output.spent ? 0.7 : 1}
                      >
                        <Stack spacing={2}>
                          <HStack justify="space-between" flexWrap="wrap">
                            <HStack>
                              <Badge colorScheme="purple">Output #{index}</Badge>
                              {isWalletAddress && (
                                <Badge colorScheme="purple" leftIcon={<Icon as={FaWallet} />}>
                                  Your Wallet
                                </Badge>
                              )}
                              {output.spent && (
                                <Badge colorScheme="red" variant="subtle">
                                  Spent
                                </Badge>
                              )}
                            </HStack>
                            <Text fontWeight="bold" color="orange.500">
                              {formatCrypto(output.value)} {networkInfo.ticker}
                            </Text>
                          </HStack>

                          {output.addresses && output.addresses.length > 0 && (
                            <Box>
                              <Text fontSize="xs" color="gray.500" mb={1}>
                                To Address
                              </Text>
                              <Code fontSize="xs" wordBreak="break-all" display="block">
                                {output.addresses[0]}
                              </Code>
                              {walletAddr && (
                                <HStack mt={2} spacing={2} fontSize="xs" flexWrap="wrap">
                                  <Badge colorScheme="green" variant="subtle">
                                    {walletAddr.type === 'receive' ? 'Receive' : 'Change'} chain
                                  </Badge>
                                  <Badge colorScheme="blue" variant="subtle">
                                    Index: {walletAddr.index}
                                  </Badge>
                                  <Badge colorScheme="orange" variant="subtle">
                                    {walletAddr.format === 'p2wpkh' ? 'Segwit' : 'Legacy'}
                                  </Badge>
                                  <Text color="gray.500">{walletAddr.path}</Text>
                                </HStack>
                              )}
                            </Box>
                          )}

                          <Flex justify="space-between" fontSize="xs" color="gray.500">
                            <Text>{formatSats(output.value)} sats</Text>
                            <Text>vout: {output.n}</Text>
                          </Flex>
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              </GridItem>
            </Grid>

            {transaction.hex && (
              <Box>
                <Text fontSize="md" fontWeight="bold" mb={2}>
                  Raw Transaction Hex
                </Text>
                <Code
                  fontSize="xs"
                  wordBreak="break-all"
                  display="block"
                  p={3}
                  maxH="200px"
                  overflowY="auto"
                >
                  {transaction.hex}
                </Code>
              </Box>
            )}
          </Stack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
