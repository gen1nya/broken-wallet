import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Code,
  FormControl,
  FormLabel,
  HStack,
  Heading,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
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
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { FaCopy, FaDownload, FaEye, FaEyeSlash, FaPlus, FaTrash, FaUpload, FaSync } from 'react-icons/fa';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { derivePasswordFromLogin, isValidLogin } from './passwordDerivation';
import {
  LoginEntry,
  addLogin,
  deleteLogin,
  exportLoginsJSON,
  getLoginsForWallet,
  importLoginsJSON,
  updateLogin,
} from './passwordStorage';

interface PasswordManagerViewProps {
  mnemonic: string;
  walletId?: string;
}

export default function PasswordManagerView({ mnemonic, walletId }: PasswordManagerViewProps) {
  const panelBg = useColorModeValue('gray.50', 'gray.800');
  const toast = useToast();

  const [logins, setLogins] = useState<LoginEntry[]>([]);
  const [newLogin, setNewLogin] = useState('');
  const [newService, setNewService] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [hdRoot, setHdRoot] = useState<HDKey | null>(null);

  // Derive HD root key from mnemonic
  useEffect(() => {
    if (mnemonic) {
      try {
        const seed = mnemonicToSeedSync(mnemonic);
        const root = HDKey.fromMasterSeed(seed);
        setHdRoot(root);
        console.log('HD root initialized successfully');
      } catch (err) {
        console.error('Failed to initialize HD root:', err);
        toast({
          title: 'Error',
          description: 'Failed to derive HD root from mnemonic',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    }
  }, [mnemonic, toast]);

  // Load logins when component mounts or walletId changes
  useEffect(() => {
    if (walletId) {
      const loadedLogins = getLoginsForWallet(walletId);
      setLogins(loadedLogins);
    } else {
      // For temporary wallets, start with empty list
      setLogins([]);
    }
  }, [walletId]);

  const handleAddLogin = () => {
    if (!newLogin.trim()) {
      toast({
        title: 'Error',
        description: 'Login cannot be empty',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (!isValidLogin(newLogin)) {
      toast({
        title: 'Error',
        description: 'Invalid login format',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    // Check for duplicates
    if (logins.some((l) => l.login === newLogin.trim())) {
      toast({
        title: 'Error',
        description: 'This login already exists',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (walletId) {
      const entry = addLogin(walletId, newLogin.trim(), newService.trim() || undefined, newNotes.trim() || undefined);
      setLogins([...logins, entry]);
    } else {
      // Temporary wallet - store in memory only
      const now = new Date().toISOString();
      const entry: LoginEntry = {
        id: crypto.randomUUID(),
        login: newLogin.trim(),
        service: newService.trim() || undefined,
        notes: newNotes.trim() || undefined,
        nonce: 0,
        createdAt: now,
        updatedAt: now,
      };
      setLogins([...logins, entry]);
    }

    setNewLogin('');
    setNewService('');
    setNewNotes('');

    toast({
      title: 'Success',
      description: 'Login added successfully',
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };

  const handleDeleteLogin = (loginId: string) => {
    if (walletId) {
      deleteLogin(walletId, loginId);
    }
    setLogins(logins.filter((l) => l.id !== loginId));
    toast({
      title: 'Success',
      description: 'Login deleted',
      status: 'info',
      duration: 3000,
      isClosable: true,
    });
  };

  const handleRotatePassword = (loginId: string) => {
    const entry = logins.find((l) => l.id === loginId);
    if (!entry) return;

    const newNonce = entry.nonce + 1;

    if (walletId) {
      updateLogin(walletId, loginId, { nonce: newNonce });
    }

    setLogins(logins.map((l) => (l.id === loginId ? { ...l, nonce: newNonce } : l)));

    toast({
      title: 'Password Rotated',
      description: `New password version: ${newNonce}`,
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };

  const togglePasswordVisibility = (loginId: string) => {
    const newVisible = new Set(visiblePasswords);
    if (newVisible.has(loginId)) {
      newVisible.delete(loginId);
    } else {
      newVisible.add(loginId);
    }
    setVisiblePasswords(newVisible);
  };

  const derivePassword = (login: string, nonce: number = 0): string => {
    if (!hdRoot) {
      console.error('HD root not initialized');
      return 'ERROR: HD root not initialized';
    }
    try {
      return derivePasswordFromLogin(login, hdRoot, nonce);
    } catch (err) {
      console.error('Failed to derive password for login:', login, 'nonce:', nonce, err);
      return `ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`;
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: `${label} copied to clipboard`,
      status: 'success',
      duration: 2000,
      isClosable: true,
    });
  };

  const handleExportJSON = () => {
    if (walletId) {
      const json = exportLoginsJSON(walletId);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `passwords-${walletId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: 'Success',
        description: 'Logins exported to JSON',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } else {
      // For temporary wallets, export in-memory logins
      const json = JSON.stringify(logins, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'passwords-temporary.json';
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: 'Success',
        description: 'Logins exported to JSON',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleImportJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const text = await file.text();

      if (walletId) {
        const result = importLoginsJSON(walletId, text);
        setLogins(getLoginsForWallet(walletId));

        if (result.errors.length > 0) {
          toast({
            title: 'Import completed with errors',
            description: `Imported: ${result.imported}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`,
            status: 'warning',
            duration: 5000,
            isClosable: true,
          });
        } else {
          toast({
            title: 'Success',
            description: `Imported ${result.imported} logins, skipped ${result.skipped} duplicates`,
            status: 'success',
            duration: 3000,
            isClosable: true,
          });
        }
      } else {
        // For temporary wallets
        try {
          const parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) {
            throw new Error('JSON must be an array');
          }

          const existingLogins = new Set(logins.map((l) => l.login));
          let imported = 0;
          let skipped = 0;

          for (const item of parsed) {
            if (typeof item === 'object' && item && 'login' in item) {
              const login = String(item.login);
              if (!existingLogins.has(login)) {
                const now = new Date().toISOString();
                const entry: LoginEntry = {
                  id: crypto.randomUUID(),
                  login,
                  service: typeof item.service === 'string' ? item.service : undefined,
                  notes: typeof item.notes === 'string' ? item.notes : undefined,
                  nonce: typeof item.nonce === 'number' ? item.nonce : 0,
                  createdAt: now,
                  updatedAt: now,
                };
                logins.push(entry);
                existingLogins.add(login);
                imported++;
              } else {
                skipped++;
              }
            }
          }

          setLogins([...logins]);
          toast({
            title: 'Success',
            description: `Imported ${imported} logins, skipped ${skipped} duplicates`,
            status: 'success',
            duration: 3000,
            isClosable: true,
          });
        } catch (err) {
          toast({
            title: 'Error',
            description: 'Failed to import JSON',
            status: 'error',
            duration: 5000,
            isClosable: true,
          });
        }
      }
    };
    input.click();
  };

  return (
    <Stack spacing={8}>
      <Box p={6} rounded="lg" bg={panelBg} shadow="md">
        <VStack align="stretch" spacing={4}>
          <HStack justify="space-between">
            <Heading size="md">Password Manager</Heading>
            <HStack>
              <Button
                size="sm"
                leftIcon={<Icon as={FaUpload} />}
                colorScheme="blue"
                variant="outline"
                onClick={handleImportJSON}
              >
                Import JSON
              </Button>
              <Button
                size="sm"
                leftIcon={<Icon as={FaDownload} />}
                colorScheme="green"
                variant="outline"
                onClick={handleExportJSON}
                isDisabled={logins.length === 0}
              >
                Export JSON
              </Button>
            </HStack>
          </HStack>

          <Alert status="info">
            <AlertIcon />
            <AlertDescription fontSize="sm">
              Passwords are derived deterministically from your mnemonic + login using BIP32 derivation (path m/128'/0'/&#123;index&#125;).
              Only login entries are stored - passwords are regenerated on-demand and never saved.
            </AlertDescription>
          </Alert>

          {!walletId && (
            <Alert status="warning">
              <AlertIcon />
              <AlertDescription fontSize="sm">
                This is a temporary wallet. Your login entries will be lost when you exit. Export them to JSON or save the wallet to persist.
              </AlertDescription>
            </Alert>
          )}
        </VStack>
      </Box>

      <Box p={6} rounded="lg" bg={panelBg} shadow="md">
        <VStack align="stretch" spacing={4}>
          <Heading size="md">Add New Login</Heading>

          <FormControl isRequired>
            <FormLabel fontSize="sm">Login / Email / Username</FormLabel>
            <Input
              placeholder="user@example.com"
              value={newLogin}
              onChange={(e) => setNewLogin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddLogin();
                }
              }}
            />
          </FormControl>

          <FormControl>
            <FormLabel fontSize="sm">Service Name (Optional)</FormLabel>
            <Input
              placeholder="Gmail, GitHub, etc."
              value={newService}
              onChange={(e) => setNewService(e.target.value)}
            />
          </FormControl>

          <FormControl>
            <FormLabel fontSize="sm">Notes (Optional)</FormLabel>
            <Textarea
              placeholder="Additional notes..."
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={2}
            />
          </FormControl>

          <Button colorScheme="purple" leftIcon={<Icon as={FaPlus} />} onClick={handleAddLogin} alignSelf="flex-start">
            Add Login
          </Button>
        </VStack>
      </Box>

      <Box p={6} rounded="lg" bg={panelBg} shadow="md">
        <VStack align="stretch" spacing={4}>
          <Heading size="md">Saved Logins ({logins.length})</Heading>

          {logins.length === 0 ? (
            <Text color="gray.500">No logins saved yet. Add your first login above.</Text>
          ) : (
            <Box overflowX="auto">
              <Table variant="simple" size="sm">
                <Thead>
                  <Tr>
                    <Th>Service</Th>
                    <Th>Login</Th>
                    <Th>Password</Th>
                    <Th>Version</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {logins.map((entry) => {
                    const password = derivePassword(entry.login, entry.nonce);
                    const isVisible = visiblePasswords.has(entry.id);

                    return (
                      <Tr key={entry.id}>
                        <Td>
                          <VStack align="flex-start" spacing={1}>
                            <Text fontWeight="semibold">{entry.service || 'N/A'}</Text>
                            {entry.notes && (
                              <Text fontSize="xs" color="gray.500">
                                {entry.notes}
                              </Text>
                            )}
                          </VStack>
                        </Td>
                        <Td>
                          <HStack>
                            <Code fontSize="xs">{entry.login}</Code>
                            <IconButton
                              aria-label="Copy login"
                              icon={<FaCopy />}
                              size="xs"
                              variant="ghost"
                              onClick={() => copyToClipboard(entry.login, 'Login')}
                            />
                          </HStack>
                        </Td>
                        <Td>
                          <HStack>
                            <InputGroup size="sm" maxW="250px">
                              <Input
                                value={password}
                                type={isVisible ? 'text' : 'password'}
                                isReadOnly
                                fontFamily="mono"
                                fontSize="xs"
                              />
                              <InputRightElement>
                                <IconButton
                                  aria-label={isVisible ? 'Hide password' : 'Show password'}
                                  icon={isVisible ? <FaEyeSlash /> : <FaEye />}
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => togglePasswordVisibility(entry.id)}
                                />
                              </InputRightElement>
                            </InputGroup>
                            <IconButton
                              aria-label="Copy password"
                              icon={<FaCopy />}
                              size="xs"
                              variant="ghost"
                              colorScheme="green"
                              onClick={() => copyToClipboard(password, 'Password')}
                            />
                          </HStack>
                        </Td>
                        <Td>
                          <Badge colorScheme={entry.nonce === 0 ? 'gray' : 'orange'}>
                            v{entry.nonce}
                          </Badge>
                        </Td>
                        <Td>
                          <HStack spacing={1}>
                            <IconButton
                              aria-label="Rotate password"
                              icon={<FaSync />}
                              size="xs"
                              colorScheme="orange"
                              variant="ghost"
                              onClick={() => handleRotatePassword(entry.id)}
                              title="Generate new password (increment version)"
                            />
                            <IconButton
                              aria-label="Delete login"
                              icon={<FaTrash />}
                              size="xs"
                              colorScheme="red"
                              variant="ghost"
                              onClick={() => handleDeleteLogin(entry.id)}
                            />
                          </HStack>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>
          )}
        </VStack>
      </Box>
    </Stack>
  );
}
