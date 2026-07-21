import User from "../models/User.model.js";
import generateToken from "../utils/generateToken.js";

// @route POST /api/auth/register
export const registerUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "An account with this email already exists" });
    }

    const user = await User.create({ name, email, password });
    generateToken(res, user._id);

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/auth/login
export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    generateToken(res, user._id);

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/auth/logout
// @route POST /api/auth/logout
export const logoutUser = (req, res) => {
  res.cookie(process.env.JWT_COOKIE_NAME || "listen_you_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    expires: new Date(0),
  });
  res.status(200).json({ message: "Logged out successfully" });
};
// @route GET /api/auth/me
export const getProfile = async (req, res) => {
  const user = req.user;
  const remainingCalls = user.getRemainingCalls();
  await user.save();

  res.status(200).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    remainingCalls,
    maxCallsPerDay: user.maxCallsPerDay,
    maxCallDurationSeconds: user.maxCallDurationSeconds,
    lastMoodSummary: user.lastMoodSummary,
    lastConsultationAt: user.lastConsultationAt,
  });
};
