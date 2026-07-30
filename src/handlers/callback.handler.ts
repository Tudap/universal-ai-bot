import { Context } from "grammy";
import { getModelByAlias } from "../config/index.js";
import { setUserModel } from "../db/index.js";
import { getFreeModelsKeyboard } from "../keyboards/models.js";

export async function handleCallbackQuery(ctx: Context) {
  if (!ctx.callbackQuery?.data) return;
  const data = ctx.callbackQuery.data;
  const userChatId = ctx.chat?.id.toString() || "";

  try {
    if (data === "noop") {
      await ctx.answerCallbackQuery();
      return;
    }

    if (data.startsWith("setmodel_")) {
      const alias = data.replace("setmodel_", "");
      const modelId = getModelByAlias(alias);

      setUserModel(userChatId, modelId);

      await ctx.answerCallbackQuery({ text: `✅ Модель установлена!` });
      await ctx.editMessageText(
        `✅ Выбрана модель: <code>${modelId}</code>\n\nТеперь все новые запросы будут обрабатываться этой моделью.`,
        { parse_mode: "HTML" }
      );
      return;
    }

    if (data.startsWith("freepage_")) {
      const page = parseInt(data.replace("freepage_", ""), 10) || 0;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("🆓 <b>Бесплатные модели</b>\n\nВыбери модель из списка:", {
        parse_mode: "HTML",
        reply_markup: getFreeModelsKeyboard(page),
      });
      return;
    }

    if (data === "menu_back") {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("🆓 <b>Бесплатные модели</b>\n\nВыбери модель из списка:", {
        parse_mode: "HTML",
        reply_markup: getFreeModelsKeyboard(0),
      });
      return;
    }
  } catch (error: any) {
    console.error("Callback ошибка:", error.message);
    try {
      await ctx.answerCallbackQuery({ text: "⚠️ Ошибка обработки кнопки" });
    } catch (_) {}
  }
}
