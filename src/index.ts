import { Bot } from "grammy";
import express, { Request, Response } from "express";
import { CONFIG } from "./config/index.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";
import { handleCallbackQuery } from "./handlers/callback.handler.js";
import { handleTextMessage, shouldReply } from "./handlers/message.handler.js";
import { handlePhoto, handleVoice } from "./handlers/media.handler.js";

if (!CONFIG.TELEGRAM_BOT_TOKEN) {
  console.error("❌ Ошибка: не задан TELEGRAM_BOT_TOKEN в файле .env!");
  process.exit(1);
}

const bot = new Bot(CONFIG.TELEGRAM_BOT_TOKEN);

// Глобальный перехватчик ошибок grammY
bot.catch((err) => {
  console.error(`❌ Ошибка в обработчике bot.catch (${err.ctx.update.update_id}):`, err.error);
});

// Middleware авторизации и Whitelist
bot.use(authMiddleware);

// Регистрация обработчиков сообщений и событий
bot.on("callback_query:data", handleCallbackQuery);
bot.on("message:text", handleTextMessage);
bot.on("message:photo", (ctx) => handlePhoto(ctx, shouldReply));
bot.on("message:voice", (ctx) => handleVoice(ctx, shouldReply));

// === EXPRESS HEALTH-CHECK СЕРВЕР ===
const app = express();
const PORT = CONFIG.PORT;

app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, () => {
  console.log(`🏥 Health check сервер запущен: http://localhost:${PORT}/health`);
});

// Запуск Telegram-бота
bot.start({
  onStart: (botInfo) => {
    console.log(`🚀 Успешный запуск бота @${botInfo.username}`);
  },
});

// Graceful Shutdown
const stop = () => {
  console.log("🛑 Остановка сервисов...");
  bot.stop();
  server.close();
  process.exit(0);
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
