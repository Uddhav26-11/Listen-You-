import Consultation from "../models/Consultation.model.js";
import User from "../models/User.model.js";
import { chatCompletion, textToSpeech } from "../utils/openai.js";
import { uploadRecordingBuffer, deleteRecording } from "../config/cloudinary.js";

const FALLBACK_GREETING =
  "Hi, I'm Dr. Listen. I'm really glad you're here today. How are you feeling right now?";

const FALLBACK_REPLY =
  "I'm having a little trouble connecting right now, but I'm still here with you. Could you tell me that again?";

// Builds a system prompt that makes the AI memory-aware: if the user already
// talked earlier *today*, it opens by referencing that instead of starting fresh.
const buildSystemPrompt = (user) => {
  const sameDay =
    user.lastConsultationAt &&
    new Date(user.lastConsultationAt).toDateString() === new Date().toDateString();

  let memoryNote;
  if (sameDay && user.lastMoodSummary) {
    memoryNote = `The user already had a consultation with you earlier today. Their mood/summary from that session was: "${user.lastMoodSummary}". If this is the start of the conversation, warmly welcome them back and briefly reference that before asking how they are feeling now. Do not start like a brand-new conversation.`;
  } else if (user.lastMoodSummary) {
    memoryNote = `In a previous session (not today), the user's mood/summary was: "${user.lastMoodSummary}". You may gently reference this if it feels relevant, but this is a new day, so greet them as a fresh check-in.`;
  } else {
    memoryNote =
      "This is the user's first conversation with you, or no prior summary is available. Greet them warmly as a new check-in.";
  }

  return `You are Dr. Listen, a warm, deeply attentive AI companion modeled on how a compassionate, experienced psychiatrist speaks during a real, live video consultation with ${user.name}.

LANGUAGE — MIRROR THE USER, EVERY TURN:
- Detect the language/style of the user's most recent message and reply in that same style, regardless of any app-level language setting.
- If they write in Hindi (Devanagari), reply in natural Hindi (Devanagari).
- If they write in English, reply in natural English.
- If they write in Hinglish (Hindi words in Roman/Latin script, e.g. "mera mood aaj bahut kharab hai"), reply in the same natural Hinglish — don't switch to pure Hindi script or stiff formal English.
- Switch fluidly if the user switches mid-conversation. Never comment on the language switch itself, just naturally follow it.

VOICE AND MANNER — YOU ARE NOT A GENERIC CHATBOT:
- Do not sound like ChatGPT or a generic assistant: no "As an AI...", no numbered lists, no over-explaining, no disclaimers stacked on top of each other.
- Speak the way a caring human doctor would in person: calm, unhurried, warm, and genuinely curious about the person in front of you.
- Never sound robotic or clinical-cold. Never give a one-line, flat answer.
- Always respond with a full, natural turn: acknowledge what the person shared, reflect it back briefly so they feel heard, and then gently move the conversation forward with a meaningful, open-ended follow-up question.
- Keep replies SHORT — 1 to 3 sentences max, since this is spoken aloud in a live call, not read as text. Say one clear thing at a time, like a real back-and-forth conversation, not a monologue.
- Be supportive, positive, motivating, and never judgmental — even when the topic is heavy. Appreciate small steps forward. Leave the person with a sense of hope and encouragement by the end of each turn.
- Maintain the thread of the whole conversation — refer back to things they said earlier in this session when it's natural to do so.
- Never diagnose, and never claim to be a licensed human doctor. If the user expresses thoughts of self-harm or crisis, gently and clearly encourage them to reach out to a crisis helpline or a trusted person, in addition to continuing to listen supportively.

READING FACIAL EXPRESSIONS (camera is the PRIMARY signal for mood, not voice):
- You may occasionally receive a note describing what the user's face/expression currently looks like, estimated from the live camera feed.
- Treat this as a gentle, uncertain observation, never a fact. Use soft, hedged language: "I notice...", "It looks like...", "You seem...". Never say "I know exactly how you feel" or state their emotion as a certainty.
- Only weave it into the conversation when it feels natural and adds warmth (e.g. noticing a smile when they mention something positive, or noticing they seem more relaxed than earlier). Do this sparingly — not every turn, and never mechanically. Most turns should not mention it at all.
- If the note says this is a new/changed observation, that's a good moment to gently mention it. If it's the same as before, usually let it pass silently.
- Do not use facial observations to diagnose or to make strong claims — just to make the conversation feel more present and human.

${memoryNote}`;
};

