# Broken Wallet Server

Backend proxy server for Broken Wallet application. Handles NowNodes Blockbook API requests for multiple cryptocurrencies.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from example:
```bash
cp .env.example .env
```

3. Add your NowNodes API key to `.env`:
```
NOWNODES_API_KEY=your_key_here
```

## Development

```bash
npm run dev
```

Server will start on `http://localhost:3000`

## API Endpoints

### GET /health
Health check endpoint

### GET /api/networks
Get list of supported networks

### POST /api/:network/utxo
Fetch UTXOs for xpub/zpub/ypub

**Body:**
```json
{
  "xpub": "zpub...",
  "pageSize": 200
}
```

### POST /api/:network/broadcast
Broadcast signed transaction

**Body:**
```json
{
  "hex": "0200000001..."
}
```

### GET /api/:network/info
Get network information

## Supported Networks

- `btc` - Bitcoin (P2PKH, P2WPKH)
- `doge` - Dogecoin (P2PKH)
- `ltc` - Litecoin (P2PKH, P2WPKH)
- `dash` - Dash (P2PKH)

## Production

Build:
```bash
npm run build
```

Start:
```bash
npm start
```

## VPS Deployment

1. Copy server folder to VPS
2. Install dependencies: `npm install --production`
3. Build: `npm run build`
4. Set up `.env` with production values
5. Use PM2 or systemd to run: `npm start`

Example with PM2:
```bash
pm2 start dist/server.js --name broken-wallet-server
pm2 save
pm2 startup
```
