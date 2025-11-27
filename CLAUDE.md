# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Broken Wallet is an experimental web-based Bitcoin wallet playground built with React, Vite, TypeScript, and Chakra UI. It demonstrates Bitcoin key management, address derivation (BIP84 native segwit), UTXO tracking, and transaction building/signing without rolling custom cryptography.

## Development Commands

### Frontend
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production (type-checks first)
npm run build

# Preview production build
npm run preview

# Lint codebase
npm run lint
```

### Backend (server/)
```bash
cd server

# Install dependencies
npm install

# Start development server (port 3001)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

**Important**: Both frontend (port 5173) and backend (port 3001) must be running during development.

## Architecture

### Core Bitcoin Operations (src/bitcoin.ts)

Handles BIP84 wallet derivation using `@scure/bip39` and `@scure/bip32`:
- Derives account xpub from mnemonic at path `m/84'/0'/0'`
- Converts account xpub to zpub format (native segwit)
- Generates receive (chain 0) and change (chain 1) addresses
- All addresses are p2wpkh (native segwit, bech32-encoded starting with "bc1")

Key exports: `deriveWalletFromMnemonic()`, `createRandomMnemonic()`

### Transaction Building (src/transactionBuilder.ts)

Builds and signs PSBTs using `bitcoinjs-lib` and `@noble/secp256k1`:
- **PSBT Signing**: Uses `@noble/secp256k1` with custom HMAC configuration (required for browser environments)
- **Input Support**: Currently only p2wpkh (native segwit) inputs are supported for signing
- **Output Support**: Handles both p2wpkh and p2pkh outputs
- **Fee Calculation**: Estimates transaction vsize and calculates fees based on user-specified sat/vB rate
- **Change Handling**: Automatically creates change output if specified, otherwise allows "sweep" transactions

Key function: `buildSignedTransaction()` - returns signed hex, txid, fee details, and effective fee rate

### External API (src/blockbookClient.ts)

Interfaces with NowNodes' Blockbook API:
- **UTXO Lookup**: Fetches UTXOs by zpub (account-level) at `https://btcbook.nownodes.io/api/v2/utxo/{zpub}`
- **Broadcasting**: Sends raw transaction hex via POST to `/api/v2/tx/send`
- **Proxying**: Development server proxies `/nownodes` → `https://btcbook.nownodes.io` to avoid CORS
- **API Keys**: Optional `api-key` header can be passed to avoid rate limits

### Wallet Storage (src/walletStorage.ts)

Secure persistent storage for mnemonics using Web Crypto API:
- **Encryption**: AES-256-GCM (authenticated encryption)
- **Key Derivation**: PBKDF2 with SHA-256 (100,000 iterations)
- **Storage Format**: Versioned JSON in localStorage with unique salt/IV per wallet
- **Security**: Passwords never stored, mnemonics encrypted at rest

Key functions: `encryptWallet()`, `decryptWallet()`, `saveWallet()`, `deleteWallet()`, `listWallets()`

Storage structure:
```typescript
{
  version: 1,
  wallets: {
    "wallet-id": {
      name: "My Wallet",
      createdAt: "2025-11-27T...",
      crypto: {
        cipher: "aes-256-gcm",
        kdf: "pbkdf2",
        kdfParams: { iterations: 100000, hash: "SHA-256", salt: "hex" },
        iv: "hex",
        ciphertext: "hex"
      }
    }
  }
}
```

### UI Components

**WalletUnlockView.tsx** - Authentication and wallet management:
- **Import/Create**: Mnemonic input with generate random option
- **Temporary Mode**: In-memory wallet (lost on refresh)
- **Encrypted Storage**: Save with password-protected encryption
- **Wallet List**: Displays all saved wallets with unlock/delete actions
- **Security Badges**: Shows encryption method (AES-256, PBKDF2)

**App.tsx** - Main layout with wallet lock/unlock flow:
- **Lock State**: Shows `WalletUnlockView` when locked
- **Unlocked State**: Two tabs (Wallet and Transaction builder)
- **Lock Button**: Clears all wallet data from memory
- **Wallet Name**: Displays current wallet name in header (if saved)
1. **Wallet tab**: Mnemonic management, zpub display, address derivation table, UTXO viewer
2. **Transaction builder tab**: Rendered by `TransactionBuilderView.tsx`

**TransactionBuilderView.tsx** - Complete transaction building interface:
- **Coin Control**: Checkbox selection of UTXOs to spend
- **Output Builder**: Dynamic rows for adding multiple outputs (address + BTC amount)
- **Change Address**: Defaults to first change address, user-editable
- **Fee Rate**: User-specified sat/vB rate
- **Build Preview**: Shows vsize, fee, effective fee rate, inputs/outputs flow, and raw hex
- **Broadcasting**: Direct broadcast via NowNodes Blockbook

