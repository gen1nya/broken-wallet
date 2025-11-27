# Security Considerations

This document outlines the security measures implemented in Broken Wallet and known limitations.

## 🔒 Implemented Protections

### 1. XSS (Cross-Site Scripting) Protection

**React Automatic Escaping**
- All user input is automatically escaped by React
- No `dangerouslySetInnerHTML` or `eval()` usage
- TypeScript prevents common injection patterns

**Content Security Policy (CSP)**
- Meta-tag CSP restricts script execution
- Prevents inline script injection
- Limits resource loading to trusted sources
- Note: Dev mode requires `unsafe-inline`/`unsafe-eval` for Vite HMR

**Best Practices**
- No inline event handlers (`onclick`, etc.)
- No dynamic code execution
- Strict typing prevents injection bugs

### 2. Cryptographic Security

**Encryption (AES-256-GCM)**
- Industry-standard authenticated encryption
- 256-bit keys for maximum security
- GCM mode provides both confidentiality and integrity
- Prevents tampering with encrypted data

**Key Derivation (PBKDF2)**
- 100,000 iterations (OWASP recommended minimum)
- SHA-256 hash function
- 16-byte random salt per wallet
- Makes brute-force attacks computationally expensive

**Randomness**
- Uses `crypto.getRandomValues()` (CSPRNG)
- Random IV (12 bytes) per encryption operation
- Prevents rainbow table attacks

### 3. Storage Security

**localStorage Encryption**
- Mnemonics never stored in plaintext
- Each wallet has unique salt and encryption key
- Password never stored or transmitted

**In-Memory Security**
- Mnemonics cleared from memory on lock
- No password caching
- UTXOs and transactions cleared on lock

## ⚠️ Known Limitations

### 1. Browser-Based Threats

**XSS via Dependencies (Supply Chain)**
- CSP cannot prevent malicious code in npm packages
- Mitigation: Use well-audited dependencies, regular updates
- User responsibility: Keep browser extensions minimal

**Memory Dumps**
- Decrypted mnemonics exist in memory while unlocked
- XSS or malicious extensions could read memory
- Mitigation: Lock wallet when not in use

**localStorage Access**
- Any script running in the same origin can read localStorage
- Encrypted data is safe, but XSS could wait for decryption
- Mitigation: CSP prevents unauthorized script execution

### 2. User-Controlled Risks

**Weak Passwords** ❌
- Short or common passwords can be brute-forced
- 8-character minimum is enforced, but not sufficient
- **Recommendation**: Use 16+ character passwords with mixed case, numbers, symbols

**Keyloggers** ❌
- Cannot protect against OS-level malware
- User responsibility: Keep OS and antivirus updated

**Phishing** ❌
- Users could be tricked into revealing passwords
- No technical solution exists
- User responsibility: Verify URLs, use bookmarks

**Physical Access** ❌
- Anyone with physical access can attempt brute-force
- localStorage encryption provides time-based defense
- User responsibility: Lock computer when away

### 3. Network Security

**TLS/HTTPS**
- Development uses HTTP (localhost only)
- **Production**: Must deploy with HTTPS/TLS
- Backend API must use HTTPS in production

**API Key Exposure**
- Backend proxies NowNodes API to hide keys
- Keys stored in `.env` (not committed to git)
- Production: Use environment variables, never hardcode

## 🎯 Security Recommendations

### For Users

1. **Strong Passwords**: Use 16+ characters with mixed case, numbers, symbols
2. **Lock When Idle**: Always lock wallet when not actively using
3. **Clean System**: Keep OS, browser, and antivirus updated
4. **Minimal Extensions**: Only install trusted browser extensions
5. **Verify URLs**: Bookmark the application, verify before entering passwords
6. **Backup Mnemonics**: Write down mnemonics on paper, store securely offline

### For Developers

1. **Dependency Audits**: Run `npm audit` regularly
2. **CSP Hardening**: For production, remove `unsafe-inline` and `unsafe-eval`
3. **HTTPS Only**: Deploy with valid TLS certificates
4. **Secure Headers**: Add `X-Content-Type-Options`, `X-Frame-Options`, etc.
5. **Rate Limiting**: Backend already has rate limiting (100 req/min)
6. **No Logging**: Never log mnemonics, passwords, or private keys

## 📋 Production Hardening Checklist

- [ ] Remove `unsafe-inline` and `unsafe-eval` from CSP
- [ ] Enable HTTPS/TLS with valid certificates
- [ ] Set `Secure` and `HttpOnly` flags on any cookies (if added)
- [ ] Add security headers: `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`
- [ ] Use environment variables for all secrets
- [ ] Implement proper CORS configuration
- [ ] Enable backend logging for security events (excluding sensitive data)
- [ ] Set up monitoring for suspicious activity

## 🚨 Threat Model Summary

| Threat | Mitigated? | How |
|--------|-----------|-----|
| XSS via user input | ✅ Yes | React auto-escaping, CSP |
| XSS via dependencies | ⚠️ Partial | CSP, dependency audits |
| Weak passwords | ⚠️ Partial | PBKDF2, 8-char minimum (user choice) |
| Keyloggers | ❌ No | User responsibility |
| Malware | ❌ No | User responsibility |
| Phishing | ❌ No | User responsibility |
| Network MitM | ⚠️ Partial | HTTPS required in production |
| localStorage theft | ✅ Yes | AES-256-GCM encryption |
| Brute force | ⚠️ Partial | PBKDF2 slows attacks (depends on password) |

## 💡 Educational Purpose

**This is an educational wallet**. For production use with real funds:
- Consider hardware wallets (Ledger, Trezor)
- Use established software wallets (Electrum, BlueWallet)
- Implement multi-signature schemes
- Use cold storage for large amounts

---

**Last Updated**: 2025-11-27
