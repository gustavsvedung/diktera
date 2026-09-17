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

const MIME_EXTENSIONS = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.mp4',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
};

// Prefer the uploaded filename's extension, fall back to the declared MIME type.
function audioExtension(file) {
  const fromName = path.extname(file.originalname || '').toLowerCase();
  if (fromName) return fromName;
  const base = (file.mimetype || '').split(';')[0].trim().toLowerCase();
  return MIME_EXTENSIONS[base] || '.webm';
}

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.static('public'));
app.use(express.json());

app.post('/process-audio', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No audio file uploaded.');
  }

  const audioBuffer = req.file.buffer;
  // The transcription API infers the audio format from the file extension, so
  // preserve whatever the browser actually recorded rather than assuming WebM.
  const tempFilePath = path.join(__dirname, `temp_audio${audioExtension(req.file)}`);
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
[Det väsentliga ur röstanteckningen, skrivet som lärarens egen koncisa minnesanteckning på tydligt skriftspråk. Oftast räcker några korta stycken; en lektion med mycket att följa upp får ta mer plats. Om läraren lovat att fixa något efter lektionen, som att t ex dela noter med eleven, markera detta med fet stil.]

#### Dagens arbetsmaterial
[Titel på ev. material som arbetats med under lektionen, till exempel en sång, musikstycke, artikel eller bok. Skriv ut titeln i originalspråket, översätt den inte. Om det handlar om musik, ta med anteckning om tonart eller transponering om det finns.]

#### Läxa till nästa lektion
[Uppgift om ev. ny läxa eller särskild arbetsuppgift som givits eleven att arbeta med till nästa lektion.]`;

    const today = new Date().toISOString().split('T')[0];
    const prompt = `Gör om en musiklärares inspelade röstanteckning till lektionsanteckningar enligt mallen nedan. Anteckningarna är lärarens arbetsverktyg: de läses inför nästa lektion med samma elev och ska snabbt visa var eleven står och vad som behöver följas upp. Skriv som en erfaren lärare skulle göra – koncentrerat, men utan att tappa något som spelar roll för undervisningen framåt.

Behåll alltid det som påverkar kommande lektioner: vad eleven utvecklats i eller kämpar med, vad som fungerade som övning eller metod, konkreta musikaliska detaljer (tonart, transponering, ställen i låten, tekniska moment), kommande uppspelningar eller andra datum, löften läraren gett och läxor. Stryk utfyllnad, upprepningar och det som saknar betydelse för elevens fortsatta utveckling, som praktiska småsaker kring själva lektionstillfället. Lägg inte till något som inte finns i anteckningen.

Dagens datum: ${today}.

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