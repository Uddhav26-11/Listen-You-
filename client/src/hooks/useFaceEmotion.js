import { useCallback, useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";

// Models are loaded from a CDN at runtime so we don't need to vendor the
// (fairly large) weight files into the repo.
const MODEL_URL = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights";

const DETECT_INTERVAL_MS = 900; // one sample roughly every second
const SMOOTHING_WINDOW = 6; // ~5-6 seconds of samples before we "trust" a label
const MIN_SAMPLES_FOR_LABEL = 3;

let modelsLoadingPromise = null;
function loadModels() {
  if (!modelsLoadingPromise) {
    modelsLoadingPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    ]);
  }
  return modelsLoadingPromise;
}

const EXPRESSION_LABELS = {
  happy: "a light, positive expression",
  sad: "a low or heavy expression",
  angry: "some tension or frustration",
  fearful: "some worry or unease",
  disgusted: "some discomfort",
  surprised: "surprise",
  neutral: "a calm, neutral expression",
};

/**
 * Continuously (but gently) estimates the user's emotional state from a
 * <video> element using face-api.js. Camera is the PRIMARY signal — this
 * hook never uses audio. It smooths over a rolling window of samples so a
 * single odd frame (blink, camera glitch, looking away) never produces an
 * abrupt conclusion.
 *
 * Returns:
 *  - ready: models loaded and detection loop running
 *  - currentEmotion: { label, description, eyeContact, confidence } | null
 *  - getSnapshotForBackend(): a plain-language, hedged description safe to
 *    send to the AI ("It looks like..." style), or null if not confident yet
 */
export default function useFaceEmotion({ videoRef, active }) {
  const [ready, setReady] = useState(false);
  const [modelsFailed, setModelsFailed] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState(null);

  const historyRef = useRef([]); // rolling window of raw expression samples
  const intervalRef = useRef(null);
  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
    };
  }, []);

  const smoothAndSetEmotion = useCallback(() => {
    const history = historyRef.current;
    if (history.length < MIN_SAMPLES_FOR_LABEL) return;

    // Average each expression's probability across the window, then pick the
    // dominant one. This avoids reacting to any single frame.
    const totals = {};
    let eyeContactSamples = 0;
    let eyeContactTrue = 0;
    for (const sample of history) {
      for (const [expr, prob] of Object.entries(sample.expressions)) {
        totals[expr] = (totals[expr] || 0) + prob;
      }
      if (typeof sample.eyeContact === "boolean") {
        eyeContactSamples += 1;
        if (sample.eyeContact) eyeContactTrue += 1;
      }
    }

    let bestLabel = "neutral";
    let bestScore = -Infinity;
    for (const [expr, sum] of Object.entries(totals)) {
      const avg = sum / history.length;
      if (avg > bestScore) {
        bestScore = avg;
        bestLabel = expr;
      }
    }

    const confidence = bestScore > 0.6 ? "clear" : bestScore > 0.4 ? "moderate" : "tentative";
    const eyeContact = eyeContactSamples > 0 ? eyeContactTrue / eyeContactSamples > 0.5 : null;

    setCurrentEmotion({
      label: bestLabel,
      description: EXPRESSION_LABELS[bestLabel] || "a mixed expression",
      eyeContact,
      confidence,
      sampleCount: history.length,
    });
  }, []);

  useEffect(() => {
    if (!active || !videoRef?.current) {
      historyRef.current = [];
      setCurrentEmotion(null);
      return;
    }

    let cancelled = false;

    loadModels()
      .then(() => {
        if (cancelled || disposedRef.current) return;
        setReady(true);

        const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 224 });

        intervalRef.current = setInterval(async () => {
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;

          try {
            const detection = await faceapi
              .detectSingleFace(video, detectorOptions)
              .withFaceLandmarks(true)
              .withFaceExpressions();

            if (!detection) return; // no face this frame — skip, don't conclude anything

            // Rough eye-contact heuristic: are both eyes roughly level and
            // facing forward (nose between the eyes horizontally)?
            let eyeContact = null;
            try {
              const landmarks = detection.landmarks;
              const leftEye = landmarks.getLeftEye();
              const rightEye = landmarks.getRightEye();
              const nose = landmarks.getNose();
              const eyeMidX = (leftEye[0].x + rightEye[3].x) / 2;
              const noseX = nose[3]?.x ?? eyeMidX;
              eyeContact = Math.abs(noseX - eyeMidX) < 15;
            } catch {
              eyeContact = null;
            }

            historyRef.current = [
              ...historyRef.current,
              { expressions: detection.expressions, eyeContact },
            ].slice(-SMOOTHING_WINDOW);

            smoothAndSetEmotion();
          } catch {
            /* skip a bad frame silently */
          }
        }, DETECT_INTERVAL_MS);
      })
      .catch(() => {
        if (!cancelled) setModelsFailed(true);
      });

    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [active, videoRef, smoothAndSetEmotion]);

  // A hedged, natural-language snapshot safe to hand to the AI. Only returns
  // something once we have enough samples to be reasonably confident.
  const getSnapshotForBackend = useCallback(() => {
    const e = currentEmotion;
    if (!e || e.sampleCount < MIN_SAMPLES_FOR_LABEL) return null;
    if (e.confidence === "tentative") return null;
    return {
      label: e.label,
      description: e.description,
      eyeContact: e.eyeContact,
      confidence: e.confidence,
    };
  }, [currentEmotion]);

  return { ready, modelsFailed, currentEmotion, getSnapshotForBackend };
}
