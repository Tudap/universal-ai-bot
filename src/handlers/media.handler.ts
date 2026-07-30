import { Context } from "grammy";
import { getThreadId } from "../services/ai.service.js";
import { getChat } from "../db/index.js";
import { analyzePhoto, enhancePhoto } from "../services/vision.service.js";
import { sendGeneratedImage } from "../services/image.service.js";
import { transcribeVoice } from "../services/whisper.service.js";
import { generateChatResponse } from "../services/ai.service.js";
import { sendLongMessage } from "../utils/text.js";
import { formatAIResponseToHTML } from "../utils/html.js";
import { CONFIG } from "../config/index.js";

export async function handlePhoto(ctx: Context, shouldReplyCheck: (ctx: Context) => boolean) {
  if (!shouldReplyCheck(ctx)) return;

  const threadId = getThreadId(ctx);
  if (ctx.chat) {
    getChat(threadId, ctx.chat.type, ctx.chat.title || undefined);
  }

  await ctx.replyWithChatAction("typing");

  try {
    const file = await ctx.getFile();
    const fileUrl = `https://api.telegram.org/file/bot${CONFIG.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const caption = ctx.message?.caption || "";

    if (
      caption.toLowerCase().includes("улучши") ||
      caption.toLowerCase().includes("фотореализм")
    ) {
      await ctx.reply("🎨 Генерирую улучшенную версию...");
      const result = await enhancePhoto(fileUrl, caption);
      if (result) {
        await sendGeneratedImage(ctx, result);
      } else {
        await ctx.reply("❌ Не удалось сгенерировать улучшенное фото.");
      }
    } else {
      const answer = await analyzePhoto(fileUrl, caption);
      await sendLongMessage(ctx, formatAIResponseToHTML(answer), { parse_mode: "HTML" });
    }
  } catch (error: any) {
    console.error("Ошибка обработки фото:", error.message);
    await ctx.reply("⚠️ Не удалось обработать фото.");
  }
}

export async function handleVoice(ctx: Context, shouldReplyCheck: (ctx: Context) => boolean) {
  if (!shouldReplyCheck(ctx)) return;

  const threadId = getThreadId(ctx);
  if (ctx.chat) {
    getChat(threadId, ctx.chat.type, ctx.chat.title || undefined);
  }

  await ctx.replyWithChatAction("typing");

  try {
    const file = await ctx.getFile();
    const fileUrl = `https://api.telegram.org/file/bot${CONFIG.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    const text = await transcribeVoice(fileUrl);
    if (!text) {
      await ctx.reply("⚠️ Не удалось разобрать речь.");
      return;
    }

    await ctx.reply(`🎤 <i>"${text}"</i>`, { parse_mode: "HTML" });
    await ctx.replyWithChatAction("typing");

    const answer = await generateChatResponse(ctx, text);
    await sendLongMessage(ctx, formatAIResponseToHTML(answer), { parse_mode: "HTML" });
  } catch (error: any) {
    console.error("Ошибка обработки голосового:", error.message);
    await ctx.reply("⚠️ Ошибка распознавания голосового сообщения.");
  }
}
