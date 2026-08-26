const recordButton = document.getElementById('recordButton');
const statusDisplay = document.getElementById('status');
const resultContainer = document.getElementById('resultContainer');
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

recordButton.addEventListener('click', () => {
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, recorderOptions());
    mediaRecorder.ondataavailable = event => {
      audioChunks.push(event.data);
    };
    mediaRecorder.onstop = processAudio;
    mediaRecorder.start();

    isRecording = true;
    recordButton.textContent = 'Stoppa';
    recordButton.classList.add('recording');
    statusDisplay.textContent = 'Spelar in...';
  } catch (error) {
    console.error('Error accessing microphone:', error);
    statusDisplay.textContent = 'Fel: Kunde inte komma åt mikrofonen.';
  }
}

function stopRecording() {
  mediaRecorder.stop();
  isRecording = false;
  recordButton.textContent = 'Spela in';
  recordButton.classList.remove('recording');
  statusDisplay.textContent = 'Bearbetar...';
}

// The transcription API accepts mp3, mp4, mpeg, mpga, m4a, wav and webm — but
// not Ogg, which is what Firefox records by default. Ask for a supported
// container instead of taking whatever the browser prefers.
const PREFERRED_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
];

function recorderOptions() {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return {};
  const supported = PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
  return supported ? { mimeType: supported } : {};
}

// Browsers disagree on what MediaRecorder produces: Chrome gives WebM, Firefox
// records Ogg by default. The transcription API goes by the file extension, so
// the recording has to be labelled with whatever it actually is.
const EXTENSIONS = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

function extensionFor(mimeType) {
  const base = (mimeType || '').split(';')[0].trim().toLowerCase();
  return EXTENSIONS[base] || 'webm';
}

async function processAudio() {
  const mimeType = mediaRecorder.mimeType || 'audio/webm';
  const audioBlob = new Blob(audioChunks, { type: mimeType });
  audioChunks = [];

  const formData = new FormData();
  formData.append('audio', audioBlob, `recording.${extensionFor(mimeType)}`);

  try {
    statusDisplay.textContent = 'Transkriberar...';
    const response = await fetch('/process-audio', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`);
    }

    statusDisplay.textContent = 'Analyserar...';
    const result = await response.json();
    const formattedText = result.formattedText;

    displayResult(formattedText);

  } catch (error) {
    console.error('Error processing audio:', error);
    statusDisplay.textContent = 'Fel: Kunde inte bearbeta ljudet.';
  }
}

function displayResult(text) {
  resultContainer.innerHTML = '';
  recordButton.style.display = 'none';
  statusDisplay.textContent = 'Din anteckning är klar.';

  const resultDiv = document.createElement('div');
  resultDiv.id = 'resultText';
  resultDiv.innerHTML = marked.parse(text);
  resultContainer.appendChild(resultDiv);
  
  // Auto-scroll to bottom of the text container
  resultDiv.scrollTop = resultDiv.scrollHeight;

  const copyButton = document.createElement('button');
  copyButton.textContent = 'Kopiera till urklipp';
  copyButton.className = 'result-button';
  copyButton.onclick = () => {
    const type = "text/html";
    const blob = new Blob([resultDiv.innerHTML], { type });
    const data = [new ClipboardItem({ [type]: blob })];
    
    navigator.clipboard.write(data).then(() => {
      statusDisplay.textContent = 'Kopierat till urklipp!';
      copyButton.textContent = 'Kopierat!';
      copyButton.disabled = true;
    }, () => {
       console.error('Failed to copy HTML, falling back to text.');
       // Fallback for browsers that don't support HTML clipboard API
       navigator.clipboard.writeText(text).then(() => {
          statusDisplay.textContent = 'Kopierat som oformaterad text!';
          copyButton.textContent = 'Kopierat!';
          copyButton.disabled = true;
       }).catch(err => {
          console.error('Failed to copy text fallback: ', err);
          statusDisplay.textContent = 'Misslyckades med att kopiera.';
       });
    });
  };
  resultContainer.appendChild(copyButton);

  const newMemoButton = document.createElement('button');
  newMemoButton.textContent = 'Spela in ny anteckning';
  newMemoButton.className = 'result-button';
  newMemoButton.onclick = resetUI;
  resultContainer.appendChild(newMemoButton);
}

function resetUI() {
  resultContainer.innerHTML = '';
  recordButton.style.display = 'inline-block';
  statusDisplay.textContent = '';
  audioChunks = [];
} 