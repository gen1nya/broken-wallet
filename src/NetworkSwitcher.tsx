import { Button, Menu, MenuButton, MenuList, MenuItem, HStack, Icon, Text } from '@chakra-ui/react';
import { FaChevronDown, FaBitcoin } from 'react-icons/fa';
import { SiLitecoin, SiDogecoin } from 'react-icons/si';
import { useNetwork, SUPPORTED_NETWORKS } from './NetworkContext';
import { NetworkSymbol } from './blockbookClient';

const NETWORK_ICONS: Record<NetworkSymbol, typeof FaBitcoin> = {
  btc: FaBitcoin,
  ltc: SiLitecoin,
  doge: SiDogecoin,
  dash: FaBitcoin, // Using Bitcoin icon as fallback for Dash
};

export default function NetworkSwitcher() {
  const { network, networkInfo, setNetwork } = useNetwork();
  const CurrentIcon = NETWORK_ICONS[network];

  return (
    <Menu>
      <MenuButton as={Button} rightIcon={<FaChevronDown />} leftIcon={<Icon as={CurrentIcon} />} variant="outline">
        {networkInfo.name}
      </MenuButton>
      <MenuList>
        {Object.entries(SUPPORTED_NETWORKS).map(([symbol, info]) => {
          const IconComponent = NETWORK_ICONS[symbol as NetworkSymbol];
          return (
            <MenuItem
              key={symbol}
              onClick={() => setNetwork(symbol as NetworkSymbol)}
              icon={<Icon as={IconComponent} />}
              isDisabled={network === symbol}
            >
              <HStack spacing={2}>
                <Text>{info.name}</Text>
                <Text fontSize="xs" color="gray.500">
                  ({info.ticker})
                </Text>
              </HStack>
            </MenuItem>
          );
        })}
      </MenuList>
    </Menu>
  );
}
