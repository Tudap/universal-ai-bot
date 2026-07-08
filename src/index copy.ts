import { Bot, InputFile } from "grammy";
import { OpenAI } from "openai";
import "dotenv/config";
import { getChat, addMessage, getHistory, clearHistory } from "./db.js";
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

// Whitelist
const allowedUsers = process.env.ALLOWED_USERS
  ? process.env.ALLOWED_USERS.split(",").map((id) => id.trim())
  : [];

bot.use(async (ctx, next) => {
  if (allowedUsers.length === 0) return next();
  const userId = ctx.from?.id.toString();
  if (!userId || !allowedUsers.includes(userId)) {
    await ctx.reply("🚫 Доступ запрещён.");
    return;
  }
  return next();
});

// Express сервер для health check
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

// Функция для генерации изображений через Gemini
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
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    },
  );

  const data: any = await response.json();

  // 1. Ищем в choices[0].message.images (формат Gemini через OpenRouter)
  if (data.choices?.[0]?.message?.images) {
    const images = data.choices[0].message.images;
    console.log("✅ Нашёл поле images, количество:", images.length);

    for (const img of images) {
      if (img.image_url?.url) {
        console.log("✅ Нашёл URL изображения");
        return img.image_url.url;
      }
      if (img.url) {
        return img.url;
      }
    }
  }

  // 2. Ищем в choices[0].message.content
  if (data.choices?.[0]?.message?.content) {
    const content = data.choices[0].message.content;

    if (typeof content === "string") {
      const urlMatch = content.match(/https?:\/\/[^\s]+/);
      if (urlMatch) return urlMatch[0];
      if (content.length > 100) return `data:image/png;base64,${content}`;
      return content;
    }

    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "image_url" && part.image_url?.url) {
          return part.image_url.url;
        }
        if (part.text) {
          const urlMatch = part.text.match(/https?:\/\/[^\s]+/);
          if (urlMatch) return urlMatch[0];
        }
      }
    }
  }

  // 3. Ищем в candidates (формат Gemini native)
  if (data.candidates?.[0]?.content?.parts) {
    for (const part of data.candidates[0].content.parts) {
      if (part.inlineData?.data) {
        return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
      }
      if (part.text) {
        const urlMatch = part.text.match(/https?:\/\/[^\s]+/);
        if (urlMatch) return urlMatch[0];
      }
    }
  }

  console.log("❌ Не удалось найти изображение");
  return null;
}

// Функция для отправки изображения в Telegram
async function sendGeneratedImage(
  ctx: any,
  imageResult: string,
): Promise<boolean> {
  try {
    await ctx.replyWithChatAction("upload_photo");

    let buffer: Buffer;

    if (imageResult.startsWith("http")) {
      console.log("Скачиваем с URL...");
      const imgResponse = await fetch(imageResult);
      const arrayBuffer = await imgResponse.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else if (imageResult.startsWith("data:image")) {
      console.log("Декодируем base64...");
      const base64Data = imageResult.replace(/^data:image\/\w+;base64,/, "");
      buffer = Buffer.from(base64Data, "base64");
    } else {
      await ctx.reply(imageResult);
      return false;
    }

    console.log("Размер буфера:", buffer.length, "байт");

    // Используем InputFile для отправки
    const file = new InputFile(buffer, "generated.png");
    await ctx.replyWithPhoto(file);

    return true;
  } catch (sendError: any) {
    console.error("Ошибка отправки фото:", sendError.message);
    await ctx.reply(`❌ Ошибка отправки: ${sendError.message}`);
    return false;
  }
}

// Обработчик текстовых сообщений
bot.on("message:text", async (ctx) => {
  const chatId = getThreadId(ctx);
  const chat = getChat(chatId, ctx.chat.type, ctx.chat.title || undefined);

  await ctx.replyWithChatAction("typing");

  const userMessage = ctx.message.text;

  if (userMessage === "/clear") {
    clearHistory(chatId);
    await ctx.reply("️ История очищена!");
    return;
  }

  if (userMessage === "/history") {
    const history = getHistory(chatId, 5);
    await ctx.reply(`📚 Последние ${history.length} сообщений в этой теме.`);
    return;
  }

  if (userMessage.startsWith("/imagine")) {
    const prompt = userMessage.replace("/imagine", "").trim();

    if (!prompt) {
      await ctx.reply(
        " Использование: /imagine [описание]\n\nПример: /imagine кот в космосе",
      );
      return;
    }

    try {
      await ctx.reply("🎨 Генерирую...");

      const result = await generateImage(prompt);

      if (result) {
        const sent = await sendGeneratedImage(ctx, result);
        if (sent) {
          addMessage(chatId, "user", `[Imagine] ${prompt}`);
          addMessage(chatId, "assistant", "Сгенерировал картинку");
        }
      } else {
        await ctx.reply("❌ Не удалось сгенерировать картинку");
      }
    } catch (error: any) {
      console.error("Ошибка генерации:", error.message);
      await ctx.reply(`⚠️ Ошибка: ${error.message}`);
    }
    return;
  }

  try {
    const history = getHistory(chatId, 10);
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((msg: any) => ({ role: msg.role, content: msg.content })),
      { role: "user", content: userMessage },
    ];

    const response = await openai.chat.completions.create({
      model: process.env.MODEL || "openrouter/auto",
      messages: messages as any[],
    });

    const replyText = response.choices[0]?.message?.content || "Пустой ответ.";

    addMessage(chatId, "user", userMessage);
    addMessage(chatId, "assistant", replyText);

    await ctx.reply(replyText);
  } catch (error: any) {
    console.error("Ошибка:", error.message);
    await ctx.reply("⚠️ Ошибка. Попробуй ещё раз.");
  }
});

