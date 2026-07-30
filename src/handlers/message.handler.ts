import { Context } from "grammy";
import { getThreadId, generateChatResponse } from "../services/ai.service.js";
import {
  getChat,
  addMessage,
  getUserModel,
  setUserModel,
} from "../db/index.js";
import { PAID_MODELS } from "../config/index.js";
import { generateImage, sendGeneratedImage } from "../services/image.service.js";
import { sendLongMessage } from "../utils/text.js";
import { formatAIResponseToHTML } from "../utils/html.js";
import { getMainKeyboard } from "../keyboards/main.js";
import {
  handleStart,
  handleHelp,
  handleClear,
  handleHistory,
  handleModel,
  handleFreeModels,
  handleCurrentModel,
  handlePrice,
} from "./command.handler.js";

export function shouldReply(ctx: Context): boolean {
  if (!ctx.chat) return false;

  const chatType = ctx.chat.type;
  const text = ctx.message?.text || ctx.message?.caption || "";

  if (chatType === "private") return true;

  if (chatType === "group" || chatType === "supergroup") {
    if (text.startsWith("/")) return true;

    const botUsername = ctx.me?.username || "parf_universal_ai_bot";
    if (text.includes(`@${botUsername}`)) return true;

    if (ctx.message?.reply_to_message?.from?.is_bot) return true;

    return false;
  }

  return true;
}

export function extractCommand(text: string): string {
  if (!text.startsWith("/")) return "";
  let cmd = text.slice(1).toLowerCase();
  const atIndex = cmd.indexOf("@");
  if (atIndex !== -1) {
    cmd = cmd.substring(0, atIndex);
  }
  cmd = cmd.split(" ")[0].trim();
  return cmd;
}

export async function handleTextMessage(ctx: Context) {
  if (!shouldReply(ctx)) return;
  if (!ctx.message?.text) return;

  const threadId = getThreadId(ctx);
  const userChatId = ctx.chat?.id.toString() || "";
  const userMessage = ctx.message.text;
  const userName = ctx.from?.first_name || ctx.from?.username || "User";

  if (ctx.chat) {
    getChat(threadId, ctx.chat.type, ctx.chat.title || undefined);
  }

  // Сохраняем сообщение пользователя в БД (включая msg_id для точности Reply Chain)
  addMessage(threadId, "user", userMessage, ctx.message.message_id, userName);

  // === ОБРАБОТКА МЕНЮ КНОПОК ===
  switch (userMessage) {
    case "💬 Чат":
      await ctx.reply(
        `💬 <b>Режим чата</b>\n\nПросто пиши текст — я отвечу и запомню контекст.\n\nТекущая модель: <code>${getUserModel(userChatId)}</code>`,
        { parse_mode: "HTML" }
      );
      return;

    case "🖼 Фото":
      await ctx.reply(
        "🖼 <b>Работа с фото</b>\n\nОтправь фото с подписью:\n• 'Что на фото?' — описание\n• 'Улучши' — создам улучшенную версию",
        { parse_mode: "HTML" }
      );
      return;

    case "🎨 Imagine":
      await ctx.reply(
        "🎨 <b>Генерация картинки</b>\n\nНапиши: <code>/imagine [описание]</code>\n\nПример: <code>/imagine кот в космосе</code>",
        { parse_mode: "HTML" }
      );
      return;

    case "🎤 Голос":
      await ctx.reply(
        "🎤 <b>Голосовые сообщения</b>\n\nОтправь мне голосовое сообщение — я расшифрую текст и отвечу.",
        { parse_mode: "HTML" }
      );
      return;

    case "🤖 Модель":
      await handleModel(ctx, userChatId);
      return;

    case "🗑 Очистить":
      await handleClear(ctx, threadId);
      return;

    case "📊 Статистика":
    case "Статистика":
      await ctx.reply("🔄 <b>Меню обновлено!</b>", {
        parse_mode: "HTML",
        reply_markup: getMainKeyboard(),
      });
      return;

    case "ℹ️ Помощь":
      await handleHelp(ctx);
      return;
  }

  // === ОБРАБОТКА КОМАНД ===
  const cmd = extractCommand(userMessage);

  if (cmd === "start" || cmd === "menu") {
    await handleStart(ctx);
    return;
  }
  if (cmd === "help") {
    await handleHelp(ctx);
    return;
  }
  if (cmd === "clear") {
    await handleClear(ctx, threadId);
    return;
  }
  if (cmd === "history") {
    await handleHistory(ctx, threadId);
    return;
  }
  if (cmd === "model") {
    await handleModel(ctx, userChatId);
    return;
  }
  if (cmd === "freemodels") {
    await handleFreeModels(ctx);
    return;
  }
  if (cmd === "current") {
    await handleCurrentModel(ctx, userChatId);
    return;
  }
  if (cmd === "price") {
    await handlePrice(ctx);
    return;
  }

  if (PAID_MODELS[cmd]) {
    setUserModel(userChatId, PAID_MODELS[cmd].model);
    await ctx.reply(
      `${PAID_MODELS[cmd].emoji || "✅"} Выбрана модель: <b>${PAID_MODELS[cmd].name}</b>\n<code>${PAID_MODELS[cmd].model}</code>`,
      { parse_mode: "HTML" }
    );
    return;
  }

  if (cmd === "setmodel") {
    const parts = userMessage.split(" ");
    if (parts.length > 1) {
      const modelId = parts.slice(1).join(" ").trim();
      setUserModel(userChatId, modelId);
      await ctx.reply(`✅ Установлена модель: <code>${modelId}</code>`, {
        parse_mode: "HTML",
      });
      return;
    }
  }

  if (cmd === "imagine") {
    const prompt = userMessage.replace(/\/imagine(@\w+)?\s*/i, "").trim();
    if (!prompt) {
      await ctx.reply("🎨 Использование: <code>/imagine [описание]</code>", {
        parse_mode: "HTML",
      });
      return;
    }
    try {
      await ctx.reply("🎨 Генерирую изображение...");
      const result = await generateImage(prompt);
      if (result) {
        const sent = await sendGeneratedImage(ctx, result);
        if (sent) {
          addMessage(threadId, "assistant", "Сгенерировал изображение");
        }
      } else {
        await ctx.reply("❌ Не удалось сгенерировать картинку.");
      }
    } catch (error: any) {
      console.error("Ошибка imagine:", error.message);
      await ctx.reply(`⚠️ Ошибка: ${error.message}`);
    }
    return;
  }

  // === ОБЫЧНЫЙ ЧАТ С ИИ ===
  await ctx.replyWithChatAction("typing");

  try {
    const replyText = await generateChatResponse(ctx, userMessage);

    // Безопасное отправление с HTML-разметкой и автоэкранированием
    const formattedHTML = formatAIResponseToHTML(replyText);
    const sentMsg = await sendLongMessage(ctx, formattedHTML, { parse_mode: "HTML" });

    // Добавляем ответ бота в базу с сохраненным msg_id
    addMessage(threadId, "assistant", replyText);
  } catch (error: any) {
    console.error("Ошибка при ответе ИИ:", error.message);
    await ctx.reply("⚠️ Произошла ошибка при обращении к ИИ. Попробуй ещё раз.");
  }
}
