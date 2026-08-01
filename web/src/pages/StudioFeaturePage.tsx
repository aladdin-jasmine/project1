import { Component, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, Loader2, Sparkles, Star, Trash2, Eye, AlertTriangle, AlertCircle } from 'lucide-react';
import { history as historyApi, study, type HistoryItem, type ContentBlueprint } from '../api/client';
import type { SlideDeck, FlashcardSet, Quiz as QuizT, MindMap, StudyPlan } from '../features/study/types';
import type { Source } from '../features/study/SourceBar';
import { useToast, Spinner, EmptyState, Badge } from '../components/ui';
import { cn } from '../lib/cn';
import Markdown from '../lib/markdown';
import SlidesViewer from '../features/study/SlidesViewer';
import Flashcards from '../features/study/Flashcards';
import Quiz from '../features/study/Quiz';
import MindMapView from '../features/study/MindMapView';
import StudyPlanView from '../features/study/StudyPlanView';
import VisualView from '../features/study/VisualView';
import GraphView from '../features/study/GraphView';
import ChatView from '../features/study/ChatView';
import PlanGate from '../components/PlanGate';

class PageErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, error: err };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-4xl mx-auto text-center">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-ink-800">Something went wrong</h2>
          <p className="text-sm text-ink-500 mt-1 max-w-md mx-auto">{this.state.error?.message || 'An unexpected error occurred.'}</p>
          <button className="btn-primary mt-4" onClick={() => this.setState({ hasError: false, error: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const FEATURE_INFO: Record<string, { label: string; color: string }> = {
  slides: { label: 'Slides', color: 'from-blue-500 to-blue-600' },
  flashcards: { label: 'Flashcards', color: 'from-emerald-500 to-emerald-600' },
  quiz: { label: 'Quiz', color: 'from-blue-500 to-blue-600' },
  mindmap: { label: 'Mind Map', color: 'from-violet-500 to-violet-600' },
  studyplan: { label: 'Study Plan', color: 'from-purple-500 to-purple-600' },
  visual: { label: 'Visual Diagrams', color: 'from-cyan-500 to-cyan-600' },
  graph: { label: 'Knowledge Graph', color: 'from-amber-500 to-amber-600' },
  prediction: { label: 'Predict Topics', color: 'from-purple-500 to-purple-600' },
  predict: { label: 'Predict Topics', color: 'from-purple-500 to-purple-600' },
  recommendation: { label: 'Recommendations', color: 'from-pink-500 to-pink-600' },
  weakspot: { label: 'Weak Spot Analysis', color: 'from-red-500 to-red-600' }
};

const FEATURE_API: Record<string, (body: any) => Promise<any>> = {
  slides: (b) => study.slides(b),
  flashcards: (b) => study.flashcards(b),
  quiz: (b) => study.quiz(b),
  mindmap: (b) => study.mindmap(b),
  studyplan: (b) => study.studyplan(b),
  visual: (b) => study.visual(b),
  graph: (b) => study.graph(b),
  prediction: (b) => study.predict(b),
  predict: (b) => study.predict(b),
  recommendation: (b) => study.recommend(b),
  weakspot: (b) => study.weakspot(b)
};

const NO_REASONING_TYPES = ['visual', 'prediction', 'predict', 'recommendation', 'graph', 'weakspot', 'chat'];

export default function StudioFeaturePage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const planningRef = useRef(false);

  const { data: item, isLoading, error } = useQuery<HistoryItem>({
    queryKey: ['history-item', id],
    queryFn: () => historyApi.getItem(id as string),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data as any;
      if (data && (data.content?._status === 'pending' || data.content?._status === 'planning')) return 2000;
      return false;
    }
  });

  // Planning effect
  useEffect(() => {
    if (!item || !id) return;
    if (item.content?._status !== 'planning') return;
    if (planningRef.current) return;
    planningRef.current = true;

    if (NO_REASONING_TYPES.includes(type || '')) {
      const run = async () => {
        try {
          await historyApi.update(id, { content: { ...item.content, _status: 'pending' } });
        } catch (e) {
          // ignore
        } finally {
          qc.invalidateQueries({ queryKey: ['history-item', id] });
          planningRef.current = false;
        }
      };
      run();
      return;
    }

    const doPlanning = async () => {
      try {
        const source = item.metadata?.source || { type: 'multi', value: item.metadata?.prompt || '' };
        const plan = await study.plan({
          prompt: item.metadata?.prompt || '',
          targetType: type || 'notes',
          source
        });
        const skipGate = (plan as any)?.reasoningAvailable === false;
        await historyApi.update(id, {
          content: {
            ...item.content,
            plan,
            _blueprint: (plan as any)?.blueprint,
            _status: skipGate ? 'pending' : 'awaiting-confirmation'
          }
        });
        qc.invalidateQueries({ queryKey: ['history-item', id] });
      } catch (err) {
        try {
          await historyApi.update(id, { content: { ...item.content, _status: 'pending' } });
          qc.invalidateQueries({ queryKey: ['history-item', id] });
        } catch (e2) {
          // ignore
        }
      } finally {
        planningRef.current = false;
      }
    };
    doPlanning();
  }, [item, id, type, qc]);

  // Generation effect
  useEffect(() => {
    if (!item || !id) return;
    if (item.content?._status !== 'pending') return;
    if (isGenerating) return;

    const apiFn = FEATURE_API[type || ''];
    if (!apiFn) {
      const run = async () => {
        await historyApi.update(id, { content: { _status: 'ready', ...item.content }, metadata: { status: 'ready' } });
        qc.invalidateQueries({ queryKey: ['history-item', id] });
      };
      run();
      return;
    }

    const doGenerate = async () => {
      setIsGenerating(true);
      try {
        const source = item.metadata?.source || { type: 'multi', value: (item.content as any)?.prompt || '' };
        const promptText = item.metadata?.prompt || (item.content as any)?.prompt || (source as any).value || '';
        const body: any = {
          source,
          _draftId: id,
          blueprint: (item.content as any)?._blueprint || (item.content as any)?.plan?.blueprint
        };
        if (type === 'visual') body.topic = promptText;
        else if (type === 'studyplan') body.goal = promptText;
        else if (type === 'prediction' || type === 'predict') {
          body.syllabus = promptText.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (body.syllabus.length === 0) body.syllabus = [promptText];
        } else if (type === 'graph' || type === 'recommendation' || type === 'weakspot') {
          body.topic = promptText;
        }
        const result = await apiFn(body);
        await historyApi.update(id, { content: { ...result, _status: 'ready' }, metadata: { ...item.metadata, status: 'completed' } });
        qc.invalidateQueries({ queryKey: ['history-item', id] });
      } catch (e: any) {
        toast('error', e?.response?.data?.error || 'Generation failed');
        try {
          await historyApi.update(id, {
            content: { ...item.content, _status: 'failed', _error: e?.response?.data?.error || 'Generation failed' }
          });
        } catch (e2) {
          // ignore
        }
      } finally {
        setIsGenerating(false);
      }
    };

    doGenerate();
  }, [item, id, type, isGenerating, qc, toast]);

  const handlePlanConfirm = async (prompt: string, source: Source, _answers: Record<string, string>, blueprint?: ContentBlueprint) => {
    try {
      await historyApi.update(id as string, {
        content: { ...item!.content, _blueprint: blueprint || (item!.content as any)?.plan?.blueprint, _status: 'pending' },
        metadata: { ...item!.metadata, prompt, source }
      });
      qc.invalidateQueries({ queryKey: ['history-item', id] });
      setIsGenerating(false);
      planningRef.current = false;
    } catch (e) {
      toast('error', 'Failed to confirm plan');
    }
  };

  const handleReplan = async (suggestion: string, prompt: string, source: Source) => {
    setReplanning(true);
    try {
      const plan = await study.plan({
        prompt,
        targetType: type || 'notes',
        source,
        suggestion,
        priorPlan: (item!.content as any)?.plan
      });
      await historyApi.update(id as string, {
        content: { ...item!.content, plan, _blueprint: (plan as any)?.blueprint, _status: 'awaiting-confirmation' },
        metadata: { ...item!.metadata, prompt, source }
      });
      qc.invalidateQueries({ queryKey: ['history-item', id] });
    } catch (e) {
      toast('error', 'Could not revise the plan — you can still proceed with the current one.');
    } finally {
      setReplanning(false);
    }
  };

  const handlePlanCancel = async () => {
    try {
      await historyApi.delete(id as string);
      toast('success', 'Cancelled generation');
      nav('/studio');
    } catch (e) {
      toast('error', 'Failed to cancel');
    }
  };

  const updateContent = useCallback(async (newContent: any) => {
    try {
      await historyApi.update(id as string, { content: newContent });
      qc.invalidateQueries({ queryKey: ['history-item', id] });
    } catch (err) {
      // ignore
    }
  }, [id, qc]);

  if (isLoading) {
    return (
      <PageErrorBoundary>
        <div className="p-6 max-w-6xl mx-auto flex items-center justify-center h-64">
          <Spinner className="w-8 h-8 text-brand-500" />
        </div>
      </PageErrorBoundary>
    );
  }

  if (error || !item) {
    return (
      <PageErrorBoundary>
        <div className="p-6 max-w-6xl mx-auto">
          <button onClick={() => nav('/studio')} className="btn-ghost !py-1.5 !px-3 text-xs mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Studio
          </button>
          <EmptyState icon={null} title="Not found" hint="This item could not be found. It may have been deleted." />
        </div>
      </PageErrorBoundary>
    );
  }

  if (item.content?._status === 'planning') {
    return (
      <PageErrorBoundary>
        <div className="p-6 max-w-6xl mx-auto">
          <button onClick={() => nav('/studio')} className="btn-ghost !py-1.5 !px-3 text-xs mb-4">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="card p-12 text-center animate-fade-in">
            <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-bold text-ink-800">Preparing generation...</h2>
            <p className="text-sm text-ink-400 mt-1">Setting up direct flow without reasoning gate.</p>
          </div>
        </div>
      </PageErrorBoundary>
    );
  }

  if (item.content?._status === 'awaiting-confirmation') {
    const fi = FEATURE_INFO[type || ''] || { label: type || 'Feature', color: 'from-brand-500 to-purple-600' };
    return (
      <PageErrorBoundary>
        <div className="p-6 max-w-6xl mx-auto">
          <button onClick={() => nav('/studio')} className="btn-ghost !py-1.5 !px-3 text-xs mb-4">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <PlanGate
            item={item}
            featureLabel={fi.label}
            onConfirm={handlePlanConfirm}
            onReplan={handleReplan}
            replanning={replanning}
            onCancel={handlePlanCancel}
          />
        </div>
      </PageErrorBoundary>
    );
  }

  if (item.content?._status === 'failed') {
    return (
      <PageErrorBoundary>
        <div className="p-6 max-w-6xl mx-auto">
          <button onClick={() => nav('/studio')} className="btn-ghost !py-1.5 !px-3 text-xs mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Studio
          </button>
          <div className="card p-8 border border-red-200 bg-red-50">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <h2 className="text-lg font-bold text-red-800">Generation Failed</h2>
            </div>
            <p className="text-sm text-red-700 mb-4">{(item.content as any)._error || 'Something went wrong'}</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setIsGenerating(false);
                  planningRef.current = false;
                  historyApi.update(id as string, { content: { ...item.content, _status: 'pending' } });
                  qc.invalidateQueries({ queryKey: ['history-item', id] });
                }}
                className="btn-primary"
              >
                Try Again
              </button>
              <button onClick={() => historyApi.delete(id as string).then(() => nav('/studio'))} className="btn-ghost text-red-600">
                Delete Draft
              </button>
            </div>
          </div>
        </div>
      </PageErrorBoundary>
    );
  }

  if (item.content?._status === 'pending') {
    const fi = FEATURE_INFO[type || ''] || { label: type || 'Feature', color: 'from-brand-500 to-purple-600' };
    return (
      <PageErrorBoundary>
        <div className="p-6 max-w-6xl mx-auto">
          <div className="card p-12 text-center">
            <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-bold text-ink-800">Generating {fi.label}...</h2>
            <p className="text-sm text-ink-400 mt-1 max-w-md mx-auto">Direct generation flow — no reasoning step. This may take 10-30 seconds.</p>
            <div className="mt-4 text-xs text-ink-300">URL: /studio/{type}/{id}</div>
          </div>
        </div>
      </PageErrorBoundary>
    );
  }

  const handleDelete = async () => {
    try {
      await historyApi.delete(id as string);
      toast('success', 'Deleted.');
      nav('/studio');
    } catch (err) {
      toast('error', 'Delete failed');
    }
  };

  const content = item.content;
  const source = item.metadata?.source;
  const fi = FEATURE_INFO[type || ''] || FEATURE_INFO.visual;

  const renderContent = () => {
    try {
      const t = type;
      if (t === 'chat' && source) {
        return <ChatView source={source} initialSessionId={id} />;
      }
      if (t === 'slides' && content && (content as any).slides) {
        return <SlidesViewer source={source || { type: 'multi' }} deck={content as SlideDeck} setDeck={(d) => updateContent(d)} />;
      }
      if (t === 'flashcards' && content && (content as any).cards) {
        return <Flashcards source={source || { type: 'multi' }} set={content as FlashcardSet} setSet={(s) => updateContent(s)} />;
      }
      if (t === 'quiz' && content && (content as any).questions) {
        return <Quiz source={source || { type: 'multi' }} quiz={content as QuizT} setQuiz={(q) => updateContent(q)} />;
      }
      if (t === 'mindmap' && content) {
        return <MindMapView source={source || { type: 'multi' }} map={content as MindMap} setMap={(m) => updateContent(m)} />;
      }
      if (t === 'studyplan' && content) {
        return <StudyPlanView source={source || { type: 'multi' }} plan={content as StudyPlan} setPlan={(p) => updateContent(p)} />;
      }
      if (t === 'visual') {
        return <VisualView source={source || { type: 'multi' }} />;
      }
      if (t === 'graph') {
        return <GraphView source={source || { type: 'multi' }} />;
      }

      if (t === 'recommendation' && content) {
        const c = content as any;
        return (
          <div className="space-y-4">
            {c.weakTopics && c.weakTopics.length > 0 && (
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200/60">
                <h3 className="font-semibold text-ink-800 mb-2">Weak Topics</h3>
                <div className="flex flex-wrap gap-1.5">
                  {c.weakTopics.map((topic: string, i: number) => (
                    <span key={i} className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200">{topic}</span>
                  ))}
                </div>
              </div>
            )}
            {c.suggestions && c.suggestions.length > 0 && (
              <div className="p-4 bg-ink-50 rounded-xl border border-ink-200">
                <h3 className="font-semibold text-ink-800 mb-2">Personalized Suggestions</h3>
                <ul className="space-y-2">
                  {c.suggestions.map((s: any, i: number) => (
                    <li key={i} className="flex items-start gap-2 p-3 bg-white rounded-lg border border-ink-200">
                      <Badge tone="brand">{s.type}</Badge>
                      <span className="text-sm text-ink-700">{s.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      }

      if (t === 'weakspot' && content) {
        const c = content as any;
        return (
          <div className="space-y-4">
            {c.weakTopics && c.weakTopics.length > 0 && (
              <div className="p-4 bg-ink-50 rounded-xl border border-ink-200">
                <h3 className="font-semibold text-ink-800 mb-2">Weak Spots Detected</h3>
                <ul className="space-y-2">
                  {c.weakTopics.map((wt: any, i: number) => (
                    <li key={i} className="p-3 bg-white rounded-lg border border-ink-200">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm text-ink-800">{wt.topic}</span>
                        <Badge tone="red">{Math.round((wt.confidence || 0) * 100)}% weak</Badge>
                      </div>
                      <p className="text-xs text-ink-500">{wt.reason}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {c.suggestions && c.suggestions.length > 0 && (
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200/60">
                <h3 className="font-semibold text-ink-800 mb-2">Improvement Plan</h3>
                <ul className="space-y-2">
                  {c.suggestions.map((s: any, i: number) => (
                    <li key={i} className="text-sm text-ink-700"><span className="font-medium">{s.topic}:</span> {s.practice}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      }

      if ((t === 'prediction' || t === 'predict') && content) {
        const c = content as any;
        return (
          <div className="space-y-4">
            {c.nextTopic && (
              <div className="p-5 bg-gradient-to-r from-purple-50 to-brand-50 rounded-xl border border-purple-200/50">
                <h3 className="font-semibold text-ink-800 mb-1 flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-600" /> Predicted Next Topic</h3>
                <p className="text-lg font-bold text-purple-700">{c.nextTopic}</p>
              </div>
            )}
            {c.rationale && (
              <div className="p-4 bg-white rounded-xl border border-ink-200 shadow-sm">
                <h3 className="font-semibold mb-2 text-sm">Why This Next?</h3>
                <div className="text-sm text-ink-700 leading-relaxed"><Markdown content={c.rationale} /></div>
              </div>
            )}
            {c.plan && Array.isArray(c.plan) && (
              <div className="p-4 bg-white rounded-xl border border-ink-200 shadow-sm">
                <h3 className="font-semibold mb-3 text-sm">Study Plan Sequence</h3>
                <ol className="space-y-2">
                  {c.plan.map((step: string, i: number) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="text-ink-700 leading-relaxed flex-1"><Markdown content={step} /></span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        );
      }

      return (
        <div className="prose-sm max-w-none">
          <div className="sf-markdown">
            {typeof content === 'string' ? (
              <Markdown content={content} />
            ) : typeof content === 'object' && content !== null ? (
              Object.entries(content)
                .filter(([k]) => k !== '_historyId' && k !== '_status')
                .map(([key, val]) => (
                  <div key={key} className="mb-4">
                    <h3 className="font-semibold text-ink-800 mb-2 capitalize">{key.replace(/([A-Z])/g, ' $1')}</h3>
                    {typeof val === 'string' ? (
                      <Markdown content={val} />
                    ) : Array.isArray(val) ? (
                      <ul className="space-y-2">
                        {(val as any[]).map((v: any, i: number) => (
                          <li key={i} className="p-3 bg-ink-50 rounded-lg text-sm text-ink-700">
                            {typeof v === 'string' ? <Markdown content={v} /> : JSON.stringify(v)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <pre className="text-sm text-ink-600 whitespace-pre-wrap">{JSON.stringify(val, null, 2)}</pre>
                    )}
                  </div>
                ))
            ) : (
              <pre className="text-sm text-ink-600 whitespace-pre-wrap">{JSON.stringify(content, null, 2)}</pre>
            )}
          </div>
        </div>
      );
    } catch (error) {
      console.error('Content rendering error:', error);
      return (
        <div className="p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-ink-800">Display Error</h3>
          <p className="text-sm text-ink-500 mt-2 max-w-md mx-auto">{error instanceof Error ? error.message : 'Failed to render content.'}</p>
          <button onClick={() => window.location.reload()} className="btn-primary mt-4">Reload Page</button>
        </div>
      );
    }
  };

  return (
    <PageErrorBoundary>
      <div className="p-6 max-w-6xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => nav('/studio')} className="btn-ghost !py-1.5 !px-3 text-xs">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className={cn('w-10 h-10 rounded-lg bg-gradient-to-br text-white flex items-center justify-center shadow-sm', fi.color)}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-ink-900">{item.title || fi.label}</h1>
              <div className="flex items-center gap-2 text-xs text-ink-400">
                <Clock className="w-3 h-3" />
                <span>{item.metadata?.generatedAt ? new Date(item.metadata.generatedAt).toLocaleString() : ''}</span>
                <Badge tone="brand">{fi.label}</Badge>
                {item.isFavorite && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
              </div>
            </div>
          </div>
          <button onClick={handleDelete} className="btn-ghost !py-1.5 !px-2.5 text-xs text-red-500">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>

        {item.metadata?.source?.value && (
          <div className="mb-4 p-3 bg-ink-50 rounded-lg border border-ink-200">
            <p className="text-xs text-ink-500 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-brand-500" /> Prompt: <span className="text-ink-700 font-medium line-clamp-2">{item.metadata.source.value}</span>
            </p>
          </div>
        )}

        <div className="card p-5 shadow-sm border border-ink-200/60">{renderContent()}</div>

        <div className="mt-4 flex items-center gap-2 text-xs text-ink-400">
          <Eye className="w-3 h-3" />
          <span>Permanent URL: /studio/{type}/{id}</span>
        </div>
      </div>
    </PageErrorBoundary>
  );
}
