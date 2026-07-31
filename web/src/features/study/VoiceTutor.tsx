import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Volume2, Send, MessagesSquare, Server, Globe } from 'lucide-react';
import { chat, progress, voice, type Collection } from '../../api/client';
import type { Source } from './SourceBar';
import { useToast, Spinner, EmptyState, Badge } from '../../components/ui';
import Markdown from '../../lib/markdown';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

// Minimal typings for the Web Speech API (not in standard DOM lib).
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onend: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type VoiceMode = 'server' | 'browser';

export default function VoiceTutor({ source }: { source: Source }) {
  const toast = useToast();
  const [mode, setMode] = useState<VoiceMode>('browser');
  const [serverOk, setServerOk] = useState(false);
  const [browserOk, setBrowserOk] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [answer, setAnswer] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [collection, setCollection] = useState<Collection>('kb');

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const answerRef = useRef('');
  const transcriptRef = useRef(''); // ref to avoid stale closure in onend
  const endRef = useRef<HTMLDivElement>(null);
  const assistantIdRef = useRef(0);

  // Capability detection: prefer server voice (Groq whisper/orpheus via your API
  // keys, load-balanced) and fall back to the browser's Web Speech API.
  useEffect(() => {
    voice
      .status()
      .then((s) => {
        setServerOk(s.serverVoiceAvailable);
        if (s.serverVoiceAvailable) setMode('server');
      })
      .catch(() => setServerOk(false));
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) setBrowserOk(false);
    return () => {
      recRef.current?.stop();
      mediaRecRef.current?.stop();
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, answer]);

  // ---- Server STT (MediaRecorder → whisper-large-v3) -----------------------
  const startServerListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 1000) return; // too short — ignore
        setTranscribing(true);
        try {
          const r = await voice.stt(blob);
          setTranscript(r.text);
          if (r.text.trim()) send(r.text.trim());
        } catch (e: any) {
          toast('error', e?.response?.data?.error || 'Transcription failed — check your Groq provider keys.');
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      toast('error', 'Microphone access denied.');
    }
  };

  // ---- Browser STT fallback -------------------------------------------------
  const startBrowserListening = () => {
    const Ctor: SpeechRecognitionCtor | undefined = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return setBrowserOk(false);
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e: any) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setTranscript(text);
      transcriptRef.current = text;
    };
    rec.onend = () => {
      setListening(false);
      const finalText = transcriptRef.current.trim();
      if (finalText) send(finalText);
    };
    rec.onerror = () => {
      setListening(false);
      toast('error', 'Speech recognition error.');
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const startListening = () => (mode === 'server' ? startServerListening() : startBrowserListening());

  const stopListening = () => {
    if (mode === 'server') {
      mediaRecRef.current?.stop();
    } else {
      recRef.current?.stop();
    }
    setListening(false);
  };

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(false);
  };

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: 'user', content: text.trim() };
    // Build the full history including the new user message (avoid stale closure)
    const currentMessages = messages;
    const fullHistory = [...currentMessages, userMsg];
    setMessages((m) => [...m, userMsg]);
    setTranscript('');
    transcriptRef.current = '';
    setAnswer('');
    answerRef.current = '';
    setLoading(true);
    const assistantIdx = fullHistory.length; // index of the assistant msg we're about to add
    assistantIdRef.current = assistantIdx;
    setMessages((m) => [...m, { role: 'assistant', content: '' }]);
    try {
      await chat.stream(
        {
          messages: fullHistory.map((m) => ({ role: m.role, content: m.content })),
          docIds: source.docId ? [source.docId] : undefined,
          collection
        },
        {
          onToken: (t) => {
            answerRef.current += t;
            setAnswer((a) => a + t);
            setMessages((m) => m.map((msg, i) => (i === assistantIdRef.current ? { ...msg, content: msg.content + t } : msg)));
          },
          onDone: () => {
            progress.activity({ type: 'chat' });
            speak(answerRef.current);
          },
          onError: (e) => {
            toast('error', e);
            setMessages((m) => m.map((msg, i) => (i === assistantIdRef.current ? { ...msg, content: '⚠️ ' + e } : msg)));
          }
        }
      );
    } finally {
      setLoading(false);
    }
  };

  // ---- TTS: server (orpheus) with browser fallback --------------------------
  const speak = async (text: string) => {
    if (!text.trim()) return;
    if (mode === 'server') {
      setSpeaking(true);
      try {
        const blob = await voice.tts(text);
        const url = URL.createObjectURL(blob);
        audioRef.current?.pause();
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => setSpeaking(false);
        await audio.play();
        return;
      } catch {
        setSpeaking(false);
        toast('error', 'Server TTS failed — falling back to browser voice.');
      }
    }
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  if (!serverOk && !browserOk) {
    return (
      <div className="card"><EmptyState icon={<Mic />} title="Voice not supported" hint="Configure a Groq provider for server voice, or use Chrome/Edge for the browser speech API." /></div>
    );
  }

  return (
    <div className="card p-4 h-[560px] flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-ink-800 flex items-center gap-2"><MessagesSquare className="w-4 h-4 text-brand-500" /> Voice Tutor</h3>
        <div className="flex items-center gap-2">
          {serverOk && (
            <button
              className="btn-ghost text-xs flex items-center gap-1"
              title={mode === 'server' ? 'Using Groq whisper + orpheus via your API keys (load-balanced)' : 'Using browser Web Speech API'}
              onClick={() => setMode((m) => (m === 'server' ? 'browser' : 'server'))}
            >
              {mode === 'server' ? <Server className="w-3.5 h-3.5 text-brand-500" /> : <Globe className="w-3.5 h-3.5" />}
              {mode === 'server' ? 'Groq voice' : 'Browser voice'}
            </button>
          )}
          <select className="input !w-auto py-1 text-xs" value={collection} onChange={(e) => setCollection(e.target.value as Collection)}>
            <option value="kb">KB</option>
            <option value="qpapers">QPapers</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {messages.length === 0 && (
          <EmptyState icon={<Mic />} title="Talk to your tutor" hint="Tap the mic, ask a question out loud, and hear the answer spoken back." />
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-800'}`}>
              {m.role === 'assistant' ? (
                m.content ? <Markdown content={m.content} className={m.role === 'user' ? '!text-white' : ''} /> : loading && i === messages.length - 1 ? <Spinner className="w-4 h-4" /> : ''
              ) : (
                <div className="text-white whitespace-pre-wrap">{m.content}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="border-t border-ink-200 pt-3 mt-3">
        {transcript && (
          <div className="mb-2 text-sm text-ink-600 bg-ink-50 rounded-lg p-2 italic">“{transcript}”</div>
        )}
        {transcribing && (
          <div className="mb-2 text-sm text-brand-600 flex items-center gap-2"><Spinner className="w-3.5 h-3.5" /> Transcribing with whisper…</div>
        )}
        <div className="flex items-center gap-2">
          {!listening ? (
            <button className="btn-primary" onClick={startListening} disabled={transcribing}>
              <Mic className="w-4 h-4" /> {messages.length ? 'Ask again' : 'Start speaking'}
            </button>
          ) : (
            <button className="btn-danger" onClick={stopListening}>
              <Square className="w-4 h-4" /> Stop
            </button>
          )}
          {answer && (
            <button className="btn-outline" onClick={() => speak(answer)} disabled={speaking}>
              <Volume2 className="w-4 h-4" /> {speaking ? 'Speaking…' : 'Replay'}
            </button>
          )}
          {speaking && (
            <button className="btn-danger" onClick={stopSpeaking}>
              <Square className="w-4 h-4" /> Stop Speaking
            </button>
          )}
          <button className="btn-ghost ml-auto" onClick={() => send(transcript)} disabled={!transcript.trim() || loading}>
            <Send className="w-4 h-4" /> Send text
          </button>
        </div>
        {source.docId && <p className="text-xs text-ink-400 mt-2">Grounded in selected document · <Badge tone="gray">{collection}</Badge></p>}
      </div>
    </div>
  );
}
