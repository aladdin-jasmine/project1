# StudyForge — Advanced AI-Powered Learning Platform

A **production-grade**, **locally-runnable** intelligent study assistant that transforms your documents into
**personalized learning experiences** with slides, flashcards, adaptive quizzes, mind maps, study plans, and
**predictive analytics** — all powered by **any LLM you bring** (OpenAI, Anthropic, Ollama, Groq, etc.).

> **Privacy-first**: Your documents and API keys never leave your machine. Everything runs locally with optional
> cloud LLM integration. Embeddings run locally as fallback. Data stored in local JSON with optional PostgreSQL/ChromaDB
> for production scale.

---

## 🌟 Advanced Features

### 🧠 Personalized AI Memory System **(Production-Ready)**
Unlike simple chatbots that forget everything, StudyForge builds a **comprehensive learning profile**:
- **What you know**: Tracks mastered concepts with confidence scores (0-100%)
- **What you struggle with**: Identifies weak areas with difficulty predictions
- **Learning velocity**: Measures how fast you learn each topic (concepts/hour)
- **Retention tracking**: Spaced repetition scheduling for optimal memory
- **Cognitive load monitoring**: Adjusts difficulty based on your mental capacity
- **Study streak tracking**: Gamified learning with daily streak counters
- **Optimal study time detection**: AI learns when you study most effectively

**Example**: When you ask "Explain Binary Trees," AI responds:
> "Since you already understand tree traversal (mastered 3 days ago), let's focus on AVL trees where you scored 45% last time..."

### 📊 Learning Difficulty Prediction Engine
Intelligent tutor that predicts what to study next using:
- **Exam countdown**: Time remaining vs. syllabus coverage
- **Learning velocity analysis**: How fast you master topics
- **Spaced repetition scheduling**: Topics due for review
- **Topic dependency mapping**: Prerequisites and logical progression
- **Cognitive load balancing**: Prevents burnout with difficulty distribution
- **Personalized study plans**: Daily/weekly schedules optimized for your pace

**Output**: "Study Operating Systems today (3 hours, difficulty 7/10), then CPU Scheduling tomorrow (2 hours, difficulty 5/10)"

### 🎯 Advanced AI Quiz Evaluation
Goes beyond simple MCQs with **semantic analysis** and **concept extraction**:
- **Semantic similarity**: Compares your answer's meaning vs. reference material (0-100%)
- **Technical accuracy**: Checks correctness of terms and facts (0-100%)
- **Completeness score**: Measures coverage of key concepts (0-100%)
- **Concept identification**: Extracts which concepts you understand/miss
- **Missing concept detection**: Shows exactly what you forgot
- **Actionable improvements**: Specific suggestions, not generic feedback
- **Ideal answer generation**: Model solution with citations

**Example Evaluation**:
```
Marks: 7/10
Semantic Similarity: 82%
Technical Accuracy: 85%
Completeness: 70%
Missing Concepts: ["Three-way handshake", "Congestion control"]
Strengths: ["Clear explanation of TCP reliability", "Good use of examples"]
Improvements: ["Add port number ranges", "Explain flow control mechanism"]
```

### 📚 Multi-Document Knowledge Graph **(Already Implemented)**
- Retrieves information **across all uploaded resources** simultaneously
- **Question**: "Explain sockets" → AI combines OS notes + Networks book + Programming examples
- **Hybrid retrieval**: BM25 keyword search + Vector semantic search with RRF fusion
- **Cross-encoder reranking**: Precision sorting of results (BGE model)
- **Multi-query expansion**: Generates alternative phrasings for higher recall

### 🔍 Citation Confidence System **(Production-Ready)**
Every answer displays:
```
Answer Confidence: 94%
Sources:
✓ ComputerNetworks.pdf (Page 25) · TCP Protocol · Score: 0.96
✓ OperatingSystems.pdf (Page 61) · Socket Programming · Score: 0.89
✓ NetworkingLab.pdf (Page 12) · Implementation · Score: 0.82
```
- **Per-source similarity scores**: Know exactly how relevant each citation is
- **Page-level precision**: Jump directly to source material
- **Heading/chapter context**: Understand where information comes from
- **Confidence calculation**: Based on top-3 retrieval scores

### 🎚️ Adaptive Explanation Levels
Five depth modes that adjust explanations dynamically:
- **Beginner**: Simple analogies, no jargon
- **School**: Clear definitions with examples
- **Engineering**: Technical depth with specifications
- **Exam**: Concise, answer-focused (2/5/10-mark format)
- **Interview**: Practical scenarios with trade-offs

