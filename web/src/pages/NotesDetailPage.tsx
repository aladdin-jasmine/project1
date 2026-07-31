import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, Loader2, Sparkles, Trash2, Star, Eye, Plus, AlertCircle } from 'lucide-react';
import { history as historyApi, study, type HistoryItem, type ContentBlueprint } from '../api/client';
import { useToast, Spinner, EmptyState, Badge } from '../components/ui';
import { cn } from '../lib/cn';
import Markdown from '../lib/markdown';
import PlanGate from '../components/PlanGate';
import type { Source } from '../features/study/SourceBar';

// Maps URL subType → display info
const NOTES_INFO: Record<string, { label: string; color: string; noteType: string }> = {
  shortnotes: { label: 'Short Notes', color: 'from-blue-500 to-blue-600', noteType: 'short-notes' },
  examnotes: { label: 'Exam Notes', color: 'from-emerald-500 to-emerald-600', noteType: 'exam-notes' },
  '5-mark': { label: '5-Mark Q&A', color: 'from-amber-500 to-amber-600', noteType: '5-mark' },
  '10-mark': { label: '10-Mark Q&A', color: 'from-orange-500 to-orange-600', noteType: '10-mark' },
  onepage: { label: 'One-Page Summary', color: 'from-violet-500 to-violet-600', noteType: 'one-page' },
  viva: { label: 'Viva Questions', color: 'from-purple-500 to-purple-600', noteType: 'viva-questions' },
};

// Maps noteType → display section keys
const NT_SECTIONS: Record<string, string[]> = {
  'short-notes': ['shortNotes'],
  'exam-notes': ['examNotes', 'quickTips', 'diagrams'],
  '5-mark': ['fiveMark'],
  '10-mark': ['tenMark'],
  'one-page': ['onePage'],
  'viva-questions': ['viva'],
};

const SECTION_LABELS: Record<string, string> = {
  shortNotes: 'Short Notes',
  examNotes: 'Exam Notes',
  quickTips: 'Quick Tips & Shortcuts',
  diagrams: 'Diagrams',
  fiveMark: '5-Mark Questions',
  tenMark: '10-Mark Questions',
  onePage: 'One-Page Summary',
  viva: 'Viva Questions',
};