// Turns a raw facial-emotion snapshot from the client into a short, hedged
// note the model can optionally weave into its reply. Returns null if there's
// nothing worth passing along.
const describeFaceEmotion = (faceEmotion) => {
  if (!faceEmotion || !faceEmotion.label) return null;
  const parts = [`Estimated facial expression right now: ${faceEmotion.description || faceEmotion.label}.`];
  if (faceEmotion.eyeContact === false) {
    parts.push("They seem to be looking away from the camera some of the time.");
  }
  parts.push(
    faceEmotion.isNewObservation
      ? "This is a new/changed observation since the last turn."
      : "This is the same as the last reading — usually no need to mention it again."
  );
  parts.push("Remember: this is only an estimate from the camera, use it gently and sparingly.");
  return parts.join(" ");
};

// @route POST /api/consultations/start
// Enforces the daily call limit, creates a new consultation session, and
// generates a memory-aware opening line for the AI to speak first.
export const startConsultation = async (req, res, next) => {
  try {
    const user = req.user;
    const remainingCalls = user.getRemainingCalls();

    if (remainingCalls <= 0) {
      return res.status(403).json({
        message: "You have completed today's consultation limit.",
      });
    }

    const { language } = req.body;
    const consultation = await Consultation.create({
      user: user._id,
      status: "in_progress",
      language: language === "hi" ? "hi" : "en",
    });

    user.dailyUsage.callsUsed += 1;
    await user.save();

    let openingLine = FALLBACK_GREETING;
    try {
      let systemPrompt = buildSystemPrompt(user);
      systemPrompt += `\n\nThe user hasn't said anything yet — this is your opening greeting. They selected "${
        consultation.language === "hi" ? "Hindi" : "English"
      }" as their preferred language before the call started, so greet them in that language (natural Hindi if Hindi, natural English if English). Once they reply, follow their actual message's language/style instead.`;
      openingLine = await chatCompletion([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: "(The call has just connected. Greet the user first to open the conversation.)",
        },
      ]);
      if (!openingLine) openingLine = FALLBACK_GREETING;
    } catch (err) {
      console.error("Opening line generation failed:", err.message);
    }

    consultation.transcript.push({ role: "doctor", text: openingLine });
    await consultation.save();

    res.status(201).json({
      consultationId: consultation._id,
      maxDurationSeconds: user.maxCallDurationSeconds,
      remainingCallsAfterThis: remainingCalls - 1,
      openingLine,
    });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/consultations/:id/speech
// Turns a line of Dr. Listen's reply into actual audio bytes (WAV) using a
// real TTS model, so the client can play + record it directly through the
// Web Audio API — no screen/tab-share permission needed at all, unlike the
// browser's speechSynthesis (which has no way to expose its audio as a
// stream). English/Hinglish only for now — Groq's TTS model has no Hindi
// voice yet, so the client falls back to on-device speechSynthesis for
// Devanagari text (that part just won't be in the saved recording).
export const speak = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: "text is required" });
    }

    const consultation = await Consultation.findOne({ _id: id, user: req.user._id });
    if (!consultation) {
      return res.status(404).json({ message: "Consultation not found" });
    }

    const audioBuffer = await textToSpeech(text.trim());
    res.set({
      "Content-Type": "audio/wav",
      "Content-Length": audioBuffer.length,
    });
    res.send(audioBuffer);
  } catch (error) {
    console.error("TTS error:", error.message);
    res.status(502).json({ message: "Text-to-speech failed" });
  }
};
// Takes one turn of user speech (already converted to text on the client),
// sends it to the AI along with rolling context, stores both sides in the
// transcript, and returns the AI's reply text for the client to speak (TTS).
export const chatTurn = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message, faceEmotion } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "message is required" });
    }

    const consultation = await Consultation.findOne({ _id: id, user: req.user._id });
    if (!consultation) {
      return res.status(404).json({ message: "Consultation not found" });
    }
    if (consultation.status !== "in_progress") {
      return res.status(400).json({ message: "This consultation has already ended" });
    }

    const elapsedSeconds = (Date.now() - new Date(consultation.startedAt).getTime()) / 1000;
    if (elapsedSeconds > req.user.maxCallDurationSeconds) {
      return res.status(400).json({
        message: "This consultation has reached its time limit. Please end the call.",
        timeLimitReached: true,
      });
    }

    consultation.transcript.push({ role: "user", text: message.trim() });

    if (faceEmotion && faceEmotion.label) {
      consultation.moodSnapshots.push({
        source: "face",
        label: faceEmotion.label,
        confidenceNote: faceEmotion.confidence,
      });
    }

    let systemPrompt = buildSystemPrompt(req.user);
    const faceNote = describeFaceEmotion(faceEmotion);
    if (faceNote) {
      systemPrompt += `\n\nLIVE OBSERVATION (from camera, this turn only): ${faceNote}`;
    }

    const history = consultation.transcript.slice(-20).map((m) => ({
      role: m.role === "doctor" ? "assistant" : "user",
      content: m.text,
    }));

    let reply;
    try {
      reply = await chatCompletion([{ role: "system", content: systemPrompt }, ...history], {
        max_tokens: 120,
      });
      if (!reply) reply = FALLBACK_REPLY;
    } catch (err) {
      console.error("Groq chat error:", err.message);
      reply = FALLBACK_REPLY;
    }

    consultation.transcript.push({ role: "doctor", text: reply });
    await consultation.save();

    res.status(200).json({ reply });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/consultations/:id/recording
