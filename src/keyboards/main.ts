import { Keyboard } from "grammy";

export function getMainKeyboard() {
  return new Keyboard()
    .text("💬 Чат")
    .text("🖼 Фото")
    .text("🎨 Imagine")
    .row()
    .text("🎤 Голос")
    .text("🤖 Модель")
    .text("🗑 Очистить")
    .row()
    .text("ℹ️ Помощь")
    .resized();
}
