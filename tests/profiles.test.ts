import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAccounts, resolveProfile, saveAccounts } from '../src/lib/profiles.js';

const BAD_ENV_REF = /Profile "b".*NOPE/;
const UNKNOWN_REF = /Unknown profile "zzz"/;

describe('profiles', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env = {
      ...original,
      BIRD_ACCOUNTS_FILE: join(mkdtempSync(join(tmpdir(), 'bird-')), 'sub', 'accounts.json'),
    };
    for (const k of ['AUTH_TOKEN', 'CT0', 'TWITTER_AUTH_TOKEN', 'TWITTER_CT0', 'BIRD_PROFILE']) {
      delete process.env[k];
    }
  });
  afterEach(() => {
    process.env = original;
  });

  it('writes the store with 0600 file and 0700 dir, and round-trips', () => {
    saveAccounts({ default: 'a', profiles: { a: { authToken: 'tok', ct0: 'c' } } });
    const file = process.env.BIRD_ACCOUNTS_FILE as string;
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(file, '..')).mode & 0o777).toBe(0o700);
    expect(loadAccounts().default).toBe('a');
  });

  it('returns an empty store when missing', () => {
    expect(loadAccounts()).toEqual({ profiles: {} });
  });

  it('resolves literals and env: refs, and fails loudly with the profile name', () => {
    process.env.MY_TOK = ' from-env ';
    const accounts = {
      profiles: { a: { authToken: 'lit', ct0: 'env:MY_TOK' }, b: { authToken: 'env:NOPE', ct0: 'x' } },
    };
    expect(resolveProfile('a', accounts)).toEqual({ authToken: 'lit', ct0: 'from-env' });
    expect(() => resolveProfile('b', accounts)).toThrow(BAD_ENV_REF);
    expect(() => resolveProfile('zzz', accounts)).toThrow(UNKNOWN_REF);
  });
});

describe('resolveCredentials precedence', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = original;
  });

  it('cli > --profile > env > default profile', async () => {
    process.env = {
      ...original,
      BIRD_ACCOUNTS_FILE: join(mkdtempSync(join(tmpdir(), 'bird-')), 'a.json'),
      AUTH_TOKEN: 'envtok',
      CT0: 'envct',
    };
    saveAccounts({
      default: 'd',
      profiles: { d: { authToken: 'dtok', ct0: 'dct' }, p: { authToken: 'ptok', ct0: 'pct' } },
    });
    const { resolveCredentials } = await import('../src/lib/cookies.js');
    expect((await resolveCredentials({ authToken: 'cli', ct0: 'clict', profile: 'p' })).cookies.authToken).toBe('cli');
    expect((await resolveCredentials({ profile: 'p' })).cookies.source).toBe('profile "p"');
    expect((await resolveCredentials({})).cookies.authToken).toBe('envtok');
    delete process.env.AUTH_TOKEN;
    delete process.env.CT0;
    delete process.env.TWITTER_AUTH_TOKEN;
    delete process.env.TWITTER_CT0;
    expect((await resolveCredentials({})).cookies.source).toBe('profile "d"');
    saveAccounts({ default: 'bad', profiles: { bad: { authToken: 'env:NOPE', ct0: 'x' } } });
    const broken = await resolveCredentials({ cookieSource: [] });
    expect(broken.cookies.authToken).toBeNull();
    expect(broken.warnings[0]).toContain('Profile "bad"');
  });
});
