import fetch from "node-fetch";
import { OpenAI, toFile } from "openai";
import { CONFIG } from "../config/index.js";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: CONFIG.OPENROUTER_API_KEY,
});

export async function transcribeVoice(fileUrl: string): Promise<string> {
  const audioResponse = await fetch(fileUrl);
  const audioBuffer = await audioResponse.arrayBuffer();

  const file = await toFile(Buffer.from(audioBuffer), "voice.ogg", {
    type: "audio/ogg",
  });

  const transcription = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file: file,
    language: "ru",
  });

  return transcription.text || "";
}
