import express from "express";
import {
  startConsultation,
  chatTurn,
  speak,
  endConsultation,
  uploadRecording,
  getHistory,
  getStatus,
  getOne,
  deleteConsultation,
} from "../controllers/consultation.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/upload.middleware.js";

const router = express.Router();

router.use(protect);

router.get("/status", getStatus);
router.get("/history", getHistory);
router.post("/start", startConsultation);
router.post("/:id/chat", chatTurn);
router.post("/:id/speech", speak);
router.post("/:id/recording", upload.single("recording"), uploadRecording);
router.post("/:id/end", endConsultation);
router.get("/:id", getOne);
router.delete("/:id", deleteConsultation);

export default router;
