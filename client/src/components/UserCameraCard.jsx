import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, ScanFace } from "lucide-react";
import useFaceEmotion from "../hooks/useFaceEmotion.js";

export default function UserCameraCard({ active, onStreamReady, onError, onEmotionUpdate }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState(null);

  // Camera is the PRIMARY signal for the user's emotional state. This runs
  // continuously while the call is active and smooths readings over several
  // seconds so we never draw a conclusion from a single frame.
  const { ready: faceReady, currentEmotion } = useFaceEmotion({
    videoRef,
    active: active && camOn && !error,
  });

  useEffect(() => {
    if (currentEmotion) onEmotionUpdate?.(currentEmotion);
  }, [currentEmotion, onEmotionUpdate]);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        onStreamReady?.(stream);
      })
      .catch(() => {
        setError("Camera/microphone access was denied. Please allow access to continue.");
        onError?.();
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  const toggleMic = () => {
    const track = streamRef.current?.getAudioTracks()?.[0];
    if (track) track.enabled = !track.enabled;
    setMicOn((v) => !v);
  };

  const toggleCam = () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (track) track.enabled = !track.enabled;
    setCamOn((v) => !v);
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[24px] bg-slate-900 shadow-premium ring-1 ring-white/40">
      {active && !error ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
          style={{ transform: "scaleX(-1)" }} // mirror effect
        />
      ) : (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
          {error || "Your camera will appear here once the consultation begins."}
        </div>
      )}

      {!camOn && active && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 text-slate-300 text-sm">
          Camera is off
        </div>
      )}

      <div className="absolute bottom-4 left-4 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
        You
      </div>

      {active && camOn && !error && (
        <div
          className="absolute top-4 left-4 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm"
          title="Dr. Listen is gently reading facial expressions to understand how you're feeling — this is only an estimate."
        >
          <ScanFace size={13} className={faceReady ? "opacity-100" : "opacity-40"} />
          {faceReady ? "Reading expressions" : "Starting..."}
        </div>
      )}

      {active && (
        <div className="absolute bottom-4 right-4 flex gap-2">
          <button
            onClick={toggleMic}
            className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-sm transition ${
              micOn ? "bg-white/20 text-white hover:bg-white/30" : "bg-red-500 text-white"
            }`}
            title={micOn ? "Mute" : "Unmute"}
          >
            {micOn ? <Mic size={16} /> : <MicOff size={16} />}
          </button>
          <button
            onClick={toggleCam}
            className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-sm transition ${
              camOn ? "bg-white/20 text-white hover:bg-white/30" : "bg-red-500 text-white"
            }`}
            title={camOn ? "Turn camera off" : "Turn camera on"}
          >
            {camOn ? <Video size={16} /> : <VideoOff size={16} />}
          </button>
        </div>
      )}
    </div>
  );
}
