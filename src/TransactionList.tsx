import {
  Badge,
  Box,
  Code,
  Flex,
  HStack,
  Icon,
  Stack,
  Text,
  Tooltip,
  useColorModeValue,
} from '@chakra-ui/react';
import { FaArrowDown, FaArrowUp, FaExchangeAlt } from 'react-icons/fa';
import { BlockbookTransaction } from './blockbookClient';
import { DerivedAddress } from './bitcoin';
import { isOwnAddress } from './addressDiscovery';
import { useNetwork } from './NetworkContext';

interface TransactionListProps {
  transactions: BlockbookTransaction[];
  onTransactionClick: (transaction: BlockbookTransaction) => void;
  addressMap: Map<string, DerivedAddress>;
  ticker?: string; // Override ticker from network context
}

const formatCrypto = (value: string | number, ticker: string) => {
  const sats = typeof value === 'string' ? BigInt(value) : BigInt(value);
  const btc = Number(sats) / 1e8;
  return `${btc.toFixed(8)} ${ticker}`;
};

const formatDate = (timestamp?: number) => {
  if (!timestamp) return 'Pending';
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
};

export default function TransactionList({ transactions, onTransactionClick, addressMap, ticker }: TransactionListProps) {
  const { networkInfo } = useNetwork();
  const effectiveTicker = ticker ?? networkInfo.ticker;
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const hoverBg = useColorModeValue('gray.50', 'gray.700');

  if (!transactions.length) {
    return <Text color="gray.500">No transactions found.</Text>;
  }

  return (
    <Stack spacing={3}>
      {transactions.map((tx) => {
        const isConfirmed = (tx.confirmations ?? 0) > 0;
        const fee = formatCrypto(tx.fees, effectiveTicker);

        // Check wallet involvement using combined approach (isOwn + addressMap)
        const walletInputs = tx.vin.filter(input => {
          const address = input.addresses?.[0];
          return address ? isOwnAddress(address, input.isOwn, addressMap) : false;
        });

        const walletOutputs = tx.vout.filter(output => {
          const address = output.addresses?.[0];
          return address ? isOwnAddress(address, output.isOwn, addressMap) : false;
        });

        const walletInputsCount = walletInputs.length;
        const walletOutputsCount = walletOutputs.length;

        const totalInputsCount = tx.vin.length;
        const totalOutputsCount = tx.vout.length;

        const hasWalletInputs = walletInputsCount > 0;
        const hasWalletOutputs = walletOutputsCount > 0;
        const allInputsAreWallet = walletInputsCount === totalInputsCount;
        const allOutputsAreWallet = walletOutputsCount === totalOutputsCount;

        // Calculate wallet impact (how much was gained/lost)
        const walletInputsSum = walletInputs.reduce((sum, input) => sum + BigInt(input.value), 0n);
        const walletOutputsSum = walletOutputs.reduce((sum, output) => sum + BigInt(output.value), 0n);
        const walletImpact = walletOutputsSum - walletInputsSum; // positive = received, negative = sent

        let txType: 'sent' | 'received' | 'internal' | 'external' = 'external';
        let txIcon = FaExchangeAlt;
        let txColor = 'gray';

        // Internal: ALL inputs AND ALL outputs belong to wallet
        if (allInputsAreWallet && allOutputsAreWallet) {
          txType = 'internal';
          txIcon = FaExchangeAlt;
          txColor = 'blue';
        }
        // Sent: wallet has inputs, but not all outputs are wallet's
        else if (hasWalletInputs) {
          txType = 'sent';
          txIcon = FaArrowUp;
          txColor = 'red';
        }
        // Received: wallet has outputs, but no wallet inputs
        else if (hasWalletOutputs) {
          txType = 'received';
          txIcon = FaArrowDown;
          txColor = 'green';
        }

        return (
          <Box
            key={tx.txid}
            borderWidth="1px"
            borderColor={borderColor}
            borderRadius="lg"
            p={4}
            cursor="pointer"
            onClick={() => onTransactionClick(tx)}
            _hover={{
              bg: hoverBg,
              borderColor: 'purple.500',
            }}
            transition="all 0.2s"
          >
            <Stack spacing={3}>
              <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
                <HStack spacing={2}>
                  <Tooltip
                    label={
                      txType === 'sent' ? 'Sent from your wallet' :
                      txType === 'received' ? 'Received to your wallet' :
                      txType === 'internal' ? 'Internal transfer between your addresses' :
                      'External transaction'
                    }
                  >
                    <Badge colorScheme={txColor}>
                      <HStack spacing={1}>
                        <Icon as={txIcon} boxSize={3} />
                        <span>{txType.charAt(0).toUpperCase() + txType.slice(1)}</span>
                      </HStack>
                    </Badge>
                  </Tooltip>
                  <Badge colorScheme={isConfirmed ? 'green' : 'yellow'}>
                    {isConfirmed ? `${tx.confirmations} confirmations` : 'Unconfirmed'}
                  </Badge>
                  {tx.blockHeight && (
                    <Badge colorScheme="blue">Block {tx.blockHeight}</Badge>
                  )}
                </HStack>
                <Text fontSize="sm" color="gray.500">
                  {formatDate(tx.blockTime)}
                </Text>
              </Flex>

              <Box>
                <Text fontSize="xs" color="gray.500" mb={1}>
                  Transaction ID
                </Text>
                <Code fontSize="xs" wordBreak="break-all">
                  {tx.txid}
                </Code>
              </Box>

              <Flex justify="space-between" fontSize="sm" gap={4} flexWrap="wrap">
                <Box>
                  <Text fontWeight="bold" color="gray.500" fontSize="xs">
                    {txType === 'received' ? 'Received' : txType === 'sent' ? 'Spent' : txType === 'internal' ? 'Transferred' : 'Amount'}
                  </Text>
                  <Text
                    fontWeight="semibold"
                    color={
                      txType === 'received' ? 'green.500' :
                      txType === 'sent' ? 'red.500' :
                      'inherit'
                    }
                  >
                    {walletImpact > 0n ? '+' : walletImpact < 0n ? '-' : ''}{formatCrypto(Number(walletImpact < 0n ? -walletImpact : walletImpact), effectiveTicker)}
                  </Text>
                </Box>
                <Box>
                  <Text fontWeight="bold" color="gray.500" fontSize="xs">
                    Fee
                  </Text>
                  <Text fontWeight="semibold">{fee}</Text>
                </Box>
                <Box>
                  <Text fontWeight="bold" color="gray.500" fontSize="xs">
                    Inputs/Outputs
                  </Text>
                  <Text fontWeight="semibold">
                    {tx.vin.length} / {tx.vout.length}
                  </Text>
                </Box>
                {(hasWalletInputs || hasWalletOutputs) && (
                  <Box>
                    <Text fontWeight="bold" color="gray.500" fontSize="xs">
                      Your Addresses
                    </Text>
                    <Text fontWeight="semibold" color="purple.500">
                      {walletInputsCount} in / {walletOutputsCount} out
                    </Text>
                  </Box>
                )}
              </Flex>
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
