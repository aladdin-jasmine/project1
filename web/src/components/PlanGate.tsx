import { useState, useEffect } from 'react';
import {
  Loader2, Sparkles, Brain, AlertCircle, Edit3, ArrowRight, X,
  ListOrdered, Image, FlaskConical, RefreshCw, MessageSquarePlus
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '../lib/cn';
import { rag } from '../api/client';
import SourceOptions from './SourceOptions';
import type { GenerationPlan, PlanQuestion, ContentBlueprint } from '../api/client';
import type { Source } from '../features/study/SourceBar';
import type { HistoryItem } from '../api/client';

interface PlanGateProps {
  item: HistoryItem;
  featureLabel: string;
  onConfirm: (
    prompt: string,
    source: Source,
    answers: Record<string, string>,
    blueprint?: ContentBlueprint
  ) => void;
  /** Re-run reasoning with the student's steer, then show the revised plan. */
  onReplan?: (suggestion: string, prompt: string, source: Source) => Promise<void> | void;
  replanning?: boolean;
  onCancel: () => void;
}

export default function PlanGate({
  item, featureLabel, onConfirm, onReplan, replanning, onCancel
}: PlanGateProps) {
  const [editing, setEditing] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(item.metadata?.prompt || '');
  const [sourceEdited, setSourceEdited] = useState(false);
  const [editedSource, setEditedSource] = useState<Source>(item.metadata?.source || { type: 'multi', value: '' });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [decidedForMe, setDecidedForMe] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [showAllUnits, setShowAllUnits] = useState(false);

  const plan = item.content?.plan as GenerationPlan | undefined;
  const blueprint = plan?.blueprint;

  const { data: docs = [] } = useQuery({
    queryKey: ['docs'],
    queryFn: () => rag.docs()
  });

  // Auto-fill answers when "Decide for me" is clicked
  useEffect(() => {
    if (decidedForMe && plan?.questions) {
      const autoAnswers: Record<string, string> = {};
      plan.questions.forEach((q: any) => {
        if (q.default) {
          autoAnswers[q.id] = q.default;
        } else if (q.kind === 'choice' || q.kind === 'multi') {
          autoAnswers[q.id] = q.options?.[0] || '';
        } else if (q.kind === 'text') {
          autoAnswers[q.id] = '';
        } else if (q.kind === 'boolean') {
          autoAnswers[q.id] = 'Yes';
        }
      });
      setAnswers(autoAnswers);
    }
  }, [decidedForMe, plan?.questions]);

  const finalPrompt = () =>
    editing && editedPrompt !== (item.metadata?.prompt || '') ? editedPrompt : item.metadata?.prompt || '';
  const finalSource = () => (sourceEdited ? editedSource : (item.metadata?.source || { type: 'multi' })) as Source;

  const handleProceed = () => {
    onConfirm(finalPrompt(), finalSource(), answers, blueprint);
  };

  const handleReplan = async () => {
    if (!suggestion.trim() || !onReplan) return;
    await onReplan(suggestion.trim(), finalPrompt(), finalSource());
    setSuggestion('');
  };

  if (!plan) {
    return (
      <div className="card p-12 text-center animate-fade-in">
        <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto mb-4" />
        <h2 className="text-lg font-bold text-ink-800">Planning generation...</h2>
        <p className="text-sm text-ink-400 mt-1">Our AI is analyzing your request.</p>
      </div>
    );
  }

  // Check if all required questions are answered
  const allQuestionsAnswered = !plan.questions || plan.questions.length === 0 ||
    plan.questions.every((q: any) => answers[q.id]);

  return (
    <div className="card p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-ink-200">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-brand-500 to-purple-600">
          <Brain className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-ink-900">AI Planning</h2>
          <p className="text-xs text-ink-500">Agentic reasoning for {featureLabel}</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Understanding */}
        <div className="p-4 bg-gradient-to-r from-brand-50 to-purple-50 border border-brand-200/50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-brand-600" />
            <span className="text-xs font-semibold text-brand-700 uppercase tracking-wider">Understanding</span>
          </div>
          <p className="text-sm text-ink-800 leading-relaxed">{plan.understanding}</p>
        </div>

        {/* Plan of action */}
        <div className="p-4 bg-ink-50 rounded-xl border border-ink-200">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-semibold text-ink-600 uppercase tracking-wider">Plan of action</span>
          </div>
          <p className="text-sm text-ink-700 leading-relaxed">{plan.plan}</p>
        </div>

        {/* Topics and context */}
        <div className="grid grid-cols-2 gap-4">
          {plan.topics && plan.topics.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-ink-600 uppercase tracking-wider block mb-2">Topics to cover</span>
              <div className="flex flex-wrap gap-1.5">
                {plan.topics.map((t: any, i: number) => (
                  <span key={i} className="text-xs bg-ink-100 text-ink-700 px-2.5 py-1 rounded-full font-medium">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <span className="text-xs font-semibold text-ink-600 uppercase tracking-wider block mb-2">Estimated size</span>
            <span className="text-sm bg-teal-50 text-teal-700 px-3 py-1 rounded-full font-medium inline-block">
              {plan.estimatedLength || 'Standard'}
            </span>
          </div>
        </div>

        {/* What will actually be generated, unit by unit */}
        {blueprint && blueprint.units.length > 0 && (
          <div className="border border-brand-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-brand-50 border-b border-brand-200">
              <div className="flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-brand-600" />
                <span className="text-xs font-semibold text-brand-700 uppercase tracking-wider">
                  Work plan — {blueprint.units.length} {blueprint.unitLabel}
                  {blueprint.units.length === 1 ? '' : 's'}
                </span>
              </div>
              <span className="text-[11px] text-brand-600 font-medium">
                ~{blueprint.totalWords.toLocaleString()} words total
              </span>
            </div>
            <ol className="divide-y divide-ink-100">
              {(showAllUnits ? blueprint.units : blueprint.units.slice(0, 5)).map((u, i) => (
                <li key={u.id || i} className="px-4 py-3 flex gap-3">
                  <span className="text-xs font-bold text-ink-300 shrink-0 mt-0.5 w-5 text-right">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-800 leading-snug">{u.title}</p>
                    {u.focus && u.focus !== u.title && (
                      <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">{u.focus}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="text-[10px] bg-ink-100 text-ink-600 px-1.5 py-0.5 rounded font-medium">
                        ~{u.targetWords} words
                      </span>
                      {u.needsDiagram && (
                        <span className="text-[10px] bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-1">
                          <Image className="w-2.5 h-2.5" /> diagram
                        </span>
                      )}
                      {u.exampleCount > 0 && (
                        <span className="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-1">
                          <FlaskConical className="w-2.5 h-2.5" /> {u.exampleCount} example
                          {u.exampleCount === 1 ? '' : 's'}
                        </span>
                      )}
                      {u.subtopics?.length > 0 && (
                        <span className="text-[10px] bg-ink-100 text-ink-600 px-1.5 py-0.5 rounded font-medium">
                          {u.subtopics.length} subtopics
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            {blueprint.units.length > 5 && (
              <button
                onClick={() => setShowAllUnits(!showAllUnits)}
                className="w-full px-4 py-2 text-xs font-medium text-brand-600 hover:bg-brand-50 border-t border-ink-100"
              >
                {showAllUnits ? 'Show fewer' : `Show all ${blueprint.units.length}`}
              </button>
            )}
          </div>
        )}

        {/* Context report */}
        {plan.contextFound ? (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2">
            <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded font-semibold shrink-0">✓</span>
            <p className="text-xs text-emerald-700">
              Found context in {plan.docsUsed} documents (~{Math.round(plan.contextChars || 0 / 1000)}K chars)
            </p>
          </div>
        ) : (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              No relevant documents found. Will generate from general knowledge.
            </p>
          </div>
        )}

        {/* Quality notes */}
        {plan.qualityNotes && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <p className="text-xs text-emerald-700">{plan.qualityNotes}</p>
          </div>
        )}

        {/* Prompt editor */}
        <div className="border-t border-ink-200 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-ink-600 uppercase tracking-wider">Your prompt</span>
            <button
              onClick={() => setEditing(!editing)}
              className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 font-medium"
            >
              <Edit3 className="w-3 h-3" />
              {editing ? 'Done' : 'Edit'}
            </button>
          </div>
          {editing ? (
            <textarea
              className="input h-20 resize-y text-sm"
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              autoFocus
            />
          ) : (
            <div className="p-3 bg-ink-50 rounded-lg border border-ink-200">
              <p className="text-sm text-ink-700">{item.metadata?.prompt || ''}</p>
            </div>
          )}
        </div>

        {/* Source selector */}
        <div className="border-t border-ink-200 pt-4">
          <span className="text-xs font-semibold text-ink-600 uppercase tracking-wider block mb-2">Sources</span>
          <SourceOptions
            docs={docs}
            source={editedSource}
            onChange={(src) => {
              setEditedSource(src);
              setSourceEdited(true);
            }}
            compact={true}
          />
        </div>

        {/* Clarifying questions */}
        {plan.questions && plan.questions.length > 0 && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                Clarifying Questions
              </span>
            </div>
            <div className="space-y-3">
              {plan.questions.map((q: any) => (
                <div key={q.id} className="bg-white rounded-lg border border-amber-100 p-3">
                  <div className="flex items-start justify-between mb-2">
                    <label className="text-sm font-medium text-ink-800">{q.question}</label>
                    {q.why && <span className="text-[10px] text-ink-400 ml-2">{q.why}</span>}
                  </div>
                  {q.kind === 'choice' && q.options && (
                    <div className="space-y-2">
                      {q.options.map((opt: any, i: number) => (
                        <label key={i} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={q.id}
                            value={opt}
                            checked={answers[q.id] === opt}
                            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                            className="w-3.5 h-3.5 accent-amber-600"
                          />
                          <span className="text-xs text-ink-700">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {q.kind === 'multi' && q.options && (
                    <div className="space-y-2">
                      {q.options.map((opt: any, i: number) => (
                        <label key={i} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            value={opt}
                            checked={answers[q.id]?.split(',').includes(opt) || false}
                            onChange={(e) => {
                              const current = answers[q.id]?.split(',') || [];
                              const updated = e.target.checked
                                ? [...current, opt]
                                : current.filter(v => v !== opt);
                              setAnswers({ ...answers, [q.id]: updated.join(',') });
                            }}
                            className="w-3.5 h-3.5 accent-amber-600"
                          />
                          <span className="text-xs text-ink-700">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {q.kind === 'text' && (
                    <input
                      type="text"
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      placeholder="Your answer..."
                      className="input text-sm h-9"
                    />
                  )}
                  {q.kind === 'boolean' && (
                    <div className="flex gap-2">
                      {['Yes', 'No'].map(opt => (
                        <button
                          key={opt}
                          onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                          className={cn(
                            'px-3 py-1 rounded-lg text-xs font-medium transition',
                            answers[q.id] === opt
                              ? 'bg-amber-600 text-white'
                              : 'bg-white border border-amber-200 text-ink-600 hover:bg-amber-50'
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setDecidedForMe(true)}
              className="mt-3 text-xs text-amber-600 hover:text-amber-700 font-medium"
            >
              Decide for me
            </button>
          </div>
        )}

        {/* Suggestion → re-reason. Skipping this and pressing Proceed runs the
            plan exactly as shown above. */}
        {onReplan && (
          <div className="border-t border-ink-200 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquarePlus className="w-4 h-4 text-brand-600" />
              <span className="text-xs font-semibold text-ink-600 uppercase tracking-wider">
                Change the plan
              </span>
              <span className="text-[11px] text-ink-400 font-normal normal-case">optional</span>
            </div>
            {plan.suggestion && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-2">
                Revised for: “{plan.suggestion}”
              </p>
            )}
            <div className="flex gap-2">
              <textarea
                className="input flex-1 h-16 resize-y text-sm"
                placeholder="e.g. make the answers longer, focus on numerical problems, drop the last two questions, add more diagrams..."
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value)}
                disabled={replanning}
              />
              <button
                onClick={handleReplan}
                disabled={!suggestion.trim() || replanning}
                className={cn(
                  'btn-outline !py-2 !px-4 text-sm self-start flex items-center gap-2 whitespace-nowrap',
                  (!suggestion.trim() || replanning) && 'opacity-50 cursor-not-allowed'
                )}
              >
                {replanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {replanning ? 'Re-planning' : 'Re-plan'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-ink-200">
        <div className="text-xs text-ink-500">
          What I'm going to do: <span className="text-ink-700 font-medium">{plan.plan.slice(0, 80)}...</span>
        </div>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} className="btn-outline !py-2 !px-4 text-sm">
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            onClick={handleProceed}
            disabled={!allQuestionsAnswered || replanning}
            className={cn(
              'btn-primary !py-2 !px-5 text-sm flex items-center gap-2',
              (!allQuestionsAnswered || replanning) && 'opacity-50 cursor-not-allowed'
            )}
          >
            <ArrowRight className="w-4 h-4" />
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}
