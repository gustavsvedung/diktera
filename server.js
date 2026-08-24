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
  let stage = 'init';

  try {
    // Write buffer to a temporary file because OpenAI SDK needs a file stream
    fs.writeFileSync(tempFilePath, audioBuffer);

    // 1. Transcribe (gpt-4o-transcribe handles English titles inside Swedish
    // speech far better than whisper-1 did)
    stage = 'transcription (OpenAI)';
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: 'gpt-4o-transcribe',
      language: 'sv', // Swedish
    });

    const transcribedText = transcription.text;

    // 2. Analyze and rewrite with Claude
    const lessonTemplate = `## Lektion [dagens datum]

### Minnesanteckningar
[Den transkriberade röstanteckningen i sin helhet, justerad till tydligt skriftspråk. Så ta bort alla talspråskformuleringar och formatera texten som om det vore en personlig minnesanteckning gjord av en lärare. Om det finns uppgifter om att läraren lovat att fixa något efter lektionen, som att t ex dela noter med eleven, markera detta med fet stil.]

#### Dagens arbetsmaterial
[Titel på ev. material som arbetats med under lektionen, till exempel en sång, musikstycke, artikel eller bok. Skriv ut titeln i originalspråket, översätt den inte. Om det handlar om musik, ta med anteckning om tonart eller transponering om det finns.]

#### Läxa till nästa lektion
[Uppgift om ev. ny läxa eller särskild arbetsuppgift som givits eleven att arbeta med till nästa lektion.]`;

    const today = new Date().toISOString().split('T')[0];
    const prompt = `Analysera röstanteckningarna och använd informationen för att fylla i lektionsdokumentationen enligt mallen nedan. Behåll all information från anteckningen, inklusive mindre detaljer och observationer. Dagens datum: ${today}.

Här är mallen:
${lessonTemplate}

Här är den transkriberade texten:
"${transcribedText}"`;

    stage = 'formatting (Anthropic)';
    const claudeResponse = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      // Filling in a template from a short memo doesn't need deep reasoning.
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: prompt }],
    });

    // The model may emit thinking blocks before the answer, so pick the text
    // block rather than assuming it is first.
    const formattedText = claudeResponse.content.find((b) => b.type === 'text')?.text;

    if (!formattedText) {
      throw new Error(
        `No text block in Claude response (stop_reason: ${claudeResponse.stop_reason}, ` +
        `blocks: ${claudeResponse.content.map((b) => b.type).join(', ')})`
      );
    }

    res.json({ formattedText });

  } catch (error) {
    // Log the full provider error server-side (visible in the Render logs).
    // The client deliberately only ever sees the generic message below.
    console.error(`Error processing audio during ${stage}:`, {
      status: error.status,
      type: error.error?.error?.type ?? error.error?.type,
      code: error.error?.error?.code ?? error.code,
      message: error.message,
    });
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