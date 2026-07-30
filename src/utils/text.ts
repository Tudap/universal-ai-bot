import { Context } from "grammy";

/**
 * Безопасная отправка длинных сообщений в Telegram (разбивка на чанки < 4000 символов).
 */
export async function sendLongMessage(
  ctx: Context,
  text: string,
  options?: { parse_mode?: "HTML" | "Markdown" }
) {
  const MAX_LENGTH = 3900; // Безопасный запас для тегов HTML

  if (!text || text.length <= MAX_LENGTH) {
    await ctx.reply(text, options);
    return;
  }

  const parts: string[] = [];
  let currentPart = "";

  const lines = text.split("\n");

  for (const line of lines) {
    if ((currentPart + "\n" + line).length > MAX_LENGTH) {
      if (currentPart) {
        parts.push(currentPart);
        currentPart = "";
      }

      // Если одна строка сама по себе длиннее MAX_LENGTH, режем её по символам
      if (line.length > MAX_LENGTH) {
        let remaining = line;
        while (remaining.length > 0) {
          parts.push(remaining.slice(0, MAX_LENGTH));
          remaining = remaining.slice(MAX_LENGTH);
        }
      } else {
        currentPart = line;
      }
    } else {
      currentPart += (currentPart ? "\n" : "") + line;
    }
  }

  if (currentPart) {
    parts.push(currentPart);
  }

  for (const part of parts) {
    try {
      await ctx.reply(part, options);
    } catch (err) {
      // Если падает парсер HTML (например, незакрытый тег в чанке), отправляем чистым текстом
      if (options?.parse_mode) {
        await ctx.reply(part);
      } else {
        throw err;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
