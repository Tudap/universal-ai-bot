import { InlineKeyboard } from "grammy";
import { FREE_MODELS, PAID_MODELS, getAliasByModel } from "../config/index.js";

const ITEMS_PER_PAGE = 5;

export function getFreeModelsKeyboard(page: number = 0) {
  const keyboard = new InlineKeyboard();
  const totalPages = Math.ceil(FREE_MODELS.length / ITEMS_PER_PAGE);
  const currentPage = Math.max(0, Math.min(page, totalPages - 1));

  const startIdx = currentPage * ITEMS_PER_PAGE;
  const endIdx = startIdx + ITEMS_PER_PAGE;
  const pageModels = FREE_MODELS.slice(startIdx, endIdx);

  pageModels.forEach((m) => {
    const alias = getAliasByModel(m.model);
    keyboard.text(m.name, `setmodel_${alias}`).row();
  });

  // Навигационные кнопки пагинации
  const navRow = [];
  if (currentPage > 0) {
    navRow.push(InlineKeyboard.text("⬅️ Назад", `freepage_${currentPage - 1}`));
  }
  navRow.push(InlineKeyboard.text(`📄 ${currentPage + 1}/${totalPages}`, `noop`));
  if (currentPage < totalPages - 1) {
    navRow.push(InlineKeyboard.text("Вперёд ➡️", `freepage_${currentPage + 1}`));
  }

  keyboard.row(...navRow);
  keyboard.row().text("🔙 В главное меню", "menu_back");

  return keyboard;
}