**AI automatically selects** the right level based on your question and learning history.

### 📈 Visual Learning Enhancement
Automatic diagram generation for complex concepts:
- **Flowcharts**: Process flows (authentication, algorithms)
- **Sequence diagrams**: Protocol interactions (TCP handshake, API calls)
- **Architecture diagrams**: System design (client-server, microservices)
- **Entity-relationship diagrams**: Database schemas
- **Mind maps**: Concept relationships
- **Class diagrams**: OOP structures

All rendered with **Mermaid.js** — no external image generation needed.

### 📝 Smart Notes Generation **(Already Implemented)**
One-click generation of:
- **Short notes**: Quick revision (1 page)
- **Exam notes**: Optimized for exams (structured)
- **2-mark answers**: Definition + brief explanation
- **5-mark answers**: Detailed explanation with examples
- **10-mark answers**: Complete coverage with diagrams
- **Viva questions**: Oral exam preparation
- **Formula sheets**: All formulas/equations extracted

### 📚 Comprehensive History & Content Management **(NEW - Production Ready)**
Every piece of generated content is **automatically saved** with **granular sub-type tracking**:
- **Automatic saving**: All quizzes, slides, flashcards, notes, mind maps, etc. saved to history
- **Granular sub-types**: Each section tracked separately (Short Notes, 5-Mark, Viva, MCQ, etc.)
- **15 content types + 20+ sub-types**: Ultra-detailed categorization
- **Usage tracking**: View counts, time spent, last viewed timestamp
- **Advanced filtering**: By type, sub-type, project, subject, topic, collection, favorites
- **Grouped views**: See all Short Notes in one tab, all 5-Mark in another
- **Full-text search**: Search titles, subjects, topics, tags, personal notes
- **Quiz performance tracking**: Attempts, scores, percentages, improvement trends
- **Sub-type statistics**: Count, views, and avg scores per sub-type
- **Favorites system**: Star important materials for quick access
- **Personal notes**: Add custom notes to any history item
- **Flexible clearing**: Clear all, by type, by sub-type, by project, or by date
- **Smart export/import**: Backup with date range filters and duplicate handling
- **Most viewed tracking**: See what content you use most
- **Recent activity**: Last 7 days of generation activity visualized
- **Pagination support**: Handle thousands of items efficiently

**API Endpoints**: 17 RESTful endpoints for complete history management  
**Storage**: Local JSON (`data/history.json`) - easy backup and migration  
**Frontend Ready**: Complete API client, hooks, and component examples provided

**Example:** Generate notes once → 7 history entries created (Short Notes, Exam Notes, 5-Mark, 10-Mark, One-Page, Viva, Complete Pack) - each viewable in its own tab!

### 🎯 Flexible Source System **(NEW - Production Ready)**
Generate content from **anywhere** without mandatory document uploads:
- **Topic/Subject Input**: Just describe what you want to learn - "Binary Search Trees"
- **Custom Text Paste**: Paste lecture notes, textbook excerpts, or any content
- **Knowledge Base (Optional)**: Select specific documents if desired
- **Web Scraping**: Add URLs from Wikipedia, GeeksforGeeks, Stack Overflow, etc.
- **Mixed Sources**: Combine multiple sources in one generation (topic + text + docs + web)

**Supported Websites**:
- Educational: Wikipedia, GeeksforGeeks, W3Schools, MDN, Khan Academy, Coursera
- Technical: Stack Overflow, GitHub, Medium, Dev.to, freeCodeCamp
- Academic: arXiv, Scholar, Tutorialspoint, Programiz

**Security**: Domain whitelist, timeout protection, no authentication needed  
**Smart Context**: Automatic retrieval when you provide a topic  
**Backward Compatible**: Old API calls still work  
**API Endpoints**: 5 new endpoints for source validation and preview

### 🗣️ Enhanced Voice Tutor **(Groq-Optimized)**
Full-duplex conversational AI with professional voice:
- **STT**: Groq Whisper (large-v3-turbo + large-v3 failback)
- **TTS**: Groq Orpheus (natural English voices)
- **Multi-key load balancing**: Round-robin across API keys for rate limits
- **Automatic failover**: Switches keys/models/providers on 429/5xx errors
- **RAG-enhanced responses**: Answers grounded in your course materials
- **Study session tracking**: Monitors effectiveness and topics covered
- **Conversation context**: Remembers previous turns in voice session
- **6 natural voices**: autumn, diana, hannah, austin, daniel, troy

