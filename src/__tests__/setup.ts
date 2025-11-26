// Test setup file

// Make sure Buffer is available globally for crypto tests
import { Buffer } from 'buffer';
if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}
