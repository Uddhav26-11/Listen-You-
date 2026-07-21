import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RECORDINGS_DIR = path.join(__dirname, "..", "uploads", "recordings");

if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RECORDINGS_DIR),
  filename: (req, file, cb) => {
    const ext = file.mimetype === "video/webm" ? "webm" : "dat";
    cb(null, `${req.params.id}-${Date.now()}.${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 300 * 1024 * 1024 }, // 300MB per consultation recording
});

export default upload;
