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

// Orpheus is the only model we know for sure works well here (English).
// If the deployer has a Hindi-capable Groq TTS model/voice available, they
// can point GROQ_TTS_MODEL_HI / GROQ_TTS_VOICE_HI at it via env vars and it
// will be used automatically for Hindi text — without touching this file.
// Until then we still send Hindi text to the same model as a best effort
// (rather than refusing outright), because some runs produce an accented
// but understandable result, and that's still strictly better for the
// recording than silently never trying at all.
const MODEL_BY_LANGUAGE = {
  en: process.env.GROQ_TTS_MODEL_EN || "canopylabs/orpheus-v1-english",
  hi: process.env.GROQ_TTS_MODEL_HI || process.env.GROQ_TTS_MODEL_EN || "canopylabs/orpheus-v1-english",
};
const VOICE_BY_LANGUAGE = {
  en: process.env.GROQ_TTS_VOICE_EN || "hannah",
  hi: process.env.GROQ_TTS_VOICE_HI || process.env.GROQ_TTS_VOICE_EN || "hannah",
};

/**
 * Converts text to spoken audio (WAV bytes) using Groq's hosted TTS.
 * `language` ("en" | "hi") picks the model/voice via the maps above.
 * Requires GROQ_API_KEY (same key already used for chatCompletion above).
 * (Groq's older "playai-tts" model was decommissioned in Dec 2025 in favor
 * of Orpheus — see https://console.groq.com/docs/deprecations)
 */
export async function textToSpeech(text, { voice, language = "en" } = {}) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set in the server .env file");
  }

  const lang = language === "hi" ? "hi" : "en";
  const model = MODEL_BY_LANGUAGE[lang];
  const resolvedVoice = voice || VOICE_BY_LANGUAGE[lang];

  const res = await fetch(GROQ_TTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      input: text,
      voice: resolvedVoice,
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
