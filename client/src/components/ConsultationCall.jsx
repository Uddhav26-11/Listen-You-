import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  MessageSquare,
} from "lucide-react";
import toast from "react-hot-toast";
import AIDoctorAvatar from "./AIDoctorAvatar.jsx";
import UserCameraCard from "./UserCameraCard.jsx";
import api from "../api/axios.js";

const RING_DURATION_MS = 2000;
const CONNECT_DELAY_MS = 700;

const SpeechRecognitionCtor =
  typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

/**
 * callPhase: "idle" | "calling" | "connecting" | "active" | "ended"
 * doctorState: "idle" | "listening" | "thinking" | "speaking"
 */
export default function ConsultationCall({
  remainingCalls,
  onLimitReached,
  onCallStart,
  onCallEnd,
  onRecordingChange,
}) {
  const [phase, setPhase] = useState("idle");
  const [doctorState, setDoctorState] = useState("idle");
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [showTranscript, setShowTranscript] = useState(true);
  const [language, setLanguage] = useState("en"); // "en" | "hi" (used for speech-recognition accent hint)
  const [aiVoiceInRecording, setAiVoiceInRecording] = useState(null); // null | true | false — reflects the latest AI turn
  const [messages, setMessages] = useState([]); // [{ role: 'user' | 'doctor', text }]
  const [interimText, setInterimText] = useState("");

  const phaseRef = useRef("idle");
  const speakerOnRef = useRef(true);
  const languageRef = useRef("en");
  const consultationIdRef = useRef(null);
  const openingLineRef = useRef("");
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);
  const shouldListenRef = useRef(false);
  const userStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const transcriptEndRef = useRef(null);

  // Audio mixing so the recording can include BOTH the user's mic AND Dr.
  // Listen's spoken voice. Dr. Listen's voice is now fetched as a real WAV
  // file from the server (see speakText/fetchAndPlayTts below) and played
  // through this same AudioContext graph, so it can be routed straight into
  // the recording destination — no screen/tab-share permission needed.
  const audioCtxRef = useRef(null);
  const audioDestRef = useRef(null); // MediaStreamAudioDestinationNode used for both recording and (indirectly) playback
  const micSourceRef = useRef(null); // MediaStreamAudioSourceNode for the user's mic — tracked so we never connect it twice
  const ttsRequestIdRef = useRef(0); // guards against a stale TTS fetch resolving after a newer turn started
  const ttsWarnedRef = useRef(false); // only show the "AI voice not being recorded" toast once per call
  const maxDurationSecondsRef = useRef(480); // 8 minutes, overridden per-call from the server
  const warnedNearLimitRef = useRef(false);

  // Facial emotion (camera is the primary mood signal — see useFaceEmotion).
  const latestEmotionRef = useRef(null); // smoothed snapshot from UserCameraCard
  const moodSnapshotsRef = useRef([]); // full history to persist at call end
  const lastMentionedEmotionRef = useRef(null); // avoid repeating the same observation

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    speakerOnRef.current = speakerOn;
  }, [speakerOn]);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  // Warm up the speechSynthesis voice list (loads async in some browsers)
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.getVoices();
    const handler = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = handler;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, interimText]);

  // ---------------- Speech-to-text (continuous listening) ----------------
  const startRecognition = useCallback(() => {
    if (!SpeechRecognitionCtor) return;
    if (phaseRef.current !== "active") return;

    shouldListenRef.current = true;
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = languageRef.current === "hi" ? "hi-IN" : "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += piece;
        else interim += piece;
      }
      if (interim) setInterimText(interim);
      if (finalText.trim()) {
        setInterimText("");
        handleUserUtterance(finalText.trim());
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "audio-capture") {
        toast.error("Microphone access is blocked. Please allow microphone access to talk to Dr. Listen.");
        shouldListenRef.current = false;
      }
    };

    recognition.onend = () => {
      // Browsers auto-stop recognition periodically — restart it as long as
      // we're still supposed to be listening (i.e. not mid-AI-turn or ended).
      if (shouldListenRef.current && phaseRef.current === "active") {
        try {
          recognition.start();
        } catch {
          /* already started */
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      /* ignore if already running */
    }
  }, []);

  const pauseRecognition = () => {
    shouldListenRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
  };

  // ---------------- Text-to-speech ----------------
  // Ensures the shared AudioContext + recording-destination node exist. This
  // is normally created up-front in startCall (inside the user-gesture), but
  // we lazily create it here too in case speakText somehow runs first.
  const ensureAudioGraph = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
      audioDestRef.current = audioCtxRef.current.createMediaStreamDestination();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch((e) => console.warn("AudioContext resume failed:", e));
    }
    return audioCtxRef.current;
  };

  // Fallback for text the server-side TTS couldn't produce (either it's
  // Hindi/Devanagari — Groq has no Hindi voice yet — or the TTS request
  // itself failed, e.g. GROQ_API_KEY missing or PlayAI TTS terms not yet
  // accepted on the Groq console). This plays on-device only, so it will
  // NOT be present in the saved recording — the transcript still has it.
  const speakWithBrowserFallback = (text, onDone, { isDevanagari = false } = {}) => {
    if (!("speechSynthesis" in window)) {
      onDone?.();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.98;
      utter.pitch = 1.02;
      utter.lang = isDevanagari ? "hi-IN" : "en-US";
      const voices = window.speechSynthesis.getVoices();
      const preferred = isDevanagari
        ? voices.find((v) => /hi-IN|Hindi/i.test(v.lang) || /Hindi/i.test(v.name)) || voices[0]
        : voices.find((v) => v.lang === "en-US") || voices[0];
      if (preferred) utter.voice = preferred;
      utter.onend = () => onDone?.();
      utter.onerror = () => onDone?.();
      window.speechSynthesis.speak(utter);
    } catch {
      onDone?.();
    }
  };

  const speakText = async (text, onDone) => {
    if (!speakerOnRef.current) {
      onDone?.();
      return;
    }

    // The AI mirrors whatever the user actually said, which can drift from
    // the initial language toggle (e.g. Hinglish) — so decide per-reply
    // based on the reply's own script, not the toggle.
    const isDevanagari = /[\u0900-\u097F]/.test(text);
    if (isDevanagari) {
      setAiVoiceInRecording(false);
      speakWithBrowserFallback(text, onDone, { isDevanagari: true });
      return;
    }

    const myRequestId = ++ttsRequestIdRef.current;
    try {
      const audioCtx = ensureAudioGraph();
      const res = await api.post(
        `/consultations/${consultationIdRef.current}/speech`,
        { text },
        { responseType: "arraybuffer" }
      );
      // If the call ended or another turn started while we were waiting,
      // drop this result instead of talking over the new turn.
      if (myRequestId !== ttsRequestIdRef.current || phaseRef.current !== "active") {
        onDone?.();
        return;
      }

      const audioBuffer = await audioCtx.decodeAudioData(res.data);
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      // Route to speakers (so the user can hear it) AND into the recording
      // destination (so it ends up in the saved file) at the same time.
      source.connect(audioCtx.destination);
      if (audioDestRef.current) source.connect(audioDestRef.current);
      setAiVoiceInRecording(true);
      source.onended = () => onDone?.();
      source.start();
    } catch (err) {
      if (myRequestId !== ttsRequestIdRef.current) return;
      // err.response.data is an ArrayBuffer here (responseType: 'arraybuffer'
      // applies to error responses too) — decode it to get the real reason
      // (e.g. "GROQ_API_KEY is not set" or a 403 from PlayAI terms not
      // being accepted yet) instead of just an opaque failure.
      let reason = err.message;
      try {
        if (err.response?.data instanceof ArrayBuffer) {
          reason = JSON.parse(new TextDecoder().decode(err.response.data))?.message || reason;
        }
      } catch {
        /* keep the generic message */
      }
      console.error("TTS request failed, falling back to on-device voice (won't be recorded):", reason);
      setAiVoiceInRecording(false);
      if (!ttsWarnedRef.current) {
        ttsWarnedRef.current = true;
        toast.error(
          "Dr. Listen's voice couldn't be generated, so it's using the on-device voice instead — that part won't be in the saved recording. Check the server logs for why (e.g. GROQ_API_KEY or PlayAI TTS terms).",
          { duration: 6000 }
        );
      }
      speakWithBrowserFallback(text, onDone, { isDevanagari: false });
    }
  };

  // ---------------- Facial emotion (primary mood signal) ----------------
  const handleEmotionUpdate = useCallback((emotion) => {
    latestEmotionRef.current = emotion;
    // Keep a light-touch history for the end-of-call record. We don't need
    // every single sample — one every ~10s is plenty for a mood timeline.
    const snapshots = moodSnapshotsRef.current;
    const last = snapshots[snapshots.length - 1];
    const now = Date.now();
    if (!last || now - last._t > 10000) {
      snapshots.push({
        timestamp: new Date().toISOString(),
        source: "face",
        label: emotion.label,
        confidenceNote: emotion.confidence,
        _t: now,
      });
      moodSnapshotsRef.current = snapshots.slice(-50);
    }
  }, []);

  // ---------------- One conversation turn ----------------
  const handleUserUtterance = async (text) => {
    if (!consultationIdRef.current || phaseRef.current !== "active") return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setDoctorState("thinking");
    pauseRecognition();

    // Only hand the AI a facial-emotion observation if we're reasonably
    // confident AND it's a genuinely new observation, so it doesn't get
    // mentioned every turn.
    const emotion = latestEmotionRef.current;
    let faceEmotion = null;
    if (emotion && emotion.confidence !== "tentative") {
      const changedSinceLastMention = lastMentionedEmotionRef.current !== emotion.label;
      faceEmotion = {
        label: emotion.label,
        description: emotion.description,
        eyeContact: emotion.eyeContact,
        confidence: emotion.confidence,
        isNewObservation: changedSinceLastMention,
      };
      lastMentionedEmotionRef.current = emotion.label;
    }

    try {
      const { data } = await api.post(`/consultations/${consultationIdRef.current}/chat`, {
        message: text,
        faceEmotion,
      });
      if (phaseRef.current !== "active") return;
      setMessages((prev) => [...prev, { role: "doctor", text: data.reply }]);
      setDoctorState("speaking");
      speakText(data.reply, () => {
        if (phaseRef.current !== "active") return;
        setDoctorState("listening");
        startRecognition();
      });
    } catch (err) {
      if (err.response?.data?.timeLimitReached) {
        toast("Time's up for this consultation — saving and wrapping up.", { icon: "⏱️" });
        endCall();
        return;
      }
      toast.error(err.response?.data?.message || "Dr. Listen couldn't respond just now. Please try again.");
      if (phaseRef.current === "active") {
        setDoctorState("listening");
        startRecognition();
      }
    }
  };

  // ---------------- Recording (auto starts once call is active) ----------------
  // Dr. Listen's voice now arrives as a real audio file from the server (see
  // speakText) and is played through the same AudioContext graph as the
  // user's mic, so both simply end up mixed into the recording destination
  // below — no screen/tab-share capture required at all.
  const handleStreamReady = (stream) => {
    userStreamRef.current = stream;
    if (typeof MediaRecorder === "undefined") {
      toast.error("Recording isn't supported in this browser.");
      return;
    }
    try {
      recordedChunksRef.current = [];

      const audioCtx = ensureAudioGraph();
      const dest = audioDestRef.current;

      // If a mic source from a previous call/stream is still wired in,
      // disconnect it first — otherwise re-running this (e.g. the camera
      // component remounting) would stack a second mic source onto the
      // same destination and double/echo the user's voice in the recording.
      if (micSourceRef.current) {
        try {
          micSourceRef.current.disconnect();
        } catch {
          /* already disconnected */
        }
        micSourceRef.current = null;
      }

      const micTracks = stream.getAudioTracks();
      if (micTracks.length) {
        const micSource = audioCtx.createMediaStreamSource(new MediaStream(micTracks));
        micSource.connect(dest);
        micSourceRef.current = micSource;
      } else {
        console.warn("No microphone audio track available — recording will be missing the user's voice.");
      }

      const recordingStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const mr = new MediaRecorder(recordingStream, { mimeType });
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mr.onerror = (e) => {
        console.error("MediaRecorder error:", e.error || e);
        toast.error("Recording hit an error and may be incomplete.");
      };
      mediaRecorderRef.current = mr;
      mr.start(1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
      toast.error("Could not start recording on this device.");
    }
  };

  const stopRecordingAndUpload = () => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === "inactive") {
        resolve();
        return;
      }
      mr.onstop = async () => {
        try {
          const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
          recordedChunksRef.current = [];
          if (blob.size > 0 && consultationIdRef.current) {
            const formData = new FormData();
            formData.append("recording", blob, `consultation-${consultationIdRef.current}.webm`);
            await api.post(`/consultations/${consultationIdRef.current}/recording`, formData, {
              headers: { "Content-Type": "multipart/form-data" },
            });
          }
        } catch {
          toast.error("Recording could not be saved.");
        } finally {
          resolve();
        }
      };
      try {
        mr.stop();
      } catch {
        resolve();
      }
    });
  };

  // ---------------- Call lifecycle ----------------
  const startCall = async () => {
    if (remainingCalls <= 0) {
      onLimitReached?.();
      return;
    }
    if (!SpeechRecognitionCtor) {
      toast.error("Your browser doesn't support voice input. Try Chrome or Edge for live conversation.");
    }

    // Create the AudioContext synchronously under this click (a user
    // gesture) so autoplay policies don't block Dr. Listen's voice later —
    // this is the only thing that needs the click now, no permission popup.
    ensureAudioGraph();
    setAiVoiceInRecording(null);

    const data = onCallStart ? await onCallStart(language) : null;
    if (!data) {
      return;
    }

    consultationIdRef.current = data.consultationId;
    openingLineRef.current = data.openingLine || "Hi, I'm Dr. Listen. How are you feeling today?";
    maxDurationSecondsRef.current = data.maxDurationSeconds || 480;
    warnedNearLimitRef.current = false;
    ttsWarnedRef.current = false;
    setMessages([]);
    setInterimText("");
    latestEmotionRef.current = null;
    moodSnapshotsRef.current = [];
    lastMentionedEmotionRef.current = null;
    setPhase("calling");

    setTimeout(() => {
      setPhase("connecting");
      setTimeout(() => {
        setPhase("active");
      }, CONNECT_DELAY_MS);
    }, RING_DURATION_MS);
  };

  // Kicks off recording + the AI's opening line once the call goes active
  useEffect(() => {
    if (phase !== "active") return;

    setRecording(true);
    setRecordSeconds(0);
    onRecordingChange?.({ recording: true, seconds: 0 });
    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed += 1;
      setRecordSeconds(elapsed);
      onRecordingChange?.({ recording: true, seconds: elapsed });

      const limit = maxDurationSecondsRef.current;
      if (!warnedNearLimitRef.current && limit - elapsed === 60) {
        warnedNearLimitRef.current = true;
        toast("1 minute left in this consultation.", { icon: "⏳" });
      }
      if (elapsed >= limit) {
        clearInterval(timerRef.current);
        toast("Time's up for this consultation — saving and wrapping up.", { icon: "⏱️" });
        endCall();
      }
    }, 1000);

    setMessages([{ role: "doctor", text: openingLineRef.current }]);
    setDoctorState("speaking");
    speakText(openingLineRef.current, () => {
      if (phaseRef.current !== "active") return;
      setDoctorState("listening");
      startRecognition();
    });

    return () => clearInterval(timerRef.current);
  }, [phase, startRecognition]);

  const endCall = async () => {
    setPhase("ended");
    setRecording(false);
    onRecordingChange?.({ recording: false, seconds: recordSeconds });
    clearInterval(timerRef.current);
    pauseRecognition();
    window.speechSynthesis?.cancel();

    const finalSeconds = recordSeconds;
    await stopRecordingAndUpload();
    try {
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        await audioCtxRef.current.close();
      }
    } catch {
      /* noop */
    }
    audioCtxRef.current = null;
    audioDestRef.current = null;
    micSourceRef.current = null;
    const moodSnapshots = moodSnapshotsRef.current.map(({ _t, ...rest }) => rest);
    onCallEnd?.(finalSeconds, moodSnapshots);

    setTimeout(() => {
      setPhase("idle");
      setDoctorState("idle");
      setMessages([]);
      setInterimText("");
    }, 1500);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pauseRecognition();
      window.speechSynthesis?.cancel();
      clearInterval(timerRef.current);
      try {
        if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
      } catch {
        /* noop */
      }
      try {
        if (audioCtxRef.current && audioCtxRef.current.state !== "closed") audioCtxRef.current.close();
      } catch {
        /* noop */
      }
    };
  }, []);

  const formatDuration = (s) => {
    const h = Math.floor(s / 3600)
      .toString()
      .padStart(2, "0");
    const m = Math.floor((s % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  const now = new Date();

  return (
    <div className="relative">
      {/* Recording indicator: status, duration, date, live time */}
      <AnimatePresence>
        {phase === "active" && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-3 flex flex-col items-center justify-center gap-0.5 text-sm font-medium"
          >
            <span className={`flex items-center gap-1.5 ${recording ? "text-red-500" : "text-slate-400"}`}>
              <span
                className={`h-2 w-2 rounded-full ${recording ? "animate-pulse bg-red-500" : "bg-slate-300"}`}
              />
              {recording ? "Recording" : "Recording Off"}
            </span>
            <span className="text-xs text-slate-400">
              {now.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })} ·{" "}
              {now.toLocaleTimeString()}
            </span>
            {recording && (
              <span className="text-xs tabular-nums text-slate-500">
                Recording: {formatDuration(recordSeconds)}
              </span>
            )}
            {recording && aiVoiceInRecording !== null && (
              <span className="text-[11px] text-slate-400">
                {aiVoiceInRecording
                  ? "Includes Dr. Listen's voice"
                  : "Your voice + video only — Dr. Listen's replies are in the transcript"}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video cards */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="aspect-video">
          <AIDoctorAvatar state={phase === "active" ? doctorState : "idle"} />
        </div>
        <div className="aspect-video">
          <UserCameraCard
            active={phase === "active"}
            onStreamReady={handleStreamReady}
            onEmotionUpdate={handleEmotionUpdate}
            onError={() => toast.error("Camera/microphone access was denied. Please allow access to continue.")}
          />
        </div>
      </div>

      {/* Live transcript */}
      <AnimatePresence>
        {showTranscript && phase === "active" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-5 grid grid-cols-1 gap-3 overflow-hidden sm:grid-cols-2"
          >
            <div className="max-h-40 overflow-y-auto rounded-2xl bg-white/60 p-3 text-sm backdrop-blur-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">You</p>
              {messages
                .filter((m) => m.role === "user")
                .map((m, i) => (
                  <p key={i} className="mb-1 text-slate-700">
                    {m.text}
                  </p>
                ))}
              {interimText && <p className="italic text-slate-400">{interimText}</p>}
              <div ref={transcriptEndRef} />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-2xl bg-white/60 p-3 text-sm backdrop-blur-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Dr. Listen (AI)
              </p>
              {messages
                .filter((m) => m.role === "doctor")
                .map((m, i) => (
                  <p key={i} className="mb-1 text-slate-700">
                    {m.text}
                  </p>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div className="mt-6 flex flex-col items-center gap-4">
        <AnimatePresence mode="wait">
          {phase === "idle" && (
            <motion.div
              key="start"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-4"
            >
              <p className="text-center text-[11px] text-slate-400">
                Speech recognition language (Dr. Listen will reply in whatever language/style you actually speak)
              </p>
              <div className="flex items-center gap-1 rounded-full bg-white/70 p-1 text-sm shadow-sm backdrop-blur-sm">
                <button
                  onClick={() => setLanguage("en")}
                  className={`rounded-full px-4 py-1.5 font-medium transition ${
                    language === "en" ? "bg-calmblue text-white" : "text-slate-500"
                  }`}
                >
                  English
                </button>
                <button
                  onClick={() => setLanguage("hi")}
                  className={`rounded-full px-4 py-1.5 font-medium transition ${
                    language === "hi" ? "bg-calmblue text-white" : "text-slate-500"
                  }`}
                >
                  हिंदी
                </button>
              </div>

              <p className="max-w-xs text-center text-[11px] text-slate-400">
                Recording includes your video + voice, and Dr. Listen's voice too — no
                screen sharing needed. (Hindi replies are spoken on-device and won't be
                in the saved recording, but are always saved in the text transcript.)
              </p>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={startCall}
                className="flex items-center gap-2 rounded-full bg-calmblue px-8 py-4 text-lg font-medium text-white shadow-lg shadow-calmblue/30 transition hover:opacity-90"
              >
                <Phone size={20} />
                Start Video Consultation
              </motion.button>
            </motion.div>
          )}

          {(phase === "calling" || phase === "connecting") && (
            <motion.div
              key="calling"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-calmblue/30 ring-pulse" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-calmblue text-white">
                  <Phone size={22} />
                </div>
              </div>
              <p className="text-sm font-medium text-slate-600">
                {phase === "calling" ? "Calling Dr. Listen..." : "Connecting..."}
              </p>
            </motion.div>
          )}

          {phase === "active" && (
            <motion.div
              key="active-controls"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-wrap items-center justify-center gap-3"
            >
              <button
                onClick={() => setSpeakerOn((v) => !v)}
                title={speakerOn ? "Mute Dr. Listen's voice" : "Unmute Dr. Listen's voice"}
                className={`flex h-11 w-11 items-center justify-center rounded-full shadow-sm backdrop-blur-sm transition hover:scale-105 ${
                  speakerOn ? "bg-white/70 text-slate-600" : "bg-red-500 text-white"
                }`}
              >
                {speakerOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>

              <button
                onClick={() => setShowTranscript((v) => !v)}
                title={showTranscript ? "Hide transcript" : "Show transcript"}
                className={`flex h-11 w-11 items-center justify-center rounded-full shadow-sm backdrop-blur-sm transition hover:scale-105 ${
                  showTranscript ? "bg-calmblue text-white" : "bg-white/70 text-slate-600"
                }`}
              >
                <MessageSquare size={18} />
              </button>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={endCall}
                className="flex items-center gap-2 rounded-full bg-red-500 px-8 py-4 text-lg font-medium text-white shadow-lg shadow-red-500/30 transition hover:opacity-90"
              >
                <PhoneOff size={20} />
                End Consultation
              </motion.button>
            </motion.div>
          )}

          {phase === "ended" && (
            <motion.p
              key="ended"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-slate-500"
            >
              Consultation ended. Saving your summary...
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}