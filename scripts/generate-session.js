/**
 * Generate MTProto USER session string for Guardy Bot.
 * Run ONCE: node scripts/generate-session.js
 * Then copy the printed session string to .env as TELEGRAM_SESSION=<string>
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');

const API_ID = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
const API_HASH = process.env.TELEGRAM_API_HASH || '';

if (!API_ID || !API_HASH) {
  console.error('ERROR: Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env first.');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

(async () => {
  console.log('\n=== Guardy MTProto Session Generator ===\n');
  console.log('You will login with YOUR OWN Telegram account (not the bot).');
  console.log('This gives the bot ability to delete messages older than 48 hours.\n');

  const session = new StringSession('');
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 3,
    useWSS: true,
  });

  await client.start({
    phoneNumber: async () => {
      const phone = await ask('Enter your phone number (e.g. +998901234567): ');
      return phone.trim();
    },
    password: async () => {
      const pw = await ask('Enter 2FA password (leave empty if none): ');
      return pw.trim();
    },
    phoneCode: async () => {
      const code = await ask('Enter the verification code sent to your Telegram: ');
      return code.trim();
    },
    onError: (err) => {
      console.error('Auth error:', err.message);
    },
  });

  const sessionStr = client.session.save();
  console.log('\n=== SUCCESS! ===\n');
  console.log('Add this to your .env file:\n');
  console.log('TELEGRAM_SESSION=' + sessionStr);
  console.log('\nAlso add to server: echo "TELEGRAM_SESSION=' + sessionStr + '" >> /var/www/guardy/.env');

  await client.disconnect();
  rl.close();
  process.exit(0);
})().catch((err) => {
  console.error('Fatal error:', err);
  rl.close();
  process.exit(1);
});