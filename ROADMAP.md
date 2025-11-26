# Development Roadmap

## Phase 1: Backend Infrastructure ✅ COMPLETED

- [x] Create Express + TypeScript backend in `/server`
- [x] NowNodes API proxy with multi-currency support
- [x] Network configurations for BTC, DOGE, LTC, DASH
- [x] CORS and rate limiting middleware
- [x] Update frontend to use backend API
- [x] Documentation and deployment guides

**Status**: Backend is fully functional and ready for VPS deployment.

## Phase 2: Testing Infrastructure (NEXT)

Priority: High - Tests are crucial before adding more features

- [ ] Setup Vitest for both frontend and backend
- [ ] Write unit tests for key derivation (BIP39/BIP32/BIP44/BIP84)
- [ ] Write tests for P2WPKH transaction signing
- [ ] Write tests for transaction building and fee calculation
- [ ] Add test vectors from known wallets (Electrum, etc.)

**Why first**: Ensure existing Bitcoin functionality is solid before expanding.

## Phase 3: Multi-Network Support

- [ ] Refactor `bitcoin.ts` into universal `walletCore.ts`
- [ ] Support multiple networks in UI (network selector dropdown)
- [ ] Add P2PKH (legacy) address derivation for all networks
- [ ] Update transaction builder for P2PKH inputs/outputs
- [ ] Write tests for each network (DOGE, LTC, DASH)

**Deliverables**:
- Single interface for deriving addresses across networks
- UI to switch between BTC/DOGE/LTC/DASH
- Support for both legacy and segwit address types (where applicable)

## Phase 4: Secure Storage

### 4.1: Basic Encryption (localStorage + password)
- [ ] Implement AES-256-GCM encryption utilities
- [ ] Add PBKDF2 key derivation from user password
- [ ] Create secure storage wrapper for localStorage
- [ ] UI for wallet creation with password
- [ ] UI for wallet unlock with password

### 4.2: WebAuthn/Passkey Integration
- [ ] Implement WebAuthn registration flow
- [ ] Implement WebAuthn authentication flow
- [ ] Combine with password encryption (two-factor approach)
- [ ] UI for passkey registration and authentication
- [ ] Fallback to password-only if passkey not available

**Security Model**:
```
User Password + Passkey → Unlock → Decrypt Mnemonic → Derive Keys
```

## Phase 5: UI/UX Polish

- [ ] Network selector in header
- [ ] Address type toggle (Legacy/Segwit) per network
- [ ] Wallet lock/unlock states
- [ ] Transaction history view (via Blockbook)
- [ ] QR code generation for addresses
- [ ] Mobile responsive improvements

## Phase 6: Advanced Features (Optional)

- [ ] Multi-signature support
- [ ] Hardware wallet integration (Ledger/Trezor)
- [ ] Testnet support for all networks
- [ ] Custom fee estimation (low/medium/high presets)
- [ ] Address book
- [ ] Transaction labeling

## Future Considerations

- [ ] Refactor into monorepo with `/shared` folder for common types
- [ ] Add backend caching layer (Redis) for UTXO lookups
- [ ] Implement websocket for real-time balance updates
- [ ] Add more cryptocurrencies (Bitcoin Cash, Zcash, etc.)

---

## Current Focus: Phase 2 (Testing)

Before proceeding with multi-network support and new features, we need a solid test suite to ensure:
1. Correct key derivation across all BIP standards
2. Valid transaction signatures
3. Accurate fee calculations
4. No regressions when adding new features

### Suggested Test Structure

```
src/__tests__/
  crypto/
    keyDerivation.test.ts     # BIP39, BIP32, BIP44, BIP84
    encryption.test.ts        # AES-256-GCM (Phase 4)
  bitcoin/
    addresses.test.ts         # P2PKH and P2WPKH derivation
    signing.test.ts           # Transaction signing
  transaction/
    builder.test.ts           # PSBT building
    fees.test.ts              # Fee estimation
  networks/
    multiNetwork.test.ts      # Cross-network tests (Phase 3)
```

### Test Vectors to Use

- **BIP39**: Use official test vectors from the BIP
- **Addresses**: Compare against Electrum-generated addresses
- **Signatures**: Use pre-built transactions from blockchain explorers
- **Networks**: Use testnet for live testing

---

**Next Steps**: Set up Vitest and begin writing tests for Phase 2.
