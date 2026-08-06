import fetch from "node-fetch";
import { toFile } from "openai";
import { executeWithFallback } from "./provider.service.js";

export async function transcribeVoice(fileUrl: string): Promise<string> {
  const audioResponse = await fetch(fileUrl);
  const audioBuffer = await audioResponse.arrayBuffer();

  const file = await toFile(Buffer.from(audioBuffer), "voice.ogg", {
    type: "audio/ogg",
  });

  return await executeWithFallback(async (client, provider) => {
    const model = provider === "odirouter" ? "minimax-speech-01-turbo" : "whisper-1";
    const transcription = await client.audio.transcriptions.create({
      model: model,
      file: file,
      language: "ru",
    });
    return transcription.text || "";
  });
}

