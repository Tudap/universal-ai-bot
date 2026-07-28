import { Bot, InputFile, Keyboard } from "grammy";
import { OpenAI } from "openai";
import "dotenv/config";
import {
  getChat,
  addMessage,
  getHistory,
  clearHistory,
  getUserModel,
  setUserModel,
} from "./db.js";
import fetch from "node-fetch";
import db from "./db.js";
import express, { Request, Response } from "express";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://github.com/your-repo",
    "X-Title": "Universal TG Bot",
  },
});

const allowedUsers = process.env.ALLOWED_USERS
  ? process.env.ALLOWED_USERS.split(",").map((id) => id.trim())
  : [];

// Whitelist — только для личных чатов
bot.use(async (ctx, next) => {
  if (!ctx.chat) return next();

  if (ctx.chat.type === "group" || ctx.chat.type === "supergroup") {
    return next();
  }

  if (allowedUsers.length === 0) return next();
  const userId = ctx.from?.id.toString();
  if (!userId || !allowedUsers.includes(userId)) {
    await ctx.reply("🚫 Доступ запрещён.");
    return;
  }
  return next();
});

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "healthy" });
});

const SYSTEM_PROMPT =
  "Ты — универсальный ИИ-ассистент. Отвечай четко, по делу и на языке пользователя.";

function getThreadId(ctx: any): string {
  const chatId = ctx.chat.id.toString();
  const threadId = ctx.message?.message_thread_id;
  return threadId ? `${chatId}_${threadId}` : chatId;
}

