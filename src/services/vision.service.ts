import { OpenAI } from "openai";
import { CONFIG } from "../config/index.js";
import { generateImage } from "./image.service.js";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: CONFIG.OPENROUTER_API_KEY,
});

export async function analyzePhoto(
  fileUrl: string,
  caption?: string
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "openai/gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: caption || "Что на фото?" },
          { type: "image_url", image_url: { url: fileUrl } },
        ],
      },
    ],
  });

  return response.choices[0]?.message?.content || "Не смог распознать фото.";
}

export async function enhancePhoto(
  fileUrl: string,
  caption?: string
): Promise<string | null> {
  const describeResponse = await openai.chat.completions.create({
    model: "openai/gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Опиши подробно что на изображении для генератора картинок." },
          { type: "image_url", image_url: { url: fileUrl } },
        ],
      },
    ],
  });

  const description = describeResponse.choices[0]?.message?.content || caption || "Красивое фото";
  return await generateImage(`Photorealistic, high detail: ${description}`);
}
