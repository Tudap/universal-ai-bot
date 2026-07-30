/**
 * Экранирует спецсимволы HTML для отправки в Telegram с parse_mode: 'HTML'
 */
export function escapeHTML(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Преобразует ответ ИИ в безопасный HTML для Telegram.
 * Преобразует кодовые блоки ```code``` в <pre><code>code</code></pre> и `code` в <code>code</code>.
 */
export function formatAIResponseToHTML(text: string): string {
  if (!text) return "";

  // Сначала временно извлекаем кодовые блоки
  const codeBlocks: string[] = [];
  const inlineCodes: string[] = [];

  // Экранируем многострочные блоки кода ```lang ... ```
  let processed = text.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, (_match, code) => {
    const index = codeBlocks.length;
    codeBlocks.push(`<pre><code>${escapeHTML(code.trim())}</code></pre>`);
    return `__CODE_BLOCK_${index}__`;
  });

  // Экранируем однострочные блоки кода `code`
  processed = processed.replace(/`([^`]+)`/g, (_match, code) => {
    const index = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHTML(code)}</code>`);
    return `__INLINE_CODE_${index}__`;
  });

  // Экранируем остальной текст
  processed = escapeHTML(processed);

  // Возвращаем кодовые блоки обратно
  codeBlocks.forEach((block, index) => {
    processed = processed.replace(`__CODE_BLOCK_${index}__`, block);
  });

  inlineCodes.forEach((code, index) => {
    processed = processed.replace(`__INLINE_CODE_${index}__`, code);
  });

  return processed;
}
