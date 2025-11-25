import React from 'react';
import ReactDOM from 'react-dom/client';
import { Buffer } from 'buffer';
import { ChakraProvider, ColorModeScript, extendTheme } from '@chakra-ui/react';
import App from './App';

// Ensure Buffer is available in the browser for bitcoinjs-lib usage
if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}

const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ChakraProvider theme={theme}>
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <App />
    </ChakraProvider>
  </React.StrictMode>,
);
