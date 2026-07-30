import "dotenv/config";
import modelsData from "../models.json" with { type: "json" };

export const CONFIG = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  PORT: process.env.PORT || 3000,
  ALLOWED_USERS: process.env.ALLOWED_USERS
    ? process.env.ALLOWED_USERS.split(",").map((id) => id.trim()).filter(Boolean)
    : [],
  ALLOWED_GROUPS: process.env.ALLOWED_GROUPS
    ? process.env.ALLOWED_GROUPS.split(",").map((id) => id.trim()).filter(Boolean)
    : [],
};

if (!CONFIG.TELEGRAM_BOT_TOKEN) {
  console.warn("⚠️ TELEGRAM_BOT_TOKEN не установлен в .env!");
}

export const SYSTEM_PROMPT =
  "Ты — универсальный ИИ-ассистент. Отвечай четко, по делу и на языке пользователя.";

export interface ModelInfo {
  name: string;
  model: string;
  emoji?: string;
  price?: string;
}

export const PAID_MODELS: Record<string, ModelInfo> = modelsData.paid;
export const FREE_MODELS: Array<ModelInfo> = modelsData.free;

// Модель в короткий ключ и обратно для пресечения ошибки 64-байтного лимита Telegram callback_data
const modelToAliasMap = new Map<string, string>();
const aliasToModelMap = new Map<string, string>();

Object.entries(PAID_MODELS).forEach(([key, info]) => {
  const alias = `p_${key}`;
  modelToAliasMap.set(info.model, alias);
  aliasToModelMap.set(alias, info.model);
});

FREE_MODELS.forEach((info, idx) => {
  const alias = `f_${idx}`;
  modelToAliasMap.set(info.model, alias);
  aliasToModelMap.set(alias, info.model);
});

export function getAliasByModel(modelId: string): string {
  return modelToAliasMap.get(modelId) || modelId;
}

export function getModelByAlias(alias: string): string {
  return aliasToModelMap.get(alias) || alias;
}
