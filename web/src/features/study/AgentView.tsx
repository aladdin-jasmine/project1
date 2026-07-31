import { useEffect, useRef, useState } from 'react';
import {
  Bot, Brain, Search, ListFilter, MessageSquareText, HelpCircle, Database, Compass,
  Send, CheckCircle2, Loader2, Circle, AlertTriangle
} from 'lucide-react';
import { agent, progress, type AgentRunResult, type AgentStepEvent, type Collection } from '../../api/client';
import type { Source } from './SourceBar';
import { useToast, Badge } from '../../components/ui';
import Markdown from '../../lib/markdown';
import { cn } from '../../lib/cn';

// Live visualisation of the multi-agent pipeline:
// Planner → Retriever → Reranker → Answer → Quiz → Memory → Recommender.

const STEPS = [
  { id: 'planner', label: 'Planner Agent', icon: Brain, desc: 'Understands intent, routes the workflow' },
  { id: 'retriever', label: 'Retrieval Agent', icon: Search, desc: 'Hybrid BM25 + vector search, multi-query' },
  { id: 'reranker', label: 'Reranker', icon: ListFilter, desc: 'RRF fusion + cross-encoder precision' },
  { id: 'answer', label: 'Answer Agent', icon: MessageSquareText, desc: 'Grounded answer with citations' },
  { id: 'quiz', label: 'Quiz Agent', icon: HelpCircle, desc: 'Practice questions when useful' },
  { id: 'memory', label: 'Memory Agent', icon: Database, desc: 'Updates your knowledge profile' },
  { id: 'recommender', label: 'Recommendation Agent', icon: Compass, desc: 'Suggests what to study next' }
] as const;

type StepId = (typeof STEPS)[number]['id'];
type StepState = 'idle' | 'active' | 'done' | 'skipped';

const STEP_COLORS: Record<StepId, { active: string; done: string; bg: string; ring: string }> = {
  planner:     { active: 'text-brand-600 border-brand-500 bg-brand-50', done: 'text-brand-600 border-brand-500 bg-brand-50', bg: 'bg-brand-50', ring: 'ring-brand-200' },
  retriever:   { active: 'text-sky-600 border-sky-500 bg-sky-50', done: 'text-sky-600 border-sky-500 bg-sky-50', bg: 'bg-sky-50', ring: 'ring-sky-200' },
  reranker:    { active: 'text-violet-600 border-violet-500 bg-violet-50', done: 'text-violet-600 border-violet-500 bg-violet-50', bg: 'bg-violet-50', ring: 'ring-violet-200' },
  answer:      { active: 'text-brand-600 border-brand-500 bg-brand-50', done: 'text-brand-600 border-brand-500 bg-brand-50', bg: 'bg-brand-50', ring: 'ring-brand-200' },
  quiz:        { active: 'text-amber-600 border-amber-500 bg-amber-50', done: 'text-amber-600 border-amber-500 bg-amber-50', bg: 'bg-amber-50', ring: 'ring-amber-200' },
  memory:      { active: 'text-teal-600 border-teal-500 bg-teal-50', done: 'text-teal-600 border-teal-500 bg-teal-50', bg: 'bg-teal-50', ring: 'ring-teal-200' },
  recommender: { active: 'text-rose-600 border-rose-500 bg-rose-50', done: 'text-rose-600 border-rose-500 bg-rose-50', bg: 'bg-rose-50', ring: 'ring-rose-200' },
};

