# VPS Deployment Guide

## Prerequisites

- Node.js 18+ installed on VPS
- PM2 for process management: `npm install -g pm2`
- Nginx for reverse proxy (optional but recommended)

## Deployment Steps

### 1. Copy files to VPS

```bash
# From local machine
scp -r server/ user@your-vps:/var/www/broken-wallet/

# Or use git
ssh user@your-vps
cd /var/www/broken-wallet
git pull origin main
```

### 2. Install dependencies and build

```bash
cd /var/www/broken-wallet/server
npm install --production
npm run build
```

### 3. Configure environment

Create `.env` file:
```bash
PORT=3001
NODE_ENV=production
NOWNODES_API_KEY=your_actual_key_here
FRONTEND_URL=https://your-domain.com
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### 4. Start with PM2

```bash
# Start the server
pm2 start dist/server.js --name broken-wallet-api

# Save PM2 config
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions from the command output

# Check status
pm2 status
pm2 logs broken-wallet-api
```

### 5. Nginx Reverse Proxy (Recommended)

Create `/etc/nginx/sites-available/broken-wallet`:

```nginx
# Backend API
server {
    listen 80;
    server_name api.your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}

# Frontend (if serving static files)
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/broken-wallet/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls to backend
    location /api {
        proxy_pass http://localhost:3001/api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/broken-wallet /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. SSL with Let's Encrypt (Recommended)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d api.your-domain.com
```

## Monitoring

```bash
# View logs
pm2 logs broken-wallet-api

# Monitor resources
pm2 monit

# Restart server
pm2 restart broken-wallet-api

# Stop server
pm2 stop broken-wallet-api
```

## Updates

```bash
cd /var/www/broken-wallet/server
git pull origin main
npm install --production
npm run build
pm2 restart broken-wallet-api
```

## Frontend Production Build

Update `src/blockbookClient.ts` to use production API:
```typescript
const API_BASE = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api';
```

This way, in production the frontend will call `/api` which Nginx will proxy to the backend.

Build frontend:
```bash
npm run build
# Copy dist/ folder to VPS
scp -r dist/ user@your-vps:/var/www/broken-wallet/
```
