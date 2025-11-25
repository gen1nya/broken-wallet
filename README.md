# Broken Wallet

Experimental web-based wallet playground built with React, Vite, TypeScript, and Chakra UI. The goal is to demo key management and signing flows without rolling custom cryptography (we will rely on vetted libraries like `ethers`).

The UI now previews a native-segwit Bitcoin account derived from a generated mnemonic (BIP84 `m/84'/0'/0'`). It shows the account `xpub`, a handful of receive/change addresses, and can query UTXOs for that account using NowNodes' Blockbook API.

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the dev server:
   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` – start the Vite development server.
- `npm run build` – type-check and build for production.
- `npm run preview` – preview the production build locally.
- `npm run lint` – run ESLint with the flat configuration.

## NowNodes Blockbook lookups

UTXO lookups use the publicly reachable Blockbook endpoint at `https://btcbook.nownodes.io/api/v2`. During `npm run dev`, calls are proxied through Vite to avoid browser CORS limits. You can optionally provide an `api-key` header (exposed in the UI) if you have a NowNodes key to avoid rate limits. The lookup uses the derived account `xpub` and displays UTXO metadata plus the derivation path and address when available.