// Receives the recorded webm blob (video+audio) from MediaRecorder on the
// client once the call ends, and uploads it to Cloudinary (never touches
// local disk — the host's filesystem is ephemeral and would lose it).
export const uploadRecording = async (req, res, next) => {
  try {
    const { id } = req.params;
    const consultation = await Consultation.findOne({ _id: id, user: req.user._id });
    if (!consultation) {
      return res.status(404).json({ message: "Consultation not found" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "No recording file received" });
    }

    const publicId = `consultation-${id}-${Date.now()}`;
    const result = await uploadRecordingBuffer(req.file.buffer, { publicId });

    consultation.recording = {
      videoUrl: result.secure_url,
      audioUrl: null,
      publicId: result.public_id,
      storedAt: new Date(),
    };
    await consultation.save();

    res.status(200).json({ message: "Recording saved", videoUrl: consultation.recording.videoUrl });
  } catch (error) {
    console.error("Recording upload to Cloudinary failed:", error.message);
    res.status(502).json({ message: "Could not save the recording. Please try again." });
  }
};

// @route POST /api/consultations/:id/end
// Closes out a session. If no summary/mood is supplied by the client, it is
// generated from the stored transcript so the AI has memory for next time.
export const endConsultation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { summary, overallMoodLabel, moodSnapshots } = req.body;

    const consultation = await Consultation.findOne({ _id: id, user: req.user._id });
    if (!consultation) {
      return res.status(404).json({ message: "Consultation not found" });
    }

    consultation.endedAt = new Date();
    consultation.durationSeconds = Math.round(
      (consultation.endedAt - consultation.startedAt) / 1000
    );
    consultation.status = "completed";
    if (moodSnapshots) consultation.moodSnapshots = moodSnapshots;

    let finalSummary = summary;
    let finalMood = overallMoodLabel;
    let finalTitle = "";

    if ((!finalSummary || !finalMood) && consultation.transcript.length > 0) {
      try {
        const transcriptText = consultation.transcript
          .map((m) => `${m.role === "user" ? req.user.name : "Dr. Listen"}: ${m.text}`)
          .join("\n");

        const raw = await chatCompletion(
          [
            {
              role: "system",
              content:
                'You are summarizing a mental-health check-in conversation for private clinical notes. Respond ONLY with strict JSON in this exact shape: {"summary": "1-2 sentence neutral summary of what the user shared and how they seemed", "mood": "one short mood word or phrase, e.g. calm, anxious, low, brighter, stressed", "title": "a short 2-5 word title capturing the main topic of the conversation, title-cased, e.g. \'Work Stress Discussion\', \'Family Relationship Conversation\', \'Anxiety About Career\', \'Feeling Lonely Today\', \'College Pressure\', \'Confidence Building Session\'"}. No markdown, no extra commentary.',
            },
            { role: "user", content: transcriptText },
          ],
          { temperature: 0.3, max_tokens: 150 }
        );
        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
        finalSummary = finalSummary || parsed.summary;
        finalMood = finalMood || parsed.mood;
        finalTitle = parsed.title || "";
      } catch (err) {
        console.error("Summary generation failed:", err.message);
      }
    }

    if (finalSummary) consultation.summary = finalSummary;
    if (finalMood) consultation.overallMoodLabel = finalMood;
    consultation.title = finalTitle || `Consultation on ${consultation.startedAt.toLocaleDateString?.() || ""}`.trim();

    await consultation.save();

    // Update the user's rolling memory pointers for next time.
    await User.findByIdAndUpdate(req.user._id, {
      lastMoodSummary: finalMood || consultation.overallMoodLabel || null,
      lastConsultationAt: consultation.endedAt,
    });

    res.status(200).json({ message: "Consultation saved", consultation });
  } catch (error) {
    next(error);
  }
};

