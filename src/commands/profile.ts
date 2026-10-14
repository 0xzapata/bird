import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { loadAccounts, maskValue, saveAccounts } from '../lib/profiles.js';

function fail(ctx: CliContext, message: string): never {
  console.error(`${ctx.p('err')}${message}`);
  process.exit(1);
}

export function registerProfileCommand(program: Command, ctx: CliContext): void {
  const profile = program
    .command('profile')
    .description('Manage named account profiles (stored in ~/.config/bird/accounts.json)');

  profile
    .command('add <name>')
    .description('Add or replace a profile; values may be literals, op://vault/item/field, or env:NAME')
    .option('--from-env', 'Store the current AUTH_TOKEN and CT0 environment variables')
    .action((name: string, cmdOpts: { fromEnv?: boolean }) => {
      // --auth-token / --ct0 are the global options.
      const opts = program.opts();
      const authToken = cmdOpts.fromEnv ? process.env.AUTH_TOKEN : opts.authToken;
      const ct0 = cmdOpts.fromEnv ? process.env.CT0 : opts.ct0;
      if (!authToken || !ct0) {
        fail(ctx, 'Need both --auth-token and --ct0 (or --from-env with AUTH_TOKEN and CT0 set)');
      }
      const accounts = loadAccounts();
      accounts.profiles[name] = { authToken: authToken.trim(), ct0: ct0.trim() };
      accounts.default ??= name;
      saveAccounts(accounts);
      console.log(`${ctx.p('ok')}Saved profile "${name}"${accounts.default === name ? ' (default)' : ''}`);
    });

  profile
    .command('list')
    .description('List profiles')
    .action(() => {
      const accounts = loadAccounts();
      const names = Object.keys(accounts.profiles);
      if (names.length === 0) {
        console.log(`${ctx.p('info')}No profiles. Add one: bird profile add <name> --auth-token … --ct0 …`);
        return;
      }
      for (const name of names) {
        console.log(`${name === accounts.default ? '*' : ' '} ${name}`);
      }
    });

  profile
    .command('use <name>')
    .description('Set the default profile')
    .action((name: string) => {
      const accounts = loadAccounts();
      if (!accounts.profiles[name]) {
        fail(ctx, `Unknown profile "${name}"`);
      }
      accounts.default = name;
      saveAccounts(accounts);
      console.log(`${ctx.p('ok')}Default profile: ${name}`);
    });

  profile
    .command('remove <name>')
    .description('Remove a profile')
    .action((name: string) => {
      const accounts = loadAccounts();
      if (!accounts.profiles[name]) {
        fail(ctx, `Unknown profile "${name}"`);
      }
      delete accounts.profiles[name];
      if (accounts.default === name) {
        delete accounts.default;
      }
      saveAccounts(accounts);
      console.log(`${ctx.p('ok')}Removed profile "${name}"`);
    });

  profile
    .command('show [name]')
    .description('Show a profile (secrets masked; references are not resolved)')
    .action((name?: string) => {
      const accounts = loadAccounts();
      const target = name ?? accounts.default;
      const entry = target ? accounts.profiles[target] : undefined;
      if (!target || !entry) {
        fail(ctx, target ? `Unknown profile "${target}"` : 'No default profile');
      }
      console.log(`${target}${target === accounts.default ? ' (default)' : ''}`);
      console.log(`  auth_token: ${maskValue(entry.authToken)}`);
      console.log(`  ct0: ${maskValue(entry.ct0)}`);
    });
}
