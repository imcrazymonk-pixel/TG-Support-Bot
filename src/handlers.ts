import { Bot, InlineKeyboard } from 'grammy';
import { config } from './config.js';
import * as store from './store.js';

const VPN_BOT_LINK = 'https://t.me/HexaVeil_bot';
const INACTIVITY_DAYS = 7;

const staffGroupId = config.SUPPORT_STAFF_GROUP_ID;
const MAX_TOPIC_NAME = 128;

// ── Spam protection ──
const SPAM_WINDOW_MS = 20_000;      // 20 seconds
const SPAM_LIMIT = 10;              // messages
const SPAM_MUTE_MS = 60_000;        // 60 seconds
const userMsgTimestamps = new Map<number, number[]>();
const userMutedUntil = new Map<number, number>();

function checkSpam(userId: number): { allowed: boolean; remainingSec?: number } {
  // Check if currently muted
  const mutedUntil = userMutedUntil.get(userId);
  if (mutedUntil && Date.now() < mutedUntil) {
    const remaining = Math.ceil((mutedUntil - Date.now()) / 1000);
    return { allowed: false, remainingSec: remaining };
  }

  // Clean old timestamps
  const now = Date.now();
  const cutoff = now - SPAM_WINDOW_MS;
  let timestamps = userMsgTimestamps.get(userId) || [];
  timestamps = timestamps.filter((t) => t > cutoff);

  // Add current message
  timestamps.push(now);
  userMsgTimestamps.set(userId, timestamps);

  // Check limit
  if (timestamps.length > SPAM_LIMIT) {
    userMutedUntil.set(userId, now + SPAM_MUTE_MS);
    userMsgTimestamps.delete(userId);
    return { allowed: false, remainingSec: 60 };
  }

  return { allowed: true };
}
// ─────────────────────

function userDisplayName(from: { first_name: string; last_name?: string; username?: string }): string {
  const name = from.last_name ? `${from.first_name} ${from.last_name}` : from.first_name;
  return from.username ? `${name} (@${from.username})` : name;
}

function topicName(from: { first_name: string; last_name?: string; username?: string }): string {
  const display = userDisplayName(from);
  return display.length <= MAX_TOPIC_NAME ? display : display.slice(0, MAX_TOPIC_NAME - 1) + '…';
}

const HELP_TEXT =
  'Доступные вам команды:\n\n' +
  '  📝 Просто отправьте сообщение — и мы создадим обращение\n' +
  '  🆔 /myid — показать ваш Telegram ID\n' +
  '  🔙 /start — показать это сообщение снова\n' +
  '\nВы также можете отправлять фото, файлы и другие медиа.';

const PRIVACY_CLEANUP_MSG =
  '🔒 Предыдущий чат очищен по соображениям безопасности и конфиденциальности. Создан новый защищённый канал связи.\n\n' +
  'P.S. Мы не храним вашу переписку, ваши данные и пароли. Безопасность и конфиденциальность превыше всего.';

async function notifyUser(bot: Bot, userId: number, text: string): Promise<void> {
  try {
    await bot.api.sendMessage(userId, text);
  } catch {
    // User may have blocked the bot — nothing we can do.
  }
}

function isUserContent(msg: any): boolean {
  return !!(
    msg.text ||
    msg.photo ||
    msg.document ||
    msg.video ||
    msg.audio ||
    msg.voice ||
    msg.sticker ||
    msg.animation ||
    msg.video_note
  );
}

