const MODEL_ID = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';
const composer = document.querySelector('#composer');
const input = document.querySelector('#promptInput');
const chat = document.querySelector('#chatScroll');
const suggestions = document.querySelector('#suggestions');
const clearButton = document.querySelector('#clearButton');
const avatarStage = document.querySelector('#avatarStage');
const presenceLabel = document.querySelector('#presenceLabel');
const expressionLabel = document.querySelector('#expressionLabel');
const voiceLabel = document.querySelector('#voiceLabel');
const modelLabel = document.querySelector('#modelLabel');
const modelStatus = document.querySelector('#modelStatus');
const modelButton = document.querySelector('#modelButton');
const systemStatus = document.querySelector('#systemStatus');
const chatModeButton = document.querySelector('#chatModeButton');
const talkModeButton = document.querySelector('#talkModeButton');
const talkControls = document.querySelector('#talkControls');
const modeNote = document.querySelector('#modeNote');
const composerFooter = document.querySelector('#composerFooter');
const micButton = document.querySelector('#micButton');
const micButtonLabel = document.querySelector('#micButtonLabel');
const talkStatus = document.querySelector('#talkStatus');
const transcriptPreview = document.querySelector('#transcriptPreview');

let engine = null;
let enginePromise = null;
let speakingTimer = null;
let recognition = null;
let isListening = false;
let conversationMode = 'chat';
const history = [{
  role: 'system',
  content: 'You are NOVA, a warm, sharp, emotionally expressive AI companion. Answer in 2 to 4 concise sentences. Be specific and practical. Use a little personality, but never claim to be human. If the user asks for a plan, give clear steps. If they seem stuck, be encouraging.'
}];

const fallbackResponses = [
  'I can still stay with that thought. Tell me the outcome you want, and I’ll help you find the smallest next step.',
  'That has an interesting signal in it. Separate what you know, what you assume, and what you want to test next — then we can build from there.',
  'I’m in. Give me one concrete detail, even if it feels unfinished, and I’ll help turn it into something with shape.'
];

function setPresence(state, expression = 'CALM / CURIOUS') {
  avatarStage.classList.remove('is-speaking', 'is-thinking', 'is-listening', 'mood-bright', 'mood-focused', 'mood-warm');
  avatarStage.classList.add(`is-${state}`);
  const label = state === 'speaking' ? 'SPEAKING' : state === 'thinking' ? 'THINKING' : state === 'listening' ? 'LISTENING' : 'IDLE';
  presenceLabel.textContent = label;
  expressionLabel.textContent = expression;
  voiceLabel.textContent = state === 'speaking' ? 'VOICE ACTIVE' : 'VOICE READY';
  if (expression.includes('BRIGHT')) avatarStage.classList.add('mood-bright');
  if (expression.includes('FOCUSED')) avatarStage.classList.add('mood-focused');
  if (expression.includes('WARM')) avatarStage.classList.add('mood-warm');
}

function inferExpression(text) {
  const value = text.toLowerCase();
  if (/excited|great|creative|idea|wonderful|celebrate/.test(value)) return 'BRIGHT / EXCITED';
  if (/plan|focus|problem|debug|fix|build|work/.test(value)) return 'FOCUSED / READY';
  if (/feel|sad|worried|love|welcome|hello|help/.test(value)) return 'WARM / PRESENT';
  return 'CALM / CURIOUS';
}

function addMessage(text, type = 'nova', streaming = false) {
  const article = document.createElement('article');
  article.className = `message ${type === 'user' ? 'user-message' : 'nova-message'}`;
  article.innerHTML = type === 'user'
    ? '<div class="avatar-mark">Y</div><div><p class="message-copy"></p></div>'
    : '<div class="avatar-mark">N</div><div><p class="message-meta">NOVA <span>NOW</span></p><p class="message-copy"></p></div>';
  article.querySelector('.message-copy').textContent = text;
  if (streaming) article.dataset.streaming = 'true';
  chat.appendChild(article);
  chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
  return article.querySelector('.message-copy');
}

function showThinking() {
  const thinking = document.createElement('div');
  thinking.className = 'thinking';
  thinking.id = 'thinking';
  thinking.innerHTML = 'NOVA IS THINKING <span class="dots"><i></i><i></i><i></i></span>';
  chat.appendChild(thinking);
  chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
}

