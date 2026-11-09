# Riya AI — Visa Interview Practice

Riya is a browser-based mock U.S. visa interview practice app. The static frontend is hosted on GitHub Pages and the FastAPI backend runs on Railway.

## Architecture

- **Frontend:** GitHub Pages (HTML, CSS, and JavaScript)
- **Backend:** FastAPI on Railway
- **Interview intelligence and feedback:** Google Gemini API, using the free tier where available
- **Voice input and output:** Browser Web Speech APIs (speech recognition and speech synthesis)
- **PDF processing:** PyMuPDF and the existing local allow-listed profile extractor

The Gemini API key stays on the backend. It is never placed in frontend JavaScript. The browser handles microphone recognition and spoken playback; the backend receives the recognized text and asks Gemini for the next interview question or final feedback.

## Features

- F1, F2, B1/B2, H1B, and H4 practice categories
- English interview setup
- Questions-only preparation
- Optional PDF upload (10 MB maximum, 20 pages maximum)
- Extracted-profile review and editing before the interview
- Visa-specific interviewer instructions and adaptive follow-up questions
- Browser-based speech input and spoken responses
- Typed-answer fallback when browser speech recognition is unavailable
- Repeat question, interview timer, and end interview controls
- Transcript-based final feedback, strengths, improvement areas, consistency notes, and practice tips

## Free-tier and privacy notes

Gemini API has a free tier, but it has model-specific rate limits and is not unlimited. Riya tries `gemini-3.8-flash` first and switches to `gemini-3.5-flash-lite` when the primary model times out or returns a model-availability/quota response. Each model attempt is bounded by `GEMINI_MODEL_TIMEOUT_SECONDS` (default 20 seconds), so a slow primary model does not consume the entire browser request deadline. Confirm that both models are available to your Google AI Studio project before deploying. Free-tier limits are model- and project-specific.

Google's Gemini API pricing documentation states that content submitted on the free tier may be used to improve Google's products. Because visa interview answers can contain personal information, do not enter passport numbers, government identifiers, account numbers, or other highly sensitive details. The app redacts several common identifier patterns and only sends the reviewed profile fields, but this is not a guarantee that all sensitive information will be detected. Review the app's privacy notice before inviting other people to use it.

Browser speech recognition support varies. It works best in desktop Google Chrome and may use a browser/platform-provided online recognition service; it is not guaranteed to work offline. Typed answers are available as a fallback. Browser text-to-speech uses the device's available voices.

## 1. Configure the Gemini API

1. Open [Google AI Studio](https://aistudio.google.com/) and create an API key.
2. In Railway, open the Riya backend service and go to **Variables**.
3. Add:

   | Variable | Value |
   |---|---|
   | `GEMINI_API_KEY` | Your Google AI Studio API key |
   | `GEMINI_TEXT_MODEL` | `gemini-3.8-flash` (primary) |
   | `GEMINI_FALLBACK_MODEL` | `gemini-3.5-flash-lite` (fallback) |
   | `GEMINI_MODEL_TIMEOUT_SECONDS` | `20` (per-model timeout; optional) |
   | `RIYA_INTERVIEW_DURATION_MINUTES` | `15` |

4. Keep the key in Railway only. Never commit it or place it in `app.js`.

## 2. Deploy the backend to Railway

1. Connect `AnushaKallempudi12/vee_bot` to Railway and set the deployment branch to `main`.
2. Set the service's **Root Directory** to `/backend`.
3. Set the build command to:

   ```bash
   pip install -r requirements.txt
   ```

4. Set the start command to:

   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

5. Add the Gemini variables listed above.
6. Under **Settings → Networking**, generate a public domain.
7. Open `https://YOUR-RAILWAY-DOMAIN/health`. A configured service should report `"gemini_configured": true` and `"voice_mode": "browser_speech_recognition_and_synthesis"`.

## 3. Configure GitHub Pages

The production frontend is the static application at the repository root:

- `index.html`
- `app.js`
- `styles.css`

The repository also contains an unused Vite/React starter under `src/`. It is not the Riya production frontend and must not be used as the Pages build output.

### One-time GitHub Pages setting

1. Open **Repository → Settings → Pages**.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Save the setting if GitHub displays a Save button.

The workflow in `.github/workflows/pages.yml` validates JavaScript syntax and compiles the backend Python files on pull requests. After changes are merged or pushed to `main`, it publishes only `index.html`, `app.js`, and `styles.css`. It deliberately does not publish the backend source, README, or unused Vite starter files.

Do not configure Pages to publish the old `migration/openai-realtime-railway`, `feature/live-voice-main`, or `feature/live-voice-interview` branches. The production branch is `main`.

### Frontend/backend connection

The frontend's `BACKEND_URL` in `app.js` should point to the Railway public domain:

```js
const BACKEND_URL = "https://veebot-production.up.railway.app";
```

Keep the GitHub Pages site on HTTPS and allow microphone access when prompted. The backend CORS allow-list includes `https://anushakallempudi12.github.io`.

## 4. Local backend development

From the `backend` directory:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Add your Gemini API key to backend/.env
uvicorn main:app --reload --port 8000
```

For local frontend testing, temporarily point `BACKEND_URL` in `app.js` to `http://localhost:8000`. Microphone access requires localhost or HTTPS.

## API endpoints

- `GET /` — service welcome/status
- `GET /health` — backend and Gemini configuration status
- `POST /api/interview/setup` — validate interview setup
- `POST /api/interview/chat` — generate the next interview question or response
- `POST /api/interview/feedback` — generate structured final feedback
- `POST /api/documents/profile-preview` — extract approved fields from a PDF for user review
- `POST /api/documents/inspect` — inspect a PDF

## Production note

This prototype does not yet include user sign-in or per-user quotas. Before sharing it widely, add authentication, rate limiting, and a clear privacy/consent flow so visitors cannot exhaust the shared Gemini free-tier quota and understand how their data is processed.

## Validation status

The migration branch includes static JavaScript syntax validation and backend route/configuration checks. A live Gemini API request, browser microphone test, PDF upload on Railway, and complete feedback run still need to be tested after the Gemini key is configured.
