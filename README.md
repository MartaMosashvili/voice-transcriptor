# Transcriptor

Simple Node.js Express server that serves `index.html` and provides a `/transcribe` endpoint for Georgian audio transcription with OpenAI Whisper.

## Setup on Windows

1. Open PowerShell in this folder.
2. Install dependencies:

```powershell
npm install
```

3. Create a `.env` file in this folder:

```text
OPENAI_API_KEY=your_api_key_here
```

4. Start the server:

```powershell
node server.js
```

5. Open `http://localhost:3000` in your browser.

## API

Send a `POST` request to `/transcribe` using `multipart/form-data` with the audio file in the `audio` field.

The response is:

```json
{
  "text": "..."
}
```

Uploaded audio files are limited to 25MB.
