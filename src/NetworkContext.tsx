import { createContext, useContext, useState, ReactNode } from 'react';
import { NetworkSymbol } from './blockbookClient';

export interface NetworkInfo {
  symbol: NetworkSymbol;
  name: string;
  ticker: string;
  coinType: number;
  bech32Prefix?: string;
  supportsSegwit: boolean;
}

export const SUPPORTED_NETWORKS: Record<NetworkSymbol, NetworkInfo> = {
  btc: {
    symbol: 'btc',
    name: 'Bitcoin',
    ticker: 'BTC',
    coinType: 0,
    bech32Prefix: 'bc',
    supportsSegwit: true,
  },
  ltc: {
    symbol: 'ltc',
    name: 'Litecoin',
    ticker: 'LTC',
    coinType: 2,
    bech32Prefix: 'ltc',
    supportsSegwit: true,
  },
  doge: {
    symbol: 'doge',
    name: 'Dogecoin',
    ticker: 'DOGE',
    coinType: 3,
    supportsSegwit: false,
  },
  dash: {
    symbol: 'dash',
    name: 'Dash',
    ticker: 'DASH',
    coinType: 5,
    supportsSegwit: false,
  },
};

interface NetworkContextType {
  network: NetworkSymbol;
  networkInfo: NetworkInfo;
  setNetwork: (network: NetworkSymbol) => void;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<NetworkSymbol>('btc');

  const value: NetworkContextType = {
    network,
    networkInfo: SUPPORTED_NETWORKS[network],
    setNetwork,
  };

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (context === undefined) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}
