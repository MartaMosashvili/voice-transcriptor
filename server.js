const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');
const rateLimit = require('express-rate-limit');
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
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, 'uploads');
const maxFileSize = 25 * 1024 * 1024;
const baseGeorgianPrompt = 'გამარჯობა, ეს არის ქართული საუბრის ტრანსკრიფცია.';
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function longestCommonSubstringLength(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);

  if (!a || !b) {
    return 0;
  }

  let previous = new Array(b.length + 1).fill(0);
  let best = 0;

  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array(b.length + 1).fill(0);

    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        current[j] = previous[j - 1] + 1;
        best = Math.max(best, current[j]);
      }
    }

    previous = current;
  }

  return best;
}

function mostlyEchoes(text, source) {
  const cleanedText = normalizeText(text);
  const cleanedSource = normalizeText(source);

  if (!cleanedText || !cleanedSource || cleanedSource.length < 12) {
    return false;
  }

  if (cleanedText === cleanedSource) {
    return true;
  }

  if (cleanedSource.includes(cleanedText) && cleanedText.length >= Math.min(24, cleanedSource.length * 0.5)) {
    return true;
  }

  if (cleanedText.startsWith(cleanedSource)) {
    return true;
  }

  const sharedLength = longestCommonSubstringLength(cleanedText, cleanedSource);
  return sharedLength >= 24 && sharedLength / cleanedText.length >= 0.7;
}

function stripEchoPrefix(text, source) {
  const cleanedText = normalizeText(text);
  const cleanedSource = normalizeText(source);

  if (!cleanedText || !cleanedSource) {
    return cleanedText;
  }

  if (cleanedText === cleanedSource) {
    return '';
  }

  if (cleanedSource.includes(cleanedText) && cleanedText.length >= Math.min(24, cleanedSource.length * 0.5)) {
    return '';
  }

  if (cleanedText.startsWith(cleanedSource)) {
    return cleanedText.slice(cleanedSource.length).replace(/^[\s\p{P}]+/u, '').trim();
  }

  return cleanedText;
}

function removePromptEcho(text, sources) {
  let cleaned = normalizeText(text);
  const candidates = sources.map(normalizeText).filter(Boolean).sort((a, b) => b.length - a.length);

  for (const source of candidates) {
    cleaned = stripEchoPrefix(cleaned, source);

    if (!cleaned) {
      return '';
    }
  }

  for (const source of candidates) {
    if (mostlyEchoes(cleaned, source)) {
      return '';
    }

    if (source.length >= 24 && cleaned.includes(source)) {
      cleaned = cleaned.replace(source, '').replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '').trim();
    }
  }

  return cleaned;
}

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

const transcribeRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'მოთხოვნების ლიმიტი გადაჭარბებულია. სცადეთ ხელახლა ერთი წუთის შემდეგ.' });
  },
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/transcribe', transcribeRateLimit, upload.single('audio'), async (req, res) => {
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
    const text = removePromptEcho(transcription.text || '', [prompt, baseGeorgianPrompt, context]);

    return res.json({ text });
  } catch (error) {
    console.error('OpenAI transcription failed:', error.message || error);
    return res.status(502).json({
      error: 'Transcription failed. Please try again.',
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