**Free-tier optimized**: Handles Groq's 20 req/min STT and 10 req/min TTS limits gracefully.

### 📊 Comprehensive Learning Dashboard
Visual analytics that faculty love:
- **Knowledge Score**: Overall mastery (0-100%)
- **Weak Topics**: With predicted difficulty and estimated hours to master
- **Strong Topics**: Mastery levels (80-100%)
- **Weekly Activity**: Actions + effectiveness trends
- **Knowledge Growth**: Progress over time with velocity
- **Study Hours**: Tracked automatically
- **Quiz Accuracy**: Performance trends
- **Learning Efficiency**: Concepts mastered per hour
- **Retention Rate**: % of concepts remembered after 7+ days
- **Optimal Study Time**: When you learn best
- **Burnout Risk**: Early warning system (0-100%)
- **Readiness Scores**: Per-topic exam preparedness
- **Concept Connections**: Interactive knowledge graph
- **Struggling Concepts**: Low success rates highlighted
- **Mastered Concepts**: Achievements tracking

### 🤖 Multi-Agent Orchestration **(Advanced)**
One question flows through 7 specialized agents (streamed live):

```
Question → Planner Agent → Retrieval Agent → Reranker → Answer Agent
         → Quiz Agent → Memory Agent → Recommendation Agent
```

**Planner Agent**: Intent classification, sub-query generation, depth selection
**Retrieval Agent**: Hybrid BM25+vector search across multiple queries
**Reranker Agent**: Cross-encoder precision sorting
**Answer Agent**: Grounded, cited response with memory-aware teaching
**Quiz Agent**: Contextual practice questions
**Memory Agent**: Concept extraction and learning profile update
**Recommendation Agent**: Next-step suggestions based on progress

### 🧪 Context Compression **(Production-Ready)**
Long conversations never hit token limits:
- **Smart summarization**: Preserves key facts, questions, and clarifications
- **Recent message protection**: Never compresses last N messages
- **Citation preservation**: Keeps referenced answers intact
- **Code block retention**: Programming examples stay complete
- **Progressive compression**: Multiple levels as needed
- **Key fact extraction**: Persists important concepts to memory

### 🔄 Local Embedding Models **(Zero-Cost)**
- **Xenova/all-MiniLM-L6-v2**: Runs entirely in Node.js (WASM)
- **Automatic download**: First-run setup (~25 MB)
- **No GPU required**: Pure JavaScript implementation
- **Fallback mode**: Works when API embeddings fail
- **Provider failover**: Tries API first, local second
- **Add / Edit / Delete custom providers** — name, API format (OpenAI- or Anthropic-compatible), Base URL, API key.
- **Multiple failback API keys** per provider (primary + failbacks) for rate-limit / credit-exhaustion resilience.
- **Enable / Disable** toggle, **Test** connection, **Load Models**, **Set as Project Default**.
- **Manual model entry**: Add any model ID if API listing fails or for custom models.
- **Model search**: Real-time filtering for large model lists (6+ models).
- **Advanced failback config**: max retries, exponential backoff, trigger HTTP codes (429/401/403/5xx), and
  failback mode (`key-only` or `key → provider`).
- **Embedding source** selection + automatic local embedding fallback.

### 📥 Upload & ingestion (Module 2–4)
- **Drag-and-drop, multi-file, and folder upload** with live progress bars.
- Formats: **PDF, DOCX, PPTX, TXT, MD** (+ CSV/JSON).
- **Auto OCR** for scanned / image-heavy PDFs (pdfjs → pngjs → tesseract.js), with graceful fallback.
- **Semantic chunking** that splits by heading/topic and preserves **page numbers** for accurate citations.
- Auto-extracted **metadata**: book, chapter, page, heading, subject, difficulty, semester.

### 🗄 Vector store & RAG engine (Module 5–6)
- Local JSON vector index (cosine) with an **optional ChromaDB mirror** for scale.
- **Auto-detects ChromaDB** at localhost:8000 (no config needed with docker-compose).
- **Hybrid retrieval**: BM25 + vector embeddings fused with **Reciprocal Rank Fusion (RRF)**.
- **Multi-query expansion** for higher recall + optional **cross-encoder reranker** (BGE).
- RAG pipeline: embed → retrieve → prompt → LLM, with **context compression** for long chats.
- **Graceful fallback**: Uses local cosine similarity if ChromaDB unavailable.

