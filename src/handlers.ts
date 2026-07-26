import { Bot, InlineKeyboard } from 'grammy';
import { config } from './config.js';
import * as store from './store.js';

const VPN_BOT_LINK = 'https://t.me/HexaVeil_bot';

const staffGroupId = config.SUPPORT_STAFF_GROUP_ID;
const MAX_TOPIC_NAME = 128;

function userDisplayName(from: { first_name: string; last_name?: string; username?: string }): string {
  const name = from.last_name ? `${from.first_name} ${from.last_name}` : from.first_name;
  return from.username ? `${name} (@${from.username})` : name;
}

function topicName(from: { first_name: string; last_name?: string; username?: string }): string {
  const display = userDisplayName(from);
  return display.length <= MAX_TOPIC_NAME ? display : display.slice(0, MAX_TOPIC_NAME - 1) + '…';
}

async function notifyUser(bot: Bot, userId: number, text: string): Promise<void> {
  try {
    await bot.api.sendMessage(userId, text);
  } catch {
    // User may have blocked the bot — nothing we can do.
  }
}

async function sendToTopicOrRecreate(ctx: any, bot: Bot, userId: number, topicId: number): Promise<boolean> {
  try {
    await ctx.forwardMessage(staffGroupId, { message_thread_id: topicId });
    return true;
  } catch {
    // Topic may be closed — try reopen
    try {
      await bot.api.reopenForumTopic(staffGroupId, topicId);
      await ctx.forwardMessage(staffGroupId, { message_thread_id: topicId });
      return true;
    } catch {
      // Topic is deleted or unrecoverable — remove old mapping
      store.removeMapping(userId);
      return false;
    }
  }
}

async function createTopic(ctx: any, bot: Bot, userId: number): Promise<number> {
  const topic = await bot.api.createForumTopic(staffGroupId, topicName(ctx.from));
  const topicId = topic.message_thread_id;
  store.setMapping(userId, topicId);

  const info = [
    `🆕 Новое обращение`,
    `Имя: ${userDisplayName(ctx.from)}`,
    `ID: ${userId}`,
    ctx.from.username ? `Username: @${ctx.from.username}` : null,
    `Дата: ${new Date().toISOString()}`,
  ].filter(Boolean).join('\n');
  await bot.api.sendMessage(staffGroupId, info, { message_thread_id: topicId });

  return topicId;
}

export function registerHandlers(bot: Bot): void {
  // /start in private chat
  bot.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const keyboard = new InlineKeyboard().url('Вернуться в VPN Бот', VPN_BOT_LINK);

    await ctx.reply(
      'Здравствуйте! 👋\n\nНапишите ваш вопрос, и мы ответим вам в ближайшее время.',
      { reply_markup: keyboard }
    );
  });

  // Operator commands inside forum topics
  bot.command('close', async (ctx) => {
    if (ctx.chat.id !== staffGroupId || !ctx.msg.message_thread_id) return;
    const topicId = ctx.msg.message_thread_id;
    const userId = store.getUserId(topicId);
    try {
      await bot.api.closeForumTopic(staffGroupId, topicId);
    } catch {
      // topic may already be closed
    }
    await ctx.reply('✅ Тикет закрыт. Если у пользователя появятся вопросы — он просто напишет новое сообщение.');
    if (userId) {
      await notifyUser(bot, userId, '✅ Ваш тикет закрыт. Если остались вопросы — просто напишите новое сообщение.');
    }
  });

  bot.command('reopen', async (ctx) => {
    if (ctx.chat.id !== staffGroupId || !ctx.msg.message_thread_id) return;
    try {
      await bot.api.reopenForumTopic(staffGroupId, ctx.msg.message_thread_id);
      await ctx.reply('🔄 Тикет открыт.');
    } catch {
      await ctx.reply('❌ Не удалось открыть тикет. Возможно, он уже открыт.');
    }
  });

  bot.command('ban', async (ctx) => {
    if (ctx.chat.id !== staffGroupId || !ctx.msg.message_thread_id) return;
    const topicId = ctx.msg.message_thread_id;
    const userId = store.getUserId(topicId);
    if (!userId) {
      await ctx.reply('❌ Не удалось найти пользователя для этого тикета.');
      return;
    }
    store.ban(userId);
    try {
      await bot.api.closeForumTopic(staffGroupId, topicId);
    } catch {
      // topic may already be closed
    }
    await notifyUser(bot, userId, '🚫 Вы заблокированы в поддержке.');
    await ctx.reply(`🚫 Пользователь ${userId} заблокирован.`);
  });

  bot.command('unban', async (ctx) => {
    if (ctx.chat.id !== staffGroupId || !ctx.msg.message_thread_id) return;
    const userId = store.getUserId(ctx.msg.message_thread_id);
    if (!userId) {
      await ctx.reply('❌ Не удалось найти пользователя для этого тикета.');
      return;
    }
    if (!store.unban(userId)) {
      await ctx.reply('⚠️ Этот пользователь не заблокирован.');
      return;
    }
    await ctx.reply(`✅ Пользователь ${userId} разблокирован.`);
  });

  // User messages in private chat → forward to forum topic
  bot.on('message:text', async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const userId = ctx.from.id;
    if (store.isBanned(userId)) return;

    let topicId = store.getTopicId(userId);

    if (topicId === undefined) {
      // New user → create topic
      topicId = await createTopic(ctx, bot, userId);
    } else {
      // Existing user → try forwarding to existing topic
      const ok = await sendToTopicOrRecreate(ctx, bot, userId, topicId);
      if (!ok) {
        // Topic was deleted — notify user, then create new one
        await ctx.reply(
  '🔒 Предыдущий чат очищен по соображениям безопасности и конфиденциальности. Создан новый защищённый канал связи.\n\n' +
  'P.S. Мы не храним вашу переписку, ваши данные и пароли. Безопасность и конфиденциальность превыше всего.'
);
        topicId = await createTopic(ctx, bot, userId);
        await ctx.forwardMessage(staffGroupId, { message_thread_id: topicId });
      }
      return;
    }

    // First message from new user: forward and send info
    await ctx.forwardMessage(staffGroupId, { message_thread_id: topicId });
  });

  // Staff group: operator reply → user
  bot.on('message:text', async (ctx) => {
    if (ctx.chat.id !== staffGroupId || !ctx.msg.message_thread_id) return;

    // Ignore service messages
    if (ctx.msg.forum_topic_created || ctx.msg.forum_topic_closed || ctx.msg.forum_topic_reopened || ctx.msg.forum_topic_edited) return;
    // Ignore bot's own messages
    if (ctx.from?.id === bot.botInfo.id) return;
    // Ignore commands (already handled above)
    if (ctx.msg.text?.startsWith('/')) return;

    const userId = store.getUserId(ctx.msg.message_thread_id);
    if (!userId) return;

    try {
      await ctx.copyMessage(userId);
    } catch {
      await ctx.reply('⚠️ Пользователь недоступен (удалил чат или заблокировал бота). Ответ не доставлен.', {
        message_thread_id: ctx.msg.message_thread_id,
      });
    }
  });
}
