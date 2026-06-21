const fs = require('fs');
const path = require('path');

function loadEnv() {
  const env = {};
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const match = line.trim().match(/^([^#=]+)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim();
      }
    }
  }
  return env;
}

const env = loadEnv();
const botToken = env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error('Error: TELEGRAM_BOT_TOKEN not found in .env.local');
  process.exit(1);
}

// Get Vercel URL from arguments
const vercelUrl = process.argv[2];

if (!vercelUrl) {
  console.error('Error: Please provide your production Vercel URL.');
  console.log('Usage: node scripts/register-webhook.js https://your-app.vercel.app');
  process.exit(1);
}

// Clean URL
const cleanUrl = vercelUrl.replace(/\/$/, '');
const webhookUrl = `${cleanUrl}/api/telegram/webhook`;

console.log(`Registering webhook: ${webhookUrl}...`);

fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${webhookUrl}`)
  .then(res => res.json())
  .then(data => {
    if (data.ok) {
      console.log('Success! Webhook successfully registered with Telegram:', data);
    } else {
      console.error('Error registering webhook:', data);
    }
  })
  .catch(err => {
    console.error('Connection error:', err);
  });
