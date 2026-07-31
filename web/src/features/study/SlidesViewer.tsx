import { useState } from 'react';
import { ChevronLeft, ChevronRight, Presentation, Download, Sparkles, Eye } from 'lucide-react';
import { study, exp, downloadBlob, progress } from '../../api/client';
import { useToast, Spinner, EmptyState } from '../../components/ui';
import type { SlideDeck } from './types';
import type { Source as Src } from './SourceBar';

export default function SlidesViewer({ source, deck, setDeck }: { source: Src; deck: SlideDeck | null; setDeck: (d: SlideDeck | null) => void }) {
  const toast = useToast();
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const generate = async () => {
    if (!source.value && !source.docId) return toast('error', 'Choose a source first.');
    setLoading(true);
    try {
      const d = await study.slides({ source, count: 8 });
      setDeck(d);
      setIdx(0);
      progress.activity({ type: 'slides' });
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const exportPptx = async () => {
    if (!deck) return;
    try {
      const blob = await exp.pptx(deck);
      downloadBlob(blob, `${deck.title || 'slides'}.pptx`);
      toast('success', 'PPTX downloaded.');
    } catch (e: any) {
      toast('error', 'Export failed');
    }
  };

  if (!deck) {
    return (
      <div className="card">
        <EmptyState
          icon={<Presentation />}
          title="Generate presentation slides"
          hint="Turn any document, text, or topic into a clean slide deck you can study from or export to PowerPoint."
          action={
            <button className="btn-primary" onClick={generate} disabled={loading}>
              {loading ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} Generate Slides
            </button>
          }
        />
      </div>
    );
  }

  const slide = deck.slides[idx];
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button className="btn-primary" onClick={generate} disabled={loading}>
          {loading ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} Regenerate
        </button>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={() => setShowNotes((s) => !s)}>
            <Eye className="w-4 h-4" /> {showNotes ? 'Hide' : 'Show'} Notes
          </button>
          <button className="btn-outline" onClick={exportPptx}>
            <Download className="w-4 h-4" /> Export PPTX
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="aspect-video bg-gradient-to-br from-brand-700 to-brand-500 text-white p-10 flex flex-col justify-center">
          <p className="text-xs uppercase tracking-widest text-brand-100 mb-2">{deck.title}</p>
          <h2 className="text-3xl font-bold">{slide.title}</h2>
          {slide.layout !== 'title' && slide.bullets.length > 0 && (
            <ul className="mt-5 space-y-2 text-brand-50">
              {slide.bullets.map((b, i) => (
                <li key={i} className="flex gap-2"><span>•</span><span>{b}</span></li>
              ))}
            </ul>
          )}
        </div>
        {showNotes && (
          <div className="p-4 bg-ink-50 border-t border-ink-200 text-sm text-ink-600">
            <b className="text-ink-700">Speaker notes:</b> {slide.notes || '—'}
          </div>
        )}
        <div className="flex items-center justify-between p-3 border-t border-ink-200">
          <button className="btn-ghost" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <span className="text-sm text-ink-500">{idx + 1} / {deck.slides.length}</span>
          <button className="btn-ghost" disabled={idx === deck.slides.length - 1} onClick={() => setIdx((i) => i + 1)}>
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-1 px-3 pb-3 flex-wrap">
          {deck.slides.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} className={`w-2.5 h-2.5 rounded-full ${i === idx ? 'bg-brand-600' : 'bg-ink-200'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
