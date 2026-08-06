import { OpenAI } from "openai";
import { Context } from "grammy";
import { SYSTEM_PROMPT } from "../config/index.js";
import {
  getHistory,
  getMessageByMsgId,
  getUserModel,
} from "../db/index.js";
import { executeWithFallback } from "./provider.service.js";

export function getThreadId(ctx: Context): string {
  if (!ctx.chat) return "";
  const chatId = ctx.chat.id.toString();
  const threadId = ctx.message?.message_thread_id;
  return threadId ? `${chatId}_${threadId}` : chatId;
}

export async function generateChatResponse(
  ctx: Context,
  userMessageText: string
): Promise<string> {
  const threadId = getThreadId(ctx);
  const userChatId = ctx.chat?.id.toString() || "";
  const model = getUserModel(userChatId);
  const isGroup = ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";

  const senderName =
    [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") ||
    ctx.from?.username ||
    "Пользователь";

  let messages: OpenAI.ChatCompletionMessageParam[] = [];

  if (!isGroup) {
    // === ЛИЧНЫЙ ЧАТ: Полноценная история сообщения за сообщением ===
    const history = getHistory(threadId, 10);
    messages = [
      {
        role: "system",
        content: `${SYSTEM_PROMPT}\n\nСобеседник: ${senderName}.`,
      },
      ...history.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user", content: userMessageText },
    ];
  } else {
    // === ГРУППОВОЙ ЧАТ: Решение 1 (Reply Chain) + Решение 3 (Forum Threads) ===
    let groupSystemPrompt =
      SYSTEM_PROMPT +
      `\n\nТы в групповом чате Telegram. Твоим ТЕКУЩИМ собеседником является ТОЛЬКО ${senderName}. ` +
      `Если в истории присутствуют сообщения других пользователей (в формате [Имя]), используй их ИСКЛЮЧИТЕЛЬНО как фоновый контекст для понимания вопроса. ` +
      `НЕ отвечай авторам предыдущих сообщений и НЕ обращаясь к ним. Отвечай СТРОГО пользователю ${senderName}!`;

    const replyMsg = ctx.message?.reply_to_message;

    if (!replyMsg) {
      // Вариант А: Запрос БЕЗ Reply. Отвечаем строго на текущий вопрос, не затягивая прошлые темы
      messages = [
        { role: "system", content: groupSystemPrompt },
        { role: "user", content: `[${senderName}]: ${userMessageText}` },
      ];
    } else {
      // Вариант Б: Запрос С Reply. Собираем точечную цепочку реплаев (Reply Chain)
      const chain: OpenAI.ChatCompletionMessageParam[] = [];
      let currentReply: any = replyMsg;
      let depth = 0;

      while (currentReply && depth < 5) {
        const replyAuthor =
          currentReply.from?.first_name ||
          currentReply.from?.username ||
          "Пользователь";
        const replyText =
          currentReply.text || currentReply.caption || "[Медиа сообщение]";
        const isBotReply =
          currentReply.from?.is_bot &&
          currentReply.from.username === ctx.me?.username;

        // Пытаемся также найти запись в базе данных по msg_id
        const dbMsg = getMessageByMsgId(threadId, currentReply.message_id);

        if (isBotReply || (dbMsg && dbMsg.role === "assistant")) {
          chain.unshift({
            role: "assistant",
            content: dbMsg ? dbMsg.content : replyText,
          });
        } else {
          chain.unshift({
            role: "user",
            content: `[${replyAuthor}]: ${dbMsg ? dbMsg.content : replyText}`,
          });
        }

        // Переходим выше по цепочке reply_to_message, если она есть
        currentReply = currentReply.reply_to_message;
        depth++;
      }

      messages = [
        { role: "system", content: groupSystemPrompt },
        ...chain,
        { role: "user", content: `[${senderName}]: ${userMessageText}` },
      ];
    }
  }

  return await executeWithFallback(async (client, _provider, getEffectiveModel) => {
    const effectiveModel = getEffectiveModel(model);
    const response = await client.chat.completions.create({
      model: effectiveModel,
      messages: messages,
    });
    return response.choices[0]?.message?.content || "Пустой ответ.";
  });
}

