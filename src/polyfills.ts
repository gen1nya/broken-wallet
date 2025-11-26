import { Buffer } from 'buffer';

// Ensure Buffer is available globally before any bitcoinjs-lib modules execute
if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}