// === ФУНКЦИЯ ДЛЯ ДЛИННЫХ СООБЩЕНИЙ ===
async function sendLongMessage(ctx: any, text: string) {
  const MAX_LENGTH = 4000;

  if (text.length <= MAX_LENGTH) {
    await ctx.reply(text);
    return;
  }

  const parts: string[] = [];
  let currentPart = "";

  for (const line of text.split("\n")) {
    if ((currentPart + "\n" + line).length > MAX_LENGTH) {
      parts.push(currentPart);
      currentPart = line;
    } else {
      currentPart += (currentPart ? "\n" : "") + line;
    }
  }

  if (currentPart) {
    parts.push(currentPart);
  }

  for (const part of parts) {
    await ctx.reply(part);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

// === ПРОВЕРКА: нужно ли отвечать в группе ===
function shouldReply(ctx: any): boolean {
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

// === МОДЕЛИ ===
const MODELS: Record<
  string,
  { name: string; model: string; emoji: string; price: string }
> = {
  auto: { name: "Авто", model: "openrouter/auto", emoji: "", price: "авто" },
  free: {
    name: "Бесплатная",
    model: "google/gemma-2b-it:free",
    emoji: "",
    price: "бесплатно",
  },
  qwen3: {
    name: "Qwen 3.7 Flash",
    model: "qwen/qwen3.7-flash",
    emoji: "🐉",
    price: "$0.00003",
  },
  ultra: {
    name: "Ультра-дешёвая",
    model: "meta/llama-3.2-1b-instruct",
    emoji: "💸",
    price: "$0.00003",
  },
  cheap: {
    name: "Дешёвая",
    model: "qwen/qwen-2.5-7b-instruct",
    emoji: "💰",
    price: "$0.00004",
  },
  fast: {
    name: "Быстрая",
    model: "openai/gpt-4o-mini",
    emoji: "⚡",
    price: "$0.00015",
  },
  smart: {
    name: "Умная",
    model: "openai/gpt-4o",
    emoji: "🧠",
    price: "$0.0025",
  },
  code: {
    name: "Для кода",
    model: "deepseek/deepseek-coder",
    emoji: "",
    price: "$0.0007",
  },
  creative: {
    name: "Креативная",
    model: "anthropic/claude-3.5-sonnet",
    emoji: "🎨",
    price: "$0.003",
  },
};

// Бесплатные модели
const FREE_MODELS = [
  { name: "Google Gemma 4 31B", model: "google/gemma-4-31b-it:free" },
  { name: "Google Gemma 4 26B A4B", model: "google/gemma-4-26b-a4b-it:free" },
  { name: "Google Gemma 4 3B", model: "google/gemma-4-3b-it:free" },
  { name: "Google Gemma 3 12B", model: "google/gemma-3-12b-it:free" },
  { name: "Google Gemma 3 4B", model: "google/gemma-3-4b-it:free" },
  { name: "NVIDIA Nemotron 3 Ultra", model: "nvidia/nemotron-3-ultra:free" },
  { name: "NVIDIA Nemotron 3 Super", model: "nvidia/nemotron-3-super:free" },
  {
    name: "NVIDIA Nemotron 3 Nano 30B",
    model: "nvidia/nemotron-3-nano-30b-a3b:free",
  },
  {
    name: "NVIDIA Nemotron 3 Nano Omni",
    model: "nvidia/nemotron-3-nano-omni:free",
  },
  {
    name: "NVIDIA Nemotron Nano 12B",
    model: "nvidia/nemotron-nano-12b-2-vl:free",
  },
  { name: "NVIDIA Nemotron Nano 9B", model: "nvidia/nemotron-nano-9b-v2:free" },
  { name: "Poolside Laguna S 2.1", model: "poolside/laguna-s-2.1:free" },
  { name: "Poolside Laguna XS 2.1", model: "poolside/laguna-xs-2.1:free" },
  { name: "Poolside Laguna M 1", model: "poolside/laguna-m-1:free" },
  { name: "Cohere North Mini Code", model: "cohere/north-mini-code:free" },
  { name: "OpenAI GPT-OSS 20B", model: "openai/gpt-oss-20b:free" },
  { name: "OpenAI GPT-OSS 120B", model: "openai/gpt-oss-120b:free" },
  { name: "Ling 3.0 Flash", model: "ling-ai/ling-3.0-flash:free" },
];

function getMainKeyboard() {
  return new Keyboard()
    .text("💬 Чат")
    .text("🖼 Фото")
    .text(" Imagine")
    .row()
    .text("🎤 Голос")
    .text("🤖 Модель")
    .text("📊 Статистика")
    .row()
    .text("🗑 Очистить")
    .text("ℹ️ Помощь")
    .resized();
}

async function generateImage(prompt: string): Promise<string | null> {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/your-repo",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-lite-image",
        messages: [{ role: "user", content: prompt }],
      }),
    },
  );

  const data: any = await response.json();

  if (data.choices?.[0]?.message?.images) {
    for (const img of data.choices[0].message.images) {
      if (img.image_url?.url) return img.image_url.url;
    }
  }

  if (data.choices?.[0]?.message?.content) {
    const content = data.choices[0].message.content;
    if (typeof content === "string") {
      const urlMatch = content.match(/https?:\/\/[^\s]+/);
      if (urlMatch) return urlMatch[0];
      if (content.length > 100) return `data:image/png;base64,${content}`;
      return content;
    }
  }

  return null;
}

async function sendGeneratedImage(
  ctx: any,
  imageResult: string,
): Promise<boolean> {
  try {
    await ctx.replyWithChatAction("upload_photo");
    let buffer: Buffer;

    if (imageResult.startsWith("http")) {
      const imgResponse = await fetch(imageResult);
      buffer = Buffer.from(await imgResponse.arrayBuffer());
    } else if (imageResult.startsWith("data:image")) {
      const base64Data = imageResult.replace(/^data:image\/\w+;base64,/, "");
      buffer = Buffer.from(base64Data, "base64");
    } else {
      await ctx.reply(imageResult);
      return false;
    }

    const file = new InputFile(buffer, "generated.png");
    await ctx.replyWithPhoto(file);
    return true;
  } catch (sendError: any) {
    console.error("Ошибка отправки:", sendError.message);
    await ctx.reply(`❌ Ошибка: ${sendError.message}`);
    return false;
  }
}

