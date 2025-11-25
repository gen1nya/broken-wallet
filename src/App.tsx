import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  HStack,
  Icon,
  Input,
  InputGroup,
  InputLeftAddon,
  Stack,
  Text,
  Textarea,
  useColorMode,
  useColorModeValue,
} from '@chakra-ui/react';
import { FaMoon, FaSun, FaWallet } from 'react-icons/fa';

function ColorModeToggle() {
  const { colorMode, toggleColorMode } = useColorMode();
  const label = colorMode === 'light' ? 'Switch to dark mode' : 'Switch to light mode';

  return (
    <Button onClick={toggleColorMode} variant="ghost" aria-label={label} leftIcon={<Icon as={colorMode === 'light' ? FaMoon : FaSun} />}>
      {colorMode === 'light' ? 'Dark' : 'Light'}
    </Button>
  );
}

function App() {
  const panelBg = useColorModeValue('gray.50', 'gray.800');
  const accent = useColorModeValue('purple.600', 'purple.300');

  return (
    <Container maxW="4xl" py={12}>
      <Flex justify="space-between" align="center" mb={10}>
        <HStack spacing={3}>
          <Icon as={FaWallet} boxSize={8} color={accent} />
          <Heading size="lg">Broken Wallet</Heading>
        </HStack>
        <ColorModeToggle />
      </Flex>

      <Stack spacing={8}>
        <Box p={6} rounded="lg" bg={panelBg} shadow="md">
          <Stack spacing={3} mb={6}>
            <Heading size="md">Wallet seed</Heading>
            <Text color="gray.500">We will load a demo seed phrase for signing once wiring is complete.</Text>
          </Stack>
          <Textarea placeholder="Seed phrase will appear here" isReadOnly rows={3} />
        </Box>

        <Box p={6} rounded="lg" bg={panelBg} shadow="md">
          <Stack spacing={4}>
            <Heading size="md">Send transaction</Heading>
            <InputGroup>
              <InputLeftAddon>To</InputLeftAddon>
              <Input placeholder="0xrecipient" />
            </InputGroup>
            <InputGroup>
              <InputLeftAddon>Amount</InputLeftAddon>
              <Input placeholder="0.1" />
            </InputGroup>
            <Button colorScheme="purple" alignSelf="flex-start">Send</Button>
          </Stack>
        </Box>

        <Box p={6} rounded="lg" bg={panelBg} shadow="md">
          <Stack spacing={4}>
            <Heading size="md">Console</Heading>
            <Textarea placeholder="Awaiting blockchain connection..." isReadOnly rows={4} />
          </Stack>
        </Box>
      </Stack>
    </Container>
  );
}

export default App;
