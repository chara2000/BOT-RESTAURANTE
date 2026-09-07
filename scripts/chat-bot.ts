/**
 * Interactive Terminal Chat with Shek Food Agentic AI
 *
 * Test the agent directly from the terminal without needing WhatsApp/YCloud!
 * Run: npx tsx --env-file=.env.local scripts/chat-bot.ts
 */

import readline from 'readline';
import { AgentOrchestrator } from '../src/ai/agent/agent.orchestrator';
import { ConversationService } from '../src/conversations/conversation.service';

const TENANT_ID = 'ecc2c874-ed2d-4991-864f-215e443db324'; // Shek House
const PHONE = `+57311${Math.floor(1000000 + Math.random() * 9000000)}`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.clear();
console.log('================================================================');
console.log('🍟 SHEK FOOD — CHAT AGENTIC AI (SIMULADOR TERMINAL)');
console.log('================================================================');
console.log(`Inquilino: Shek House | Sesión ID: ${PHONE}`);
console.log('Escribe tus mensajes como si estuvieras en WhatsApp.');
console.log('Escribe "reiniciar" para vaciar el carrito o "salir" para terminar.\n');

async function promptUser() {
  rl.question('\n👤 Tú: ', async (input) => {
    const text = input.trim();
    if (!text) {
      promptUser();
      return;
    }

    if (text.toLowerCase() === 'salir' || text.toLowerCase() === 'exit') {
      console.log('\n👋 ¡Hasta pronto!');
      rl.close();
      process.exit(0);
    }

    if (text.toLowerCase() === 'reiniciar' || text.toLowerCase() === 'reset') {
      await ConversationService.resetConversation(TENANT_ID, PHONE);
      console.log('🔄 Sesión y carrito reiniciados.');
      promptUser();
      return;
    }

    try {
      console.log('⏳ ShekBot escribiendo...');
      const response = await AgentOrchestrator.processMessage(
        TENANT_ID,
        PHONE,
        text,
        'Cliente Terminal'
      );
      console.log(`\n🤖 ShekBot:\n${response.text}`);
    } catch (err) {
      console.error('❌ Error:', (err as Error).message);
    }

    promptUser();
  });
}

promptUser();
