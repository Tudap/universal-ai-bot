import Database from "better-sqlite3";
import path from "path";

const db = new Database("bot.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
`);

export function getChat(chatId: string, type: string, title?: string) {
  const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(chatId);

  if (!chat) {
    db.prepare("INSERT INTO chats (id, type, title) VALUES (?, ?, ?)").run(
      chatId,
      type,
      title || null,
    );
    return { id: chatId, type, title };
  }

  return chat;
}

export function addMessage(chatId: string, role: string, content: string) {
  db.prepare(
    "INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)",
  ).run(chatId, role, content);
}

export function getHistory(chatId: string, limit: number = 10) {
  return db
    .prepare(
      "SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(chatId, limit)
    .reverse();
}

export function clearHistory(chatId: string) {
  db.prepare("DELETE FROM messages WHERE chat_id = ?").run(chatId);
}

export default db;
