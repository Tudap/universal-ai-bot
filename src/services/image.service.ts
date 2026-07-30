import fetch from "node-fetch";
import { Context, InputFile } from "grammy";
import { CONFIG } from "../config/index.js";

export async function generateImage(prompt: string): Promise<string | null> {
  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CONFIG.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/your-repo",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-lite-image",
          messages: [{ role: "user", content: prompt }],
        }),
      }
    );

    const data: any = await response.json();

    if (data.choices?.[0]?.message?.images) {
      for (const img of data.choices[0].message.images) {
        if (img.image_url?.url) return img.image_url.url;
      }
    }

    if (data.choices?.[0]?.message?.content) {
      const content = data.choices[0].message.content;
      if (typeof content === "string") {
        const urlMatch = content.match(/https?:\/\/[^\s]+/);
        if (urlMatch) return urlMatch[0];
        if (content.startsWith("data:image")) return content;
        if (content.length > 100 && !content.includes(" ")) {
          return `data:image/png;base64,${content}`;
        }
      }
    }

    return null;
  } catch (error: any) {
    console.error("Ошибка генерации изображения:", error.message);
    return null;
  }
}

export async function sendGeneratedImage(
  ctx: Context,
  imageResult: string
): Promise<boolean> {
  try {
    await ctx.replyWithChatAction("upload_photo");
    let buffer: Buffer;

    if (imageResult.startsWith("http")) {
      const imgResponse = await fetch(imageResult);
      buffer = Buffer.from(await imgResponse.arrayBuffer());
    } else if (imageResult.startsWith("data:image")) {
      const base64Data = imageResult.replace(/^data:image\/\w+;base64,/, "");
      buffer = Buffer.from(base64Data, "base64");
    } else {
      // Защита от огромных неизвестных строк
      await ctx.reply(`⚠️ Ошибка формата картинки.`);
      return false;
    }

    const file = new InputFile(buffer, "generated.png");
    await ctx.replyWithPhoto(file);
    return true;
  } catch (sendError: any) {
    console.error("Ошибка отправки картинки:", sendError.message);
    await ctx.reply(`❌ Ошибка отправки фото: ${sendError.message}`);
    return false;
  }
}
