# Transcriptor
**🔴 Live Demo:** https://voice-transcriptor.onrender.com

*პირველი ჩატვირთვა შეიძლება ~1 წუთი გაგრძელდეს (უფასო სერვერი უმოქმედობისას იძინებს). რეკომენდებული ბრაუზერი: **Chrome** ან **Edge** (Windows, macOS, Android). Safari და iOS არ არის მხარდაჭერილი WebM-ჩაწერის შეზღუდვის გამო.*

Live Georgian speech transcription web app. Node.js/Express backend calls OpenAI `gpt-4o-transcribe`; vanilla JS frontend with a Siri-style orb, chunked recording with silence detection, cross-chunk context continuity, and prompt-echo stripping.

## Features

- **Chunked live recording** — audio is split on ~800 ms silence or a 12 s maximum per chunk
- **Cross-chunk context** — the last 200 characters of transcript are sent as prompt context for the next chunk
- **Prompt-echo protection** — server-side logic strips repeated prompt text from model output
- **Rate limiting** — `/transcribe` accepts at most 30 requests per minute per IP

## Local setup

1. Open a terminal in this folder.
2. Install dependencies:

```powershell
npm install
```

3. Create a `.env` file:

```text
OPENAI_API_KEY=your_api_key_here
```

4. Start the server:

```powershell
npm start
```

5. Open `http://localhost:3000` in your browser (Chrome or Edge recommended).

## Render deployment

1. Create a new **Web Service** on [Render](https://render.com) connected to this repository.
2. Set **Build Command** to `npm install` and **Start Command** to `npm start`.
3. In the Render dashboard, add an environment variable:
   - `OPENAI_API_KEY` — your OpenAI API key
4. **PORT** is set automatically by Render; the server reads `process.env.PORT` and requires no manual configuration.
5. Deploy. The app is served over HTTPS, which is required for microphone access in the browser.

## API

`POST /transcribe` — `multipart/form-data`

| Field    | Description                          |
|----------|--------------------------------------|
| `audio`  | Audio file (WebM, max 25 MB)         |
| `context`| Optional prior transcript (≤200 chars)|

Response:

```json
{
  "text": "..."
}
```

Rate-limited requests receive HTTP 429 with a JSON error body.

## Known limitations

- **Georgian accuracy** — fast or unclear speech may produce errors or omissions; the model works best with clear, steady speech.
- **Safari / iOS** — not supported. The app requires WebM via `MediaRecorder`, which Safari on iOS does not provide reliably. Use Chrome or Edge on desktop or Android.
