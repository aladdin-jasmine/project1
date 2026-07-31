import { useState } from 'react';
import { CalendarRange, Sparkles, Check, CheckCircle2 } from 'lucide-react';
import { study, progress } from '../../api/client';
import { useToast, Spinner, EmptyState } from '../../components/ui';
import type { StudyPlan } from './types';
import type { Source as Src } from './SourceBar';

export default function StudyPlanView({ source, plan, setPlan }: { source: Src; plan: StudyPlan | null; setPlan: (p: StudyPlan | null) => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [goal, setGoal] = useState('');
  const [days, setDays] = useState(7);
  const [done, setDone] = useState<Record<string, boolean>>({});

  const generate = async () => {
    if (!source.value && !source.docId) return toast('error', 'Choose a source first.');
    if (!goal.trim()) return toast('error', 'Enter a study goal.');
    setLoading(true);
    try {
      const p = await study.studyplan({ source, goal, durationDays: days });
      setPlan(p);
      setDone({});
      progress.activity({ type: 'plan' });
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  if (!plan) {
    return (
      <div className="card p-6">
        <EmptyState icon={<CalendarRange />} title="Build a study plan" hint="A realistic, day-by-day plan tailored to your goal and material." />
        <div className="mt-4 space-y-3 max-w-lg mx-auto">
          <div>
            <label className="label">Goal</label>
            <input className="input" placeholder="e.g. Understand and ace my biology midterm" value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <div>
            <label className="label">Duration (days)</label>
            <input type="number" className="input" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </div>
          <button className="btn-primary w-full" onClick={generate} disabled={loading}>
            {loading ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} Generate Plan
          </button>
        </div>
      </div>
    );
  }

  const total = plan.days.reduce((s, d) => s + d.tasks.length, 0);
  const completed = Object.values(done).filter(Boolean).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button className="btn-primary" onClick={generate} disabled={loading}>{loading ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} Regenerate</button>
        <div className="flex items-center gap-2">
          <div className="w-40 h-2 bg-ink-200 rounded-full overflow-hidden">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm text-ink-500">{pct}%</span>
        </div>
      </div>
      <p className="text-sm text-ink-500 mb-4"><b className="text-ink-700">{plan.goal}</b> · {plan.durationDays} days · {plan.summary}</p>

      <div className="space-y-3">
        {plan.days.map((d) => (
          <div key={d.day} className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-ink-800">Day {d.day}</h4>
              <span className="text-xs text-ink-400">~{d.estMinutes} min</span>
            </div>
            {d.topics.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {d.topics.map((t) => <span key={t} className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">{t}</span>)}
              </div>
            )}
            <ul className="space-y-1.5">
              {d.tasks.map((t, i) => {
                const key = `${d.day}-${i}`;
                return (
                  <li key={key}>
                    <button className="flex items-start gap-2 text-left w-full" onClick={() => setDone((s) => ({ ...s, [key]: !s[key] }))}>
                      <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center text-white ${done[key] ? 'bg-green-500 border-green-500' : 'border-ink-300'}`}>
                        {done[key] && <Check className="w-3 h-3" />}
                      </span>
                      <span className={done[key] ? 'text-ink-400 line-through text-sm' : 'text-sm text-ink-700'}>{t}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
