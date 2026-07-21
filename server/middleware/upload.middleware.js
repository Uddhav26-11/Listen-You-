import multer from "multer";

// Memory storage — the recording buffer goes straight to Cloudinary
// (see controllers/consultation.controller.js -> uploadRecording), it is
// never written to local disk. This is important because most deploy hosts
// (Render, Railway, etc.) use an ephemeral filesystem: anything saved to
// disk gets wiped on every restart/redeploy.
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 300 * 1024 * 1024 }, // 300MB per consultation recording
});

export default upload;
