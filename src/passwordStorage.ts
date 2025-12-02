/**
 * Password Manager Storage
 *
 * Stores login entries (but NOT passwords) in localStorage.
 * Passwords are derived on-demand from the mnemonic + login.
 *
 * Storage structure:
 * {
 *   version: 1,
 *   wallets: {
 *     "wallet-id": {
 *       logins: [
 *         {
 *           id: "unique-id",
 *           login: "user@example.com",
 *           service: "Gmail",
 *           notes: "Optional notes",
 *           createdAt: "2025-11-27T...",
 *           updatedAt: "2025-11-27T..."
 *         }
 *       ]
 *     }
 *   }
 * }
 */

const STORAGE_KEY = 'broken-wallet-passwords';
const STORAGE_VERSION = 1;

export interface LoginEntry {
  id: string;
  login: string;
  service?: string;
  notes?: string;
  nonce: number; // Password version/nonce for rotation (0 = initial)
  createdAt: string;
  updatedAt: string;
}

interface PasswordStorage {
  version: number;
  wallets: {
    [walletId: string]: {
      logins: LoginEntry[];
    };
  };
}

function getStorage(): PasswordStorage {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return {
      version: STORAGE_VERSION,
      wallets: {},
    };
  }

  try {
    return JSON.parse(stored);
  } catch {
    return {
      version: STORAGE_VERSION,
      wallets: {},
    };
  }
}

function saveStorage(storage: PasswordStorage): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
}

export function getLoginsForWallet(walletId: string): LoginEntry[] {
  const storage = getStorage();
  return storage.wallets[walletId]?.logins || [];
}

export function addLogin(
  walletId: string,
  login: string,
  service?: string,
  notes?: string,
  nonce: number = 0
): LoginEntry {
  const storage = getStorage();

  if (!storage.wallets[walletId]) {
    storage.wallets[walletId] = { logins: [] };
  }

  const now = new Date().toISOString();
  const entry: LoginEntry = {
    id: crypto.randomUUID(),
    login,
    service,
    notes,
    nonce,
    createdAt: now,
    updatedAt: now,
  };

  storage.wallets[walletId].logins.push(entry);
  saveStorage(storage);

  return entry;
}

export function updateLogin(
  walletId: string,
  loginId: string,
  updates: Partial<Pick<LoginEntry, 'login' | 'service' | 'notes' | 'nonce'>>
): LoginEntry | null {
  const storage = getStorage();
  const walletLogins = storage.wallets[walletId]?.logins;

  if (!walletLogins) {
    return null;
  }

  const entry = walletLogins.find((l) => l.id === loginId);
  if (!entry) {
    return null;
  }

  Object.assign(entry, updates, { updatedAt: new Date().toISOString() });
  saveStorage(storage);

  return entry;
}

export function deleteLogin(walletId: string, loginId: string): boolean {
  const storage = getStorage();
  const walletLogins = storage.wallets[walletId]?.logins;

  if (!walletLogins) {
    return false;
  }

  const index = walletLogins.findIndex((l) => l.id === loginId);
  if (index === -1) {
    return false;
  }

  walletLogins.splice(index, 1);
  saveStorage(storage);

  return true;
}

export function exportLoginsJSON(walletId: string): string {
  const logins = getLoginsForWallet(walletId);
  return JSON.stringify(logins, null, 2);
}

export function importLoginsJSON(
  walletId: string,
  json: string
): { imported: number; skipped: number; errors: string[] } {
  const storage = getStorage();

  if (!storage.wallets[walletId]) {
    storage.wallets[walletId] = { logins: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { imported: 0, skipped: 0, errors: ['Invalid JSON format'] };
  }

  if (!Array.isArray(parsed)) {
    return { imported: 0, skipped: 0, errors: ['JSON must be an array of login entries'] };
  }

  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  const existingLogins = new Set(
    storage.wallets[walletId].logins.map((l) => l.login)
  );

  for (const item of parsed) {
    if (typeof item !== 'object' || !item || !('login' in item)) {
      errors.push(`Invalid entry: missing 'login' field`);
      skipped++;
      continue;
    }

    const login = String(item.login);

    if (existingLogins.has(login)) {
      skipped++;
      continue;
    }

    const now = new Date().toISOString();
    const entry: LoginEntry = {
      id: crypto.randomUUID(),
      login,
      service: typeof item.service === 'string' ? item.service : undefined,
      notes: typeof item.notes === 'string' ? item.notes : undefined,
      nonce: typeof item.nonce === 'number' ? item.nonce : 0,
      createdAt: now,
      updatedAt: now,
    };

    storage.wallets[walletId].logins.push(entry);
    existingLogins.add(login);
    imported++;
  }

  saveStorage(storage);

  return { imported, skipped, errors };
}

export function clearLoginsForWallet(walletId: string): void {
  const storage = getStorage();
  if (storage.wallets[walletId]) {
    delete storage.wallets[walletId];
    saveStorage(storage);
  }
}
