// Netlify serverless function.
// Keeps the Gemini API key secret on the server side — the frontend never sees it.
// Set GEMINI_API_KEY as an environment variable in your Netlify site settings.

const SYSTEM_PROMPTS = {
  image:
    "You are an expert prompt engineer for AI image generators (Midjourney, DALL-E, Stable Diffusion). Given a rough idea, write ONE polished, highly detailed image-generation prompt in English. Include subject, composition, lighting, style/medium, color palette, camera/lens details if relevant, and mood. Output ONLY the final prompt text, no preamble, no quotes, no markdown.",
  video:
    "You are an expert prompt engineer for AI video generators (Sora, Runway, Veo). Given a rough idea, write ONE cinematic, highly detailed video-generation prompt in English. Include scene, camera movement, lighting, pacing, duration feel, style (photorealistic/animated), and sound cues if relevant. Output ONLY the final prompt text, no preamble, no quotes, no markdown.",
  master:
    "You are an expert at designing reusable 'master prompts' for recurring AI content series (like structured video/image generation workflows). Given a rough series concept, output a complete master-prompt template with these sections, in this order:\n\n1. WORKFLOW — describe a two-stage flow: Stage 1 pitches exactly 10 original concept ideas for this series (numbered, one line each) and stops to wait for the user's pick; Stage 2 (after the user picks) generates the final detailed prompt.\n2. FINAL PROMPT SPEC — the exact technical specification for the final generation prompt: format (JSON or plain text), aspect ratio, duration/panel count if relevant, camera/composition rules, style/visual details, audio rules if video, and any recurring structural beats.\n3. NEGATIVE RULES — a clear list of what must never appear (unwanted elements, camera behavior, artifacts, etc).\n4. OUTPUT FORMAT — state exactly what the final output should contain and nothing else.\n\nWrite this as a ready-to-reuse instruction block, in English, formatted with clear numbered/bulleted sections. Do not include any preamble or explanation outside the template itself.",
  photo:
    "You are an expert at looking at a photo and writing a ready-to-use social media caption AND a matching AI image-recreation prompt for it. Look closely at the uploaded photo. Output in this exact format, nothing else:\n\nCaption: <a short, engaging social media caption in English, with 3-5 relevant hashtags>\n\nImage Prompt: <a detailed English prompt an AI image generator could use to recreate a similar photo, covering subject, composition, lighting, style>",
};

const MODEL = "gemini-2.5-flash";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server is missing GEMINI_API_KEY" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { category, idea, image } = body;
  const systemPrompt = SYSTEM_PROMPTS[category];
  if (!systemPrompt) {
    return { statusCode: 400, body: JSON.stringify({ error: "Unknown category" }) };
  }
  if (category === "photo" && !image) {
    return { statusCode: 400, body: JSON.stringify({ error: "Photo is required for this category" }) };
  }
  if (category !== "photo" && !idea) {
    return { statusCode: 400, body: JSON.stringify({ error: "Idea is required" }) };
  }

  const parts = [];
  if (category === "photo" && image) {
    parts.push({ inline_data: { mime_type: image.mediaType, data: image.base64 } });
    parts.push({ text: idea || "Write a caption and an image prompt for this photo." });
  } else {
    parts.push({ text: idea });
  }

  const requestBody = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts }],
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(requestBody),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const message = (data && data.error && data.error.message) || "Gemini API error";
      return { statusCode: response.status, body: JSON.stringify({ error: message }) };
    }

    const text =
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.map((p) => p.text || "").join("\n").trim();

    if (!text) {
      return { statusCode: 502, body: JSON.stringify({ error: "Empty response from model" }) };
    }

    return { statusCode: 200, body: JSON.stringify({ text }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Request to Gemini failed" }) };
  }
};
