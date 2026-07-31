import { useState } from 'react';
import { FileText, LinkIcon, ExternalLink, Globe, X, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn';
import type { Source } from '../features/study/SourceBar';

interface SourceOptionsProps {
  docs: Array<{ id: string; name: string; subject?: string }>;
  source?: Source;
  onChange?: (source: Source) => void;
  compact?: boolean;
}

export default function SourceOptions({ docs, source, onChange, compact = false }: SourceOptionsProps) {
  const [showOpts, setShowOpts] = useState(!compact);
  const [sourceMode, setSourceMode] = useState<'all' | 'select' | 'custom'>('all');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [customText, setCustomText] = useState('');
  const [webUrl, setWebUrl] = useState('');
  const [webUrls, setWebUrls] = useState<string[]>([]);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState('');

  const handleWebFetch = async () => {
    if (!webUrl.trim()) return;
    setWebLoading(true);
    setWebError('');
    try {
      const res = await fetch('/api/source/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webUrl.trim() })
      });
      const data = await res.json();
      if (data.error) {
        setWebError(data.error);
        return;
      }
      setWebUrls(prev => [...prev, webUrl.trim()]);
      setWebUrl('');
    } catch (e: any) {
      setWebError(e.message || 'Failed to fetch URL');
    } finally {
      setWebLoading(false);
    }
  };

  const toggleDoc = (id: string) => {
    setSelectedDocIds(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
    notifyChange();
  };

  const notifyChange = () => {
    if (!onChange) return;
    let newSource: Source;
    if (sourceMode === 'select' && selectedDocIds.length > 0) {
      newSource = { type: 'multi', docIds: selectedDocIds, useAllDocs: false, customText: customText || undefined, urls: webUrls.length > 0 ? webUrls : undefined };
    } else if (sourceMode === 'custom') {
      newSource = { type: 'multi', docIds: selectedDocIds.length > 0 ? selectedDocIds : docs.map(d => d.id), useAllDocs: selectedDocIds.length === 0, customText: customText || undefined, urls: webUrls.length > 0 ? webUrls : undefined };
    } else {
      newSource = { type: 'multi', docIds: docs.map(d => d.id), useAllDocs: true, customText: customText || undefined, urls: webUrls.length > 0 ? webUrls : undefined };
    }
    onChange(newSource);
  };

  const handleSourceModeChange = (mode: 'all' | 'select' | 'custom') => {
    setSourceMode(mode);
    setShowOpts(true);
  };

  if (compact && !showOpts) {
    return (
      <button
        onClick={() => setShowOpts(true)}
        className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 font-medium"
      >
        <span>Adjust sources</span>
        <ChevronDown className="w-3 h-3" />
      </button>
    );
  }

  return (
    <div className={cn('space-y-3', compact && 'card p-4 mt-3 animate-scale-in')}>
      {compact && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-ink-600 uppercase tracking-wider">Sources</span>
          <button onClick={() => setShowOpts(false)} className="text-ink-400 hover:text-ink-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'all', label: 'All Documents' },
          { id: 'select', label: 'Select Files' },
          { id: 'custom', label: 'Custom' }
        ].map(m => (
          <button
            key={m.id}
            onClick={() => handleSourceModeChange(m.id as any)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition',
              sourceMode === m.id ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {sourceMode === 'select' && (
        <div className="max-h-40 overflow-y-auto space-y-1 border border-ink-200 rounded-lg p-2">
          {docs.map(d => (
            <label key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-ink-50 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={selectedDocIds.includes(d.id)}
                onChange={() => toggleDoc(d.id)}
                className="w-3.5 h-3.5 accent-brand-600"
              />
              <FileText className="w-3.5 h-3.5 text-ink-400 shrink-0" />
              <span className="truncate text-ink-700">{d.name}</span>
              {d.subject && <span className="text-xs text-ink-400 shrink-0">({d.subject})</span>}
            </label>
          ))}
        </div>
      )}

      {sourceMode === 'custom' && (
        <div className="space-y-2">
          <textarea
            className="input h-24 resize-y"
            placeholder="Paste custom text (optional)..."
            value={customText}
            onChange={(e) => {
              setCustomText(e.target.value);
              notifyChange();
            }}
          />
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                type="url"
                className="input pl-9"
                placeholder="https://en.wikipedia.org/wiki/..."
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleWebFetch();
                }}
              />
            </div>
            <button className="btn-primary" onClick={handleWebFetch} disabled={webLoading || !webUrl.trim()}>
              {webLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              Add URL
            </button>
          </div>
          {webError && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {webError}
            </p>
          )}
          {webUrls.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {webUrls.map((u, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">
                  <Globe className="w-3 h-3" />
                  {u.slice(0, 40)}...
                  <button
                    onClick={() => {
                      setWebUrls(prev => prev.filter((_, j) => j !== i));
                      notifyChange();
                    }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
