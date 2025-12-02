# Broken Wallet

Experimental web-based wallet playground built with React, Vite, TypeScript, and Chakra UI. Demonstrates Bitcoin key management, address derivation (BIP84 native segwit), UTXO tracking, and transaction building/signing without rolling custom cryptography.

## Features

### Bitcoin Wallet
- ✅ BIP84 native segwit (P2WPKH) and legacy P2PKH support
- ✅ Multi-currency support (BTC, DOGE, LTC, DASH)
- ✅ UTXO tracking and transaction history
- ✅ Transaction builder with coin control and fee estimation
- ✅ Encrypted wallet storage (AES-256-GCM + PBKDF2)

### Password Manager
- ✅ Deterministic password generation from mnemonic
- ✅ BIP32 key derivation (m/128'/0'/{index})
- ✅ Password rotation with nonce/version support
- ✅ Import/export login entries to JSON
- ✅ No passwords stored - regenerated on demand

### Backend API
- ✅ Secure proxy for NowNodes Blockbook
- ✅ API key protection and rate limiting
- ✅ CORS configuration for production

## Project Structure

```
broken-wallet/
├── src/              # Frontend (React + Vite)
├── server/           # Backend API (Express + TypeScript)
└── CLAUDE.md         # Architecture documentation
```

## Getting Started

### Frontend Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the dev server:
   ```bash
   npm run dev
   ```

Frontend will run on `http://localhost:5173`

### Backend Setup

1. Navigate to server directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` from example:
   ```bash
   cp .env.example .env
   ```

4. Add your NowNodes API key to `.env`:
   ```
   NOWNODES_API_KEY=your_key_here
   ```

5. Start backend server:
   ```bash
   npm run dev
   ```

Backend will run on `http://localhost:3001`

**Important**: Both frontend and backend must be running for the app to work.

## Scripts

### Frontend
- `npm run dev` – start the Vite development server
- `npm run build` – type-check and build for production
- `npm run preview` – preview the production build locally
- `npm run lint` – run ESLint

### Backend
- `npm run dev` – start development server with hot reload
- `npm run build` – compile TypeScript to JavaScript
- `npm start` – run production build
- `npm run lint` – run ESLint

## Architecture

The app uses a **backend proxy** to keep NowNodes API keys secure:
- Frontend calls backend at `/api` endpoints
- Backend proxies requests to NowNodes Blockbook
- Supports multiple networks: BTC, DOGE, LTC, DASH
- Rate limiting and CORS protection included

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation.

## Deployment

See [server/deploy.md](./server/deploy.md) for VPS deployment instructions using PM2 and Nginx.

## Security Considerations

- Mnemonics are generated client-side and never transmitted
- Private keys exist in memory only during signing
- API keys secured on backend
- All crypto operations use vetted libraries (@scure/*, @noble/*, bitcoinjs-lib)
- **This is experimental software - not recommended for real funds**
