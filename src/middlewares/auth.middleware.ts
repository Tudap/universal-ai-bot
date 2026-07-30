import { Context, NextFunction } from "grammy";
import { CONFIG } from "../config/index.js";

export async function authMiddleware(ctx: Context, next: NextFunction) {
  if (!ctx.chat) return next();

  // Если это группа или супергруппа
  if (ctx.chat.type === "group" || ctx.chat.type === "supergroup") {
    // Если настроен список разрешенных групп ALLOWED_GROUPS
    if (CONFIG.ALLOWED_GROUPS.length > 0) {
      const groupId = ctx.chat.id.toString();
      if (!CONFIG.ALLOWED_GROUPS.includes(groupId)) {
        console.warn(`[Auth] Запрос из неразрешенной группы ${groupId}`);
        return; // Молча игнорируем запросы из неразрешенных групп
      }
    }
    return next();
  }

  // Если это личный чат
  if (CONFIG.ALLOWED_USERS.length > 0) {
    const userId = ctx.from?.id.toString();
    if (!userId || !CONFIG.ALLOWED_USERS.includes(userId)) {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({ text: "🚫 Доступ запрещён." });
      } else {
        await ctx.reply("🚫 Доступ запрещён.");
      }
      return;
    }
  }

  return next();
}
