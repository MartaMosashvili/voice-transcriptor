const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const OpenAI = require('openai');
const path = require('path');
const { toFile } = require('openai/uploads');

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY. Create a .env file with OPENAI_API_KEY=your_api_key_here before starting the server.');
  process.exit(1);
}

const app = express();
const port = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, 'uploads');
const maxFileSize = 25 * 1024 * 1024;
const baseGeorgianPrompt = 'გამარჯობა, ეს არის ქართული საუბრის ტრანსკრიფცია.';
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: maxFileSize,
  },
});

app.use(cors());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Missing audio file. Send multipart/form-data with field name 'audio'." });
  }

  try {
    const context = req.body && typeof req.body.context === 'string' ? req.body.context.trim().slice(-200) : '';
    const prompt = context ? `${baseGeorgianPrompt}\n${context}` : baseGeorgianPrompt;
    const audioBuffer = await fs.promises.readFile(req.file.path);
    const originalFilename = path.basename(req.file.originalname) || req.file.filename;
    const audioFile = await toFile(audioBuffer, originalFilename, {
      type: req.file.mimetype,
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'gpt-4o-transcribe',
      prompt,
    });

    return res.json({ text: transcription.text || '' });
  } catch (error) {
    console.error('OpenAI transcription failed:', error);
    return res.status(502).json({
      error: 'Transcription failed. Please try again.',
      details: error.message,
    });
  } finally {
    fs.promises.unlink(req.file.path).catch(() => {});
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Audio file is too large. Maximum size is 25MB.' });
  }

  if (error) {
    console.error('Request failed:', error);
    return res.status(500).json({ error: 'Request failed. Please try again.' });
  }

  return next();
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
