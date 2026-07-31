import { useState } from 'react';
import { HelpCircle, Sparkles, CheckCircle2, XCircle, Award } from 'lucide-react';
import { study, progress, exp, downloadBlob } from '../../api/client';
import { useToast, Spinner, EmptyState } from '../../components/ui';
import type { Quiz as QuizT } from './types';
import type { Source as Src } from './SourceBar';
import { cn } from '../../lib/cn';

export default function Quiz({ source, quiz, setQuiz }: { source: Src; quiz: QuizT | null; setQuiz: (q: QuizT | null) => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number[][]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [difficulty, setDifficulty] = useState<'mixed' | 'easy' | 'medium' | 'hard' | 'adaptive'>('adaptive');

  const generate = async () => {
    if (!source.value && !source.docId) return toast('error', 'Choose a source first.');
    setLoading(true);
    try {
      const q = await study.quiz({ source, count: 8, difficulty });
      setQuiz(q);
      setSelected(q.questions.map(() => []));
      setSubmitted(false);
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = async () => {
    if (!quiz) return;
    try {
      const blob = await exp.quizCsv(quiz);
      downloadBlob(blob, `${quiz.title || 'quiz'}.csv`);
      toast('success', 'Quiz CSV downloaded.');
    } catch {
      toast('error', 'Export failed');
    }
  };

  const submit = () => {
    if (selected.some((s) => s.length === 0)) return toast('error', 'Answer every question first.');
    setSubmitted(true);

    let correct = 0;
    quiz!.questions.forEach((qq, i) => {
      const selectedSet = new Set(selected[i]);
      const correctSet = new Set([qq.answerIndex]);
      if (selectedSet.size === correctSet.size && [...selectedSet].every(x => correctSet.has(x))) correct++;
    });

    const score = (correct / quiz!.questions.length) * 100;
    progress.activity({ type: 'quiz', score });

    quiz!.questions.forEach((qq, i) => {
      const selectedSet = new Set(selected[i]);
      const correctSet = new Set([qq.answerIndex]);
      const ok = selectedSet.size === correctSet.size && [...selectedSet].every(x => correctSet.has(x));
      progress.activity({ type: 'quiz', correct: ok ? 1 : 0, incorrect: ok ? 0 : 1, topic: qq.topic });
    });

    toast(correct === quiz!.questions.length ? 'success' : 'info', `Score: ${correct}/${quiz!.questions.length}`);
  };

  if (!quiz) {
    return (
      <div className="card">
        <EmptyState icon={<HelpCircle />} title="Generate a quiz" hint="Multiple-choice questions with explanations to test your understanding. Adaptive mode matches difficulty to your recent performance."
          action={
            <div className="flex items-center gap-2">
              <select className="input !w-auto py-1.5 text-sm" value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)}>
                <option value="adaptive">Adaptive</option>
                <option value="mixed">Mixed</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <button className="btn-primary" onClick={generate} disabled={loading}>{loading ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} Generate Quiz</button>
            </div>
          } />
      </div>
    );
  }

  const correct = selected.filter((s, i) => {
    const selectedSet = new Set(s);
    const correctSet = new Set([quiz.questions[i].answerIndex]);
    return selectedSet.size === correctSet.size && [...selectedSet].every(x => correctSet.has(x));
  }).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button className="btn-primary" onClick={generate} disabled={loading}>{loading ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} Regenerate</button>
          <select className="input !w-auto py-1.5 text-sm" value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)}>
            <option value="adaptive">Adaptive</option>
            <option value="mixed">Mixed</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {quiz && <button className="btn-outline" onClick={exportCsv}>Export CSV</button>}
          {submitted && (
            <span className="flex items-center gap-2 text-sm font-medium text-brand-700">
              <Award className="w-4 h-4" /> {correct}/{quiz.questions.length}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {quiz.questions.map((q, qi) => (
          <div key={qi} className="card p-4">
            <p className="font-medium text-ink-800 mb-3">{qi + 1}. {q.question}</p>
            <div className="space-y-2">
              {q.options.map((opt, oi) => {
                const isSel = selected[qi]?.includes(oi);
                const isCorrect = q.answerIndex === oi;
                const showState = submitted && (isSel || isCorrect);
                return (
                  <label key={oi} className={cn(
                    'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border text-sm transition cursor-pointer',
                    showState && isCorrect && 'border-green-400 bg-green-50 text-green-800',
                    showState && isSel && !isCorrect && 'border-red-400 bg-red-50 text-red-800',
                    !showState && isSel && 'border-brand-400 bg-brand-50',
                    !submitted && !isSel && 'border-ink-200 hover:bg-ink-50'
                  )}>
                    <input
                      type="radio"
                      name={`q-${qi}`}
                      checked={isSel}
                      disabled={submitted}
                      onChange={() => {
                        setSelected((s) => s.map((v, i) => (i === qi ? [oi] : v)));
                      }}
                      className="w-4 h-4 accent-brand-600"
                    />
                    <span className="font-medium mr-1">{String.fromCharCode(65 + oi)}.</span>
                    <span className="flex-1">{opt !== undefined && opt !== null ? opt : `Option ${String.fromCharCode(65 + oi)}`}</span>
                    {submitted && isCorrect && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                    {submitted && isSel && !isCorrect && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                  </label>
                );
              })}
            </div>
            {submitted && q.explanation && (
              <p className="text-xs text-ink-500 mt-3 bg-ink-50 p-2 rounded-lg"><b>Explanation:</b> {q.explanation}</p>
            )}
          </div>
        ))}
      </div>

      {!submitted && (
        <button className="btn-primary w-full mt-4" onClick={submit}>Check Answers</button>
      )}
    </div>
  );
}