// Обработчик текста
bot.on("message:text", async (ctx) => {
  if (!shouldReply(ctx)) return;

  const chatId = getThreadId(ctx);
  const userChatId = ctx.chat?.id.toString() || "";

  getChat(chatId, ctx.chat.type, ctx.chat.title || undefined);

  await ctx.replyWithChatAction("typing");

  const userMessage = ctx.message.text;

  // === ОБРАБОТКА КНОПОК МЕНЮ ===
  switch (userMessage) {
    case "💬 Чат":
      await ctx.reply(
        "💬 *Режим чата*\n\n" +
          "Просто пиши текст — я отвечу и запомню контекст.\n\n" +
          `Текущая модель: \`${getUserModel(userChatId)}\``,
        { parse_mode: "Markdown" },
      );
      return;

    case " Фото":
      await ctx.reply(
        "🖼 *Работа с фото*\n\n" +
          "Отправь фото с подписью:\n" +
          "• 'Что на фото?' — опишу\n" +
          "• 'Улучши' — создам фотореалистичную версию",
        { parse_mode: "Markdown" },
      );
      return;

    case "🎨 Imagine":
      await ctx.reply(
        "🎨 *Генерация картинок*\n\n" +
          "Напиши: `/imagine [описание]`\n\n" +
          "Пример: `/imagine кот в космосе`",
        { parse_mode: "Markdown" },
      );
      return;

    case "🎤 Голос":
      await ctx.reply(
        "🎤 *Голосовые*\n\n" + "Отправь голосовое — я распознаю и отвечу.",
        { parse_mode: "Markdown" },
      );
      return;

    case "🤖 Модель":
      const current = getUserModel(userChatId);
      let text = "🤖 *Выбор модели*\n\nТекущая: `" + current + "`\n\n";
      Object.entries(MODELS).forEach(([key, val]) => {
        text += `${val.emoji} /${key} — ${val.name} (${val.price})\n`;
      });
      text += "\nИспользуй /freemodels для списка бесплатных";
      await ctx.reply(text, { parse_mode: "Markdown" });
      return;

    case "📊 Статистика": {
      const chats = db
        .prepare(
          "SELECT id, type, title, (SELECT COUNT(*) FROM messages WHERE chat_id = chats.id) as msg_count FROM chats ORDER BY msg_count DESC",
        )
        .all();
      if (chats.length === 0) {
        await ctx.reply("📭 Пока нет статистики");
        return;
      }
      let text = "📊 *Статистика:*\n\n";
      chats.forEach((chat: any) => {
        text += `• ${chat.title || chat.id} — ${chat.msg_count} сообщ.\n`;
      });
      await ctx.reply(text, { parse_mode: "Markdown" });
      return;
    }

    case "🗑 Очистить":
      clearHistory(chatId);
      await ctx.reply("️ История очищена!");
      return;

    case "ℹ️ Помощь":
      await ctx.reply(
        "📚 *Помощь*\n\n" +
          "💬 Текст — помню контекст\n" +
          "🖼 Фото — анализирую и улучшаю\n" +
          "🎨 /imagine — генерирую картинки\n" +
          "🎤 Голосовые — распознаю\n" +
          "🤖 /model — выбор модели\n\n" +
          "Команды:\n" +
          "/imagine [описание]\n" +
          "/model — список моделей\n" +
          "/freemodels — бесплатные модели\n" +
          "/current — текущая модель\n" +
          "/price — цены\n" +
          "/clear — очистить",
        { parse_mode: "Markdown" },
      );
      return;
  }

  // === КОМАНДЫ ===

  if (userMessage === "/start" || userMessage === "/menu") {
    await ctx.reply(
      "🤖 *Привет! Я умный бот с памятью!*\n\n" +
        "💬 Текст + контекст\n" +
        "🖼️ Фото — анализирую и улучшаю\n" +
        "🎨 /imagine — генерирую картинки\n" +
        "🎤 Голосовые — распознаю\n" +
        "🤖 /model — выбор модели\n\n" +
        "Используй кнопки внизу ",
      {
        parse_mode: "Markdown",
        reply_markup: getMainKeyboard(),
      },
    );
    return;
  }

  if (userMessage === "/clear") {
    clearHistory(chatId);
    await ctx.reply("️ История очищена!");
    return;
  }

  if (userMessage === "/history") {
    const history = getHistory(chatId, 5);
    await ctx.reply(`📚 Последние ${history.length} сообщений.`);
    return;
  }

  if (userMessage === "/model") {
    const current = getUserModel(userChatId);
    let text = "🤖 *Выбор модели*\n\nТекущая: `" + current + "`\n\n";
    Object.entries(MODELS).forEach(([key, val]) => {
      text += `${val.emoji} /${key} — ${val.name} (${val.price})\n`;
    });
    text += "\nИспользуй /freemodels для списка бесплатных";
    await ctx.reply(text, { parse_mode: "Markdown" });
    return;
  }

  if (userMessage === "/freemodels") {
    let text = "🆓 *Бесплатные модели:*\n\n";
    FREE_MODELS.forEach((m, i) => {
      text += `${i + 1}. *${m.name}*\n   \`${m.model}\`\n\n`;
    });
    text += "Чтобы выбрать: скопируй ID и напиши /setmodel <id>";
    await ctx.reply(text, { parse_mode: "Markdown" });
    return;
  }

  if (userMessage === "/current") {
    await ctx.reply(`📊 Текущая модель: \`${getUserModel(userChatId)}\``, {
      parse_mode: "Markdown",
    });
    return;
  }

  if (userMessage === "/price") {
    let text = "💰 *Цены моделей:*\n\n";
    Object.entries(MODELS).forEach(([key, val]) => {
      text += `${val.emoji} ${val.name}: ${val.price}\n`;
    });
    text += "\n🎨 Imagine: ~$0.04/картинка";
    await ctx.reply(text, { parse_mode: "Markdown" });
    return;
  }

  if (userMessage === "/stats") {
    const chats = db
      .prepare(
        "SELECT id, type, title, (SELECT COUNT(*) FROM messages WHERE chat_id = chats.id) as msg_count FROM chats ORDER BY msg_count DESC",
      )
      .all();
    if (chats.length === 0) {
      await ctx.reply("📭 Пока нет статистики");
      return;
    }
    let text = "📊 *Статистика:*\n\n";
    chats.forEach((chat: any) => {
      text += `• ${chat.title || chat.id} — ${chat.msg_count} сообщ.\n`;
    });
    await ctx.reply(text, { parse_mode: "Markdown" });
    return;
  }

  // Команды выбора модели
  if (userMessage.startsWith("/")) {
    const cmd = userMessage.slice(1).toLowerCase();
    if (MODELS[cmd]) {
      setUserModel(userChatId, MODELS[cmd].model);
      await ctx.reply(
        `${MODELS[cmd].emoji} Выбрана: ${MODELS[cmd].name}\n_Модель: ${MODELS[cmd].model}_`,
        { parse_mode: "Markdown" },
      );
      return;
    }

    // /setmodel <model_id>
    if (cmd.startsWith("setmodel ")) {
      const modelId = userMessage.split(" ").slice(1).join(" ").trim();
      if (modelId) {
        setUserModel(userChatId, modelId);
        await ctx.reply(`✅ Установлена модель: \`${modelId}\``, {
          parse_mode: "Markdown",
        });
        return;
      }
    }
  }

  // /imagine
  if (userMessage.startsWith("/imagine")) {
    const prompt = userMessage.replace("/imagine", "").trim();
    if (!prompt) {
      await ctx.reply(" Использование: /imagine [описание]");
      return;
    }
    try {
      await ctx.reply("🎨 Генерирую...");
      const result = await generateImage(prompt);
      if (result) {
        const sent = await sendGeneratedImage(ctx, result);
        if (sent) {
          addMessage(chatId, "user", `[Imagine] ${prompt}`);
          addMessage(chatId, "assistant", "Сгенерировал");
        }
      } else {
        await ctx.reply("❌ Не удалось");
      }
    } catch (error: any) {
      console.error("Ошибка:", error.message);
      await ctx.reply(`️ Ошибка: ${error.message}`);
    }
    return;
  }

  // Обычный чат
  try {
    const model = getUserModel(userChatId);
    const history = getHistory(chatId, 10);
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((msg: any) => ({ role: msg.role, content: msg.content })),
      { role: "user", content: userMessage },
    ];

    const response = await openai.chat.completions.create({
      model: model,
      messages: messages as any[],
    });

    const replyText = response.choices[0]?.message?.content || "Пустой ответ.";

    addMessage(chatId, "user", userMessage);
    addMessage(chatId, "assistant", replyText);

    await sendLongMessage(ctx, replyText);
  } catch (error: any) {
    console.error("Ошибка:", error.message);
    await ctx.reply("⚠️ Ошибка. Попробуй ещё раз.");
  }
});