function setModelStatus(text, state = '') {
  modelStatus.textContent = text;
  document.querySelector('#modelStrip').className = `model-strip ${state}`;
}

async function loadModel() {
  if (engine) return engine;
  if (!navigator.gpu) {
    setModelStatus('WebGPU unavailable — using the graceful offline companion', 'fallback');
    modelLabel.textContent = 'FREE · FALLBACK';
    return null;
  }
  if (enginePromise) return enginePromise;
  modelButton.disabled = true;
  modelButton.textContent = 'LOADING...';
  setModelStatus('Downloading the free local model (first run only)', 'loading');
  systemStatus.textContent = 'LOADING LOCAL MODEL';
  enginePromise = import('https://esm.run/@mlc-ai/web-llm').then(({ CreateMLCEngine }) => CreateMLCEngine(MODEL_ID, {
    initProgressCallback: (progress) => {
      const percent = Math.round((progress.progress || 0) * 100);
      setModelStatus(`Preparing local Llama model · ${percent}%`, 'loading');
    }
  }));
  try {
    engine = await enginePromise;
    modelButton.textContent = 'MODEL READY';
    setModelStatus('Local Llama is ready — no server or key required', 'ready');
    modelLabel.textContent = 'LOCAL · LLAMA 3.2';
    systemStatus.textContent = 'SYSTEM ONLINE';
    return engine;
  } catch (error) {
    console.warn('WebLLM could not initialize', error);
    enginePromise = null;
    modelButton.disabled = false;
    modelButton.textContent = 'RETRY MODEL';
    setModelStatus('Model unavailable here — offline companion is still ready', 'fallback');
    modelLabel.textContent = 'FREE · FALLBACK';
    systemStatus.textContent = 'SYSTEM ONLINE';
    return null;
  }
}

function speak(text) {
  if (!text) return;
  window.clearTimeout(speakingTimer);
  if (!('speechSynthesis' in window)) {
    setPresence('speaking', inferExpression(text));
    speakingTimer = window.setTimeout(() => setPresence('idle', inferExpression(text)), Math.min(5200, Math.max(1700, text.length * 35)));
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.98;
  utterance.pitch = 0.92;
  utterance.onstart = () => setPresence('speaking', inferExpression(text));
  utterance.onend = () => setPresence('idle', inferExpression(text));
  utterance.onerror = () => setPresence('idle', inferExpression(text));
  window.speechSynthesis.speak(utterance);
}

function setMode(mode) {
  conversationMode = mode;
  const talk = mode === 'talk';
  chatModeButton.classList.toggle('is-active', !talk);
  talkModeButton.classList.toggle('is-active', talk);
  chatModeButton.setAttribute('aria-selected', String(!talk));
  talkModeButton.setAttribute('aria-selected', String(talk));
  talkControls.hidden = !talk;
  composer.hidden = talk;
  composerFooter.hidden = talk;
  modeNote.textContent = talk ? 'Press the circle, speak, and NOVA will answer aloud' : 'Type a message or use a suggestion';
  if (talk) {
    transcriptPreview.textContent = 'Your words will appear here before NOVA answers.';
    talkStatus.textContent = speechRecognitionSupported() ? 'Microphone ready. Press the circle and speak naturally.' : 'Voice input is not supported in this browser. Chat mode is ready.';
  } else if (isListening) {
    stopListening();
  }
}

function speechRecognitionSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function setupRecognition() {
  if (!speechRecognitionSupported()) return;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new Recognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';
  recognition.onstart = () => {
    isListening = true;
    micButton.classList.add('is-listening');
    micButtonLabel.textContent = 'STOP LISTENING';
    micButton.setAttribute('aria-label', 'Stop listening');
    talkStatus.textContent = 'Listening… tell NOVA what is on your mind.';
    transcriptPreview.textContent = 'Listening for your voice…';
    setPresence('listening', 'ATTENTIVE / PRESENT');
  };
  recognition.onresult = (event) => {
    let transcript = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) transcript += event.results[index][0].transcript;
    transcriptPreview.textContent = transcript || 'Listening for your voice…';
    const finalResult = Array.from(event.results).some((result) => result.isFinal);
    if (finalResult && transcript.trim()) {
      talkStatus.textContent = 'I heard you. NOVA is thinking…';
      send(transcript, { fromVoice: true });
    }
  };
  recognition.onerror = (event) => {
    isListening = false;
    micButton.classList.remove('is-listening');
    micButtonLabel.textContent = 'START TALKING';
    micButton.setAttribute('aria-label', 'Start talking');
    const message = event.error === 'not-allowed' ? 'Microphone permission was not granted. You can still use Chat.' : event.error === 'no-speech' ? 'I did not hear anything. Press the circle and try again.' : 'Voice input needs another try.';
    talkStatus.textContent = message;
    setPresence('idle', 'CALM / CURIOUS');
  };
  recognition.onend = () => {
    isListening = false;
    micButton.classList.remove('is-listening');
    micButtonLabel.textContent = 'START TALKING';
    micButton.setAttribute('aria-label', 'Start talking');
    if (!talkStatus.textContent.startsWith('I heard')) talkStatus.textContent = 'Microphone ready. Press the circle and speak naturally.';
  };
}

