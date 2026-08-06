import fetch from "node-fetch";
import { Context, InputFile } from "grammy";
import { executeWithFallback } from "./provider.service.js";

export async function generateImage(prompt: string): Promise<string | null> {
  try {
    return await executeWithFallback(async (client, provider) => {
      const model =
        provider === "odirouter" ? "flux-pro-1.1" : "google/gemini-3.1-flash-lite-image";

      const response = await client.chat.completions.create({
        model: model,
        messages: [{ role: "user", content: prompt }],
      });

      const message: any = response.choices?.[0]?.message;

      if (message?.images) {
        for (const img of message.images) {
          if (img.image_url?.url) return img.image_url.url;
        }
      }

      if (message?.content) {
        const content = message.content;
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
    });
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
