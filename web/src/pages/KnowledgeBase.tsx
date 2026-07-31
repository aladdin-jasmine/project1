import { useState, useRef, useEffect, useCallback, Component, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  UploadCloud, FileText, Trash2, Search, Database, FolderOpen, FileUp, 
  ScanText, Globe, Link as LinkIcon, Loader2, ExternalLink, AlertCircle,
  BookMarked, Plus, X,
  FolderPlus, ChevronRight, ChevronLeft, Folder, Settings2,
  Layers, Cpu, List, Grid3X3, AlertTriangle
} from 'lucide-react';
import { rag, type KnowledgeDoc, type Collection, type StagedFileInfo, type FolderNode } from '../api/client';
import { useToast, Badge, EmptyState, Modal } from '../components/ui';
import { cn } from '../lib/cn';

// ── Error Boundary ──
class PageErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  state: { hasError: boolean; error: Error | null } = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-3xl mx-auto animate-fade-in">
          <div className="card p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-ink-800 mb-2">Something went wrong</h2>
            <p className="text-sm text-ink-500 mb-4">{this.state.error?.message || 'An unexpected error occurred.'}</p>
            <button className="btn-primary" onClick={() => this.setState({ hasError: false, error: null })}>
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── FolderTreeNode component ──
function FolderTreeNode({
  node,
  depth,
  selectedFolderId,
  totalDocs,
  onSelect,
}: {
  node: FolderNode;
  depth: number;
  selectedFolderId: string | null;
  totalDocs: number;
  onSelect: (id: string) => void;
}) {
  const isSelected = selectedFolderId === node.id;
  const isRoot = depth === 0;
  return (
    <div>
      <button
        onClick={() => onSelect(node.id)}
        className={cn(
          'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition text-left',
          isSelected ? 'bg-brand-100 text-brand-700' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-800'
        )}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {isRoot ? (
          <Database className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Folder className="w-3.5 h-3.5 shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
        {isRoot && (
          <span className="text-[10px] text-ink-400 ml-auto">{totalDocs}</span>
        )}
      </button>
      {Array.isArray(node.children) && node.children.map((child) => (
        <FolderTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedFolderId={selectedFolderId}
          totalDocs={totalDocs}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

type ActiveUploadTab = 'upload' | 'web' | 'text';
type ViewMode = 'grid' | 'list';

export default function KnowledgeBase() {
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  // ── Collection ──
  const [collection, setCollection] = useState<Collection>('kb');
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['docs', collection],
    queryFn: () => rag.docs(collection)
  });

  // ── Metadata form ──
  const [book, setBook] = useState('');
  const [subject, setSubject] = useState('');
  const [chapter, setChapter] = useState('');
  const [semester, setSemester] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [ocr, setOcr] = useState(false);
  const meta = { collection, book, subject, chapter, semester, difficulty, ocr };

  // ── Folder tree ──
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const { data: folderTree } = useQuery({
    queryKey: ['folder-tree'],
    queryFn: () => rag.folderTree(),
  });

  // Filter docs by selected folder
  const docsInFolder = selectedFolderId && folderTree
    ? docs.filter(d => {
        const allIds = collectDocIds(folderTree, selectedFolderId);
        return allIds.includes(d.id);
      })
    : docs;

  // ── Staged / Pending files ──
  const { data: stagedFiles = [], refetch: refetchStaged } = useQuery({
    queryKey: ['staged-files'],
    queryFn: () => rag.staged(),
  });

  // ── Tabs ──
  const [activeUploadTab, setActiveUploadTab] = useState<ActiveUploadTab>('upload');
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);

  // ── Web ──
  const [webUrl, setWebUrl] = useState('');
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState('');

  // ── Text ──
  const [customText, setCustomText] = useState('');
  const [showTextEntry, setShowTextEntry] = useState(false);

  // ── Query ──
  const [query, setQuery] = useState('');
  const [queryResults, setQueryResults] = useState<any[] | null>(null);
  const [querying, setQuerying] = useState(false);

  // ── Chunk viewer ──
  const [chunkViewDoc, setChunkViewDoc] = useState<KnowledgeDoc | null>(null);
  const [chunks, setChunks] = useState<any[] | null>(null);
  const [chunksLoading, setChunksLoading] = useState(false);

  // ── View mode ──
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // ── Doc detail modal ──
  const [detailDoc, setDetailDoc] = useState<KnowledgeDoc | null>(null);

  // ── Move doc modal ──
  const [moveDocId, setMoveDocId] = useState<string | null>(null);
  const [moveToFolderId, setMoveToFolderId] = useState('');
  const { data: folderPaths = [] } = useQuery({
    queryKey: ['folder-paths'],
    queryFn: () => rag.folderPaths(),
  });

  // ── Confirm delete modal ──
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const el = folderRef.current;
    if (el) {
      el.setAttribute('webkitdirectory', 'true');
      el.setAttribute('directory', 'true');
    }
  }, []);

  // ── Helpers ──
  function collectDocIds(node: FolderNode, targetId: string): string[] {
    if (!node) return [];
    if (node.id === targetId) {
      const all: string[] = [...(node.docIds || [])];
      const collect = (n: FolderNode) => {
        for (const c of n.children || []) {
          all.push(...(c.docIds || []));
          collect(c);
        }
      };
      collect(node);
      return all;
    }
    for (const child of node.children || []) {
      const ids = collectDocIds(child, targetId);
      if (ids.length > 0) return ids;
    }
    return [];
  }

  function getFolderName(id: string): string {
    if (id === 'root') return 'All Documents';
    if (!folderTree) return '...';
    function find(node: FolderNode): string | null {
      if (!node) return null;
      if (node.id === id) return node.name;
      for (const child of node.children || []) {
        const r = find(child);
        if (r) return r;
      }
      return null;
    }
    return find(folderTree) || 'Unknown';
  }

  // ── Upload handlers ──
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).filter((f) => f.size > 0);
    if (arr.length === 0) return;
    setUploading(true);
    setProgressMap(Object.fromEntries(arr.map((f) => [f.name, 0])));
    try {
      await rag.stageUpload(arr, meta, (name, pct) => setProgressMap((m) => ({ ...m, [name]: pct })));
      toast('success', `${arr.length} file(s) uploaded to staging. Click "Process" to embed.`);
      refetchStaged();
      qc.invalidateQueries({ queryKey: ['folder-tree'] });
    } catch (e: any) {
      toast('error', e?.message || 'Upload failed');
    } finally {
      setUploading(false);
      setProgressMap({});
    }
  };

  const processStagedFile = async (id: string) => {
    setProcessingIds(prev => new Set(prev).add(id));
    try {
      await rag.processStaged(id);
      toast('success', 'File processed and embedded.');
      refetchStaged();
      qc.invalidateQueries({ queryKey: ['docs'] });
      qc.invalidateQueries({ queryKey: ['folder-tree'] });
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Processing failed');
    } finally {
      setProcessingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const processAllStaged = async () => {
    const ids = stagedFiles.map(s => s.id);
    if (ids.length === 0) return;
    setBatchProcessing(true);
    try {
      const res = await rag.processBatchStaged(ids);
      const ok = res.results.filter((r: any) => r.status === 'ok').length;
      const err = res.results.filter((r: any) => r.status === 'error').length;
      toast('success', `Processed ${ok} file(s)${err > 0 ? `, ${err} failed` : ''}.`);
      refetchStaged();
      qc.invalidateQueries({ queryKey: ['docs'] });
      qc.invalidateQueries({ queryKey: ['folder-tree'] });
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Batch processing failed');
    } finally {
      setBatchProcessing(false);
    }
  };

  const deleteStaged = async (id: string) => {
    try {
      await rag.deleteStaged(id);
      refetchStaged();
    } catch { toast('error', 'Failed to delete staged file'); }
  };

  const removeDoc = useCallback(async (id: string) => {
    try {
      await rag.remove(id);
      toast('info', 'Document deleted.');
      qc.invalidateQueries({ queryKey: ['docs'] });
      qc.invalidateQueries({ queryKey: ['folder-tree'] });
      setConfirmDeleteId(null);
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Delete failed');
    }
  }, [qc, toast]);

  // ── Web fetch ──
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
      if (data.error) { setWebError(data.error); return; }
      const blob = new Blob([data.content], { type: 'text/plain' });
      const file = new File([blob], `${data.title || 'web-content'}.txt`, { type: 'text/plain' });
      await rag.stageUpload([file], { ...meta, book: data.title || webUrl.trim(), chapter: 'Web Scraped' });
      toast('success', `Fetched and staged: ${data.title}`);
      setWebUrl('');
      refetchStaged();
    } catch (e: any) {
      setWebError(e.message || 'Failed to fetch URL');
    } finally { setWebLoading(false); }
  };

  // ── Text ingest ──
  const handleTextIngest = async () => {
    if (!customText.trim()) return;
    const blob = new Blob([customText], { type: 'text/plain' });
    const file = new File([blob], `pasted-text-${Date.now()}.txt`, { type: 'text/plain' });
    await rag.stageUpload([file], meta);
    setCustomText('');
    setShowTextEntry(false);
    refetchStaged();
  };

  // ── Query ──
  const runQuery = async () => {
    if (!query.trim()) return;
    setQuerying(true);
    try {
      const r = await rag.query({ query, k: 8, collection });
      setQueryResults(r);
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Query failed');
    } finally { setQuerying(false); }
  };

  // ── Chunks ──
  const viewChunks = async (doc: KnowledgeDoc) => {
    setChunkViewDoc(doc);
    setChunksLoading(true);
    try {
      const r = await rag.docChunks(doc.id);
      setChunks(r.chunks);
    } catch { toast('error', 'Failed to load chunks'); }
    finally { setChunksLoading(false); }
  };

  // ── Folder creation ──
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await rag.createFolder(newFolderName.trim(), selectedFolderId === 'root' ? undefined : selectedFolderId || undefined);
      setNewFolderName('');
      setCreatingFolder(false);
      qc.invalidateQueries({ queryKey: ['folder-tree'] });
      qc.invalidateQueries({ queryKey: ['folder-paths'] });
    } catch { toast('error', 'Failed to create folder'); }
  };

  // ── Move doc ──
  const handleMoveDoc = async () => {
    if (!moveDocId || !moveToFolderId) return;
    try {
      let fromFolder: string | undefined;
      if (folderTree) findDocFolder(folderTree, moveDocId, (fid) => { fromFolder = fid; });
      await rag.moveDoc(moveDocId, moveToFolderId, fromFolder);
      toast('success', 'Document moved.');
      setMoveDocId(null);
      setMoveToFolderId('');
      qc.invalidateQueries({ queryKey: ['folder-tree'] });
    } catch { toast('error', 'Failed to move document'); }
  };

  function findDocFolder(node: FolderNode, docId: string, cb: (id: string) => void): boolean {
    if (!node) return false;
    if ((node.docIds || []).includes(docId)) { cb(node.id); return true; }
    for (const child of node.children || []) {
      if (findDocFolder(child, docId, cb)) return true;
    }
    return false;
  }

  return (
    <PageErrorBoundary>
    <div className="p-6 max-w-7xl mx-auto animate-fade-in flex gap-4 items-start">
      {/* ── Sidebar: Folder Tree ── */}
      <div className={cn(
        'shrink-0 transition-all duration-300',
        sidebarOpen ? 'w-56' : 'w-0 overflow-hidden'
      )}>
        <div className="card p-3 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-ink-600 uppercase tracking-wider">Folders</span>
            <button onClick={() => setCreatingFolder(true)} className="text-brand-600 hover:text-brand-700 p-0.5">
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>
          {creatingFolder && (
            <div className="flex gap-1 mb-2">
              <input className="input text-xs py-1" placeholder="Folder name" value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} autoFocus />
              <button className="btn-primary !py-1 !px-2 text-xs" onClick={handleCreateFolder}>
                <Plus className="w-3 h-3" />
              </button>
              <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}>
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {folderTree && (
            <FolderTreeNode
              node={folderTree}
              depth={0}
              selectedFolderId={selectedFolderId}
              totalDocs={docs.length}
              onSelect={setSelectedFolderId}
            />
          )}
        </div>
      </div>

      {/* ── Toggle sidebar ── */}
      <button onClick={() => setSidebarOpen(!sidebarOpen)}
        className="btn-ghost !py-1 !px-1.5 shrink-0 self-start mt-1">
        {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {/* ── Main Content ── */}
      <div className="flex-1 min-w-0 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold gradient-text">Knowledge Base</h1>
            <p className="text-sm text-ink-500 mt-1">
              {selectedFolderId && selectedFolderId !== 'root'
                ? `Showing: ${getFolderName(selectedFolderId)} (${docsInFolder.length} docs)`
                : `${docs.length} documents · ${stagedFiles.length} pending`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="btn-ghost !py-1.5 !px-2 text-xs">
              {viewMode === 'grid' ? <List className="w-3.5 h-3.5" /> : <Grid3X3 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* ── Collection toggle ── */}
        <div className="flex gap-1 bg-ink-100 w-fit p-1 rounded-lg">
          {(['kb', 'qpapers'] as Collection[]).map((c) => (
            <button key={c} onClick={() => setCollection(c)}
              className={cn('px-4 py-1.5 rounded-md text-sm font-medium transition',
                collection === c ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-800'
              )}>
              {c === 'kb' ? 'Knowledge Base' : 'Question Papers'}
            </button>
          ))}
        </div>

        {/* ── Metadata form ── */}
        <details className="card p-4 group" open>
          <summary className="flex items-center gap-2 cursor-pointer list-none">
            <Settings2 className="w-4 h-4 text-brand-500" />
            <span className="text-sm font-semibold text-ink-800">Document Metadata</span>
            <Badge tone="brand">Apply to all uploads</Badge>
            <ChevronRight className="w-4 h-4 text-ink-400 ml-auto transition-transform group-open:rotate-90" />
          </summary>
          <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="label">Book</label>
              <input className="input" value={book} onChange={(e) => setBook(e.target.value)} placeholder="e.g. HC Verma" />
            </div>
            <div>
              <label className="label">Subject</label>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Physics" />
            </div>
            <div>
              <label className="label">Chapter</label>
              <input className="input" value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="e.g. Thermodynamics" />
            </div>
            <div>
              <label className="label">Semester</label>
              <input className="input" value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="e.g. 3" />
            </div>
            <div>
              <label className="label">Difficulty</label>
              <select className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="">Any</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer select-none">
                <input type="checkbox" checked={ocr} onChange={(e) => setOcr(e.target.checked)} className="w-4 h-4 accent-brand-600" />
                <ScanText className="w-4 h-4 text-brand-500" /> Use OCR (scanned PDFs)
              </label>
            </div>
          </div>
          <p className="text-xs text-ink-400 mt-2">
            Metadata is saved with each file and used for auto-organization into folders.
          </p>
        </details>

        {/* ── Input tabs ── */}
        <div className="flex gap-1 bg-ink-100 p-1 rounded-lg w-fit">
          {([
            { id: 'upload' as const, label: 'Upload Files', icon: FileUp },
            { id: 'web' as const, label: 'Fetch from Web', icon: Globe },
            { id: 'text' as const, label: 'Paste Text', icon: BookMarked },
          ]).map(t => (
            <button key={t.id} onClick={() => setActiveUploadTab(t.id)}
              className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5',
                activeUploadTab === t.id ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-800'
              )}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* ── Upload Drop Zone ── */}
        {activeUploadTab === 'upload' && (
          <div className={`card p-8 text-center border-2 border-dashed transition ${drag ? 'border-brand-400 bg-brand-50' : 'border-ink-200'}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
          >
            <UploadCloud className="w-10 h-10 text-brand-500 mx-auto mb-2" />
            <p className="font-medium text-ink-700">Drop files or click to upload</p>
            <p className="text-xs text-ink-400 mt-1">PDF, DOCX, TXT, MD · Files go to staging — process after review</p>
            <div className="flex justify-center gap-2 mt-4">
              <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <FileUp className="w-4 h-4" /> Choose Files
              </button>
              <button className="btn-outline" onClick={() => folderRef.current?.click()} disabled={uploading}>
                <FolderOpen className="w-4 h-4" /> Upload Folder
              </button>
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <input ref={folderRef} type="file" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            {Object.keys(progressMap).length > 0 && (
              <div className="mt-5 max-w-md mx-auto space-y-2 text-left">
                {Object.entries(progressMap).map(([name, pct]) => (
                  <div key={name}>
                    <div className="flex justify-between text-xs text-ink-500 mb-1">
                      <span className="truncate">{name}</span><span>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Web Fetch ── */}
        {activeUploadTab === 'web' && (
          <div className="card p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-ink-800 mb-1">Fetch Content from the Web</h3>
                <p className="text-xs text-ink-500 mb-3">Enter a public URL to scrape and add to staging.</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                    <input type="url" className="input pl-9" placeholder="https://en.wikipedia.org/wiki/..."
                      value={webUrl} onChange={(e) => setWebUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleWebFetch(); }} />
                  </div>
                  <button className="btn-primary" onClick={handleWebFetch} disabled={webLoading || !webUrl.trim()}>
                    {webLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                    Fetch & Stage
                  </button>
                </div>
                {webError && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-700">{webError}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Text Paste ── */}
        {activeUploadTab === 'text' && (
          <div className="card p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shrink-0">
                <BookMarked className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-ink-800 mb-1">Paste Custom Text</h3>
                <p className="text-xs text-ink-500 mb-3">Paste study material to stage for processing.</p>
                <textarea className="input h-32 resize-y" placeholder="Paste your text content here..."
                  value={customText} onChange={(e) => setCustomText(e.target.value)} />
                <div className="flex justify-end mt-3">
                  <button className="btn-primary" onClick={handleTextIngest} disabled={!customText.trim()}>
                    <Plus className="w-4 h-4" /> Stage Text
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Staged / Pending Files ── */}
        {stagedFiles.length > 0 && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-ink-800">Pending Files ({stagedFiles.length})</span>
                <Badge tone="amber">Awaiting processing</Badge>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={processAllStaged} disabled={batchProcessing}
                  className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1">
                  {batchProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cpu className="w-3.5 h-3.5" />}
                  Process All
                </button>
                <button onClick={() => rag.clearStaged().then(refetchStaged)}
                  className="btn-ghost !py-1 !px-2 text-xs text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {stagedFiles.map(sf => (
                <div key={sf.id} className="flex items-center gap-3 p-3 bg-amber-50/50 rounded-lg border border-amber-100">
                  <FileText className="w-5 h-5 text-ink-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-800 truncate">{sf.fileName}</p>
                    <p className="text-xs text-ink-400">
                      {(sf.size / 1024).toFixed(0)} KB · {new Date(sf.uploadedAt).toLocaleString()}
                      {sf.metadata.subject && ` · ${sf.metadata.subject}`}
                      {sf.metadata.book && ` · ${sf.metadata.book}`}
                    </p>
                  </div>
                  <button onClick={() => processStagedFile(sf.id)} disabled={processingIds.has(sf.id)}
                    className={cn('btn-soft !py-1.5 !px-2.5 text-xs flex items-center gap-1',
                      processingIds.has(sf.id) && 'opacity-50')}>
                    {processingIds.has(sf.id)
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Cpu className="w-3 h-3" />}
                    Process
                  </button>
                  <button onClick={() => deleteStaged(sf.id)} className="btn-ghost !py-1 !px-1.5 text-xs text-red-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Documents List ── */}
        <div>
          <h2 className="font-semibold text-ink-800 mb-3 flex items-center gap-2">
            <Database className="w-4 h-4 text-brand-500" />
            {selectedFolderId && selectedFolderId !== 'root'
              ? getFolderName(selectedFolderId)
              : collection === 'kb' ? 'Knowledge Base' : 'Question Papers'}
            {' '}({docsInFolder.length})
          </h2>

          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-brand-500 animate-spin" /></div>
          ) : docsInFolder.length === 0 ? (
            <div className="card"><EmptyState icon={<Database />} title="No documents here"
              hint={selectedFolderId && selectedFolderId !== 'root' ? 'This folder is empty.' : 'Upload files and process them.'} /></div>
          ) : viewMode === 'list' ? (
            <div className="space-y-2">
              {docsInFolder.map((d: KnowledgeDoc) => (
                <div key={d.id} className="card-hover p-3 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 text-white flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="font-medium text-ink-800 text-sm truncate">{d.name}</p>
                      <Badge tone={d.collection === 'qpapers' ? 'amber' : 'brand'}>
                        {d.collection === 'qpapers' ? 'QPapers' : 'KB'}
                      </Badge>
                      {d.ocr && <Badge tone="green">OCR</Badge>}
                      {d.book && <Badge tone="gray">{d.book}</Badge>}
                    </div>
                    <p className="text-xs text-ink-400">
                      {d.type.toUpperCase()} · {d.chunks} chunks · {(d.size / 1024).toFixed(0)} KB
                      {d.subject && ` · ${d.subject}`}{d.chapter && ` · ${d.chapter}`}
                      {d.semester && ` · Sem ${d.semester}`}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {d.topics.slice(0, 4).map((t: string) => <Badge key={t} tone="gray">{t}</Badge>)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => viewChunks(d)} className="btn-ghost !py-1 !px-1.5 text-xs" title="View chunks">
                      <Layers className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { setMoveDocId(d.id); setMoveToFolderId('root'); }}
                      className="btn-ghost !py-1 !px-1.5 text-xs" title="Move to folder">
                      <Folder className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setConfirmDeleteId(d.id)} className="btn-ghost !py-1 !px-1.5 text-xs text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Grid view */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {docsInFolder.map((d: KnowledgeDoc) => (
                <div key={d.id} className="card-hover p-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 text-white flex items-center justify-center mb-2">
                    <FileText className="w-4 h-4" />
                  </div>
                  <p className="font-medium text-ink-800 text-xs truncate mb-1">{d.name}</p>
                  <p className="text-[10px] text-ink-400">{d.chunks} chunks · {(d.size / 1024).toFixed(0)} KB</p>
                  <div className="flex gap-1 mt-1.5">
                    <Badge tone={d.collection === 'qpapers' ? 'amber' : 'brand'}>{d.collection === 'qpapers' ? 'QP' : 'KB'}</Badge>
                    {d.ocr && <Badge tone="green">OCR</Badge>}
                  </div>
                  <div className="flex gap-1 mt-2">
                    <button onClick={() => viewChunks(d)} className="btn-ghost !py-0.5 !px-1 text-[10px]">
                      <Layers className="w-3 h-3" />
                    </button>
                    <button onClick={() => setConfirmDeleteId(d.id)} className="btn-ghost !py-0.5 !px-1 text-[10px] text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Test Retrieval ── */}
        <div className="card p-5">
          <h3 className="font-semibold text-ink-800 mb-3 flex items-center gap-2">
            <Search className="w-4 h-4 text-brand-500" />
            Test Retrieval
          </h3>
          <div className="flex gap-2">
            <input className="input" placeholder="Ask anything from your docs..."
              value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runQuery()} />
            <button className="btn-primary" onClick={runQuery} disabled={querying}>
              {querying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {queryResults === null && (
              <p className="text-xs text-ink-400 text-center py-6">Top retrieved chunks will appear here.</p>
            )}
            {queryResults?.map((c, i) => (
              <div key={c.id} className="text-xs border border-ink-200 rounded-lg p-3 hover:border-brand-200 transition">
                <div className="flex justify-between text-ink-400 mb-1">
                  <span className="font-medium">Chunk {i + 1}</span>
                  <span className={cn(
                    'px-1.5 py-0.5 rounded font-medium',
                    (c.score || 0) > 0.7 ? 'bg-emerald-100 text-emerald-700' :
                    (c.score || 0) > 0.4 ? 'bg-amber-100 text-amber-700' : 'bg-ink-100 text-ink-600'
                  )}>
                    {(c.score || 0).toFixed(2)} score
                  </span>
                </div>
                <p className="text-ink-700 line-clamp-4">{c.text}</p>
                {c.meta?.heading && <p className="text-ink-400 mt-1">Heading: {c.meta.heading}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* ── Chunk Viewer Modal ── */}
        <Modal open={!!chunkViewDoc} onClose={() => { setChunkViewDoc(null); setChunks(null); }}
          title={chunkViewDoc ? `Chunks: ${chunkViewDoc.name}` : ''} width="max-w-4xl">
          {chunksLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /></div>
          ) : chunks ? (
            <div className="space-y-3 overflow-y-auto max-h-[60vh]">
              <div className="flex items-center gap-2 text-xs text-ink-400 mb-2">
                <Database className="w-3.5 h-3.5" />
                <span>{chunks.length} chunks · {(chunks as any[]).reduce((s, c) => s + c.text.length, 0).toLocaleString()} total chars</span>
              </div>
              {chunks.map((chunk: any, i: number) => (
                <div key={chunk.id || i} className="p-3 bg-ink-50 rounded-lg border border-ink-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-ink-600">Chunk #{i + 1}</span>
                    <div className="flex items-center gap-2 text-[10px] text-ink-400">
                      {chunk.meta?.page && <Badge tone="gray">p.{chunk.meta.page}</Badge>}
                      {chunk.meta?.heading && <Badge tone="gray">{chunk.meta.heading}</Badge>}
                      <span>{chunk.text.length} chars</span>
                    </div>
                  </div>
                  <pre className="text-xs text-ink-700 whitespace-pre-wrap font-sans leading-relaxed">{chunk.text}</pre>
                </div>
              ))}
            </div>
          ) : null}
        </Modal>

        {/* ── Delete Confirmation Modal ── */}
        <Modal open={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)}
          title="Delete Document?" footer={
            <>
              <button className="btn-outline" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button className="btn-danger" onClick={() => confirmDeleteId && removeDoc(confirmDeleteId)}>Delete</button>
            </>
          }>
          <p className="text-sm text-ink-600">This will permanently delete the document and all its chunks. Irreversible.</p>
        </Modal>

        {/* ── Move Doc Modal ── */}
        <Modal open={!!moveDocId} onClose={() => { setMoveDocId(null); setMoveToFolderId(''); }}
          title="Move Document" footer={
            <>
              <button className="btn-outline" onClick={() => { setMoveDocId(null); setMoveToFolderId(''); }}>Cancel</button>
              <button className="btn-primary" onClick={handleMoveDoc}>Move</button>
            </>
          }>
          <div className="space-y-3">
            <p className="text-sm text-ink-600">Select destination folder:</p>
            <select className="input" value={moveToFolderId} onChange={(e) => setMoveToFolderId(e.target.value)}>
              <option value="root">All Documents (root)</option>
              {folderPaths.map(fp => (
                <option key={fp.id} value={fp.id}>{fp.path}</option>
              ))}
            </select>
          </div>
        </Modal>
      </div>
    </div>
    </PageErrorBoundary>
  );
}
