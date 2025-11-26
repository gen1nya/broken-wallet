import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Box,
  Button,
  HStack,
  Select,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  useColorModeValue,
  Flex,
  IconButton,
} from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { DerivedAddress, deriveWalletFromMnemonic } from './bitcoin';
import { useNetwork } from './NetworkContext';

interface AddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  mnemonic: string;
}

type AddressFormat = 'segwit' | 'legacy';
type AddressChain = 'receive' | 'change';

const PAGE_SIZE = 100;

export default function AddressModal({ isOpen, onClose, mnemonic }: AddressModalProps) {
  const { network, networkInfo } = useNetwork();
  const [format, setFormat] = useState<AddressFormat>('segwit');
  const [chain, setChain] = useState<AddressChain>('receive');
  const [count, setCount] = useState(10);
  const [addresses, setAddresses] = useState<DerivedAddress[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  const badgeColor = useColorModeValue('purple.600', 'purple.300');

  // Reset state when modal closes or network changes
  useEffect(() => {
    if (!isOpen) {
      setFormat(networkInfo.supportsSegwit ? 'segwit' : 'legacy');
      setChain('receive');
      setCount(10);
      setAddresses([]);
      setCurrentPage(0);
    }
  }, [isOpen, networkInfo.supportsSegwit]);

  // Switch to legacy if network doesn't support segwit
  useEffect(() => {
    if (!networkInfo.supportsSegwit && format === 'segwit') {
      setFormat('legacy');
    }
  }, [networkInfo.supportsSegwit, format]);

  const handleGenerate = () => {
    // Use new API to generate exact count for selected chain
    const options = chain === 'receive'
      ? { receiveCount: count, changeCount: 0 }
      : { receiveCount: 0, changeCount: count };

    const wallet = deriveWalletFromMnemonic(mnemonic, options, network);

    const sourceAddresses = format === 'segwit'
      ? wallet.segwitAccount.addresses
      : wallet.legacyAccount.addresses;

    setAddresses(sourceAddresses);
    setCurrentPage(0); // Reset to first page on new generation
  };

  // Pagination
  const totalPages = Math.ceil(addresses.length / PAGE_SIZE);
  const paginatedAddresses = addresses.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  const canGoPrevious = currentPage > 0;
  const canGoNext = currentPage < totalPages - 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Address Management</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <Stack spacing={4}>
            <Box>
              <Text fontWeight="semibold" mb={2}>Generate Addresses</Text>
              <HStack spacing={4}>
                <Box>
                  <Text fontSize="sm" mb={1}>Format</Text>
                  <Select value={format} onChange={(e) => setFormat(e.target.value as AddressFormat)} width="200px">
                    <option value="segwit" disabled={!networkInfo.supportsSegwit}>Segwit (P2WPKH)</option>
                    <option value="legacy">Legacy (P2PKH)</option>
                  </Select>
                </Box>

                <Box>
                  <Text fontSize="sm" mb={1}>Chain</Text>
                  <Select value={chain} onChange={(e) => setChain(e.target.value as AddressChain)} width="150px">
                    <option value="receive">Receive</option>
                    <option value="change">Change</option>
                  </Select>
                </Box>

                <Box>
                  <Text fontSize="sm" mb={1}>Count</Text>
                  <NumberInput
                    value={count}
                    onChange={(_, num) => setCount(num)}
                    min={1}
                    max={10000}
                    width="120px"
                  >
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </Box>

                <Button colorScheme="purple" onClick={handleGenerate} alignSelf="flex-end">
                  Generate
                </Button>
              </HStack>
            </Box>

            {addresses.length > 0 && (
              <Stack spacing={3}>
                <Box borderWidth="1px" borderRadius="lg" overflow="hidden">
                  <Table size="sm">
                    <Thead>
                      <Tr>
                        <Th>Index</Th>
                        <Th>Path</Th>
                        <Th>Address</Th>
                        <Th>Public Key</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {paginatedAddresses.map((addr, idx) => {
                        const absoluteIndex = currentPage * PAGE_SIZE + idx;
                        return (
                          <Tr key={addr.path}>
                            <Td>
                              <Text fontWeight="semibold" color={badgeColor}>
                                {absoluteIndex}
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
                        );
                      })}
                    </Tbody>
                  </Table>
                </Box>

                {totalPages > 1 && (
                  <Flex justify="space-between" align="center">
                    <IconButton
                      aria-label="Previous page"
                      icon={<FaChevronLeft />}
                      onClick={() => setCurrentPage(p => p - 1)}
                      isDisabled={!canGoPrevious}
                      size="sm"
                    />
                    <Text fontSize="sm" color="gray.600">
                      Page {currentPage + 1} of {totalPages} ({addresses.length} addresses, showing {paginatedAddresses.length})
                    </Text>
                    <IconButton
                      aria-label="Next page"
                      icon={<FaChevronRight />}
                      onClick={() => setCurrentPage(p => p + 1)}
                      isDisabled={!canGoNext}
                      size="sm"
                    />
                  </Flex>
                )}
              </Stack>
            )}

            {addresses.length === 0 && (
              <Text color="gray.500" textAlign="center" py={8}>
                Select parameters and click Generate to view addresses
              </Text>
            )}
          </Stack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
