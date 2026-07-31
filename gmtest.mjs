import { Composer } from 'grammy';

const bot = new Composer();
const order = [];

bot.on('message', async (ctx) => {
  order.push('first-ran');
  return;
});

bot.on('message', async (ctx) => {
  order.push('second-ran');
});

const update = {
  update_id: 1,
  message: { message_id: 1, chat: { id: -100, type: 'supergroup' }, message_thread_id: 5, text: 'hello', from: { id: 111 } }
};
const ctx = { update, chat: { id: -100, type: 'supergroup' }, msg: { message_thread_id: 5, text: 'hello' } };

await bot.middleware()(ctx, async () => { order.push('next-called'); });
console.log('RESULT:', order.join(', '));
