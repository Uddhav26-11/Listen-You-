import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { History as HistoryIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/axios.js";
import ConsultationCall from "../components/ConsultationCall.jsx";

function formatDuration(s) {
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const now = useLiveClock();
  const [status, setStatus] = useState(null);
  const [activeConsultationId, setActiveConsultationId] = useState(null);
  const [recordingState, setRecordingState] = useState({ recording: false, seconds: 0 });

  const refreshStatus = () => {
    api
      .get("/consultations/status")
      .then(({ data }) => setStatus(data))
      .catch(() => toast.error("Could not load consultation status"));
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleLimitReached = () => {
    toast.error("You have reached today's consultation limit.");
  };

  // Registers the session with the backend as soon as the user presses
  // Start, so the daily quota decrements immediately and the id is ready
  // for the "end" call once the consultation finishes.
  const registerCallStart = async (language = "en") => {
    try {
      const { data } = await api.post("/consultations/start", { language });
      setActiveConsultationId(data.consultationId);
      refreshStatus();
      return data; // { consultationId, openingLine, maxDurationSeconds, remainingCallsAfterThis, language }
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not start consultation");
      return null;
    }
  };

  const handleCallEnd = async (_finalSeconds, moodSnapshots) => {
    if (!activeConsultationId) return;
    try {
      // Transcript is already saved turn-by-turn by the backend during the
      // call; ending the call triggers AI summary + mood generation there.
      await api.post(`/consultations/${activeConsultationId}/end`, {
        moodSnapshots: moodSnapshots || [],
      });
      toast.success("Consultation saved");
      setActiveConsultationId(null);
      refreshStatus();
    } catch {
      toast.error("Could not save consultation");
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 glass-panel px-4 py-3 shadow-premium sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-calmblue via-purpleaccent to-mintgreen text-white font-display font-semibold shadow-glow">
              L
            </div>
            <span className="font-display text-lg font-medium text-slate-800">
              Listen You<span className="premium-gradient-text">!</span>
            </span>
          </div>

          <div className="hidden text-center text-xs text-slate-400 sm:block">
            <div className="font-medium text-slate-600">
              {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </div>
            <div className="tabular-nums">{now.toLocaleTimeString()}</div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {activeConsultationId && (
              <div className="flex flex-col items-end text-xs">
                <span
                  className={`flex items-center gap-1.5 font-medium ${
                    recordingState.recording ? "text-red-500" : "text-slate-400"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      recordingState.recording ? "animate-pulse bg-red-500" : "bg-slate-300"
                    }`}
                  />
                  {recordingState.recording ? "Recording" : "Recording Off"}
                </span>
                {recordingState.recording && (
                  <span className="tabular-nums text-slate-400">
                    {formatDuration(recordingState.seconds)}
                  </span>
                )}
              </div>
            )}

            <button
              onClick={() => navigate("/history")}
              className="flex items-center gap-1.5 rounded-xl border border-white/60 bg-white/50 px-3 py-1.5 text-sm text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-white sm:px-4"
            >
              <HistoryIcon size={15} />
              <span className="hidden sm:inline">History</span>
            </button>

            <div className="flex items-center gap-2 rounded-xl border border-white/60 bg-white/50 py-1 pl-1 pr-2 shadow-sm sm:pl-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-calmblue to-purpleaccent text-xs font-semibold text-white">
                {user?.name?.[0]?.toUpperCase() || "U"}
              </div>
              <span className="hidden max-w-[110px] truncate text-sm font-medium text-slate-700 md:inline">
                {user?.name || "You"}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="rounded-xl border border-white/60 bg-white/50 px-3 py-1.5 text-sm text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-white sm:px-4"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        {/* ambient floating accents */}
        <div className="ambient-blob pointer-events-none h-56 w-56 bg-skyblue/20 -left-16 top-0" />
        <div
          className="ambient-blob pointer-events-none h-64 w-64 bg-softpurple/25 -right-16 top-20"
          style={{ animationDelay: "1.5s" }}
        />

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative mb-8">
          <h2 className="font-display text-2xl font-medium sm:text-3xl">
            <span className="text-slate-800">Welcome</span>
            {user ? <span className="premium-gradient-text">, {user.name}</span> : null}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {status
              ? `${status.remainingCalls} of ${status.maxCallsPerDay} consultations remaining today.`
              : "Loading today's status..."}
          </p>
          {status?.lastMoodSummary && (
            <p className="mt-1 text-xs text-slate-400">Last check-in: {status.lastMoodSummary}</p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="gradient-border-card relative shadow-premium"
        >
          <div className="gradient-border-card-inner p-5 sm:p-8">
            <ConsultationCall
              remainingCalls={status?.remainingCalls ?? 0}
              onLimitReached={handleLimitReached}
              onCallStart={registerCallStart}
              onCallEnd={handleCallEnd}
              onRecordingChange={setRecordingState}
            />
          </div>
        </motion.div>
      </main>
    </div>
  );
}