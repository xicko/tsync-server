/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable prettier/prettier */
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import input from 'input';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
const apiHash = process.env.TELEGRAM_API_HASH || '';
const phoneNumber = process.env.TELEGRAM_PHONE_NUMBER || '';

(async () => {
  if (!apiId || !apiHash || !phoneNumber) {
    console.error(
      'Please fill TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_PHONE_NUMBER in .env',
    );
    process.exit(1);
  }

  console.log('Starting Telegram session generation...');
  const stringSession = new StringSession(''); // Start with an empty session
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => phoneNumber,
    password: async () => await input.text('Please enter your password (if 2FA enabled): '),
    phoneCode: async () => await input.text('Please enter the code you received: '),
    onError: (err) => console.log(err),
  });

  console.log('You are now connected.');
  const sessionString = client.session.save() as unknown as string;
  console.log('--- YOUR SESSION STRING ---');
  console.log(sessionString);
  console.log('---------------------------');
  console.log(
    'Copy the string above and paste it into TELEGRAM_SESSION in your .env file.',
  );
  
  await client.disconnect();
  process.exit(0);
})();
