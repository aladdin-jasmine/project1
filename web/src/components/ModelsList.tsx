import { useState, useMemo } from 'react';
import { Badge } from './ui';
import { Eye, EyeOff, Sparkles, Brain, Image, Mic, Volume2, Database, Search, X, Plus } from 'lucide-react';
import { cn } from '../lib/cn';
import type { ModelInfo, ModelCapability } from '../api/client';

const CAPABILITY_ICONS: Record<ModelCapability, { icon: React.ReactNode; label: string; color: string }> = {
  text: { icon: <Sparkles className="w-3 h-3" />, label: 'Text', color: 'bg-blue-100 text-blue-700' },
  vision: { icon: <Image className="w-3 h-3" />, label: 'Vision', color: 'bg-purple-100 text-purple-700' },
  reasoning: { icon: <Brain className="w-3 h-3" />, label: 'Reasoning', color: 'bg-amber-100 text-amber-700' },
  'voice-stt': { icon: <Mic className="w-3 h-3" />, label: 'Voice STT', color: 'bg-green-100 text-green-700' },
  'voice-tts': { icon: <Volume2 className="w-3 h-3" />, label: 'Voice TTS', color: 'bg-teal-100 text-teal-700' },
  embeddings: { icon: <Database className="w-3 h-3" />, label: 'Embeddings', color: 'bg-pink-100 text-pink-700' }
};

export default function ModelsList({
  models,
  onToggle,
  onSetDefault,
  onAddManual
}: {
  models: ModelInfo[];
  onToggle: (modelId: string, enabled: boolean) => void;
  onSetDefault: (modelId: string) => void;
  onAddManual?: (modelId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualModelId, setManualModelId] = useState('');
  
  // Filter models by search term
  const filteredModels = useMemo(() => {
    if (!searchTerm.trim()) return models;
    const term = searchTerm.toLowerCase();
    return models.filter(m => 
      m.id.toLowerCase().includes(term) ||
      m.name.toLowerCase().includes(term) ||
      m.capabilities.some(c => c.toLowerCase().includes(term)) ||
      m.metadata?.vendor?.toLowerCase().includes(term)
    );
  }, [models, searchTerm]);
  
  const displayModels = expanded ? filteredModels : filteredModels.slice(0, 3);
  
  const handleManualAdd = () => {
    if (manualModelId.trim() && onAddManual) {
      onAddManual(manualModelId.trim());
      setManualModelId('');
      setShowManualEntry(false);
    }
  };

  if (models.length === 0) {
    return (
      <div className="text-xs text-ink-400 italic py-2">
        No models loaded yet. Click "Load Models" to fetch available models or add a model manually below.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-medium text-ink-600 mb-2">
        <span>Models ({models.length})</span>
        <div className="flex items-center gap-2">
          {onAddManual && (
            <button
              onClick={() => setShowManualEntry(!showManualEntry)}
              className="text-brand-600 hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              {showManualEntry ? 'Cancel' : 'Add Manual'}
            </button>
          )}
          {models.length > 3 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-brand-600 hover:underline"
            >
              {expanded ? 'Show less' : `Show all (${models.length})`}
            </button>
          )}
        </div>
      </div>
      
      {/* Manual Model Entry */}
      {showManualEntry && onAddManual && (
        <div className="p-3 bg-brand-50 border border-brand-200 rounded-lg space-y-2">
          <label className="text-xs font-medium text-ink-700">Add Model Manually</label>
          <input
            type="text"
            className="input text-sm w-full"
            placeholder="e.g., gpt-4o-mini, llama-3.1-70b-versatile"
            value={manualModelId}
            onChange={(e) => setManualModelId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleManualAdd();
              }
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleManualAdd}
              disabled={!manualModelId.trim()}
              className="btn-primary text-xs flex-1"
            >
              Add Model
            </button>
            <button
              onClick={() => {
                setShowManualEntry(false);
                setManualModelId('');
              }}
              className="btn-outline text-xs"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-ink-500">
            Enter the exact model ID as accepted by your provider's API. The model will be added to the list with default settings.
          </p>
        </div>
      )}

      {/* Search Input */}
      {models.length > 5 && (
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-ink-400" />
          <input
            type="text"
            className="input text-sm pl-9 pr-8 w-full"
            placeholder="Search models..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-2 p-1 hover:bg-ink-100 rounded"
            >
              <X className="w-4 h-4 text-ink-400" />
            </button>
          )}
        </div>
      )}
      
      {searchTerm && filteredModels.length === 0 && (
        <p className="text-xs text-amber-600 py-2">
          No models match "{searchTerm}". Try different keywords.
        </p>
      )}

      <div className="space-y-1.5">
        {displayModels.map((model) => (
          <div
            key={model.id}
            className={cn(
              'rounded-lg border p-2.5 transition',
              model.enabled ? 'border-ink-200 bg-white' : 'border-ink-100 bg-ink-50 opacity-60'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-ink-900 truncate">{model.name}</p>
                  {model.metadata?.speed && (
                    <Badge tone={model.metadata.speed === 'fast' ? 'green' : model.metadata.speed === 'medium' ? 'amber' : 'gray'}>
                      {model.metadata.speed}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-1 mb-1.5">
                  {model.capabilities.map((cap) => {
                    const info = CAPABILITY_ICONS[cap];
                    return (
                      <div
                        key={cap}
                        className={cn(
                          'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                          info.color
                        )}
                        title={info.label}
                      >
                        {info.icon}
                        <span>{info.label}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3 text-[10px] text-ink-500">
                  {model.contextWindow > 0 && (
                    <span title="Context Window">
                      📄 {model.contextWindow >= 1000 ? `${(model.contextWindow / 1000).toFixed(0)}K` : model.contextWindow}
                    </span>
                  )}
                  {model.maxTokens > 0 && (
                    <span title="Max Output Tokens">
                      ✏️ {model.maxTokens >= 1000 ? `${(model.maxTokens / 1000).toFixed(0)}K` : model.maxTokens}
                    </span>
                  )}
                  {model.metadata?.vendor && (
                    <span title="Vendor">🏢 {model.metadata.vendor}</span>
                  )}
                  {model.metadata?.quality && (
                    <span title="Quality">
                      ⭐ {model.metadata.quality}
                    </span>
                  )}
                </div>

                {model.metadata?.description && (
                  <p className="text-[10px] text-ink-400 mt-1 line-clamp-1">
                    {model.metadata.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onToggle(model.id, !model.enabled)}
                  className={cn(
                    'p-1.5 rounded hover:bg-ink-100 transition',
                    model.enabled ? 'text-green-600' : 'text-ink-400'
                  )}
                  title={model.enabled ? 'Disable model' : 'Enable model'}
                >
                  {model.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => onSetDefault(model.id)}
                  className="px-2 py-1 text-[10px] font-medium text-brand-600 hover:bg-brand-50 rounded transition"
                  title="Set as default model"
                >
                  Set Default
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
