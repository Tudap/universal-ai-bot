import { generateImage } from "./image.service.js";
import { executeWithFallback } from "./provider.service.js";

export async function analyzePhoto(
  fileUrl: string,
  caption?: string
): Promise<string> {
  return await executeWithFallback(async (client, _provider, getEffectiveModel) => {
    const model = getEffectiveModel("free-gpt-5.4-mini");
    const response = await client.chat.completions.create({
      model: model,
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
  });
}

export async function enhancePhoto(
  fileUrl: string,
  caption?: string
): Promise<string | null> {
  const description = await executeWithFallback(
    async (client, _provider, getEffectiveModel) => {
      const model = getEffectiveModel("free-gpt-5.4-mini");
      const describeResponse = await client.chat.completions.create({
        model: model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Опиши подробно что на изображении для генератора картинок.",
              },
              { type: "image_url", image_url: { url: fileUrl } },
            ],
          },
        ],
      });
      return (
        describeResponse.choices[0]?.message?.content || caption || "Красивое фото"
      );
    }
  );

  return await generateImage(`Photorealistic, high detail: ${description}`);
}