// Обработчик фото
bot.on("message:photo", async (ctx) => {
  const chatId = getThreadId(ctx);
  await ctx.replyWithChatAction("typing");

  try {
    const file = await ctx.getFile();
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const caption = ctx.message.caption || "";

    if (
      caption.toLowerCase().includes("улучши") ||
      caption.toLowerCase().includes("фотореализм") ||
      caption.toLowerCase().includes("сделай")
    ) {
      await ctx.reply(" Генерирую улучшенную версию...");

      const describeResponse = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Опиши подробно что на этом изображении для генерации похожего но более качественного",
              },
              { type: "image_url", image_url: { url: fileUrl } },
            ],
          },
        ],
      });

      const description =
        describeResponse.choices[0]?.message?.content || caption;
      const result = await generateImage(
        `Photorealistic high quality version: ${description}`,
      );

      if (result) {
        const sent = await sendGeneratedImage(ctx, result);
        if (sent) {
          addMessage(chatId, "user", `[Фото для улучшения] ${caption}`);
          addMessage(chatId, "assistant", "Улучшил картинку");
        }
      } else {
        await ctx.reply("❌ Не удалось улучшить");
      }
    } else {
      const response = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: caption || "Что на этом фото?" },
              { type: "image_url", image_url: { url: fileUrl } },
            ],
          },
        ],
      });

      const replyText =
        response.choices[0]?.message?.content || "Не смог распознать.";
      addMessage(chatId, "user", `[Фото] ${caption}`);
      addMessage(chatId, "assistant", replyText);
      await ctx.reply(replyText);
    }
  } catch (error: any) {
    console.error("Ошибка с фото:", error.message);
    await ctx.reply("⚠️ Не смог обработать фото.");
  }
});

// Обработчик голосовых
bot.on("message:voice", async (ctx) => {
  const chatId = getThreadId(ctx);
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

    const text = transcription.text;
    const response = await openai.chat.completions.create({
      model: process.env.MODEL || "openrouter/auto",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `[Голосовое] ${text}` },
      ],
    });

    const replyText = response.choices[0]?.message?.content || "Не понял.";
    addMessage(chatId, "user", `[Голосовое] ${text}`);
    addMessage(chatId, "assistant", replyText);
    await ctx.reply(replyText);
  } catch (error: any) {
    console.error("Ошибка с голосовым:", error.message);
    await ctx.reply("⚠️ Не смог распознать голосовое.");
  }
});

bot.command("stats", async (ctx) => {
  const chats = db
    .prepare(
      "SELECT id, type, title, (SELECT COUNT(*) FROM messages WHERE chat_id = chats.id) as msg_count FROM chats ORDER BY msg_count DESC",
    )
    .all();
  if (chats.length === 0) {
    await ctx.reply("📭 Пока нет статистики");
    return;
  }
  let text = "📊 *Статистика чатов:*\n\n";
  chats.forEach((chat: any) => {
    const name = chat.title || chat.id;
    text += `• ${name} (${chat.type}) — ${chat.msg_count} сообщений\n`;
  });
  await ctx.reply(text, { parse_mode: "Markdown" });
});

bot.command("topics", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const topics = db
    .prepare(
      `
    SELECT DISTINCT chat_id,
      (SELECT title FROM chats WHERE id = messages.chat_id) as chat_title,
      COUNT(*) as msg_count,
      MAX(created_at) as last_message
    FROM messages WHERE chat_id LIKE ? GROUP BY chat_id ORDER BY last_message DESC
  `,
    )
    .all(`${chatId}%`);

  if (topics.length === 0) {
    await ctx.reply("📭 Пока нет сообщений");
    return;
  }
  let text = `📊 *Темы:*\n\n`;
  topics.forEach((topic: any, i: number) => {
    text += `${i + 1}. ${topic.chat_title || topic.chat_id} — ${topic.msg_count} сообщений\n`;
  });
  await ctx.reply(text, { parse_mode: "Markdown" });
});

bot.command("start", async (ctx) => {
  await ctx.reply(
    "🤖 *Привет! Я умный бот с памятью!*\n\n" +
      "💬 Текст + контекст\n" +
      "🖼️ Фото — анализирую и улучшаю\n" +
      "🎨 /imagine — генерирую картинки\n" +
      "🎤 Голосовые — распознаю\n\n" +
      "Команды:\n" +
      "/imagine [описание] — создать картинку\n" +
      "/clear — очистить историю\n" +
      "/stats — статистика\n" +
      "/topics — темы в группе",
    { parse_mode: "Markdown" },
  );
});

app.listen(PORT, () => {
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

bot.start();
console.log("🚀 Бот запущен и слушает сообщения!");
