import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Play,
  X,
  Video as VideoIcon,
  Clock,
  Search,
  MessageSquareText,
  Trash2,
  Calendar,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import api from "../api/axios.js";

const formatDuration = (s = 0) => {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

// Loosely maps a free-form AI mood label to one of a few calming accent
// colors, so badges feel intentional rather than random.
const moodStyle = (mood = "") => {
  const m = mood.toLowerCase();
  if (/(calm|relax|peace|content|okay|fine)/.test(m)) return "bg-mintgreen/15 text-mintgreen";
  if (/(anx|stress|worry|overwhelm|tense)/.test(m)) return "bg-amber-400/15 text-amber-600";
  if (/(low|sad|down|lonely|tired|drain)/.test(m)) return "bg-calmblue/15 text-calmblue";
  if (/(bright|happy|hope|confiden|motivat|positive)/.test(m)) return "bg-purpleaccent/15 text-purpleaccent";
  return "bg-slate-200/60 text-slate-600";
};

// Builds a single lowercased blob of every date/text field we want the
// search bar to match against (title, month name, weekday, "16 Jul", year, etc).
const buildSearchIndex = (c) => {
  const d = new Date(c.startedAt || c.createdAt);
  const parts = [
    c.title,
    c.summary,
    c.overallMoodLabel,
    d.toLocaleDateString(undefined, { weekday: "long" }),
    d.toLocaleDateString(undefined, { weekday: "short" }),
    d.toLocaleDateString(undefined, { month: "long" }),
    d.toLocaleDateString(undefined, { month: "short" }),
    d.getFullYear().toString(),
    d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }),
    d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
};

function EmptyState({ onStart }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel mx-auto mt-6 flex max-w-md flex-col items-center gap-4 rounded-[28px] px-8 py-14 text-center shadow-premium"
    >
      <div className="relative flex h-28 w-28 items-center justify-center">
        <div className="ambient-blob h-28 w-28 bg-calmblue/20" />
        <div className="ambient-blob h-20 w-20 bg-purpleaccent/20" style={{ animationDelay: "1.5s" }} />
        <Sparkles size={40} className="relative text-calmblue" />
      </div>
      <h3 className="font-display text-xl font-medium text-slate-800">No consultations yet.</h3>
      <p className="text-sm text-slate-500">
        Your consultation history will appear here after your first session with Dr. Listen.
      </p>
      <button
        onClick={onStart}
        className="mt-2 rounded-full bg-gradient-to-r from-calmblue to-purpleaccent px-6 py-2.5 text-sm font-medium text-white shadow-glow transition hover:opacity-90 hover:-translate-y-0.5"
      >
        Start Consultation
      </button>
    </motion.div>
  );
}

