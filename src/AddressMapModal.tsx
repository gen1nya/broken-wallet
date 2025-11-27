import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Box,
  HStack,
  VStack,
  Text,
  Badge,
  Tooltip,
  useColorModeValue,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { useMemo } from 'react';
import { DerivedAddress } from './bitcoin';
import { BlockbookTransaction } from './blockbookClient';
import { QRCodeSVG } from 'qrcode.react';

interface AddressMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  segwitAddresses: DerivedAddress[];
  legacyAddresses: DerivedAddress[];
  transactions: BlockbookTransaction[];
}

type AddressState = 'empty' | 'with-balance' | 'spent';

interface AddressInfo {
  address: DerivedAddress;
  state: AddressState;
  balance: bigint;
  txCount: number;
}

function AddressBlock({ info }: { info: AddressInfo }) {
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
            Balance: {(Number(info.balance) / 1e8).toFixed(8)} BTC
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

function AddressChain({ addresses, label, transactions }: {
  addresses: DerivedAddress[];
  label: string;
  transactions: BlockbookTransaction[];
}) {
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Calculate address states based on transactions - memoized for performance
  const addressInfos: AddressInfo[] = useMemo(() => {
    // Build address lookup map for faster transaction scanning
    const addressSet = new Set(addresses.map(a => a.address));
    const addressTxMap = new Map<string, { balance: bigint; txCount: number }>();

    // Initialize all addresses
    addresses.forEach(addr => {
      addressTxMap.set(addr.address, { balance: 0n, txCount: 0 });
    });

    // Scan transactions once
    transactions.forEach(tx => {
      const involvedAddresses = new Set<string>();

      // Check outputs (received)
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

      // Check inputs (spent)
      tx.vin.forEach(input => {
        input.addresses?.forEach(address => {
          if (addressSet.has(address)) {
            involvedAddresses.add(address);
          }
        });
      });

      // Increment tx count for involved addresses
      involvedAddresses.forEach(address => {
        addressTxMap.get(address)!.txCount++;
      });
    });

    // Build final address info array
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

  return (
    <VStack align="stretch" spacing={2}>
      <HStack spacing={2}>
        <Badge colorScheme="purple" fontSize="xs" px={2}>
          {label}
        </Badge>
        <Text fontSize="xs" color="gray.500">
          {addresses.length} addresses
        </Text>
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
              <AddressBlock info={info} />
            </WrapItem>
          ))}
        </Wrap>
      </Box>
    </VStack>
  );
}

export default function AddressMapModal({
  isOpen,
  onClose,
  segwitAddresses,
  legacyAddresses,
  transactions,
}: AddressMapModalProps) {
  const bgColor = useColorModeValue('white', 'gray.800');

  // Split addresses into chains
  const segwitReceive = segwitAddresses.filter(a => a.type === 'receive');
  const segwitChange = segwitAddresses.filter(a => a.type === 'change');
  const legacyReceive = legacyAddresses.filter(a => a.type === 'receive');
  const legacyChange = legacyAddresses.filter(a => a.type === 'change');

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg={bgColor} maxH="90vh">
        <ModalHeader>Address Map</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <VStack align="stretch" spacing={6}>
            <Box>
              <Text fontSize="sm" color="gray.500" mb={4}>
                Visual representation of wallet address chains. Colors indicate state:
                <Badge colorScheme="gray" mx={1}>Empty</Badge>
                <Badge colorScheme="green" mx={1}>With Balance</Badge>
                <Badge colorScheme="red" mx={1}>Spent</Badge>
              </Text>
            </Box>

            <Text fontSize="md" fontWeight="bold">Native SegWit (P2WPKH)</Text>
            <AddressChain
              addresses={segwitReceive}
              label="Segwit Receive (m/84'/0'/0'/0/x)"
              transactions={transactions}
            />
            <AddressChain
              addresses={segwitChange}
              label="Segwit Change (m/84'/0'/0'/1/x)"
              transactions={transactions}
            />

            <Text fontSize="md" fontWeight="bold" mt={4}>Legacy (P2PKH)</Text>
            <AddressChain
              addresses={legacyReceive}
              label="Legacy Receive (m/44'/0'/0'/0/x)"
              transactions={transactions}
            />
            <AddressChain
              addresses={legacyChange}
              label="Legacy Change (m/44'/0'/0'/1/x)"
              transactions={transactions}
            />
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