### Browser Polyfills (src/polyfills.ts)

Sets up global `Buffer` for Node.js crypto libraries (`bitcoinjs-lib`, `@scure/*`) to work in browser environments. Must be imported first in `main.tsx`.

### Noble Secp256k1 Configuration

The `@noble/secp256k1` library requires explicit HMAC configuration for browser builds. This is handled in `transactionBuilder.ts:15-22` by wiring `@noble/hashes/hmac` with `sha256` to `secp256k1.etc.hmacSha256Sync/Async`. Without this configuration, PSBT signing will fail in the browser.

## Important Patterns

### Address Derivation Paths
- Account level: `m/84'/0'/0'`
- Receive addresses: `m/84'/0'/0'/0/{index}`
- Change addresses: `m/84'/0'/0'/1/{index}`

### UTXO Selection and Signing
When building transactions, each UTXO must have a derivation path (either from API response or local address map). The transaction builder:
1. Derives the private key for each input from the mnemonic + path
2. Creates a PSBT signer with the private key
3. Adds `witnessUtxo` and `bip32Derivation` metadata to each input
4. Signs all inputs sequentially
5. Finalizes and extracts the signed transaction

### Change-Only Transactions
The transaction builder supports "sweep" or change-only transactions where no destination outputs are specified. In this case, all selected UTXO value (minus fees) goes to the change address. This requires a change address to be specified.

## Backend API (server/)

The app uses a Node.js/Express backend to proxy NowNodes Blockbook API requests. This keeps API keys secure and adds rate limiting.

### Backend Architecture
- **Location**: `/server` directory
- **Tech Stack**: Express + TypeScript
- **Port**: 3001 (development)
- **Endpoints**:
  - `GET /health` - Health check
  - `GET /api/networks` - List supported networks (BTC, DOGE, LTC, DASH)
  - `POST /api/:network/utxo` - Fetch UTXOs (body: `{ xpub, pageSize }`)
  - `POST /api/:network/broadcast` - Broadcast transaction (body: `{ hex }`)
  - `GET /api/:network/info` - Network info

### Network Support
The backend supports multiple BTC-like cryptocurrencies:
- **Bitcoin** (btc): P2PKH (legacy) and P2WPKH (native segwit)
- **Dogecoin** (doge): P2PKH only
- **Litecoin** (ltc): P2PKH and P2WPKH
- **Dash** (dash): P2PKH only

Network configs are in `server/src/config/networks.ts`.

### Security
- API keys stored in `server/.env` (not in git)
- CORS configured for frontend origin only
- Rate limiting: 100 requests/minute per IP
- Frontend calls backend instead of NowNodes directly

### Development vs Production
- **Development**: Frontend calls `http://localhost:3001/api`
- **Production**: Frontend calls `/api` (backend should serve on same domain or use reverse proxy)

## Security Considerations

### Cryptographic Security
- **Mnemonics**: Generated client-side using `@scure/bip39`, never transmitted
- **Private Keys**: Derived in-memory only for signing, cleared on lock
- **Storage Encryption**: AES-256-GCM with PBKDF2 key derivation (100k iterations)
- **Randomness**: Uses `crypto.getRandomValues()` for salts and IVs
- **Libraries**: All crypto uses vetted libraries (`@scure/*`, `@noble/*`, `bitcoinjs-lib`)

### XSS Protection
- **React Auto-Escaping**: All user input automatically escaped
- **Content Security Policy**: Meta-tag CSP in `index.html` restricts script execution
  - Dev mode: Allows `unsafe-inline`/`unsafe-eval` for Vite HMR
  - Production: Should use strict CSP via HTTP headers (see `index.prod.html`)
- **No Dangerous Patterns**: No `dangerouslySetInnerHTML`, `eval()`, or inline handlers
- **TypeScript**: Strict typing prevents common injection bugs

### Known Limitations
- **Supply Chain XSS**: CSP cannot prevent malicious npm packages
- **Browser Extensions**: Malicious extensions can read memory/localStorage
- **Weak Passwords**: User-chosen passwords can be brute-forced (8-char minimum enforced)
- **System Malware**: Keyloggers and OS-level attacks cannot be prevented
- **Physical Access**: localStorage encryption provides time-based defense only

See `SECURITY.md` for detailed threat model and hardening recommendations.

### Production Deployment
- **HTTPS Required**: Use valid TLS certificates
- **Strict CSP**: Remove `unsafe-inline`/`unsafe-eval` from CSP
- **Security Headers**: Add `X-Frame-Options`, `Strict-Transport-Security`, etc.
- **Environment Variables**: Never hardcode secrets in source code
- **Dependency Audits**: Run `npm audit` regularly

This is an educational/experimental wallet - not intended for production use with real funds.
