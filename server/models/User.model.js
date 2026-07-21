import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },
    // Daily consultation usage tracking
    dailyUsage: {
      date: { type: String, default: null }, // stored as YYYY-MM-DD
      callsUsed: { type: Number, default: 0 },
    },
    maxCallsPerDay: { type: Number, default: 5 },
    maxCallDurationSeconds: { type: Number, default: 480 }, // 8 minutes

    // Rolling emotional memory (lightweight pointer; full history lives in Consultation docs)
    lastMoodSummary: { type: String, default: null },
    lastConsultationAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Resets callsUsed if the stored date isn't today; returns remaining calls
userSchema.methods.getRemainingCalls = function () {
  const today = new Date().toISOString().slice(0, 10);
  if (this.dailyUsage.date !== today) {
    this.dailyUsage.date = today;
    this.dailyUsage.callsUsed = 0;
  }
  return this.maxCallsPerDay - this.dailyUsage.callsUsed;
};

const User = mongoose.model("User", userSchema);
export default User;