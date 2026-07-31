import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, BookOpen, FileText, Plus, Trash2, Brain, ChevronDown, AlertTriangle } from 'lucide-react';
import { chat, progress, type Citation, type ChatSession, type Collection } from '../../api/client';
import { useToast, Spinner, EmptyState, Badge } from '../../components/ui';
import type { Source as Src } from './SourceBar';
import Markdown from '../../lib/markdown';
import { cn } from '../../lib/cn';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  confidence?: number;
  memoryNote?: string;
  truncated?: boolean;
}

const LEARNING_STYLES = ['Visual', 'Auditory', 'Reading/Writing', 'Kinesthetic'];
const EXPLAIN_LEVELS = ['Beginner', 'School', 'Engineering', 'Exam', 'Interview'];

export default function ChatView({ source, initialSessionId }: { source: Src; initialSessionId?: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sessions = [], refetch: refetchSessions } = useQuery<ChatSession[]>({ queryKey: ['chat-sessions'], queryFn: chat.sessions });

  const [activeId, setActiveId] = useState<string | null>(initialSessionId || null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [learningStyle, setLearningStyle] = useState('');
  const [explainLevel, setExplainLevel] = useState('');
  const [useMemory, setUseMemory] = useState(true);
  const [collection, setCollection] = useState<Collection>('kb');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const endRef = useRef<HTMLDivElement>(null);
  const assistantIdRef = useRef<number>(0);

  const loadSession = async (id: string) => {
    try {
      const full = await chat.session(id);
      setMessages(
        full.messages.map((m) => ({
          id: m.id,
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
          citations: m.citations,
          truncated: m.truncated
        }))
      );
      if (full.meta?.learningStyle) setLearningStyle(full.meta.learningStyle as string);
      if (full.meta?.explainLevel) setExplainLevel(full.meta.explainLevel as string);
      if (full.meta?.collection) setCollection(full.meta.collection as Collection);
      if (typeof full.meta?.useMemory === 'boolean') setUseMemory(full.meta.useMemory);
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Failed to load chat');
    }
  };

  useEffect(() => {
    if (activeId) loadSession(activeId);
    else setMessages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (initialSessionId && initialSessionId !== activeId) setActiveId(initialSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId]);

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
  };

  const delSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await chat.deleteSession(id);
      toast('info', 'Chat deleted.');
      if (activeId === id) newChat();
      refetchSessions();
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Delete failed');
    }
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Msg = { id: 'u' + Date.now(), role: 'user', content: input.trim() };
    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
    const currentMessagesLen = messages.length;
    const assistantIdx = currentMessagesLen + 1;
    assistantIdRef.current = assistantIdx;
    setMessages((m) => [...m, userMsg, { id: 'a' + Date.now(), role: 'assistant', content: '' }]);
    setInput('');
    setLoading(true);
    const currentActiveId = activeId;
    try {
      await chat.stream(
        {
          messages: history,
          docIds: source.docId ? [source.docId] : undefined,
          collection,
          sessionId: currentActiveId ?? undefined,
          learningStyle: learningStyle || undefined,
          explainLevel: explainLevel || undefined,
          useMemory
        },
        {
          onToken: (t) =>
            setMessages((m) => m.map((msg, i) => (i === assistantIdRef.current ? { ...msg, content: msg.content + t } : msg))),
          onDone: (d) => {
            setMessages((m) =>
              m.map((msg, i) =>
                i === assistantIdRef.current
                  ? { ...msg, citations: d.citations, confidence: d.confidence, memoryNote: d.memoryNote, truncated: d.truncated }
                  : msg
              )
            );
            const targetSessionId = currentActiveId || d.sessionId;
            if (targetSessionId) {
              chat.updateSession(targetSessionId, {
                meta: { learningStyle, explainLevel, collection, useMemory }
              }).catch(() => { /* non-blocking */ });
            }
            refetchSessions();
          },
          onError: (e) => {
            toast('error', e);
            setMessages((m) => m.map((msg, i) => (i === assistantIdRef.current ? { ...msg, content: '⚠️ ' + e } : msg)));
          }
        }
      );
      progress.activity({ type: 'chat' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid md:grid-cols-[260px_1fr] gap-4 h-[560px]">
      {/* Session list */}
      <div className="card p-3 flex flex-col overflow-hidden">
        <button className="btn-primary w-full mb-3" onClick={newChat}>
          <Plus className="w-4 h-4" /> New Chat
        </button>
        <div className="flex-1 overflow-y-auto space-y-1.5">
          {sessions.length === 0 && <p className="text-xs text-ink-400 text-center mt-4">No saved chats yet.</p>}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={cn('group flex items-center justify-between gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition', activeId === s.id ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-100')}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{s.title || 'Untitled chat'}</p>
                <p className="text-[11px] text-ink-400">{s.messageCount} msgs</p>
              </div>
              <button className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-red-500" onClick={(e) => delSession(s.id, e)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="card flex flex-col overflow-hidden">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <EmptyState
              icon={<MessageSquare />}
              title="Chat with your knowledge"
              hint="Ask questions grounded in your documents. Answers cite their sources and show a confidence score."
              action={
                <div className="max-w-lg mx-auto w-full mt-2">
                  <div className="flex gap-2">
                    <input className="input" placeholder="Ask anything…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
                    <button className="btn-primary" onClick={send} disabled={loading}><Send className="w-4 h-4" /></button>
                  </div>
                  {(source.value || source.docId) && (
                    <p className="text-xs text-ink-400 mt-2 text-center">Source set: <b>{source.docId ? 'document' : source.type}</b></p>
                  )}
                </div>
              }
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m, i) => (
              <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-800'}`}>
                  {m.role === 'assistant' ? (
                    <>
                      {m.content ? (
                        <Markdown content={m.content} className={m.role === 'user' ? '!text-white' : ''} />
                      ) : loading && i === messages.length - 1 ? (
                        <Spinner className="w-4 h-4" />
                      ) : (
                        ''
                      )}
                      {m.confidence !== undefined && (
                        <div className="mt-2 pt-2 border-t border-ink-200">
                          <Badge tone={m.confidence >= 70 ? 'green' : m.confidence >= 40 ? 'amber' : 'red'}>
                            Confidence {Math.round(m.confidence || 0)}%
                          </Badge>
                        </div>
                      )}
                      {m.truncated && (
                        <div className="mt-2 pt-2 border-t border-ink-200">
                          <Badge tone="red">Response was cut short — the model hit its output limit. Try a shorter question or increase max tokens in settings.</Badge>
                        </div>
                      )}
                      {m.memoryNote && (
                        <div className="mt-2 pt-2 border-t border-ink-200 text-xs text-ink-500 flex items-start gap-1.5">
                          <Brain className="w-3.5 h-3.5 text-brand-400 mt-0.5 shrink-0" /> {m.memoryNote}
                        </div>
                      )}
                      {m.citations && m.citations.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-ink-200">
                          <p className="text-xs font-medium text-ink-500 flex items-center gap-1 mb-1.5">
                            <BookOpen className="w-3 h-3" /> Sources
                            <span className="text-ink-400 font-normal text-[10px]">
                              · confidence {m.confidence !== undefined ? Math.round(m.confidence) : '-'}%
                            </span>
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {m.citations.map((c: Citation) => (
                              <button
                                key={c.index}
                                onClick={() => setExpanded((e) => ({ ...e, [c.index]: !e[c.index] }))}
                                className="inline-flex items-center gap-1 text-xs bg-white rounded-lg px-2 py-1 border border-ink-200 hover:border-brand-300 text-ink-700"
                              >
                                <FileText className="w-3 h-3 text-brand-500" />
                                <span className="max-w-[100px] truncate">{c.docName}</span>
                                {c.page && <span className="text-ink-400">p.{c.page}</span>}
                                <span className={cn(
                                  'w-1.5 h-1.5 rounded-full',
                                  (c.score || 0) >= 0.7 ? 'bg-emerald-500' :
                                  (c.score || 0) >= 0.4 ? 'bg-amber-500' : 'bg-red-500'
                                )} />
                                <ChevronDown className={cn('w-3 h-3 transition', expanded[c.index] && 'rotate-180')} />
                              </button>
                            ))}
                          </div>
                          {m.citations.map((c: Citation) =>
                            expanded[c.index] ? (
                              <div key={'exp' + c.index} className="mt-1.5 text-xs bg-white rounded-lg p-2 border border-ink-200">
                                <div className="flex justify-between items-center text-ink-400 mb-1">
                                  <span className="inline-flex items-center gap-1 min-w-0">
                                    <FileText className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{c.docName}</span>
                                    {c.heading && <span className="truncate">· {c.heading}</span>}
                                  </span>
                                  <span className={cn(
                                    'text-[10px] font-medium px-1.5 py-0.5 rounded-full ml-2 shrink-0',
                                    (c.score || 0) >= 0.7 ? 'bg-emerald-100 text-emerald-700' :
                                    (c.score || 0) >= 0.4 ? 'bg-amber-100 text-amber-700' :
                                    'bg-red-100 text-red-700'
                                  )}>
                                    {Math.round((c.score || 0) * 100)}% conf
                                  </span>
                                </div>
                                <p className="text-ink-600">{c.snippet}</p>
                                {(c.score || 0) < 0.4 && (
                                  <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Low confidence — verify this source
                                  </p>
                                )}
                              </div>
                            ) : null
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-white whitespace-pre-wrap">{m.content}</div>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}

        {/* Controls + input */}
        <div className="border-t border-ink-200 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select className="input !w-auto py-1 text-xs" value={learningStyle} onChange={(e) => setLearningStyle(e.target.value)}>
              <option value="">Learning style: any</option>
              {LEARNING_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="input !w-auto py-1 text-xs" value={explainLevel} onChange={(e) => setExplainLevel(e.target.value)}>
              <option value="">Explain level: auto</option>
              {EXPLAIN_LEVELS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="input !w-auto py-1 text-xs" value={collection} onChange={(e) => setCollection(e.target.value as Collection)}>
              <option value="kb">KB</option>
              <option value="qpapers">QPapers</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer select-none">
              <input type="checkbox" checked={useMemory} onChange={(e) => setUseMemory(e.target.checked)} className="w-3.5 h-3.5 accent-brand-600" />
              Memory
            </label>
          </div>
          <div className="flex gap-2">
            <input className="input" placeholder="Ask a follow-up…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
            <button className="btn-primary" onClick={send} disabled={loading}>
              {loading ? <Spinner className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
