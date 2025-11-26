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
} from '@chakra-ui/react';
import { useState } from 'react';
import { DerivedAddress, deriveWalletFromMnemonic } from './bitcoin';

interface AddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  mnemonic: string;
}

type AddressFormat = 'segwit' | 'legacy';
type AddressChain = 'receive' | 'change';

export default function AddressModal({ isOpen, onClose, mnemonic }: AddressModalProps) {
  const [format, setFormat] = useState<AddressFormat>('segwit');
  const [chain, setChain] = useState<AddressChain>('receive');
  const [count, setCount] = useState(10);
  const [addresses, setAddresses] = useState<DerivedAddress[]>([]);

  const badgeColor = useColorModeValue('purple.600', 'purple.300');

  const handleGenerate = () => {
    // Generate double the count to ensure we have enough change addresses
    // (deriveWalletFromMnemonic generates change addresses as floor(count/2))
    const generateCount = chain === 'change' ? count * 2 : count;
    const wallet = deriveWalletFromMnemonic(mnemonic, generateCount);

    const sourceAddresses = format === 'segwit'
      ? wallet.segwitAccount.addresses
      : wallet.legacyAccount.addresses;

    const filtered = sourceAddresses
      .filter(addr => addr.type === chain)
      .slice(0, count); // Take exactly the requested count

    setAddresses(filtered);
  };

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
                    <option value="segwit">Segwit (P2WPKH)</option>
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
                    max={100}
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
                    {addresses.map((addr, idx) => (
                      <Tr key={addr.path}>
                        <Td>
                          <Text fontWeight="semibold" color={badgeColor}>
                            {idx}
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