async function sendToTopicOrRecreate(ctx: any, bot: Bot, userId: number, topicId: number): Promise<boolean> {
  try {
    await ctx.forwardMessage(staffGroupId, { message_thread_id: topicId });
    store.updateLastActivity(topicId);
    return true;
  } catch {
    // Topic may be closed — try reopen
    try {
      await bot.api.reopenForumTopic(staffGroupId, topicId);
      await ctx.forwardMessage(staffGroupId, { message_thread_id: topicId });
      store.updateLastActivity(topicId);
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

async function cleanupTopic(bot: Bot, topicId: number, userId: number): Promise<void> {
  store.clearPendingCleanup(topicId);

  // Notify the user
  await notifyUser(bot, userId, PRIVACY_CLEANUP_MSG);

  // Close and remove the topic
  try {
    await bot.api.closeForumTopic(staffGroupId, topicId);
  } catch {
    // may already be closed
  }
  store.removeMapping(userId);
}

export function startInactivityChecker(bot: Bot): void {
  const CHECK_INTERVAL_MS = 60 * 60 * 1000; // every hour

  async function check(): Promise<void> {
    try {
      const inactive = store.getInactiveTopicIds(INACTIVITY_DAYS);
      for (const { topicId, userId } of inactive) {
        if (store.isPendingCleanup(topicId)) continue;

        const keyboard = new InlineKeyboard().text('🧹 Очистить чат', `cleanup:${topicId}`);
        await bot.api.sendMessage(staffGroupId, `⚠️ Чат неактивен более ${INACTIVITY_DAYS} дней. Рекомендуется очистка.`, {
          message_thread_id: topicId,
          reply_markup: keyboard,
        });
        store.markPendingCleanup(topicId);
      }
    } catch (err) {
      console.error('Inactivity checker error:', err);
    }
  }

  // Run immediately on start, then every hour
  setTimeout(check, 30_000); // first check after 30s (give bot time to connect)
  setInterval(check, CHECK_INTERVAL_MS);
  console.log(`Inactivity checker started: ${INACTIVITY_DAYS} days, check every hour`);
}

export function registerHandlers(bot: Bot): void {
  // /start in private chat
  bot.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const keyboard = InlineKeyboard.from([
      [{ text: '❌ Завершить чат', callback_data: 'close_mychat' }],
      [{ text: 'Вернуться в VPN Бот', url: VPN_BOT_LINK }],
    ]);

    await ctx.reply(
      `Добро пожаловать в поддержку! 👋\n\n${HELP_TEXT}`,
      { reply_markup: keyboard }
    );
  });

  // /myid — show user's Telegram ID
  bot.command('myid', async (ctx) => {
    if (ctx.chat.type !== 'private' || !ctx.from) return;
    await ctx.reply(`🆔 Ваш Telegram ID: \`${ctx.from.id}\``, { parse_mode: 'Markdown' });
  });

  // Close own chat (from /start button)
  bot.callbackQuery('close_mychat', async (ctx) => {
    const userId = ctx.from.id;
    const topicId = store.getTopicId(userId);
    if (topicId === undefined) {
      await ctx.answerCallbackQuery({ text: '❌ У вас нет активного чата.' });
      return;
    }

    try {
      await bot.api.closeForumTopic(staffGroupId, topicId);
    } catch {
      // may already be closed
    }
    await notifyUser(bot, userId, '✅ Ваше обращение закрыто. Если нужна будет помощь — просто напишите нам.');
    await ctx.editMessageText('✅ Чат завершён.');
    await ctx.answerCallbackQuery();
  });

  // Cleanup callback from inactivity warning
  bot.callbackQuery(/^cleanup:(\d+)$/, async (ctx) => {
    const topicId = Number(ctx.match[1]);
    const userId = store.getUserId(topicId);
    if (!userId) {
      await ctx.answerCallbackQuery({ text: '❌ Пользователь не найден.' });
      return;
    }

    await cleanupTopic(bot, topicId, userId);
    await ctx.editMessageText('✅ Чат очищен. Пользователь уведомлён.');
    await ctx.answerCallbackQuery();
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
    await ctx.reply('✅ Тикет закрыт. Пользователь уведомлён.');
    if (userId) {
      await notifyUser(bot, userId, '✅ Ваше обращение закрыто. Если нужна будет помощь — просто напишите нам, и мы откроем новый чат.');
    }
  });

  bot.command('reopen', async (ctx) => {
    if (ctx.chat.id !== staffGroupId || !ctx.msg.message_thread_id) return;
    try {
      await bot.api.reopenForumTopic(staffGroupId, ctx.msg.message_thread_id);
      await ctx.reply('🔄 Тикет открыт.');
    } catch {
      await ctx.reply('❌ Не удалось открыть — тикет уже открыт или был удалён.');
    }
  });

  bot.command('ban', async (ctx) => {
    if (ctx.chat.id !== staffGroupId || !ctx.msg.message_thread_id) return;
    const topicId = ctx.msg.message_thread_id;
    const userId = store.getUserId(topicId);
    if (!userId) {
      await ctx.reply('❌ Пользователь не найден. Возможно, тикет создан не через бота.');
      return;
    }
    store.ban(userId);
    try {
      await bot.api.closeForumTopic(staffGroupId, topicId);
    } catch {
      // topic may already be closed
    }
    await notifyUser(bot, userId, '🚫 Вам ограничен доступ в поддержку. Если считаете, что это ошибка — обратитесь в другой канал связи.');
    await ctx.reply(`🚫 Пользователь ${userId} заблокирован. Тикет закрыт.`);
  });

  bot.command('unban', async (ctx) => {
    if (ctx.chat.id !== staffGroupId || !ctx.msg.message_thread_id) return;
    const userId = store.getUserId(ctx.msg.message_thread_id);
    if (!userId) {
      await ctx.reply('❌ Пользователь не найден. Возможно, тикет создан не через бота.');
      return;
    }
    if (!store.unban(userId)) {
      await ctx.reply('⚠️ Этот пользователь не в бане.');
      return;
    }
    await ctx.reply(`✅ Пользователь ${userId} разблокирован. Он снова может писать в поддержку.`);
  });

  // ────── User messages → forward to staff (all types: text, photo, file, etc.) ──────
  bot.on('message', async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    // Ignore service messages (topic created, user joined, etc.)
    if (!isUserContent(ctx.msg)) return;
    // Ignore commands (handled by .command() handlers above)
    if (ctx.msg.text?.startsWith('/')) return;

    const userId = ctx.from.id;
    if (store.isBanned(userId)) return;

    // Spam check
    const spam = checkSpam(userId);
    if (!spam.allowed) {
      await ctx.reply(`⏳ Вы превысили лимит сообщений. Подождите ${spam.remainingSec} секунд.`);
      return;
    }

    let topicId = store.getTopicId(userId);

    if (topicId === undefined) {
      // New user → create topic
      topicId = await createTopic(ctx, bot, userId);
    } else {
      // Existing user → try forwarding to existing topic
      const ok = await sendToTopicOrRecreate(ctx, bot, userId, topicId);
      if (!ok) {
        // Topic was deleted — notify user, then create new one
        await ctx.reply(PRIVACY_CLEANUP_MSG);
        topicId = await createTopic(ctx, bot, userId);
        await ctx.forwardMessage(staffGroupId, { message_thread_id: topicId });
      }
      return;
    }

    // First message from new user: forward and send info
    await ctx.forwardMessage(staffGroupId, { message_thread_id: topicId });
  });

  // ────── Staff group: operator reply → user ──────
  bot.on('message', async (ctx) => {
    if (ctx.chat.id !== staffGroupId || !ctx.msg.message_thread_id) return;

    // Ignore service messages
    if (ctx.msg.forum_topic_created || ctx.msg.forum_topic_closed || ctx.msg.forum_topic_reopened || ctx.msg.forum_topic_edited) return;
    // Ignore bot's own messages
    if (ctx.from?.id === bot.botInfo.id) return;
    // Ignore commands (already handled above)
    if (ctx.msg.text?.startsWith('/')) return;

    const topicId = ctx.msg.message_thread_id;
    const userId = store.getUserId(topicId);
    if (!userId) return;

    try {
      await ctx.copyMessage(userId);
      store.updateLastActivity(topicId);
    } catch {
      await ctx.reply('⚠️ Пользователь недоступен. Возможно, он удалил чат или заблокировал бота. Ответ не доставлен.', {
        message_thread_id: topicId,
      });
    }
  });
}
