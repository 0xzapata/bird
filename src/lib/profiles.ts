import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** A stored value: a literal, `op://vault/item/field` (1Password), or `env:NAME`. */
export interface Profile {
  authToken: string;
  ct0: string;
}

export interface Accounts {
  default?: string;
  profiles: Record<string, Profile>;
}

export function accountsPath(): string {
  return process.env.BIRD_ACCOUNTS_FILE || join(homedir(), '.config', 'bird', 'accounts.json');
}

export function loadAccounts(): Accounts {
  let raw: string;
  try {
    raw = readFileSync(accountsPath(), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { profiles: {} };
    }
    throw error;
  }
  const parsed = JSON.parse(raw) as Partial<Accounts>;
  return { default: parsed.default, profiles: parsed.profiles ?? {} };
}

// ponytail: plain 0600 file, atomic rename. Upgrade path: keychain/encrypted store behind these two functions.
export function saveAccounts(accounts: Accounts): void {
  const path = accountsPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(accounts, null, 2)}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}

export function resolveRef(value: string): string {
  if (value.startsWith('op://')) {
    return execFileSync('op', ['read', value], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  }
  if (value.startsWith('env:')) {
    const name = value.slice(4);
    const resolved = process.env[name];
    if (!resolved) {
      throw new Error(`environment variable ${name} is not set`);
    }
    return resolved.trim();
  }
  return value.trim();
}

/** Resolves a profile's references. Throws with the profile name on any failure (no silent fallback). */
export function resolveProfile(name: string, accounts: Accounts = loadAccounts()): Profile {
  const profile = accounts.profiles[name];
  if (!profile) {
    throw new Error(`Unknown profile "${name}". Run: bird profile list`);
  }
  try {
    return { authToken: resolveRef(profile.authToken), ct0: resolveRef(profile.ct0) };
  } catch (error) {
    throw new Error(`Profile "${name}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function maskValue(value: string): string {
  return value.startsWith('op://') || value.startsWith('env:') ? value : `${value.slice(0, 6)}...`;
}