function startListening() {
  if (!recognition) {
    talkStatus.textContent = 'Voice input is not supported in this browser. Try Chrome, then use Chat here.';
    return;
  }
  window.speechSynthesis?.cancel();
  try { recognition.start(); } catch (error) { console.warn('Voice input could not start', error); }
}

function stopListening() {
  recognition?.stop();
  isListening = false;
  micButton.classList.remove('is-listening');
  micButtonLabel.textContent = 'START TALKING';
  micButton.setAttribute('aria-label', 'Start talking');
  talkStatus.textContent = 'Microphone ready. Press the circle and speak naturally.';
  setPresence('idle', 'CALM / CURIOUS');
}

async function generate(prompt, output) {
  const localEngine = await loadModel();
  if (!localEngine) {
    const reply = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    output.textContent = reply;
    history.push({ role: 'assistant', content: reply });
    speak(reply);
    return;
  }
  history.push({ role: 'user', content: prompt });
  setPresence('thinking', 'FOCUSED / PROCESSING');
  try {
    const stream = await localEngine.chat.completions.create({ messages: history, temperature: 0.72, max_tokens: 180, stream: true });
    let reply = '';
    for await (const chunk of stream) {
      reply += chunk.choices?.[0]?.delta?.content || '';
      output.textContent = reply;
      chat.scrollTo({ top: chat.scrollHeight, behavior: 'auto' });
    }
    history.push({ role: 'assistant', content: reply });
    speak(reply);
  } catch (error) {
    console.warn('Local completion failed', error);
    const reply = 'The local model needs another moment to warm up. I’m still here — try that once more.';
    output.textContent = reply;
    speak(reply);
  }
}

async function send(prompt, options = {}) {
  const clean = prompt.trim();
  if (!clean) return;
  addMessage(clean, 'user');
  input.value = '';
  input.style.height = 'auto';
  suggestions?.remove();
  showThinking();
  setPresence('thinking', 'FOCUSED / PROCESSING');
  await new Promise((resolve) => window.setTimeout(resolve, 280));
  document.querySelector('#thinking')?.remove();
  const output = addMessage('', 'nova', true);
  await generate(clean, output);
  if (options.fromVoice) {
    transcriptPreview.textContent = 'Conversation complete. Press the circle to speak again.';
    talkStatus.textContent = 'NOVA answered. I’m ready for your next thought.';
  }
}

composer.addEventListener('submit', (event) => { event.preventDefault(); send(input.value); });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 100)}px`; });
input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); composer.requestSubmit(); } });
document.querySelectorAll('.suggestion').forEach((button) => button.addEventListener('click', () => send(button.dataset.prompt)));
modelButton.addEventListener('click', () => loadModel());
chatModeButton.addEventListener('click', () => setMode('chat'));
talkModeButton.addEventListener('click', () => setMode('talk'));
micButton.addEventListener('click', () => (isListening ? stopListening() : startListening()));
clearButton.addEventListener('click', () => {
  window.speechSynthesis?.cancel();
  history.splice(1);
  chat.innerHTML = '<article class="message nova-message"><div class="avatar-mark">N</div><div><p class="message-meta">NOVA <span>JUST NOW</span></p><p class="message-copy">A clean slate. I’m listening. What would you like to explore?</p></div></article>';
  setPresence('idle', 'CALM / CURIOUS');
  transcriptPreview.textContent = 'Your words will appear here before NOVA answers.';
  talkStatus.textContent = 'Microphone ready. Press the circle and speak naturally.';
});

setupRecognition();
setPresence('idle');
