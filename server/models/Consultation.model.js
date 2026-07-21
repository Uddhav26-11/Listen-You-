import mongoose from "mongoose";

const moodSnapshotSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    source: { type: String, enum: ["voice", "face", "text", "combined"], default: "combined" },
    label: { type: String }, // e.g. "calm", "low", "anxious", "brighter"
    confidenceNote: { type: String }, // human-readable, non-absolute e.g. "tentative"
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "doctor"], required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const consultationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
    durationSeconds: { type: Number, default: 0 },

    transcript: [messageSchema],
    moodSnapshots: [moodSnapshotSchema],

    // Short AI-generated title summarizing what the conversation was about,
    // e.g. "Work Stress Discussion" — generated once at end-of-call.
    title: { type: String, default: "" },

    // Short natural-language summary generated at end of call, used to seed memory next time
    summary: { type: String, default: "" },
    overallMoodLabel: { type: String, default: "" },

    recording: {
      videoUrl: { type: String, default: null },
      audioUrl: { type: String, default: null },
      storedAt: { type: Date, default: null },
    },

    status: {
      type: String,
      enum: ["in_progress", "completed", "aborted"],
      default: "in_progress",
    },

    language: { type: String, enum: ["en", "hi"], default: "en" },
  },
  { timestamps: true }
);

consultationSchema.index({ user: 1, createdAt: -1 });

const Consultation = mongoose.model("Consultation", consultationSchema);
export default Consultation;
