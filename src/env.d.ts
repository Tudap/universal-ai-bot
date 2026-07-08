declare global {
  namespace NodeJS {
    interface ProcessEnv {
      TELEGRAM_BOT_TOKEN: string;
      OPENROUTER_API_KEY: string;
      MODEL?: string;
    }
  }
}

export {};
