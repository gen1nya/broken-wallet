import {
  Box,
  Button,
  Container,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  VStack,
  useDisclosure,
  useToast,
  Alert,
  AlertIcon,
  AlertDescription,
  HStack,
  Badge,
  FormErrorMessage,
} from '@chakra-ui/react';
import { useState } from 'react';
import { FaLock, FaPlus, FaRandom, FaTrash, FaDownload } from 'react-icons/fa';
import { createRandomMnemonic } from './bitcoin';
import {
  decryptWallet,
  deleteWallet,
  encryptWallet,
  listWallets,
  saveWallet,
  type EncryptedWallet,
} from './walletStorage';
import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

interface WalletUnlockViewProps {
  onUnlock: (mnemonic: string, walletId?: string, walletName?: string) => void;
}

export default function WalletUnlockView({ onUnlock }: WalletUnlockViewProps) {
  const cleanMnemonicForDisplay = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, ' ');

  const [mnemonic, setMnemonic] = useState('');
  const [savedWallets, setSavedWallets] = useState<EncryptedWallet[]>(listWallets());
  const [selectedWallet, setSelectedWallet] = useState<EncryptedWallet | null>(null);

  const {
    isOpen: isUnlockOpen,
    onOpen: onUnlockOpen,
    onClose: onUnlockClose,
  } = useDisclosure();

  const {
    isOpen: isSaveOpen,
    onOpen: onSaveOpen,
    onClose: onSaveClose,
  } = useDisclosure();

  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();

  const {
    isOpen: isBackupOpen,
    onOpen: onBackupOpen,
    onClose: onBackupClose,
  } = useDisclosure();

  const [password, setPassword] = useState('');
  const [walletName, setWalletName] = useState('');
  const [savePassword, setSavePassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [walletToDelete, setWalletToDelete] = useState<EncryptedWallet | null>(null);
  const [walletToBackup, setWalletToBackup] = useState<EncryptedWallet | null>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [decryptedMnemonic, setDecryptedMnemonic] = useState('');
  const [mnemonicError, setMnemonicError] = useState<string | null>(null);

  const toast = useToast();

  const normalizedMnemonic = cleanMnemonicForDisplay(mnemonic).trim().split(/\s+/).join(' ');
  const isMnemonicValid = normalizedMnemonic ? validateMnemonic(normalizedMnemonic, wordlist) : false;

  const handleGenerateRandom = () => {
    const randomMnemonic = createRandomMnemonic();
    setMnemonic(cleanMnemonicForDisplay(randomMnemonic));
    setMnemonicError(null);
    toast({
      title: 'Mnemonic generated',
      description: 'A new random mnemonic has been generated',
      status: 'success',
      duration: 3000,
    });
  };

  const handleUseTemporary = () => {
    if (!mnemonic.trim()) {
      toast({
        title: 'No mnemonic',
        description: 'Please enter or generate a mnemonic first',
        status: 'warning',
        duration: 3000,
      });
      return;
    }

    if (!isMnemonicValid) {
      toast({
        title: 'Invalid mnemonic',
        description: 'Please enter a valid BIP39 mnemonic phrase',
        status: 'error',
        duration: 4000,
      });
      return;
    }

    onUnlock(normalizedMnemonic);
  };

  const handleSaveAndEncrypt = () => {
    if (!mnemonic.trim()) {
      toast({
        title: 'No mnemonic',
        description: 'Please enter or generate a mnemonic first',
        status: 'warning',
        duration: 3000,
      });
      return;
    }

    if (!isMnemonicValid) {
      toast({
        title: 'Invalid mnemonic',
        description: 'Please enter a valid BIP39 mnemonic phrase',
        status: 'error',
        duration: 4000,
      });
      return;
    }

    setWalletName('');
    setSavePassword('');
    setConfirmPassword('');
    onSaveOpen();
  };

  const handleSaveWallet = async () => {
    if (!walletName.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter a wallet name',
        status: 'warning',
        duration: 3000,
      });
      return;
    }

    if (savePassword.length < 8) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 8 characters',
        status: 'warning',
        duration: 3000,
      });
      return;
    }

    if (savePassword !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure passwords match',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    setIsProcessing(true);

    try {
      if (!isMnemonicValid) {
        throw new Error('Mnemonic must be valid before saving');
      }

      const encrypted = await encryptWallet(normalizedMnemonic, savePassword, walletName.trim());
      saveWallet(encrypted);
      setSavedWallets(listWallets());

      toast({
        title: 'Wallet saved',
        description: `Wallet "${walletName}" has been encrypted and saved`,
        status: 'success',
        duration: 3000,
      });

      onSaveClose();
      // Auto-unlock after saving
      onUnlock(normalizedMnemonic, encrypted.id, encrypted.name);
    } catch (error) {
      toast({
        title: 'Failed to save wallet',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 5000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnlockWallet = (wallet: EncryptedWallet) => {
    setSelectedWallet(wallet);
    setPassword('');
    onUnlockOpen();
  };

  const handleUnlockSubmit = async () => {
    if (!selectedWallet) return;

    setIsProcessing(true);

    try {
      const decrypted = await decryptWallet(selectedWallet, password);

      toast({
        title: 'Wallet unlocked',
        description: `Welcome back to "${selectedWallet.name}"`,
        status: 'success',
        duration: 3000,
      });

      onUnlockClose();
      onUnlock(decrypted, selectedWallet.id, selectedWallet.name);
    } catch (error) {
      toast({
        title: 'Failed to unlock',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 5000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteClick = (wallet: EncryptedWallet) => {
    setWalletToDelete(wallet);
    onDeleteOpen();
  };

  const handleDeleteConfirm = () => {
    if (!walletToDelete) return;

    deleteWallet(walletToDelete.id);
    setSavedWallets(listWallets());

    toast({
      title: 'Wallet deleted',
      description: `Wallet "${walletToDelete.name}" has been deleted`,
      status: 'info',
      duration: 3000,
    });

    setWalletToDelete(null);
    onDeleteClose();
  };

  const handleBackupClick = (wallet: EncryptedWallet) => {
    setWalletToBackup(wallet);
    setBackupPassword('');
    setDecryptedMnemonic('');
    onBackupOpen();
  };

  const handleBackupSubmit = async () => {
    if (!walletToBackup) return;

    setIsProcessing(true);

    try {
      const decrypted = await decryptWallet(walletToBackup, backupPassword);
      setDecryptedMnemonic(decrypted);

      toast({
        title: 'Backup successful',
        description: 'Mnemonic decrypted successfully',
        status: 'success',
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: 'Failed to decrypt',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 5000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBackupClose = () => {
    setBackupPassword('');
    setDecryptedMnemonic('');
    setWalletToBackup(null);
    onBackupClose();
  };

  const formatDate = (isoDate: string) => {
    return new Date(isoDate).toLocaleString();
  };

  return (
    <Container maxW="container.lg" py={8}>
      <VStack spacing={8} align="stretch">
        {/* Header */}
        <Box textAlign="center">
          <Heading size="xl" mb={2}>
            Broken Wallet
          </Heading>
          <Text color="gray.500">Educational Bitcoin Wallet Playground</Text>
        </Box>

        {/* Import/Create Section */}
        <Box borderWidth={1} borderRadius="lg" p={6}>
          <Heading size="md" mb={4}>
            Import or Create Wallet
          </Heading>

          <Stack spacing={4}>
            <FormControl isInvalid={!!mnemonicError}>
              <FormLabel>BIP39 Mnemonic Phrase</FormLabel>
              <Textarea
                value={mnemonic}
                onChange={(e) => {
                  const cleanedDisplay = cleanMnemonicForDisplay(e.target.value);
                  setMnemonic(cleanedDisplay);
                  const cleanedNormalized = cleanedDisplay.trim().split(/\s+/).join(' ');
                  if (!cleanedNormalized) {
                    setMnemonicError(null);
                    return;
                  }
                  setMnemonicError(validateMnemonic(cleanedNormalized, wordlist) ? null : 'Invalid mnemonic phrase');
                }}
                placeholder="Enter your 12 or 24 word mnemonic phrase, or generate a new one"
                rows={3}
                fontFamily="monospace"
              />
              {mnemonicError && <FormErrorMessage>{mnemonicError}</FormErrorMessage>}
            </FormControl>

            <Flex gap={3} flexWrap="wrap">
              <Button
                leftIcon={<FaRandom />}
                onClick={handleGenerateRandom}
                colorScheme="purple"
                variant="outline"
              >
                Generate Random
              </Button>

              <Button onClick={handleUseTemporary} colorScheme="blue" variant="outline" isDisabled={!normalizedMnemonic || !!mnemonicError}>
                Use Temporary (In-Memory)
              </Button>

              <Button
                leftIcon={<FaLock />}
                onClick={handleSaveAndEncrypt}
                colorScheme="green"
                isDisabled={!normalizedMnemonic || !!mnemonicError}
              >
                Save & Encrypt
              </Button>
            </Flex>

            <Alert status="info" borderRadius="md">
              <AlertIcon />
              <AlertDescription fontSize="sm">
                <strong>Temporary:</strong> Wallet exists only in memory, lost on page refresh.{' '}
                <strong>Save & Encrypt:</strong> Encrypted with password and stored in browser
                localStorage.
              </AlertDescription>
            </Alert>
          </Stack>
        </Box>

        {/* Saved Wallets Section */}
        {savedWallets.length > 0 && (
          <Box borderWidth={1} borderRadius="lg" p={6}>
            <Heading size="md" mb={4}>
              Saved Wallets
            </Heading>

            <Box overflowX="auto">
              <Table variant="simple" size="sm">
                <Thead>
                  <Tr>
                    <Th>Name</Th>
                    <Th>Created</Th>
                    <Th>Security</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {savedWallets.map((wallet) => (
                    <Tr key={wallet.id}>
                      <Td fontWeight="medium">{wallet.name}</Td>
                      <Td fontSize="sm" color="gray.600">
                        {formatDate(wallet.createdAt)}
                      </Td>
                      <Td>
                        <HStack spacing={1}>
                          <Badge colorScheme="green" fontSize="xs">
                            AES-256
                          </Badge>
                          <Badge colorScheme="blue" fontSize="xs">
                            PBKDF2
                          </Badge>
                        </HStack>
                      </Td>
                      <Td>
                        <HStack spacing={2}>
                          <Button
                            size="sm"
                            colorScheme="green"
                            onClick={() => handleUnlockWallet(wallet)}
                          >
                            Unlock
                          </Button>
                          <IconButton
                            size="sm"
                            icon={<FaDownload />}
                            aria-label="Backup mnemonic"
                            colorScheme="blue"
                            variant="ghost"
                            onClick={() => handleBackupClick(wallet)}
                          />
                          <IconButton
                            size="sm"
                            icon={<FaTrash />}
                            aria-label="Delete wallet"
                            colorScheme="red"
                            variant="ghost"
                            onClick={() => handleDeleteClick(wallet)}
                          />
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          </Box>
        )}
      </VStack>

      {/* Unlock Modal */}
      <Modal isOpen={isUnlockOpen} onClose={onUnlockClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Unlock Wallet</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <Text>
                Enter password to unlock <strong>{selectedWallet?.name}</strong>
              </Text>
              <FormControl>
                <FormLabel>Password</FormLabel>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  onKeyPress={(e) => e.key === 'Enter' && handleUnlockSubmit()}
                  autoFocus
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onUnlockClose}>
              Cancel
            </Button>
            <Button
              colorScheme="green"
              onClick={handleUnlockSubmit}
              isLoading={isProcessing}
              isDisabled={!password}
            >
              Unlock
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Save Wallet Modal */}
      <Modal isOpen={isSaveOpen} onClose={onSaveClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Save & Encrypt Wallet</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Wallet Name</FormLabel>
                <Input
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  placeholder="e.g., My Main Wallet"
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Password (min 8 characters)</FormLabel>
                <Input
                  type="password"
                  value={savePassword}
                  onChange={(e) => setSavePassword(e.target.value)}
                  placeholder="Enter a strong password"
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Confirm Password</FormLabel>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  onKeyPress={(e) => e.key === 'Enter' && handleSaveWallet()}
                />
              </FormControl>

              <Alert status="warning" borderRadius="md">
                <AlertIcon />
                <AlertDescription fontSize="sm">
                  Your mnemonic will be encrypted with AES-256-GCM using a key derived from your
                  password via PBKDF2 (100k iterations). <strong>Do not forget your password</strong>
                  - there is no recovery mechanism.
                </AlertDescription>
              </Alert>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onSaveClose}>
              Cancel
            </Button>
            <Button
              colorScheme="green"
              onClick={handleSaveWallet}
              isLoading={isProcessing}
              isDisabled={
                !walletName.trim() ||
                savePassword.length < 8 ||
                savePassword !== confirmPassword
              }
            >
              Save & Unlock
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isDeleteOpen} onClose={onDeleteClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Delete Wallet</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Alert status="error" borderRadius="md" mb={4}>
              <AlertIcon />
              <AlertDescription>
                This action cannot be undone. Make sure you have backed up your mnemonic phrase.
              </AlertDescription>
            </Alert>
            <Text>
              Are you sure you want to delete <strong>{walletToDelete?.name}</strong>?
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onDeleteClose}>
              Cancel
            </Button>
            <Button colorScheme="red" onClick={handleDeleteConfirm}>
              Delete Wallet
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Backup Mnemonic Modal */}
      <Modal isOpen={isBackupOpen} onClose={handleBackupClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Backup Wallet</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {!decryptedMnemonic ? (
                <>
                  <Text>
                    Enter password to decrypt mnemonic for <strong>{walletToBackup?.name}</strong>
                  </Text>
                  <FormControl>
                    <FormLabel>Password</FormLabel>
                    <Input
                      type="password"
                      value={backupPassword}
                      onChange={(e) => setBackupPassword(e.target.value)}
                      placeholder="Enter your password"
                      onKeyPress={(e) => e.key === 'Enter' && handleBackupSubmit()}
                      autoFocus
                    />
                  </FormControl>
                </>
              ) : (
                <>
                  <Alert status="warning" borderRadius="md">
                    <AlertIcon />
                    <AlertDescription>
                      <strong>Security Warning:</strong> Anyone with this mnemonic can access your
                      funds. Keep it safe and private. Never share it online or store it digitally.
                    </AlertDescription>
                  </Alert>

                  <FormControl>
                    <FormLabel fontWeight="bold">Recovery Phrase (Mnemonic)</FormLabel>
                    <Textarea
                      value={decryptedMnemonic}
                      isReadOnly
                      rows={4}
                      fontFamily="monospace"
                      fontSize="sm"
                      bg="gray.50"
                      _dark={{ bg: 'gray.800' }}
                    />
                  </FormControl>

                  <Alert status="info" borderRadius="md">
                    <AlertIcon />
                    <AlertDescription fontSize="sm">
                      <strong>Recommended:</strong> Write this phrase on paper and store it in a
                      secure location. Do not take screenshots or save to cloud storage.
                    </AlertDescription>
                  </Alert>
                </>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleBackupClose}>
              {decryptedMnemonic ? 'Close' : 'Cancel'}
            </Button>
            {!decryptedMnemonic && (
              <Button
                colorScheme="blue"
                onClick={handleBackupSubmit}
                isLoading={isProcessing}
                isDisabled={!backupPassword}
              >
                Decrypt
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Container>
  );
}
