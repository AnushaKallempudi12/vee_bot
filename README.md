# Riya AI — Visa Interview Practice

Riya is a browser-based mock U.S. visa interview practice app. The frontend is a static GitHub Pages site; the FastAPI backend handles PDF profile extraction, secure OpenAI API requests, and interview feedback.

## Current architecture

- **Frontend:** GitHub Pages (existing HTML, CSS, and JavaScript)
- **Backend:** FastAPI hosted on Railway
- **Live voice:** OpenAI Realtime API over WebRTC
- **Interview feedback and text endpoints:** OpenAI Responses API
- **PDF processing:** PyMuPDF plus the existing local, allow-listed profile extractor

The OpenAI API key stays on the backend. The browser sends its WebRTC offer to FastAPI; FastAPI creates the Realtime call with the server-side key and returns the SDP answer. No permanent API key is sent to GitHub Pages.

## Features retained

- F1, F2, B1/B2, H1B, and H4 practice categories
- English interview setup
- Questions-only preparation
- Optional PDF upload (10 MB maximum, 20 pages maximum)
- Extracted-profile review and editing before the interview
- Visa-specific interviewer instructions
- Natural speech-to-speech conversation with interruptions and adaptive follow-up questions
- Mute/unmute, repeat question, interview timer, and end interview controls
- Transcript-based final feedback, strengths, improvement areas, consistency notes, and practice tips

The PDF profile extractor only returns approved fields. It excludes names, addresses, passport details, dates of birth, contact details, and government identifiers.

## 1. Deploy the backend to Railway

1. Sign in to Railway and create a new project.
2. Choose **Deploy from GitHub Repo** and connect `AnushaKallempudi12/vee_bot`.
3. Open the new service's **Settings**.
4. Set **Root Directory** to `/backend`. This repository also contains the static frontend at its root, so the backend service must use this subdirectory.
5. Set the build command to:

   ```bash
   pip install -r requirements.txt
   ```

6. Set the start command to:

   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

7. Add these variables in the Railway service's **Variables** tab:

   | Variable | Value |
   |---|---|
   | `OPENAI_API_KEY` | Your OpenAI API key |
   | `OPENAI_TEXT_MODEL` | `gpt-6-luna` |
   | `OPENAI_REALTIME_MODEL` | `gpt-realtime-2.1-mini` |
   | `RIYA_INTERVIEW_DURATION_MINUTES` | `15` |

8. In Railway **Settings → Networking**, generate a public domain.
9. After deployment, open `https://YOUR-RAILWAY-DOMAIN/health`. It should return `"status": "healthy"` and `"openai_configured": true`.

Do not commit your real API key or put it in frontend JavaScript. The ChatGPT subscription does not include API usage; API billing and limits are managed separately in the OpenAI Platform.

## 2. Point GitHub Pages to Railway

After Railway has generated the public domain:

1. Open `app.js` in this repository.
2. Replace the placeholder in this line with your Railway domain:

   ```js
   const BACKEND_URL = window.RIYA_BACKEND_URL || "https://YOUR-RAILWAY-DOMAIN";
   ```

3. Commit the change to the deployment branch used by GitHub Pages.
4. Wait for GitHub Pages to publish, then open the site using HTTPS and allow microphone access.

The backend CORS allow-list already includes `https://anushakallempudi12.github.io`.

## 3. Local backend development

From the `backend` directory:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Add your OpenAI API key to backend/.env
uvicorn main:app --reload --port 8000
```

For local frontend testing, temporarily set `BACKEND_URL` in `app.js` to `http://localhost:8000`. The browser must run on localhost or HTTPS to access the microphone.

## API endpoints

- `GET /` — service welcome/status
- `GET /health` — backend and OpenAI configuration status
- `POST /api/interview/setup` — validate the selected interview setup
- `POST /api/realtime/session` — create an OpenAI Realtime WebRTC session
- `POST /api/interview/chat` — text-based interview response endpoint
- `POST /api/interview/feedback` — generate structured interview feedback
- `POST /api/documents/profile-preview` — extract approved fields from a PDF for user review
- `POST /api/documents/inspect` — inspect a PDF

## Validation status

Code migration and static checks are performed in the migration pull request. A real microphone-to-OpenAI voice session, PDF upload on the deployed Railway service, and end-to-end feedback flow still need to be tested after adding the API key and Railway domain.
