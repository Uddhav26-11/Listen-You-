// Uses Groq's free, OpenAI-compatible chat completion API.
// Get a free key at https://console.groq.com/keys — no card/billing required.
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Minimal chat completion wrapper used by the consultation controller.
 * Requires GROQ_API_KEY to be set in server/.env
 */
export async function chatCompletion(messages, { temperature = 0.8, max_tokens = 300 } = {}) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set in the server .env file");
  }

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      messages,
      temperature,
      max_tokens,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

const GROQ_TTS_URL = "https://api.groq.com/openai/v1/audio/speech";

/**
 * Converts text to spoken audio (WAV bytes) using Groq's hosted Orpheus TTS
 * model. NOTE: this model currently only speaks English well — there is no
 * Hindi voice yet. Callers should keep using the browser's built-in
 * speechSynthesis as a fallback for Hindi/Devanagari text.
 * Requires GROQ_API_KEY (same key already used for chatCompletion above).
 * (Groq's older "playai-tts" model was decommissioned in Dec 2025 in favor
 * of Orpheus — see https://console.groq.com/docs/deprecations)
 */
export async function textToSpeech(text, { voice = "hannah" } = {}) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set in the server .env file");
  }

  const res = await fetch(GROQ_TTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "canopylabs/orpheus-v1-english",
      input: text,
      voice,
      response_format: "wav",
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq TTS error (${res.status}): ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export default chatCompletion;
