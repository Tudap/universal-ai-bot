import Database from "better-sqlite3";

const db = new Database("bot.db");

// Создаём таблицы БЕЗ FOREIGN KEY (чтобы не было ошибок)
db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    type TEXT,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    chat_id TEXT PRIMARY KEY,
    model TEXT DEFAULT 'openrouter/auto',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

export function getChat(id: string, type: string, title?: string) {
  const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(id);
  if (!chat) {
    db.prepare("INSERT INTO chats (id, type, title) VALUES (?, ?, ?)").run(
      id,
      type,
      title || null,
    );
    return db.prepare("SELECT * FROM chats WHERE id = ?").get(id);
  }
  return chat;
}

export function addMessage(chatId: string, role: string, content: string) {
  try {
    // Сначала гарантируем что чат существует
    getChat(chatId, "unknown");

    // Потом добавляем сообщение
    db.prepare(
      "INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)",
    ).run(chatId, role, content);
  } catch (error: any) {
    console.error("Ошибка добавления сообщения:", error.message);
  }
}

export function getHistory(chatId: string, limit: number = 10) {
  return db
    .prepare(
      "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(chatId, limit)
    .reverse();
}

export function clearHistory(chatId: string) {
  db.prepare("DELETE FROM messages WHERE chat_id = ?").run(chatId);
}

// === НОВЫЕ ФУНКЦИИ ДЛЯ ВЫБОРА МОДЕЛИ ===

export function getUserModel(chatId: string): string {
  const row = db
    .prepare("SELECT model FROM user_settings WHERE chat_id = ?")
    .get(chatId) as any;
  return row?.model || "openrouter/auto";
}

export function setUserModel(chatId: string, model: string) {
  db.prepare(
    `
    INSERT INTO user_settings (chat_id, model, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(chat_id) DO UPDATE SET model = excluded.model, updated_at = CURRENT_TIMESTAMP
  `,
  ).run(chatId, model);
}

export default db;