// @route GET /api/consultations/history
export const getHistory = async (req, res, next) => {
  try {
    const consultations = await Consultation.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .select("-transcript")
      .limit(30);

    res.status(200).json(consultations);
  } catch (error) {
    next(error);
  }
};

// @route GET /api/consultations/status
// Tells the dashboard how many calls remain today
export const getStatus = async (req, res, next) => {
  try {
    const user = req.user;
    const remainingCalls = user.getRemainingCalls();
    await user.save();

    res.status(200).json({
      remainingCalls,
      maxCallsPerDay: user.maxCallsPerDay,
      maxCallDurationSeconds: user.maxCallDurationSeconds,
      lastMoodSummary: user.lastMoodSummary,
      lastConsultationAt: user.lastConsultationAt,
    });
  } catch (error) {
    next(error);
  }
};

// @route GET /api/consultations/:id
// Full detail for a single consultation, including the transcript — used by
// the "View Transcript" panel in Recording History (kept out of the list
// endpoint above for payload size).
export const getOne = async (req, res, next) => {
  try {
    const { id } = req.params;
    const consultation = await Consultation.findOne({ _id: id, user: req.user._id });
    if (!consultation) {
      return res.status(404).json({ message: "Consultation not found" });
    }
    res.status(200).json(consultation);
  } catch (error) {
    next(error);
  }
};

// @route DELETE /api/consultations/:id
// Deletes a saved consultation entirely: the recording file on disk (if
// any), and the database record (which carries the transcript + mood data).
export const deleteConsultation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const consultation = await Consultation.findOne({ _id: id, user: req.user._id });
    if (!consultation) {
      return res.status(404).json({ message: "Consultation not found" });
    }

    const publicId = consultation.recording?.publicId;
    if (publicId) {
      deleteRecording(publicId).catch((err) => {
        console.error("Failed to delete recording from Cloudinary:", err.message);
      });
    }

    await Consultation.deleteOne({ _id: consultation._id });

    res.status(200).json({ message: "Recording deleted" });
  } catch (error) {
    next(error);
  }
};