### 💬 Chatbot (Module 7)
- **Cited answers** with source markers, **page references**, book + heading + similarity score.
- **Citation confidence %** per answer; **streaming (SSE)** with Markdown, **code highlighting**, and **KaTeX math**.
- **Conversation history + session persistence**; **Mermaid diagrams** rendered inline when useful.
- **Personalised AI memory**: tracks what you know / struggle with and adapts future answers.

### 🎓 Study Studio (Module 8–13, 16)
- **Slides** — PPT-like viewer + **Export to PowerPoint (PPTX)**.
- **Flashcards** — flip cards with **SM-2 spaced repetition** + **revision mode**.
- **Smart Quiz** — MCQ / fill-in / short / long / **coding** questions across Easy/Medium/Hard.
- **Notes Generator** — short / exam / 5-mark / 10-mark / one-page / viva + **mind map**.
- **AI Study Planner** — exam date + hours + subjects → daily/weekly plan with priorities.
- **Weak-Topic Detector** — surfaces topics you miss most and builds a **revision PDF**.
- **Explain Like** — Beginner / School / Engineering / Exam / Interview depth levels.

### 🔎 Search, Q-Papers & Dashboards (Module 14–15, 18–19)
- **Search Everything** — hybrid search across your books **and** previous question papers, plus chat history **and generated content history**.
- **Previous Question Paper Finder** — upload papers, ask questions, get model answers (separate `qpapers` collection).
- **Dashboard** — charts for study hours, quiz scores, knowledge growth, weak vs strong topics, weekly activity.
- **History Dashboard** — view all generated content, filter by type, search, track quiz performance, mark favorites.
- **Admin Panel** — users, documents, subjects, analytics, storage usage, and activity logs.

### 🤖 Advanced / personality features
- **AI Quiz Evaluation** — free-form / code answers graded against retrieved notes (marks + missing concepts).
- **Visual Learning** — auto **Mermaid** diagrams for any topic.
- **Knowledge Graph** — multi-document concept graph (nodes + edges).
- **Personalised Recommendations** — from memory + progress analytics.
- **Learning Difficulty Prediction** — suggests the next best topic to study.
- **Adaptive Quiz Difficulty** — question difficulty auto-tuned to your recent quiz accuracy.
- **Voice Tutor** — full-duplex voice sessions (see above).
- **Citation Engine** — book + page + heading + similarity score on every claim.
- **Content History** — persistent storage of all generated materials with search, filtering, and analytics.

### 🗣 Server Voice Pipeline (Groq Whisper + Orpheus)
- **STT** via `whisper-large-v3-turbo` → `whisper-large-v3` model fallback; **TTS** via `canopylabs/orpheus-v1-english`.
- **Multi-key load balancing** — round-robin across all configured API keys; a rate-limited key (429/401/403/5xx)
  is cooled down automatically while the next key/model/provider takes over — built for Groq free-tier limits.
- Works with any OpenAI-compatible audio endpoint; Groq providers are auto-prioritised.
- Browser **Web Speech API fallback** when no voice-capable provider is configured.

### 🧠 Agentic Workflow (multi-agent orchestration)
One question flows through seven specialised agents, streamed live over SSE (`POST /api/agent/run`):

```
Question → Planner Agent → Retrieval Agent → Reranker → Answer Agent
         → Quiz Agent → Memory Agent → Recommendation Agent
```

- **Planner** — LLM intent router (explain / quiz / notes / plan) with heuristic fallback; picks sub-queries,
  explanation depth, and whether to attach a quiz or diagram.
- **Retrieval** — hybrid BM25 + vector (RRF) across planned sub-queries, merged and deduped.
- **Reranker** — cross-encoder precision pass (when enabled) + final top-k selection.
- **Answer** — grounded, cited answer with confidence %, memory-aware teaching.
- **Quiz / Memory / Recommendation** — practice questions, knowledge-profile update, and next-step suggestions.
- The **Agent tab** in Study Studio renders the whole pipeline live, step by step.

---

## 🚀 Quick start

```bash
# 1. Install (Node 18+)
npm install

# 2. Run (starts API on :5174 and the web app on :5173)
npm run dev
```

Open **http://localhost:5173**.

> First time you use embeddings offline, the local model (`Xenova/all-MiniLM-L6-v2`, ~25 MB) is
> downloaded automatically.

