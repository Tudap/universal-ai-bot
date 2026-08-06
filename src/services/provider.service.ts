import { OpenAI } from "openai";
import { CONFIG } from "../config/index.js";

export type ProviderType = "odirouter" | "openrouter";

// Создание клиентов OpenAI для обоих провайдеров
export const odirouterClient = new OpenAI({
  baseURL: "https://odirouter.ai/v1",
  apiKey: CONFIG.ODIROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://github.com/your-repo",
    "X-Title": "Universal TG Bot",
  },
});

export const openrouterClient = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: CONFIG.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://github.com/your-repo",
    "X-Title": "Universal TG Bot",
  },
});

/**
 * Получить экземпляр OpenAI клиента в зависимости от требуемого или активного провайдера
 */
export function getClient(provider?: ProviderType): OpenAI {
  const activeProvider = provider || (CONFIG.AI_PROVIDER as ProviderType);
  if (activeProvider === "openrouter") {
    return openrouterClient;
  }
  return odirouterClient;
}

/**
 * Модель адаптации идентификатора модели при переключении между провайдерами
 */
export function mapModelForProvider(modelId: string, targetProvider: ProviderType): string {
  if (targetProvider === "openrouter") {
    // Таблица соответствия OdiRouter моделей аналогам на OpenRouter
    const openrouterMap: Record<string, string> = {
      "free-gemini-3.5-flash": "google/gemma-3-12b-it",
      "free-gpt-5.4-mini": "openai/gpt-4o-mini",
      "free-claude-haiku-4.5": "openai/gpt-4o-mini",
      "free-qwen3.6-flash": "qwen/qwen-2.5-7b-instruct",
      "free-grok-4.5": "openai/gpt-4o-mini",
      "free-gemini-3.1-pro-preview": "google/gemma-3-12b-it",
      "free-qwen3.7-plus": "qwen/qwen-2.5-72b-instruct",
      "free-gpt-5.6-luna": "openai/gpt-4o-mini",
      "free-minimax-m2.7": "openai/gpt-4o-mini",
      "free-gemini-2.5-pro": "google/gemma-3-12b-it",
      "qwen3.7-plus": "qwen/qwen-2.5-72b-instruct",
      "gpt-5.4-mini": "openai/gpt-4o-mini",
      "qwen3.6-flash": "qwen/qwen-2.5-7b-instruct",
      "gemini-3.5-flash": "google/gemma-3-12b-it",
      "gpt-5.5": "openai/gpt-4o",
      "deepseek-v4-pro": "deepseek/deepseek-chat",
      "claude-sonnet-4-6": "anthropic/claude-3.5-sonnet",
    };
    return openrouterMap[modelId] || modelId;
  }
  return modelId;
}

/**
 * Выполнить асинхронную операцию через основной провайдер, 
 * с мгновенным бесшовным переходом на резервный провайдер при ошибке
 */
export async function executeWithFallback<T>(
  operation: (client: OpenAI, provider: ProviderType, getEffectiveModel: (model: string) => string) => Promise<T>
): Promise<T> {
  const primaryProvider: ProviderType =
    CONFIG.AI_PROVIDER === "openrouter" ? "openrouter" : "odirouter";
  const fallbackProvider: ProviderType =
    primaryProvider === "odirouter" ? "openrouter" : "odirouter";

  const primaryClient = getClient(primaryProvider);

  try {
    return await operation(primaryClient, primaryProvider, (model) =>
      mapModelForProvider(model, primaryProvider)
    );
  } catch (error: any) {
    console.warn(
      `⚠️ [AI Provider] Ошибка при запросе к ${primaryProvider} (${error?.message || error}). Переключение на резервный ${fallbackProvider}...`
    );

    const fallbackClient = getClient(fallbackProvider);
    return await operation(fallbackClient, fallbackProvider, (model) =>
      mapModelForProvider(model, fallbackProvider)
    );
  }
}
