// StudyForge — local OpenAI-compatible mock LLM server.
// Implements /v1/chat/completions (stream + non-stream), /v1/embeddings,
// /v1/audio/transcriptions, /v1/audio/speech and /v1/models so the app can run
// fully offline for development & testing. No external dependencies.
import http from 'node:http';
import crypto from 'node:crypto';

// Minimal valid WAV (0.25s of 8 kHz mono 16-bit silence) for mock TTS.
function tinyWav() {
  const samples = 2000;
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(8000, 24);
  buf.writeUInt32LE(16000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

const PORT = Number(process.env.MOCK_PORT || 8787);
const EMBED_404 = process.env.MOCK_EMBED_404 === '1'; // simulate a chat-only provider (e.g. Groq)

// ---------- deterministic, semantically-meaningful embeddings ----------
const DIM = 384;
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function embedText(text) {
  const vec = new Array(DIM).fill(0);
  const toks = (text.toLowerCase().match(/[a-z0-9]+/g) || []);
  for (const t of toks) vec[hashStr(t) % DIM] += 1;
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}
function embed(input) {
  const arr = Array.isArray(input) ? input : [input];
  return arr.map(embedText);
}

// ---------- intent-specific JSON builders ----------
function quizJSON(user, system) {
  const m = user.match(/(\d+)-question/);
  const n = m ? parseInt(m[1], 10) : 8;
  
  // Check if specific types are requested in either system or user prompt
  const combined = system + '\n' + user;
  const typesMatch = combined.match(/(?:ONLY these types|Use ONLY these types):\s*([^\n.]+)/i);
  const requestedTypes = typesMatch 
    ? typesMatch[1].split(/,\s*/).map(t => t.trim()) 
    : null;
  
  const questions = [];
  for (let i = 1; i <= n; i++) {
    let type;
    if (requestedTypes && requestedTypes.length > 0) {
      // Use only requested types, cycling through them
      type = requestedTypes[(i - 1) % requestedTypes.length];
    } else {
      // Default mix
      type = i % 5 === 0 ? 'coding' : i % 4 === 0 ? 'long' : i % 3 === 0 ? 'short' : 'mcq';
    }
    
    questions.push({
      question: `Sample question ${i} derived from the material?`,
      type,
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      answerIndex: 0,
      answer: type === 'coding' ? 'console.log("answer");' : 'The correct answer is A because it follows directly from the context.',
      explanation: 'Plausible distractors; answer grounded in the retrieved text.',
      difficulty: ['easy', 'medium', 'hard'][i % 3],
      topic: 'Sample Topic'
    });
  }
  return { title: 'Auto-generated Quiz', questions };
}
function notesJSON() {
  return {
    title: 'Study Notes',
    shortNotes: 'Concise bullet summary of the key ideas.',
    examNotes: 'Exam-focused notes: definitions, formulas, and worked examples.',
    fiveMark: ['5-mark answer: state the principle and give one example.', '5-mark answer: compare the two approaches.'],
    tenMark: ['10-mark answer: derive the result and discuss limitations.'],
    onePage: 'One-page consolidated revision sheet covering every heading.',
    viva: ['Viva: Why does this method work?', 'Viva: What are its assumptions?'],
    mindmap: {
      root: 'Subject',
      nodes: [
        { id: 'n1', parent: null, label: 'Core Concept', desc: 'Foundational idea.' },
        { id: 'n2', parent: 'n1', label: 'Sub-topic A', desc: 'Detail.' },
        { id: 'n3', parent: 'n1', label: 'Sub-topic B', desc: 'Detail.' }
      ]
    }
  };
}
function planJSON(user) {
  const m = user.match(/across\s+(\d+)\s+days/);
  const n = m ? parseInt(m[1], 10) : 7;
  const days = [];
  for (let i = 1; i <= n; i++) {
    days.push({
      day: i,
      date: '',
      topics: [`Topic ${i}`],
      tasks: ['Read the chapter', 'Solve practice problems', 'Summarise in own words'],
      estMinutes: 45,
      priority: [`Ch. ${i}`]
    });
  }
  return { goal: 'Master this topic', durationDays: n, summary: 'A balanced, motivating study plan.', days };
}
function evalJSON(user) {
  const q = (user.match(/Question:\s*([^\n]+)/) || [])[1] || 'Question';
  const ans = (user.match(/Student answer:\s*([\s\S]*?)\n\nReference/) || [])[1] || '';
  return {
    question: q,
    studentAnswer: ans.trim(),
    marks: 8,
    maxMarks: 10,
    missingConcepts: ['A finer detail was omitted'],
    strengths: ['Clear structure', 'Correct main point'],
    improvements: ['Add a worked example', 'Define terms explicitly'],
    idealAnswer: 'The ideal answer states the principle, derives it, and gives one example.'
  };
}
function explainJSON(combined, user) {
  const levels = [...combined.matchAll(/"level":"(\w+)"/g)].map((x) => x[1]);
  const wanted = levels.length ? levels : ['beginner', 'school', 'engineering', 'exam', 'interview'];
  const termM = user.match(/Explain the concept:\s*"([^"]+)"/);
  const term = termM ? termM[1] : 'Concept';
  return {
    term,
    layers: wanted.map((l) => ({ level: l, text: `Explanation at the ${l} level: build from intuition to rigour.` }))
  };
}
function visualJSON() {
  return {
    title: 'Concept Diagram',
    mermaid: 'flowchart TD\n  A[Concept] --> B[Part 1]\n  A --> C[Part 2]\n  B --> D[Detail]',
    description: 'A flowchart that decomposes the concept into its parts.'
  };
}
function graphJSON() {
  return {
    nodes: [
      { id: 'c1', label: 'Concept 1', doc: 'Doc A' },
      { id: 'c2', label: 'Concept 2', doc: 'Doc B' },
      { id: 'c3', label: 'Concept 3', doc: 'Doc A' }
    ],
    edges: [
      { source: 'c1', target: 'c2', label: 'relates to' },
      { source: 'c2', target: 'c3', label: 'supports' }
    ]
  };
}
function recommendJSON() {
  return {
    suggestions: [
      { type: 'practice', text: 'Solve 5 targeted MCQs on the weakest topic.' },
      { type: 'revision', text: 'Re-read the chapter and summarise it aloud.' },
      { type: 'quiz', text: 'Take a mixed-difficulty quiz to confirm progress.' },
      { type: 'resource', text: 'Open the one-page notes for a quick recap.' }
    ]
  };
}
function predictJSON() {
  return {
    nextTopic: 'Next recommended topic',
    rationale: 'Chosen from the remaining syllabus weighted by past scores and exam proximity.',
    plan: ['Review prerequisites', 'Study the topic with examples', 'Attempt practice problems']
  };
}
function memoryJSON() {
  return { known: ['Core Concept'], unknown: ['Advanced Sub-topic'], mistakes: [] };
}

function slidesJSON(user) {
  const m = user.match(/(\d+)-slide/);
  const n = m ? parseInt(m[1], 10) : 8;
  const slides = [];
  for (let i = 1; i <= n; i++) {
    slides.push({
      title: `Slide ${i}`,
      bullets: ['Key point 1', 'Key point 2', 'Key point 3'],
      notes: `Speaker notes explaining the content of slide ${i}.`,
      layout: i === 1 ? 'title' : i % 3 === 0 ? 'two-col' : 'bullets'
    });
  }
  return { title: 'Study Deck', subtitle: 'Generated from materials', slides };
}

function flashcardsJSON(user) {
  const m = user.match(/(\d+)\s+flashcards/);
  const n = m ? parseInt(m[1], 10) : 12;
  const cards = [];
  for (let i = 1; i <= n; i++) {
    cards.push({
      front: `Question ${i}?`,
      back: `Answer ${i}: Explanation based on the material.`,
      hint: `Hint ${i}`,
      tags: ['topic1', 'topic2']
    });
  }
  return { title: 'Flashcards', cards };
}

function mindmapJSON() {
  return {
    root: 'Central Topic',
    nodes: [
      { id: 'n1', parent: null, label: 'Root', desc: 'Main concept' },
      { id: 'n2', parent: 'n1', label: 'Branch A', desc: 'Sub-concept A' },
      { id: 'n3', parent: 'n1', label: 'Branch B', desc: 'Sub-concept B' }
    ]
  };
}

function buildJSON(combined, system, user) {
  if (/test author/i.test(system)) return quizJSON(user, system);
  if (/note-maker/i.test(system)) return notesJSON();
  if (/study coach/i.test(system)) return planJSON(user);
  if (/evaluator/i.test(system)) return evalJSON(user);
  if (/gifted teacher/i.test(system)) return explainJSON(combined, user);
  if (/visual explanations/i.test(system)) return visualJSON();
  if (/knowledge graph/i.test(system)) return graphJSON();
  if (/learning advisor/i.test(system)) return recommendJSON();
  if (/intelligent tutor/i.test(system)) return predictJSON();
  if (/instructional designer/i.test(system)) return slidesJSON(user);
  if (/memory expert/i.test(system)) return flashcardsJSON(user);
  if (/learning scientist/i.test(system)) return mindmapJSON();
  if (/JSON array of 3 strings/i.test(system)) return ['Alternative perspective one', 'Alternative perspective two', 'Alternative perspective three'];
  if (/identify concepts|known.*unknown|unknown.*known|mistakes/i.test(system)) return memoryJSON();
  if (/fix malformed JSON/i.test(system)) return {};
  return { result: 'ok' };
}

function buildChatAnswer(system, user) {
  const markers = [...system.matchAll(/\[(\d+)\]/g)].map((m) => m[1]);
  const uniq = [...new Set(markers)].sort((a, b) => a - b);
  const cite = uniq.length ? uniq.map((n) => `[${n}]`).join(', ') : '';
  const citeLine = uniq.length ? `\n\nSources cited: ${cite}.` : '';
  return (
    `Here is the answer grounded in the retrieved context.\n\n` +
    `The core idea is explained in the material${uniq.length ? ` (see ${cite})` : ''}. ` +
    `It builds on foundational concepts and connects to related topics, so a worked example helps.\n\n` +
    '```mermaid\nflowchart TD\n  A[Question] --> B[Key Idea]\n  B --> C[Detail]\n  B --> D[Example]\n```\n' +
    citeLine
  );
}

function handleChat(body, res) {
  const model = body.model || 'mock-chat';
  const stream = !!body.stream;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const system = messages.find((m) => m.role === 'system')?.content || '';
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const combined = system + '\n' + lastUser;
  const allText = messages.map((m) => m.content || '').join('\n');
  const wantsJSON = /Return ONLY (valid )?JSON/i.test(allText);

  if (stream) {
    const answer = buildChatAnswer(system, lastUser);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    const words = answer.split(/(\s+)/);
    let i = 0;
    const timer = setInterval(() => {
      if (i >= words.length) {
        clearInterval(timer);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      const w = words[i++];
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`);
    }, 5);
    return;
  }

  let content;
  if (wantsJSON) {
    content = JSON.stringify(buildJSON(combined, system, lastUser));
  } else if (/Summarise the conversation/i.test(system)) {
    content = 'Summary of the prior study discussion and decisions.';
  } else {
    content = buildChatAnswer(system, lastUser);
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      id: 'mock-' + crypto.randomUUID(),
      object: 'chat.completion',
      model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    })
  );
}

const server = http.createServer((req, res) => {
  // CORS (harmless for local use)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = req.url || '';
  if (req.method === 'GET' && (url === '/' || url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'mock-llm' }));
    return;
  }
  if (req.method === 'GET' && url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-chat', object: 'model' }] }));
    return;
  }
  // Binary-safe audio endpoints (voice pipeline verification)
  if (req.method === 'POST' && url.endsWith('/audio/transcriptions')) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const size = chunks.reduce((s, c) => s + c.length, 0);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text: `mock transcript of ${size} bytes of audio` }));
    });
    return;
  }
  if (req.method === 'POST' && url.endsWith('/audio/speech')) {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'audio/wav' });
      res.end(tinyWav());
    });
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      const parsed = body ? JSON.parse(body) : {};
      if (url.endsWith('/embeddings')) {
        if (EMBED_404) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: "The model `text-embedding-3-small` does not exist or you do not have access to it.", type: 'invalid_request_error', code: 'model_not_found' } }));
          return;
        }
        const out = embed(parsed.input);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            object: 'list',
            model: parsed.model || 'mock-embed',
            data: out.map((embedding, index) => ({ object: 'embedding', index, embedding })),
            usage: { prompt_tokens: 0, total_tokens: 0 }
          })
        );
        return;
      }
      if (url.endsWith('/chat/completions')) {
        handleChat(parsed, res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found', url }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[mock-llm] listening on http://127.0.0.1:${PORT} (OpenAI-compatible)`);
});