export default function NotesDetailPage() {
  const { subType: urlSubType, id } = useParams<{ subType: string; id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const generating = useRef(false);
  const [generatingMore, setGeneratingMore] = useState(false);
  const [replanning, setReplanning] = useState(false);

  const nt = NOTES_INFO[urlSubType || ''] || NOTES_INFO.shortnotes;
  const planningRef = useRef(false);

  const { data: item, isLoading, error } = useQuery<HistoryItem>({
    queryKey: ['notes-item', id],
    queryFn: () => historyApi.getItem(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Poll during both planning and pending states, but NOT during awaiting-confirmation
      if (data && (data.content?._status === 'pending' || data.content?._status === 'planning')) return 2000;
      return false;
    },
  });

  // State machine:
  // planning → (LLM plans) → awaiting-confirmation → (user confirms) → pending → (LLM generates) → ready
  useEffect(() => {
    if (!item || !id) return;

    // Handle planning state: fire /plan endpoint once
    if (item.content?._status === 'planning' && !planningRef.current) {
      planningRef.current = true;
      const doPlanning = async () => {
        try {
          const source = item.metadata?.source || { type: 'multi', value: item.metadata?.prompt || '' };
          const plan = await study.plan({
            prompt: item.metadata?.prompt || '',
            targetType: nt.noteType,
            source
          });
          // Reasoning is the gate. When it is unavailable there is nothing to
          // review, so go straight to generation instead of stalling the user
          // in front of a placeholder plan.
          const skipGate = plan?.reasoningAvailable === false;
          await historyApi.update(id, {
            content: {
              ...item.content,
              plan,
              _blueprint: plan?.blueprint,
              _status: skipGate ? 'pending' : 'awaiting-confirmation'
            }
          });
          qc.invalidateQueries({ queryKey: ['notes-item', id] });
        } catch (e: any) {
          // No reasoning at all — proceed directly rather than blocking.
          await historyApi.update(id, {
            content: { ...item.content, _status: 'pending' }
          });
          qc.invalidateQueries({ queryKey: ['notes-item', id] });
        }
      };
      doPlanning();
    }

    // Handle pending state: auto-generate
    if (item.content?._status === 'pending' && !generating.current) {
      generating.current = true;
      const doGenerate = async () => {
        try {
          const source = item.metadata?.source || { type: 'multi', value: item.metadata?.prompt || '' };
          const promptText = item.metadata?.prompt || '';
          if (source.type === 'multi' && !source.value) source.value = promptText;
          await study.notes({
            source,
            noteType: nt.noteType,
            subject: promptText,
            // The approved work plan: every unit is generated in parallel from it.
            blueprint: item.content?._blueprint || item.content?.plan?.blueprint,
            _draftId: id
          });
          qc.invalidateQueries({ queryKey: ['notes-item', id] });
        } catch (e: any) {
          toast('error', e?.response?.data?.error || 'Generation failed');
          await historyApi.update(id, {
            content: { ...item.content, _status: 'failed', _error: e?.response?.data?.error || 'Generation failed' }
          });
          generating.current = false;
        }
      };
      doGenerate();
    }
  }, [item, id, nt.noteType, qc, toast]);

  const handlePlanConfirm = async (
    prompt: string,
    source: Source,
    _answers: Record<string, string>,
    blueprint?: ContentBlueprint
  ) => {
    try {
      await historyApi.update(id!, {
        content: {
          ...item!.content,
          _blueprint: blueprint || item!.content?.plan?.blueprint,
          _status: 'pending'
        },
        metadata: { ...item!.metadata, prompt, source }
      });
      qc.invalidateQueries({ queryKey: ['notes-item', id] });
      generating.current = false;
    } catch (e: any) {
      toast('error', 'Failed to confirm plan');
    }
  };

  // Re-run reasoning with the student's steer, then show the revised plan.
  const handleReplan = async (suggestion: string, prompt: string, source: Source) => {
    setReplanning(true);
    try {
      const plan = await study.plan({
        prompt,
        targetType: nt.noteType,
        source,
        suggestion,
        priorPlan: item!.content?.plan
      });
      await historyApi.update(id!, {
        content: { ...item!.content, plan, _blueprint: plan?.blueprint, _status: 'awaiting-confirmation' },
        metadata: { ...item!.metadata, prompt, source }
      });
      qc.invalidateQueries({ queryKey: ['notes-item', id] });
    } catch (e: any) {
      toast('error', 'Could not revise the plan — you can still proceed with the current one.');
    } finally {
      setReplanning(false);
    }
  };

  const handlePlanCancel = async () => {
    try {
      await historyApi.delete(id!);
      toast('success', 'Cancelled generation');
      nav('/notes');
    } catch (e: any) {
      toast('error', 'Failed to cancel');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto flex items-center justify-center h-64">
        <Spinner className="w-8 h-8 text-brand-500" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button onClick={() => nav('/notes')} className="btn-ghost !py-1.5 !px-3 text-xs mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Notes
        </button>
        <EmptyState icon={null} title="Not found" hint="This note could not be found." />
      </div>
    );
  }

  if (item.content?._status === 'planning') {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button onClick={() => nav('/notes')} className="btn-ghost !py-1.5 !px-3 text-xs mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="card p-12 text-center animate-fade-in">
          <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-bold text-ink-800">AI is planning...</h2>
          <p className="text-sm text-ink-400 mt-1">Analyzing your request and knowledge base.</p>
        </div>
      </div>
    );
  }

  if (item.content?._status === 'awaiting-confirmation') {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button onClick={() => nav('/notes')} className="btn-ghost !py-1.5 !px-3 text-xs mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <PlanGate
          item={item}
          featureLabel={nt.label}
          onConfirm={handlePlanConfirm}
          onReplan={handleReplan}
          replanning={replanning}
          onCancel={handlePlanCancel}
        />
      </div>
    );
  }

  if (item.content?._status === 'failed') {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button onClick={() => nav('/notes')} className="btn-ghost !py-1.5 !px-3 text-xs mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Notes
        </button>
        <div className="card p-8 border border-red-200 bg-red-50">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
            <h2 className="text-lg font-bold text-red-800">Generation Failed</h2>
          </div>
          <p className="text-sm text-red-700 mb-4">{item.content._error || 'Something went wrong'}</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                generating.current = false;
                historyApi.update(id!, { content: { ...item.content, _status: 'pending' } });
                qc.invalidateQueries({ queryKey: ['notes-item', id] });
              }}
              className="btn-primary"
            >
              Try Again
            </button>
            <button onClick={() => historyApi.delete(id!).then(() => nav('/notes'))} className="btn-ghost text-red-600">
              Delete Draft
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (item.content?._status === 'pending') {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="card p-12 text-center animate-fade-in">
          <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-bold text-ink-800">Generating {nt.label}...</h2>
          <p className="text-sm text-ink-400 mt-1">You can safely refresh or bookmark this page.</p>
          <div className="mt-4 text-xs text-ink-300">URL: /notes/{urlSubType}/{id}</div>
        </div>
      </div>
    );
  }

  const handleDelete = async () => {
    try {
      await historyApi.delete(id!);
      toast('success', 'Deleted.');
      nav('/notes');
    } catch { toast('error', 'Delete failed'); }
  };

  const handleGenerateMore = async (noteType: string, existingItems: any[]) => {
    if (generatingMore) return;
    setGeneratingMore(true);
    try {
      const source = item.metadata?.source || { type: 'multi', value: '' };
      const existingQA: string[] = existingItems.map((qa: any) => qa.question || '');
      await study.notes({
        source,
        noteType,
        existingQA,
        _existingContent: item.content,
        _draftId: id,
        subject: item.metadata?.subject || '',
        topic: item.metadata?.topic || '',
        tags: item.metadata?.tags
      });
      qc.invalidateQueries({ queryKey: ['notes-item', id] });
      toast('success', 'More questions generated!');
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Generation failed');
    } finally {
      setGeneratingMore(false);
    }
  };

  const renderContent = () => {
    const c = item.content;
    if (!c) return null;
    if (typeof c === 'string') return <Markdown content={c} />;

    const sections = NT_SECTIONS[nt.noteType] || ['shortNotes', 'examNotes', 'fiveMark', 'tenMark', 'onePage', 'viva'];

    return (
      <div className="space-y-4">
        {sections.map((key) => {
          const val = c[key];
          if (!val) return null;
          const label = SECTION_LABELS[key] || key;

          if (key === 'examNotes' || key === 'onePage') {
            return (
              <div key={key} className="p-4 bg-ink-50 rounded-lg">
                <h3 className="font-semibold text-ink-800 mb-2">{label}</h3>
                <div className="text-sm text-ink-700 sf-markdown">
                  <Markdown content={val} />
                </div>
              </div>
            );
          }

          if (key === 'shortNotes') {
            const cards = Array.isArray(val) ? val : [val].filter(Boolean);
            if (cards.length === 0) return null;
            return (
              <div key={key}>
                <h3 className="font-semibold text-ink-800 mb-3">{label}</h3>
                <div className="grid gap-3">
                  {cards.map((card: string, i: number) => (
                    <div key={i} className="p-4 bg-white rounded-lg border border-ink-200 shadow-sm">
                      <div className="text-sm text-ink-700 sf-markdown">
                        <Markdown content={card} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          if (key === 'quickTips') {
            const tips = Array.isArray(val) ? val : [val].filter(Boolean);
            if (tips.length === 0) return null;
            return (
              <div key={key}>
                <h3 className="font-semibold text-ink-800 mb-3">{label}</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {tips.map((tip: string, i: number) => (
                    <div key={i} className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="flex items-start gap-2">
                        <span className="text-amber-500 font-bold text-sm shrink-0 mt-0.5">Tip {i + 1}</span>
                        <div className="text-sm text-ink-700 sf-markdown">
                          <Markdown content={tip} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          if (key === 'diagrams') {
            const diagrams = Array.isArray(val) ? val : [val].filter(Boolean);
            if (diagrams.length === 0) return null;
            return (
              <div key={key}>
                <h3 className="font-semibold text-ink-800 mb-3">{label}</h3>
                <div className="grid gap-3">
                  {diagrams.map((diag: string, i: number) => (
                    <div key={i} className="p-4 bg-white rounded-lg border border-ink-200 shadow-sm">
                      <div className="text-sm text-ink-700 sf-markdown">
                        <Markdown content={diag} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          if (key === 'fiveMark' || key === 'tenMark') {
            const items = Array.isArray(val) ? val : [];
            if (items.length === 0) return null;
            return (
              <div key={key} className="p-4 bg-ink-50 rounded-lg">
                <h3 className="font-semibold text-ink-800 mb-3">{label}</h3>
                <div className="space-y-4">
                  {items.map((qa: any, i: number) => (
                    <div key={i} className="p-4 bg-white rounded-lg border border-ink-200 shadow-sm">
                      <h4 className="font-semibold text-ink-800 mb-2">Q{i + 1}: {qa.question}</h4>
                      <div className="text-sm text-ink-700 sf-markdown mb-3">
                        <Markdown content={qa.answer} />
                      </div>
                      {qa.subtopics?.length > 0 && (
                        <div className="mb-3">
                          <span className="font-medium text-ink-700">Subtopics:</span>
                          <ul className="list-disc list-inside text-sm text-ink-600 mt-1">
                            {qa.subtopics.map((st: string, j: number) => <li key={j}>{st}</li>)}
                          </ul>
                        </div>
                      )}
                      {qa.diagrams?.length > 0 && (
                        <div className="mb-3">
                          <span className="font-medium text-ink-700">Diagrams:</span>
                          <div className="grid gap-2 mt-1">
                            {qa.diagrams.map((diag: string, j: number) => (
                              <div key={j} className="p-3 bg-ink-50 rounded border border-ink-200">
                                <Markdown content={diag} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {qa.examples?.length > 0 && (
                        <div className="mb-3">
                          <span className="font-medium text-ink-700">Examples:</span>
                          <ul className="list-disc list-inside text-sm text-ink-600 mt-1">
                            {qa.examples.map((ex: string, j: number) => <li key={j}>{ex}</li>)}
                          </ul>
                        </div>
                      )}
                      {qa.keyPoints?.length > 0 && (
                        <div className="mb-3">
                          <span className="font-medium text-ink-700">Key Points:</span>
                          <ul className="list-disc list-inside text-sm text-ink-600 mt-1">
                            {qa.keyPoints.map((kp: string, j: number) => <li key={j}>{kp}</li>)}
                          </ul>
                        </div>
                      )}
                      {key === 'tenMark' && qa.introduction && (
                        <div className="mb-3 p-3 bg-blue-50 rounded border border-blue-200">
                          <span className="font-medium text-blue-700">Introduction:</span>
                          <div className="text-sm text-blue-800 mt-1 sf-markdown"><Markdown content={qa.introduction} /></div>
                        </div>
                      )}
                      {key === 'tenMark' && qa.conclusion && (
                        <div className="mb-3 p-3 bg-green-50 rounded border border-green-200">
                          <span className="font-medium text-green-700">Conclusion:</span>
                          <div className="text-sm text-green-800 mt-1 sf-markdown"><Markdown content={qa.conclusion} /></div>
                        </div>
                      )}
                      {key === 'tenMark' && qa.markingScheme && (
                        <div className="p-3 bg-amber-50 rounded border border-amber-200">
                          <span className="font-medium text-amber-700">Marking Scheme:</span>
                          <div className="text-sm text-amber-800 mt-1 sf-markdown"><Markdown content={qa.markingScheme} /></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-ink-500">{items.length} question{items.length !== 1 ? 's' : ''} generated</span>
                  <button
                    onClick={() => handleGenerateMore(key === 'fiveMark' ? '5-mark' : '10-mark', items)}
                    disabled={generatingMore}
                    className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1.5"
                  >
                    {generatingMore ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    {generatingMore ? 'Generating...' : 'Generate More'}
                  </button>
                </div>
              </div>
            );
          }

          if (key === 'viva') {
            const items = Array.isArray(val) ? val : [];
            if (items.length === 0) return null;
            return (
              <div key={key} className="p-4 bg-ink-50 rounded-lg">
                <h3 className="font-semibold text-ink-800 mb-2">{label}</h3>
                <div className="space-y-2">
                  {items.map((q: string, i: number) => (
                    <div key={i} className="p-3 bg-white rounded-lg border border-ink-200">
                      <div className="text-sm text-ink-700 sf-markdown">
                        <Markdown content={q} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          return null;
        })}

        {/* Show raw data if no known sections found */}
        {sections.every((k) => !c[k]) && (
          <pre className="text-sm text-ink-600 whitespace-pre-wrap">{JSON.stringify(c, null, 2)}</pre>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/notes')} className="btn-ghost !py-1.5 !px-3 text-xs">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className={cn('w-10 h-10 rounded-lg bg-gradient-to-br text-white flex items-center justify-center shadow-sm', nt.color)}>
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink-900">{item.title || nt.label}</h1>
            <div className="flex items-center gap-2 text-xs text-ink-400">
              <Clock className="w-3 h-3" />
              <span>{item.metadata?.generatedAt ? new Date(item.metadata.generatedAt).toLocaleString() : ''}</span>
              <Badge tone="brand">{nt.label}</Badge>
              {item.isFavorite && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
            </div>
          </div>
        </div>
        <button onClick={handleDelete} className="btn-ghost !py-1.5 !px-2.5 text-xs text-red-500">
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>

      <div className="card p-6">
        <div className="sf-markdown prose-sm max-w-none">{renderContent()}</div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-ink-400">
        <Eye className="w-3 h-3" />
        <span>Permanent URL: /notes/{urlSubType}/{id}</span>
      </div>
    </div>
  );
}
