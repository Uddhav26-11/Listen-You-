# Listen You! — AI Psychiatrist Consultation App (MERN)

This is the project scaffold: authentication, data models, and the daily
call-limit logic are wired up end-to-end. The live video / AI conversation /
mood-detection engine are stubbed with clear TODOs and will be built next.

## Structure

```
listen-you/
├── server/                  Express + MongoDB API
│   ├── config/db.js
│   ├── models/
│   │   ├── User.model.js          auth, daily call quota, rolling mood memory
│   │   └── Consultation.model.js  transcript, mood snapshots, recording refs
│   ├── controllers/
│   ├── routes/
│   ├── middleware/
│   ├── utils/generateToken.js
│   └── server.js             Express + Socket.io entry point
│
└── client/                  React (Vite) + Tailwind
    └── src/
        ├── context/AuthContext.jsx
        ├── api/axios.js
        ├── components/ProtectedRoute.jsx
        └── pages/ (Login, Register, Dashboard)
```

## Getting started

### 1. Backend

```bash
cd server
cp .env.example .env      # fill in MONGO_URI and JWT_SECRET at minimum
npm install
npm run dev                # http://localhost:5000
```

### 2. Frontend

```bash
cd client
npm install
npm run dev                 # http://localhost:5173
```

The Vite dev server proxies `/api` requests to `http://localhost:5000`, and
auth uses an httpOnly JWT cookie, so no token handling is needed on the client.

## What's implemented

- Register / Login / Logout / Get profile (JWT in httpOnly cookie, bcrypt hashing)
- `User` model: daily call quota (5/day, auto-resets by date) and 5-minute-per-call cap
- `Consultation` model: transcript, mood snapshots, summary, recording refs
- Consultation routes: `start` (enforces the daily limit), `end` (saves transcript/summary/mood, updates the user's rolling memory), `history`, `status`
- Socket.io server with placeholder events for WebRTC signaling and live mood updates
- React app shell: routing, auth context, protected routes, Login/Register pages, a Dashboard skeleton that already reads live quota status from the API

## What's next (not yet built)

1. **Dashboard video UI** — the two-card layout (AI doctor / user webcam), Start Consultation button, call timer countdown
2. **AI conversation engine** — GPT-based psychiatrist persona, wired through Socket.io, using `Consultation.summary` history for cross-call memory
3. **Mood detection** — voice features (pitch/pace/pauses) + face-api.js or MediaPipe facial analysis, streamed as `mood-update` socket events
4. **TTS/STT** — real-time voice in/out for the AI doctor
5. **Call recording & storage** — MediaRecorder → upload to server/cloud storage, linked via `Consultation.recording`
6. **Avatar animation** — blinking/lip-sync/idle states for the AI doctor card

## Important product note

This app should make clear to users that it is an AI wellness tool, not a
licensed clinical service, and should direct users to real crisis resources
if a conversation indicates they're in danger — the AI conversation engine
should not attempt to handle acute crises on its own.
