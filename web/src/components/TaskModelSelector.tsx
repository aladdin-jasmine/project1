import { useState, useMemo } from 'react';
import { Settings2, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { cn } from '../lib/cn';
import type { Provider, ModelInfo } from '../api/client';

export type TaskType =
  | 'slides' | 'flashcards' | 'quiz' | 'mindmap' | 'studyplan'
  | 'chat' | 'agent' | 'notes'
  | 'visual' | 'graph' | 'recommend' | 'predict'
  | 'voice-stt' | 'voice-tts' | 'embeddings';

export interface TaskModelConfig {
  taskType: TaskType;
  providerId?: string;
  modelId?: string;
  useDefault: boolean;
  fallbackToDefault: boolean;
  temperature?: number;
  maxTokens?: number;
}

interface TaskModelSelectorProps {
  taskType: TaskType;
  taskLabel: string;
  config: TaskModelConfig;
  providers: Provider[];
  onChange: (config: TaskModelConfig) => void;
}

export default function TaskModelSelector({
  taskType,
  taskLabel,
  config,
  providers,
  onChange
}: TaskModelSelectorProps) {
  const [expanded, setExpanded] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [manualEntry, setManualEntry] = useState(false);
  const [manualModelId, setManualModelId] = useState(config.modelId || '');

  const selectedProvider = config.providerId 
    ? providers.find(p => p.id === config.providerId)
    : null;

  const availableModels = selectedProvider?.models || [];
  
  // Filter models by search term
  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return availableModels;
    const term = modelSearch.toLowerCase();
    return availableModels.filter(m => 
      m.id.toLowerCase().includes(term) ||
      m.name.toLowerCase().includes(term) ||
      m.capabilities.some(c => c.toLowerCase().includes(term)) ||
      m.metadata?.vendor?.toLowerCase().includes(term)
    );
  }, [availableModels, modelSearch]);
  
  const selectedModel = config.modelId 
    ? availableModels.find(m => m.id === config.modelId)
    : null;

  const handleProviderChange = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    const firstModel = provider?.models.find(m => m.enabled);
    
    onChange({
      ...config,
      providerId,
      modelId: firstModel?.id || '',
      useDefault: false
    });
  };

  const handleModelChange = (modelId: string) => {
    onChange({
      ...config,
      modelId,
      useDefault: false
    });
    setModelSearch('');
  };

  const handleManualModelSubmit = () => {
    if (manualModelId.trim()) {
      onChange({
        ...config,
        modelId: manualModelId.trim(),
        useDefault: false
      });
      setManualEntry(false);
      setModelSearch('');
    }
  };

  const handleUseDefault = (useDefault: boolean) => {
    onChange({
      ...config,
      useDefault,
      providerId: useDefault ? undefined : config.providerId,
      modelId: useDefault ? undefined : config.modelId
    });
  };

  return (
    <div className="border border-ink-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-ink-50 transition"
      >
        <div className="flex items-center gap-3">
          <Settings2 className="w-4 h-4 text-ink-400" />
          <div className="text-left">
            <p className="font-medium text-sm text-ink-900">{taskLabel}</p>
            <p className="text-xs text-ink-500">
              {config.useDefault 
                ? 'Using project default model'
                : selectedModel 
                  ? `${selectedProvider?.name} - ${selectedModel.name}`
                  : 'Custom configuration'}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-ink-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-ink-400" />
        )}
      </button>

      {expanded && (
        <div className="p-4 bg-ink-50 border-t border-ink-200 space-y-4">
          {/* Model Selection Mode */}
          <div>
            <label className="label text-xs">Model Selection</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleUseDefault(true)}
                className={cn(
                  'px-3 py-2 rounded-lg border text-xs font-medium transition',
                  config.useDefault 
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-ink-200 text-ink-600 hover:bg-ink-100'
                )}
              >
                Use Default
              </button>
              <button
                onClick={() => handleUseDefault(false)}
                className={cn(
                  'px-3 py-2 rounded-lg border text-xs font-medium transition',
                  !config.useDefault 
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-ink-200 text-ink-600 hover:bg-ink-100'
                )}
              >
                Custom Model
              </button>
            </div>
          </div>

          {/* Custom Model Configuration */}
          {!config.useDefault && (
            <>
              <div>
                <label className="label text-xs">Provider</label>
                <select
                  className="input text-sm"
                  value={config.providerId || ''}
                  onChange={(e) => handleProviderChange(e.target.value)}
                >
                  <option value="">Select provider...</option>
                  {providers.filter(p => p.enabled).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.models.length} models)
                    </option>
                  ))}
                </select>
              </div>

              {config.providerId && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label text-xs">Model</label>
                    <button
                      type="button"
                      onClick={() => {
                        setManualEntry(!manualEntry);
                        setModelSearch('');
                      }}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      {manualEntry ? 'Select from list' : 'Enter model ID manually'}
                    </button>
                  </div>
                  
                  {manualEntry ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        className="input text-sm"
                        placeholder="e.g., gpt-4o, llama-3.1-70b-versatile"
                        value={manualModelId}
                        onChange={(e) => setManualModelId(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleManualModelSubmit();
                          }
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleManualModelSubmit}
                          className="btn-primary text-xs flex-1"
                          disabled={!manualModelId.trim()}
                        >
                          Set Model
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setManualEntry(false);
                            setManualModelId('');
                          }}
                          className="btn-outline text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="text-xs text-ink-500">
                        Enter the exact model ID as accepted by your provider's API.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Search Input */}
                      {availableModels.length > 5 && (
                        <div className="relative mb-2">
                          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-ink-400" />
                          <input
                            type="text"
                            className="input text-sm pl-9 pr-8"
                            placeholder="Search models..."
                            value={modelSearch}
                            onChange={(e) => setModelSearch(e.target.value)}
                          />
                          {modelSearch && (
                            <button
                              onClick={() => setModelSearch('')}
                              className="absolute right-2 top-2 p-1 hover:bg-ink-100 rounded"
                            >
                              <X className="w-4 h-4 text-ink-400" />
                            </button>
                          )}
                        </div>
                      )}
                      
                      {/* Model Dropdown */}
                      <select
                        className="input text-sm"
                        value={config.modelId || ''}
                        onChange={(e) => handleModelChange(e.target.value)}
                      >
                        <option value="">Select model...</option>
                        {filteredModels.filter(m => m.enabled).map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} - {m.capabilities.join(', ')}
                          </option>
                        ))}
                      </select>
                      
                      {modelSearch && filteredModels.length === 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          No models match "{modelSearch}". Try different keywords or enter manually.
                        </p>
                      )}
                      
                      {selectedModel && (
                        <div className="mt-2 p-2 bg-white border border-ink-200 rounded text-xs text-ink-600">
                          <p><strong>Capabilities:</strong> {selectedModel.capabilities.join(', ')}</p>
                          <p><strong>Context:</strong> {selectedModel.contextWindow.toLocaleString()} tokens</p>
                          {selectedModel.metadata?.speed && (
                            <p><strong>Speed:</strong> {selectedModel.metadata.speed}</p>
                          )}
                        </div>
                      )}
                      
                      {!selectedModel && config.modelId && (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                          <p><strong>Custom Model:</strong> {config.modelId}</p>
                          <p className="mt-1">This model was entered manually and is not in the loaded list.</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">Temperature</label>
                  <input
                    type="number"
                    className="input text-sm"
                    min="0"
                    max="2"
                    step="0.1"
                    value={config.temperature ?? 0.7}
                    onChange={(e) => onChange({ ...config, temperature: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label text-xs">Max Tokens</label>
                  <input
                    type="number"
                    className="input text-sm"
                    min="100"
                    max="16000"
                    step="100"
                    value={config.maxTokens ?? 2000}
                    onChange={(e) => onChange({ ...config, maxTokens: Number(e.target.value) })}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-ink-700">
                <input
                  type="checkbox"
                  checked={config.fallbackToDefault}
                  onChange={(e) => onChange({ ...config, fallbackToDefault: e.target.checked })}
                />
                Fallback to default model on error
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}