export default function AgentView({ source }: { source: Source }) {
  const toast = useToast();
  const [question, setQuestion] = useState('');
  const [running, setRunning] = useState(false);
  const [states, setStates] = useState<Record<StepId, StepState>>(() => Object.fromEntries(STEPS.map((s) => [s.id, 'idle'])) as any);
  const [details, setDetails] = useState<Record<string, any>>({});
  const [streamed, setStreamed] = useState('');
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [collection, setCollection] = useState<Collection>('kb');
  const [showAnswers, setShowAnswers] = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [streamed]);

  const reset = () => {
    setStates(Object.fromEntries(STEPS.map((s) => [s.id, 'idle'])) as any);
    setDetails({});
    setStreamed('');
    setResult(null);
    setShowAnswers(false);
  };

  const onStep = (e: AgentStepEvent) => {
    setStates((s) => ({ ...s, [e.step]: e.status === 'start' ? 'active' : e.data?.skipped ? 'skipped' : 'done' }));
    if (e.status === 'end' && e.data) setDetails((d) => ({ ...d, [e.step]: e.data }));
  };

  const run = async () => {
    const q = question.trim();
    if (!q || running) return;
    reset();
    setRunning(true);
    try {
      await agent.run(
        { question: q, docIds: source.docId ? [source.docId] : undefined, collection },
        {
          onStep,
          onToken: (t) => setStreamed((s) => s + t),
          onDone: (r) => {
            setResult(r);
            progress.activity({ type: 'chat' });
          },
          onError: (e) => toast('error', e)
        }
      );
    } catch (e: any) {
      toast('error', e?.message || 'Agent pipeline failed');
    } finally {
      setRunning(false);
    }
  };

  const stepDetail = (id: StepId): string | null => {
    const d = details[id];
    if (!d) return null;
    switch (id) {
      case 'planner':
        return null; // plan shown in header instead
      case 'retriever':
        return `${d.chunks} chunks · ${d.sources?.slice(0, 3).join(', ') || 'no sources'}`;
      case 'reranker':
        return `${d.kept} kept · ${d.strategy}`;
      case 'answer':
        return `${d.citations} citations · ${d.confidence}% confidence`;
      case 'quiz':
        return d.skipped ? 'skipped' : `${d.questions} questions generated`;
      case 'memory':
        return d.note || 'profile unchanged';
      case 'recommender':
        return d.skipped ? 'skipped' : `${d.suggestions} suggestions`;
      default:
        return null;
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      {/* Pipeline trace */}
      <div className="card p-5 h-fit">
        <h3 className="font-semibold text-ink-800 flex items-center gap-2.5 mb-5 text-[15px]">
          <Bot className="w-4 h-4 text-brand-500" /> Agent Pipeline
        </h3>
        <ol className="relative space-y-0">
          {STEPS.map((s, idx) => {
            const st = states[s.id];
            const Icon = s.icon;
            const colors = STEP_COLORS[s.id];
            const isLast = idx === STEPS.length - 1;

            return (
              <li key={s.id} className="relative flex gap-3.5">
                {/* Vertical connector line */}
                {!isLast && (
                  <div className={`absolute left-[15px] top-8 w-px h-full transition-colors duration-300 ${st === 'done' ? colors.bg : 'bg-ink-200/70'}`}
                       style={{ minHeight: '20px' }}
                  />
                )}

                {/* Step indicator circle */}
                <span
                  className={cn(
                    'z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300',
                    st === 'active' && `border-current ${colors.active} ring-4 ${colors.ring} animate-pulse-soft`,
                    st === 'done' && `border-current ${colors.done}`,
                    st === 'skipped' && 'border-amber-300 text-amber-500 bg-amber-50',
                    st === 'idle' && 'border-ink-200 text-ink-300 bg-white'
                  )}
                >
                  {st === 'active' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {st === 'done' && <CheckCircle2 className="w-4 h-4" />}
                  {st === 'skipped' && <Circle className="w-3 h-3" />}
                  {st === 'idle' && <Icon className="w-4 h-4" />}
                </span>

                {/* Step label + detail */}
                <div className={cn('min-w-0 pb-5', isLast && 'pb-0')}>
                  <p className={cn(
                    'text-sm font-semibold transition-colors duration-200',
                    st === 'idle' ? 'text-ink-400' : 'text-ink-800'
                  )}>
                    {s.label}
                  </p>
                  <p className={cn(
                    'text-xs mt-0.5 transition-colors duration-200',
                    st === 'done' && 'text-ink-600',
                    st === 'idle' && 'text-ink-400'
                  )}>
                    {stepDetail(s.id) || s.desc}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Plan block */}
        {result?.plan && (
          <div className="mt-5 rounded-xl bg-gradient-to-br from-brand-50 to-brand-100/60 p-4 text-xs text-ink-600 ring-1 ring-brand-200/50">
            <p className="font-semibold text-brand-700 mb-1">Plan: {result.plan.intent}</p>
            <p className="leading-relaxed">{result.plan.reasoning}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {result.plan.explainLevel && <Badge tone="brand">{result.plan.explainLevel}</Badge>}
              {result.plan.needsVisual && <Badge tone="gray">visual</Badge>}
              {result.plan.needsQuiz && <Badge tone="gray">quiz x{result.plan.quizCount}</Badge>}
            </div>
          </div>
        )}
      </div>

      {/* Question + answer */}
      <div className="card p-5 flex flex-col min-h-[560px]">
        {/* Top toolbar */}
        <div className="flex items-center gap-2 mb-4">
          <input
            className="input flex-1"
            placeholder='Ask anything — e.g. "Explain deadlocks and quiz me"'
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
          />
          <select className="input !w-auto py-2.5 text-xs min-w-[90px]" value={collection} onChange={(e) => setCollection(e.target.value as Collection)}>
            <option value="kb">KB</option>
            <option value="qpapers">QPapers</option>
          </select>
          <button className="btn-primary px-5 py-2.5" onClick={run} disabled={running || !question.trim()}>
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Run
          </button>
        </div>

        {/* Scrollable answer area */}
        <div className="flex-1 overflow-y-auto pr-1">
          {!streamed && !result && !running && (
            <div className="h-full flex flex-col items-center justify-center text-center text-ink-400 text-sm p-8 animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mb-4 ring-1 ring-brand-100">
                <Bot className="w-7 h-7 text-brand-400" />
              </div>
              <p className="font-semibold text-ink-600 text-base mb-1">One question, seven specialised agents.</p>
              <p className="max-w-sm leading-relaxed">The planner routes your question through retrieval, reranking, answering, quizzing, memory and recommendation — watch each agent work live.</p>
            </div>
          )}
          {(streamed || running) && (
            <div className="text-sm text-ink-800 leading-relaxed animate-fade-in">
              {streamed ? <Markdown content={streamed} /> : <span className="text-ink-400 italic">Agents are working…</span>}
              {running && <span className="inline-block w-2 h-4 bg-brand-500 animate-pulse ml-0.5 align-text-bottom" />}
            </div>
          )}
          <div ref={answerRef} />
        </div>

        {/* Result footer */}
        {result && (
          <div className="border-t border-ink-200/80 pt-4 mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="brand">Confidence {result.confidence}%</Badge>
              {result.memoryNote && <Badge tone="gray">{result.memoryNote}</Badge>}
              {result.model && <Badge tone="gray">{result.model}</Badge>}
            </div>

            {/* Citations */}
            {result.citations.length > 0 && (
              <details className="text-xs group">
                <summary className="cursor-pointer font-semibold text-ink-700 flex items-center gap-2 list-none select-none">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-ink-100 text-ink-600 text-[10px] font-bold">
                    {result.citations.length}
                  </span>
                  Sources
                  <span className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded-full ml-auto',
                    result.confidence >= 70 ? 'bg-emerald-100 text-emerald-700' :
                    result.confidence >= 40 ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  )}>
                    {result.confidence}% conf
                  </span>
                </summary>
                <div className="mt-2 space-y-2">
                  {result.citations.map((c) => (
                    <div key={c.index} className="p-2.5 rounded-lg border border-ink-100 hover:border-ink-200 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-ink-700 flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-brand-50 text-brand-600 text-[10px] font-bold flex items-center justify-center ring-1 ring-brand-100">{c.index}</span>
                          {c.docName}
                        </span>
                        <span className={cn(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                          (c.score || 0) >= 0.7 ? 'bg-emerald-100 text-emerald-700' :
                          (c.score || 0) >= 0.4 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        )}>
                          conf {(c.score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="text-ink-400 text-[11px]">
                        {c.page && <span>p.{c.page}</span>}
                        {c.heading && <span> · {c.heading}</span>}
                        {c.subject && <span> · {c.subject}</span>}
                      </div>
                      <p className="text-ink-600 mt-1 text-[11px] line-clamp-2">{c.snippet}</p>
                      {(c.score || 0) < 0.4 && (
                        <p className="text-[10px] text-amber-600 mt-1.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Low confidence citation
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Quiz with Show Answer toggle */}
            {result.quiz && result.quiz.questions.length > 0 && (
              <details className="text-xs group">
                <summary className="cursor-pointer font-semibold text-ink-700 flex items-center gap-2 list-none select-none">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                    {result.quiz.questions.length}
                  </span>
                  Practice quiz
                  <span className="text-ink-400 ml-1">({result.quiz.questions.length} questions)</span>
                </summary>
                <div className="mt-3 space-y-3">
                  {/* Toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-ink-500 text-[11px] font-medium uppercase tracking-wider">Answers</span>
                    <button
                      onClick={() => setShowAnswers((prev) => !prev)}
                      className={cn(
                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-400/30',
                        showAnswers ? 'bg-brand-500' : 'bg-ink-300'
                      )}
                      role="switch"
                      aria-checked={showAnswers}
                    >
                      <span className={cn(
                        'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200',
                        showAnswers ? 'translate-x-4.5' : 'translate-x-0.5'
                      )} />
                    </button>
                  </div>

                  {/* Questions */}
                  <ol className="space-y-2.5 text-ink-600 list-decimal list-inside">
                    {result.quiz.questions.map((q: any, i: number) => (
                      <li key={i} className="pl-1">
                        <span className="font-medium text-ink-800">{q.question}</span>
                        {q.options?.length > 0 && (
                          <ul className="ml-5 mt-1.5 space-y-1 text-ink-500">
                            {q.options.map((o: string, oi: number) => {
                              const isCorrect = oi === q.answerIndex;
                              const showAnswerClass = showAnswers && isCorrect
                                ? 'text-emerald-700 font-semibold bg-emerald-50 rounded-md px-2 py-1 -mx-2 ring-1 ring-emerald-200'
                                : showAnswers
                                  ? 'text-ink-400 line-through opacity-60'
                                  : 'text-ink-500';

                              return (
                                <li key={oi} className={cn('text-xs leading-relaxed transition-all duration-200', showAnswerClass)}>
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className={cn(
                                      'w-4 h-4 rounded-full border flex items-center justify-center text-[9px] font-bold transition-all duration-200',
                                      isCorrect && showAnswers ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-ink-300 text-ink-400'
                                    )}>
                                      {String.fromCharCode(65 + oi)}
                                    </span>
                                    {o}
                                    {isCorrect && showAnswers && (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 ml-1 shrink-0" />
                                    )}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {q.explanation && (
                          <p className="ml-5 mt-1.5 text-ink-400 italic text-[11px]">{q.explanation}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              </details>
            )}

            {/* Recommendations */}
            {result.recommendation && result.recommendation.suggestions.length > 0 && (
              <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100">
                <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5" /> Recommended next
                </p>
                <ul className="space-y-1.5 text-xs text-ink-600">
                  {result.recommendation.suggestions.map((s, i) => (
                    <li key={i} className="flex gap-2 items-start">
                      <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      <Badge tone="amber">{s.type}</Badge>
                      <span className="leading-snug">{s.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
