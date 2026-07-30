import { Context } from "grammy";
import { getMainKeyboard } from "../keyboards/main.js";
import { getFreeModelsKeyboard } from "../keyboards/models.js";
import {
  getUserModel,
  clearHistory,
  getHistory,
  setUserModel,
} from "../db/index.js";
import { PAID_MODELS } from "../config/index.js";
import { formatAIResponseToHTML } from "../utils/html.js";

export async function handleStart(ctx: Context) {
  await ctx.reply(
    "🤖 <b>Привет! Я умный ИИ-бот с памятью диалогов!</b>\n\n" +
      "💬 <b>Текст:</b> держу контекст беседы\n" +
      "🖼️ <b>Фото:</b> анализирую и улучшаю снимки\n" +
      "🎨 <b>Imagine:</b> генерирую изображения\n" +
      "🎤 <b>Голосовые:</b> распознаю и отвечаю\n" +
      "🤖 <b>Модель:</b> выбор любых языковых моделей\n\n" +
      "Используй меню или кнопки ниже 👇",
    {
      parse_mode: "HTML",
      reply_markup: getMainKeyboard(),
    }
  );
}

export async function handleHelp(ctx: Context) {
  await ctx.reply(
    "📚 <b>Помощь и возможности</b>\n\n" +
      "💬 <b>Текст:</b> ответы с учётом контекста\n" +
      "🖼 <b>Фото:</b> отправь фото с подписью 'Что на фото?' или 'Улучши'\n" +
      "🎨 <b>/imagine [описание]:</b> генерация картинки\n" +
      "🎤 <b>Голосовые:</b> отправь голосовое сообщение\n" +
      "🤖 <b>/model:</b> выбор платных и бесплатных нейросетей\n\n" +
      "<b>Команды:</b>\n" +
      "• <code>/imagine [описание]</code> — генерация картинки\n" +
      "• <code>/model</code> — список моделей\n" +
      "• <code>/freemodels</code> — бесплатные нейросети\n" +
      "• <code>/current</code> — текущая активная модель\n" +
      "• <code>/price</code> — расценки\n" +
      "• <code>/clear</code> — очистить историю контекста",
    { parse_mode: "HTML" }
  );
}

export async function handleClear(ctx: Context, threadId: string) {
  clearHistory(threadId);
  await ctx.reply("🗑️ История контекста очищена!");
}

export async function handleHistory(ctx: Context, threadId: string) {
  const history = getHistory(threadId, 5);
  await ctx.reply(`📚 Последние ${history.length} сообщений в истории.`);
}

export async function handleModel(ctx: Context, userChatId: string) {
  const current = getUserModel(userChatId);
  let text = `🤖 <b>Выбор модели</b>\n\nТекущая: <code>${current}</code>\n\n`;
  Object.entries(PAID_MODELS).forEach(([key, val]) => {
    text += `${val.emoji || "🔹"} /${key} — ${val.name} (${val.price})\n`;
  });
  text += "\nИспользуй /freemodels для выбора бесплатных моделей";
  await ctx.reply(text, { parse_mode: "HTML" });
}

export async function handleFreeModels(ctx: Context) {
  await ctx.reply("🆓 <b>Бесплатные модели</b>\n\nВыбери модель из списка:", {
    parse_mode: "HTML",
    reply_markup: getFreeModelsKeyboard(0),
  });
}

export async function handleCurrentModel(ctx: Context, userChatId: string) {
  await ctx.reply(
    `📊 Текущая модель: <code>${getUserModel(userChatId)}</code>`,
    { parse_mode: "HTML" }
  );
}

export async function handlePrice(ctx: Context) {
  let text = "💰 <b>Цены моделей:</b>\n\n";
  Object.entries(PAID_MODELS).forEach(([key, val]) => {
    text += `${val.emoji || "🔹"} ${val.name}: ${val.price}\n`;
  });
  text += "\n🎨 Imagine: ~$0.04/картинка";
  await ctx.reply(text, { parse_mode: "HTML" });
}