export default function History() {
  const navigate = useNavigate();
  const [consultations, setConsultations] = useState(null);
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState(null); // consultation object being played
  const [transcriptFor, setTranscriptFor] = useState(null); // consultation object
  const [transcriptDetail, setTranscriptDetail] = useState(null); // fetched full record w/ transcript
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // consultation object pending delete confirm
  const [deleting, setDeleting] = useState(false);

  const loadHistory = () => {
    api
      .get("/consultations/history")
      .then(({ data }) => setConsultations(data))
      .catch(() => toast.error("Could not load consultation history"));
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const filtered = useMemo(() => {
    if (!consultations) return null;
    const q = query.trim().toLowerCase();
    if (!q) return consultations;
    return consultations.filter((c) => buildSearchIndex(c).includes(q));
  }, [consultations, query]);

  const openTranscript = async (c) => {
    setTranscriptFor(c);
    setTranscriptDetail(null);
    setTranscriptLoading(true);
    try {
      const { data } = await api.get(`/consultations/${c._id}`);
      setTranscriptDetail(data);
    } catch {
      toast.error("Could not load transcript");
      setTranscriptFor(null);
    } finally {
      setTranscriptLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/consultations/${deleteTarget._id}`);
      setConsultations((prev) => prev.filter((c) => c._id !== deleteTarget._id));
      toast.success("Recording deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Could not delete this recording");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex items-center gap-3 glass-panel px-4 py-4 shadow-premium sm:px-6">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/60 bg-white/50 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
          title="Back to dashboard"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="font-display text-lg font-medium text-slate-800">Recording History</span>
      </header>

      <main className="relative mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="ambient-blob pointer-events-none h-56 w-56 bg-skyblue/15 -left-16 top-0" />
        <div
          className="ambient-blob pointer-events-none h-64 w-64 bg-softpurple/20 -right-16 top-24"
          style={{ animationDelay: "1.5s" }}
        />

        {/* Search bar */}
        {consultations !== null && consultations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mb-6 flex items-center gap-2 rounded-2xl glass-panel px-4 py-3 shadow-premium"
          >
            <Search size={18} className="shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, date, month, or year — e.g. Work, Family, 2026, 16 Jul"
              className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X size={14} />
              </button>
            )}
          </motion.div>
        )}

        {consultations === null && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-3xl bg-white/40" />
            ))}
          </div>
        )}

        {consultations?.length === 0 && <EmptyState onStart={() => navigate("/dashboard")} />}

        {consultations?.length > 0 && filtered?.length === 0 && (
          <p className="mt-10 text-center text-sm text-slate-500">
            No recordings match "{query}".
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AnimatePresence>
            {filtered?.map((c, i) => {
              const started = new Date(c.startedAt || c.createdAt);
              return (
                <motion.div
                  key={c._id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  className="glass-card flex flex-col justify-between gap-4 rounded-3xl p-5 shadow-premium"
                >
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-base font-medium leading-snug text-slate-800">
                        {c.title || "Consultation Session"}
                      </h3>
                      {c.overallMoodLabel && (
                        <span
                          className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${moodStyle(
                            c.overallMoodLabel
                          )}`}
                        >
                          {c.overallMoodLabel}
                        </span>
                      )}
                    </div>

                    {c.summary && <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">{c.summary}</p>}

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {started.toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <span>
                        {started.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> {formatDuration(c.durationSeconds)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        c.recording?.videoUrl
                          ? setPlaying(c)
                          : toast.error("No recording was saved for this consultation.")
                      }
                      disabled={!c.recording?.videoUrl}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium shadow-sm transition ${
                        c.recording?.videoUrl
                          ? "bg-calmblue text-white hover:opacity-90 hover:-translate-y-0.5"
                          : "cursor-not-allowed bg-slate-100 text-slate-300"
                      }`}
                      title={c.recording?.videoUrl ? "Play recording" : "No recording available"}
                    >
                      {c.recording?.videoUrl ? <Play size={14} /> : <VideoIcon size={14} />}
                      Play
                    </button>
                    <button
                      onClick={() => openTranscript(c)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/70 py-2 text-xs font-medium text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
                      title="View transcript"
                    >
                      <MessageSquareText size={14} />
                      Transcript
                    </button>
                    <button
                      onClick={() => setDeleteTarget(c)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70 text-red-400 shadow-sm transition hover:-translate-y-0.5 hover:bg-red-50 hover:text-red-500"
                      title="Delete recording"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </main>

      {/* Playback modal */}
      <AnimatePresence>
        {playing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setPlaying(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl overflow-hidden rounded-2xl bg-slate-900 shadow-2xl"
            >
              <div className="flex items-center justify-between px-4 py-3 text-sm text-white/80">
                <span>{playing.title || "Consultation"} · {new Date(playing.startedAt || playing.createdAt).toLocaleString()}</span>
                <button
                  onClick={() => setPlaying(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
                >
                  <X size={16} />
                </button>
              </div>
              <video
                src={playing.recording.videoUrl}
                controls
                autoPlay
                className="max-h-[70vh] w-full bg-black"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transcript modal */}
      <AnimatePresence>
        {transcriptFor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setTranscriptFor(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/50 px-5 py-3.5">
                <div>
                  <p className="font-display text-sm font-medium text-slate-800">
                    {transcriptFor.title || "Transcript"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(transcriptFor.startedAt || transcriptFor.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => setTranscriptFor(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-white/60"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {transcriptLoading && <p className="text-sm text-slate-500">Loading transcript...</p>}
                {!transcriptLoading && transcriptDetail?.transcript?.length === 0 && (
                  <p className="text-sm text-slate-500">No transcript was saved for this consultation.</p>
                )}
                {!transcriptLoading &&
                  transcriptDetail?.transcript?.map((m, i) => (
                    <div key={i} className={`mb-3 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                          m.role === "user"
                            ? "bg-calmblue text-white"
                            : "bg-white/80 text-slate-700"
                        }`}
                      >
                        {m.text}
                      </div>
                    </div>
                  ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => !deleting && setDeleteTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl glass-panel p-6 text-center shadow-2xl"
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-500">
                <AlertTriangle size={22} />
              </div>
              <h3 className="font-display text-base font-medium text-slate-800">
                Are you sure you want to delete this recording?
              </h3>
              <p className="mt-1.5 text-xs text-slate-500">
                This will permanently remove the recording, transcript, and saved details. This can't be undone.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 rounded-xl border border-slate-200 bg-white/70 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-white disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
