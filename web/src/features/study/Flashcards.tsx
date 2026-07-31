import { useState, useEffect } from 'react';
import { Layers, Sparkles, RotateCcw, Check, X, Flame } from 'lucide-react';
import { study, progress, exp, downloadBlob } from '../../api/client';
import { useToast, Spinner, EmptyState } from '../../components/ui';
import type { FlashcardSet } from './types';
import type { Source as Src } from './SourceBar';

interface Sch {
  ease: number;
  interval: number;
  reps: number;
  due: number; // epoch ms
}

function sm2(s: Sch, q: number): Sch {
  let { ease, interval, reps } = s;
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  if (q < 3) {
    reps = 0;
    interval = 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ease);
    reps += 1;
  }
  return { ease, interval, reps, due: Date.now() + interval * 86400000 };
}

function initSch(cards: { length: number }) {
  return Array.from({ length: cards.length }, () => ({ ease: 2.5, interval: 0, reps: 0, due: 0 }));
}

export default function Flashcards({ source, set, setSet }: { source: Src; set: FlashcardSet | null; setSet: (s: FlashcardSet | null) => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [sch, setSch] = useState<Sch[]>(() => set?.cards ? initSch(set.cards) : []);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [studied, setStudied] = useState(0);

  // Initialize sch when set changes (e.g., viewing historical flashcards)
  useEffect(() => {
    if (set?.cards) {
      setSch(initSch(set.cards));
      setPos(0);
      setFlipped(false);
      setStudied(0);
    }
  }, [set]);

  const generate = async () => {
    if (!source.value && !source.docId) return toast('error', 'Choose a source first.');
    setLoading(true);
    try {
      const s = await study.flashcards({ source, count: 12 });
      setSet(s);
      setSch(s.cards.map(() => ({ ease: 2.5, interval: 0, reps: 0, due: 0 })));
      setPos(0);
      setFlipped(false);
      setStudied(0);
      progress.activity({ type: 'flashcards' });
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const exportTsv = async () => {
    if (!set) return;
    try {
      const blob = await exp.flashcardsTsv(set);
      downloadBlob(blob, `${set.title || 'flashcards'}.tsv`);
      toast('success', 'Anki-compatible TSV downloaded.');
    } catch {
      toast('error', 'Export failed');
    }
  };

  if (!set) {
    return (
      <div className="card">
        <EmptyState icon={<Layers />} title="Generate flashcards" hint="Spaced-repetition flashcards with SM-2 scheduling to lock in long-term memory."
          action={<button className="btn-primary" onClick={generate} disabled={loading}>{loading ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} Generate Flashcards</button>} />
      </div>
    );
  }

  const card = pos < set.cards.length ? set.cards[pos] : null;
  const rate = (q: number) => {
    const next = sch.length > 0 ? [...sch] : initSch(set.cards);
    next[pos] = sm2(next[pos] || { ease: 2.5, interval: 0, reps: 0, due: 0 }, q);
    setSch(next);
    const correct = q >= 3;
    progress.activity({ type: 'flashcards', correct: correct ? 1 : 0, incorrect: correct ? 0 : 1, topic: card?.tags?.[0] });
    setStudied((n) => n + 1);
    setFlipped(false);
    if (pos + 1 < set.cards.length) setPos((p) => p + 1);
    else {
      toast('success', 'Study session complete!');
      setPos(0);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button className="btn-primary" onClick={generate} disabled={loading}>{loading ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} Regenerate</button>
        <div className="flex items-center gap-2">
          <button className="btn-outline" onClick={exportTsv}>Export TSV</button>
          <span className="text-sm text-ink-500">{Math.min(pos + 1, set.cards.length)} / {set.cards.length} · {studied} reviewed</span>
        </div>
      </div>

      <div className="card p-6 min-h-[320px] flex flex-col items-center justify-center text-center">
        {pos < set.cards.length ? (
          <>
            <p className="text-xs uppercase tracking-widest text-ink-400 mb-3">{flipped ? 'Answer' : 'Question'}</p>
            <div onClick={() => setFlipped((f) => !f)} className="cursor-pointer select-none max-w-2xl">
              <p className="text-xl font-semibold text-ink-900">{flipped ? card?.back : card?.front}</p>
              {flipped && card?.hint && <p className="text-sm text-ink-400 mt-3">💡 {card.hint}</p>}
            </div>
            {!flipped ? (
              <button className="btn-outline mt-6" onClick={() => setFlipped(true)}><RotateCcw className="w-4 h-4" /> Show Answer</button>
            ) : (
              <div className="flex gap-2 mt-6">
                <button className="btn-danger !bg-red-100 !text-red-700" onClick={() => rate(1)}><X className="w-4 h-4" /> Again</button>
                <button className="btn-outline" onClick={() => rate(3)}>Hard</button>
                <button className="btn-outline !border-green-300 !text-green-700" onClick={() => rate(4)}>Good</button>
                <button className="btn-primary" onClick={() => rate(5)}><Check className="w-4 h-4" /> Easy</button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center">
            <Flame className="w-10 h-10 text-amber-500 mx-auto mb-2" />
            <p className="font-semibold text-ink-800">All cards reviewed</p>
            <p className="text-sm text-ink-400 mt-1">Due cards will return based on your SM-2 schedule.</p>
          </div>
        )}
      </div>
    </div>
  );
}
