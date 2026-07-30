import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(process.cwd(), "bot.db");
const db = new Database(dbPath);

// Включаем режим WAL для максимальной производительности
db.pragma("journal_mode = WAL");

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
    msg_id INTEGER,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    user_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    chat_id TEXT PRIMARY KEY,
    model TEXT DEFAULT 'openrouter/auto',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Миграция существующих таблиц (добавление недостающих колонок msg_id и user_name, если их ещё нет)
const columns = db.prepare("PRAGMA table_info(messages)").all() as any[];
const columnNames = columns.map((c) => c.name);

if (!columnNames.includes("msg_id")) {
  db.exec("ALTER TABLE messages ADD COLUMN msg_id INTEGER;");
}
if (!columnNames.includes("user_name")) {
  db.exec("ALTER TABLE messages ADD COLUMN user_name TEXT;");
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_chat_msg ON messages(chat_id, msg_id);
  CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at);
`);

export interface DBMessage {
  id: number;
  chat_id: string;
  msg_id: number | null;
  role: "user" | "assistant" | "system";
  content: string;
  user_name: string | null;
  created_at: string;
}

export function getChat(id: string, type: string, title?: string) {
  const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(id);
  if (!chat) {
    db.prepare("INSERT INTO chats (id, type, title) VALUES (?, ?, ?)").run(
      id,
      type,
      title || null
    );
    return db.prepare("SELECT * FROM chats WHERE id = ?").get(id);
  }
  return chat;
}

export function addMessage(
  chatId: string,
  role: string,
  content: string,
  msgId?: number,
  userName?: string
) {
  try {
    getChat(chatId, "unknown");
    db.prepare(
      "INSERT INTO messages (chat_id, msg_id, role, content, user_name) VALUES (?, ?, ?, ?, ?)"
    ).run(chatId, msgId || null, role, content, userName || null);
  } catch (error: any) {
    console.error("Ошибка добавления сообщения в БД:", error.message);
  }
}

export function getMessageByMsgId(chatId: string, msgId: number): DBMessage | undefined {
  return db
    .prepare("SELECT * FROM messages WHERE chat_id = ? AND msg_id = ? LIMIT 1")
    .get(chatId, msgId) as DBMessage | undefined;
}

export function getHistory(chatId: string, limit: number = 10): DBMessage[] {
  const rows = db
    .prepare(
      "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC, id DESC LIMIT ?"
    )
    .all(chatId, limit) as DBMessage[];

  return rows.reverse();
}

export function clearHistory(chatId: string) {
  db.prepare("DELETE FROM messages WHERE chat_id = ?").run(chatId);
}

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
  `
  ).run(chatId, model);
}

export default db;
