import { createBot } from './bot.js';
import * as store from './store.js';
import { startInactivityChecker } from './handlers.js';

const bot = createBot();
store.load();
startInactivityChecker(bot);

bot.start({ onStart: () => console.log('Support bot started') });

process.on('SIGTERM', () => bot.stop());
process.on('SIGINT', () => bot.stop());
