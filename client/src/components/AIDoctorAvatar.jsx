import { motion, AnimatePresence } from "framer-motion";

/**
 * Realistic-leaning, calm animated avatar for Dr. Listen.
 * state: "idle" | "listening" | "thinking" | "speaking"
 */
export default function AIDoctorAvatar({ state = "idle" }) {
  const isSpeaking = state === "speaking";
  const isThinking = state === "thinking";
  const isListening = state === "listening";

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-[24px] bg-gradient-to-br from-[#eef1fb] via-[#f4f0fb] to-[#eafaf1] transition-shadow duration-500 ${
        isSpeaking ? "speak-glow" : "shadow-premium"
      }`}
    >
      {/* soft ambient blobs */}
      <div className="ambient-blob h-40 w-40 bg-purpleaccent/40 -left-10 -top-10" />
      <div className="ambient-blob h-48 w-48 bg-mintgreen/40 -right-12 bottom-0" style={{ animationDelay: "2s" }} />

      {/* presence ring while listening */}
      {isListening && (
        <div className="absolute h-56 w-56 rounded-full border-2 border-calmblue/40 ring-pulse" />
      )}

      <div className="head-sway relative flex flex-col items-center">
        {/* face */}
        <svg width="180" height="200" viewBox="0 0 180 200" className="drop-shadow-sm">
          {/* neck/shoulders (coat) */}
          <path d="M40 200 Q90 160 140 200 L140 220 L40 220 Z" fill="#dfe7f5" />
          <path d="M55 195 Q90 175 125 195 L125 220 L55 220 Z" fill="#4a6fa5" />

          {/* neck */}
          <rect x="78" y="120" width="24" height="30" rx="8" fill="#e8bfa0" />

          {/* head */}
          <ellipse cx="90" cy="95" rx="52" ry="58" fill="#f0c9a8" />

          {/* hair */}
          <path
            d="M40 85 Q35 35 90 32 Q145 35 140 85 Q140 60 90 55 Q40 60 40 85 Z"
            fill="#5a4a42"
          />

          {/* ears */}
          <ellipse cx="38" cy="98" rx="7" ry="12" fill="#eabf9d" />
          <ellipse cx="142" cy="98" rx="7" ry="12" fill="#eabf9d" />

          {/* eyebrows */}
          <path d="M62 78 Q73 72 84 78" stroke="#4a3b34" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M96 78 Q107 72 118 78" stroke="#4a3b34" strokeWidth="3" fill="none" strokeLinecap="round" />

          {/* eyes */}
          <g className="eye-blink" style={{ transformOrigin: "73px 90px" }}>
            <ellipse cx="73" cy="90" rx="8" ry="6" fill="white" />
            <circle cx="74" cy="90" r="3.5" fill="#3d3128" />
          </g>
          <g className="eye-blink" style={{ transformOrigin: "107px 90px", animationDelay: "0.05s" }}>
            <ellipse cx="107" cy="90" rx="8" ry="6" fill="white" />
            <circle cx="106" cy="90" r="3.5" fill="#3d3128" />
          </g>

          {/* nose */}
          <path d="M90 92 Q86 105 90 110 Q94 108 90 92" fill="#e0b190" opacity="0.6" />

          {/* mouth: shifts shape when "speaking" */}
          <AnimatePresence mode="wait">
            {isSpeaking ? (
              <motion.ellipse
                key="speaking-mouth"
                cx="90"
                cy="125"
                rx="14"
                animate={{ ry: [4, 9, 5, 8, 4] }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                fill="#8a4b45"
              />
            ) : (
              <motion.path
                key="calm-mouth"
                d="M75 123 Q90 132 105 123"
                stroke="#8a4b45"
                strokeWidth="3.5"
                fill="none"
                strokeLinecap="round"
              />
            )}
          </AnimatePresence>

          {/* glasses - calm professional touch */}
          <g opacity="0.5">
            <rect x="58" y="82" width="30" height="18" rx="9" fill="none" stroke="#4a3b34" strokeWidth="2" />
            <rect x="92" y="82" width="30" height="18" rx="9" fill="none" stroke="#4a3b34" strokeWidth="2" />
            <line x1="88" y1="90" x2="92" y2="90" stroke="#4a3b34" strokeWidth="2" />
          </g>
        </svg>

        {/* thinking dots */}
        <AnimatePresence>
          {isThinking && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 flex gap-1.5"
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-2 w-2 rounded-full bg-purpleaccent"
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* name + status chip */}
      <div className="absolute bottom-4 left-4 rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700 backdrop-blur-sm shadow-sm">
        Dr. Listen <span className="text-slate-400">· AI Psychiatrist</span>
      </div>
      <div className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium backdrop-blur-sm shadow-sm">
        <span
          className={`h-2 w-2 rounded-full ${
            isSpeaking
              ? "bg-purpleaccent soft-glow"
              : isListening
              ? "bg-calmblue animate-pulse"
              : isThinking
              ? "bg-amber-400 animate-pulse"
              : "bg-mintgreen"
          }`}
        />
        <span className="text-slate-600">
          {isSpeaking ? "Speaking" : isThinking ? "Thinking" : isListening ? "Listening" : "Online"}
        </span>
      </div>
    </div>
  );
}
