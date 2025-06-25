require('dotenv').config();
const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.static('public'));
app.use(express.json());

app.post('/process-audio', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No audio file uploaded.');
  }

  const audioBuffer = req.file.buffer;
  const tempFilePath = path.join(__dirname, 'temp_audio.webm');
  
  try {
    // Write buffer to a temporary file because OpenAI SDK needs a file stream
    fs.writeFileSync(tempFilePath, audioBuffer);

    // 1. Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: 'whisper-1',
      language: 'sv', // Swedish
    });

    const transcribedText = transcription.text;

    // 2. Analyze and rewrite with Claude
    const lessonTemplate = `## Lektion [dagens datum]

### Minnesanteckningar
[Den transkriberade röstanteckningen i sin helhet, justerad till tydligt skriftspråk. Så ta bort alla talspråskformuleringar och formatera texten som om det vore en personlig minnesanteckning gjord av en lärare. Om det finns uppgifter om att läraren lovat att fixa något efter lektionen, som att t ex dela noter med eleven, markera detta med fet stil.]

#### Dagens arbetsmaterial
[Titel på ev. material som arbetats med under lektionen, till exempel en sång, musikstycke, artikel eller bok. Om det handlar om musik, ta med anteckning om tonart eller transponering om det finns.]

#### Läxa till nästa lektion
[Uppgift om ev. ny läxa eller särskild arbetsuppgift som givits eleven att arbeta med till nästa lektion.]`;

    const today = new Date().toISOString().split('T')[0];
    const prompt = `Du är en hjälpsam assistent för en lärare. Analysera följande transkriberade röstanteckning från en lektion och formatera den enligt mallen med markdown. Byt ut [dagens datum] mot dagens datum (${today}). Se till att all text är på svenska.

Här är mallen:
${lessonTemplate}

Här är den transkriberade texten:
"${transcribedText}"`;

    const claudeResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const formattedText = claudeResponse.content[0].text;

    res.json({ formattedText });

  } catch (error) {
    console.error('Error processing audio:', error);
    res.status(500).send('Error processing audio.');
  } finally {
    // Clean up the temporary file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
}); 