// Фото
bot.on("message:photo", async (ctx) => {
  if (!shouldReply(ctx)) return;

  const chatId = getThreadId(ctx);
  getChat(chatId, ctx.chat.type, ctx.chat.title || undefined);

  await ctx.replyWithChatAction("typing");

  try {
    const file = await ctx.getFile();
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const caption = ctx.message.caption || "";

    if (
      caption.toLowerCase().includes("улучши") ||
      caption.toLowerCase().includes("фотореализм")
    ) {
      await ctx.reply("🎨 Генерирую улучшенную версию...");

      const describeResponse = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Опиши что на изображении" },
              { type: "image_url", image_url: { url: fileUrl } },
            ],
          },
        ],
      });

      const description =
        describeResponse.choices[0]?.message?.content || caption;
      const result = await generateImage(`Photorealistic: ${description}`);

      if (result) {
        await sendGeneratedImage(ctx, result);
      } else {
        await ctx.reply("❌ Не удалось");
      }
    } else {
      const response = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: caption || "Что на фото?" },
              { type: "image_url", image_url: { url: fileUrl } },
            ],
          },
        ],
      });

      await sendLongMessage(
        ctx,
        response.choices[0]?.message?.content || "Не смог распознать.",
      );
    }
  } catch (error: any) {
    console.error("Ошибка с фото:", error.message);
    await ctx.reply("⚠️ Не смог обработать.");
  }
});

// Голосовые
bot.on("message:voice", async (ctx) => {
  if (!shouldReply(ctx)) return;

  const chatId = getThreadId(ctx);
  getChat(chatId, ctx.chat.type, ctx.chat.title || undefined);

  await ctx.replyWithChatAction("typing");

  try {
    const file = await ctx.getFile();
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    const audioResponse = await fetch(fileUrl);
    const audioBuffer = await audioResponse.arrayBuffer();

    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: new File([audioBuffer], "voice.ogg", { type: "audio/ogg" }),
      language: "ru",
    });

    const response = await openai.chat.completions.create({
      model: getUserModel(ctx.chat.id.toString()),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcription.text },
      ],
    });

    await sendLongMessage(
      ctx,
      response.choices[0]?.message?.content || "Не понял.",
    );
  } catch (error: any) {
    console.error("Ошибка с голосовым:", error.message);
    await ctx.reply("⚠️ Не смог распознать.");
  }
});

// Запуск
app.listen(PORT, () => {
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

bot.start();
console.log("🚀 Бот запущен!");