### Add your LLM
1. Go to **Providers → Add Provider**.
2. Choose **OpenAI-compatible** (e.g. `http://localhost:11434/v1` for Ollama) or **Anthropic-compatible**.
3. Paste a Base URL + API key. Add **failback keys** if you like.
4. Click **Load Models**, pick a default model, then **Set as Project Default**.
5. Head to **Knowledge Base**, upload a document, then open **Study Studio**.

### Optional: Docker services (Postgres)
```bash
docker compose up -d   # enables pgvector; auto-detected, gracefully skipped if absent
```

**FAISS vector index**: The app uses FAISS (in-process, no external server) for accelerated vector search. See `CHROMA_SETUP.md` for details.

### Production build
```bash
npm run build      # builds web/dist
npm start          # serves the API + built frontend on :5174
```

---

## 🧪 Local mock LLM & end-to-end verification
For offline development and CI, a zero-dependency **OpenAI-compatible mock LLM** is included:

```bash
node server/mock-llm.mjs          # serves chat/completions + embeddings on :8787
```

Run the full feature verification (starts the mock + the server, exercises every module, then
restores your `data/` and provider config):

```bash
node scripts/verify-e2e.mjs
```

> ✅ All 42 end-to-end checks pass (upload of PDF/DOCX/PPTX/TXT, hybrid retrieval, streaming chat with
> citations + confidence, quiz/notes/explain/visual/plan/evaluate/predict/recommend/weakspot/graph,
> search-everything, analytics, admin, qpapers collection, adaptive quiz, server voice STT/TTS, and the
> 7-agent orchestration pipeline). Per-file upload isolation guarantees one bad file never aborts a batch.

---

## 🧩 How the failback engine works
Every LLM call (chat, study generation, RAG) goes through one unified client:

1. Resolve the active provider (project default first, then other enabled providers by priority).
2. Try each **enabled key** in order. On a trigger error (429 rate-limit, 401/403 credits exhausted, 5xx),
   the key is put on a short **cooldown** and the next key is tried.
3. If all keys are exhausted and the mode is `key → provider`, the **next enabled provider** is tried.
4. Non-trigger errors (e.g. 400 bad request) stop immediately and surface to you.

This means a single `Generate` button is resilient to outages, throttling, and exhausted credits.

---

## 🗂 Project layout
```
server/            Express + TypeScript API
  src/llm/         provider adapters, failback client, embeddings, model loader
  src/rag/         parse, ocr, chunk, vector store, retrieve, bm25, rerank, RAG chat
  src/study/       quiz, notes, explain, visual, studyplan, evaluate, predict, recommend,
                   weakspot, graph, slides, flashcards, mindmap, summarize, pack, analytics
  src/agents/      planner + 7-agent orchestration pipeline (SSE step streaming)
  src/voice/       Groq whisper STT / orpheus TTS with round-robin key load balancing
  src/routes/      REST routers (rag, chat, study, search, analytics, admin, progress, export, voice, agent, history)
  src/config/      providers / settings / projects persistence
  src/db/          JSON store, optional Postgres, personalised memory, progress, history
web/               React + Vite + TypeScript SPA
  src/pages/       Dashboard, Providers, Advanced, Knowledge Base, Search, Notes, Admin, Study Studio, History
  src/features/study/  per-feature UI (Slides, Flashcards, Quiz, MindMap, Plan, Chat, Explain, Visual, Graph…)
data/              runtime JSON store (providers, vectors, projects, progress, memory, history) — git-ignored
scripts/           verify-e2e.mjs (integration harness), test-history.mjs (history system test)
server/mock-llm.mjs  zero-dependency OpenAI-compatible mock for offline dev/tests
```

## ⚙️ Tech
Node 22 · Express · OpenAI & Anthropic SDKs · @xenova/transformers (local embeddings) · ChromaDB (optional, Docker) ·
PostgreSQL/pgvector (optional, Docker) · pdfjs-dist (PDF text + OCR) · mammoth (DOCX) · jszip (PPTX) · pdfkit (PDF export) ·
React · Vite · Tailwind · TanStack Query · Zustand · React Flow · Chart.js · react-markdown · KaTeX · Mermaid · Web Speech API.

## 📝 Notes
- No native modules required for the core flow — pure-JS vector store, WASM embeddings. Easy to run anywhere Node runs.
- Bring your own model: point a provider at any OpenAI-compatible endpoint.
- All data stays local; nothing is sent to a third party except your configured LLM endpoint.
- **Graceful fallback** everywhere: missing Docker services, unavailable embeddings, OCR failure, or a
  single bad upload file all degrade cleanly instead of crashing.
