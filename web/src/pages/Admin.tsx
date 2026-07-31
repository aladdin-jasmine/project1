import { useQuery } from '@tanstack/react-query';
import { Shield, Database, HardDrive, Boxes, FileText, Activity } from 'lucide-react';
import { admin, type KnowledgeDoc } from '../api/client';
import { useToast, Spinner, Badge, EmptyState } from '../components/ui';

function fmtBytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${mb.toFixed(1)} MB`;
}

export default function Admin() {
  const toast = useToast();
  const { data, isLoading, isError } = useQuery({ queryKey: ['admin'], queryFn: admin.overview });

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-ink-900">Admin Panel</h1>
        <div className="flex justify-center py-16"><Spinner className="w-6 h-6 text-brand-500" /></div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-ink-900">Admin Panel</h1>
        <div className="card mt-5"><EmptyState icon={<Shield />} title="Unable to load overview" hint="The admin service may be unavailable." /></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-ink-900">Admin Panel</h1>
      <p className="text-sm text-ink-500 mt-1">Read-only system overview.</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Database className="w-6 h-6" /></div>
          <div><p className="text-2xl font-bold text-ink-900 leading-none">{data.docCount}</p><p className="text-sm text-ink-500 mt-1">Documents</p></div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center"><HardDrive className="w-6 h-6" /></div>
          <div><p className="text-2xl font-bold text-ink-900 leading-none">{fmtBytes(data.storageBytes)}</p><p className="text-sm text-ink-500 mt-1">Storage used</p></div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-50 text-green-600 flex items-center justify-center"><Boxes className="w-6 h-6" /></div>
          <div>
            <p className="text-2xl font-bold text-ink-900 leading-none">{data.faiss ? 'Online' : 'Offline'}</p>
            <p className="text-sm text-ink-500 mt-1">FAISS vector index</p>
          </div>
        </div>
      </div>

      {data.subjects.length > 0 && (
        <div className="card p-4 mt-4">
          <h3 className="font-semibold text-ink-800 mb-2">Subjects</h3>
          <div className="flex flex-wrap gap-1.5">
            {data.subjects.map((s) => <Badge key={s} tone="brand">{s}</Badge>)}
          </div>
        </div>
      )}

      <div className="card p-4 mt-4">
        <h3 className="font-semibold text-ink-800 mb-3">Documents ({data.documents.length})</h3>
        {data.documents.length === 0 ? (
          <p className="text-sm text-ink-400">No documents ingested.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-ink-400 text-left border-b border-ink-200">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Collection</th>
                  <th className="py-2 pr-4">Chunks</th>
                  <th className="py-2 pr-4">Subject</th>
                </tr>
              </thead>
              <tbody>
                {data.documents.map((d: KnowledgeDoc) => (
                  <tr key={d.id} className="border-b border-ink-100">
                    <td className="py-2 pr-4 font-medium text-ink-700 inline-flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-ink-400" />{d.name}</td>
                    <td className="py-2 pr-4 uppercase text-ink-500">{d.type}</td>
                    <td className="py-2 pr-4"><Badge tone={d.collection === 'qpapers' ? 'amber' : 'gray'}>{d.collection || 'kb'}</Badge></td>
                    <td className="py-2 pr-4 text-ink-600">{d.chunks}</td>
                    <td className="py-2 pr-4 text-ink-600">{d.subject || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-4 mt-4">
        <h3 className="font-semibold text-ink-800 mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-brand-500" /> Activity / Audit Log</h3>
        {data.logs.length === 0 ? (
          <p className="text-sm text-ink-400">No activity logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-ink-400 text-left border-b border-ink-200">
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Topic</th>
                  <th className="py-2 pr-4">Correct</th>
                  <th className="py-2 pr-4">Incorrect</th>
                  <th className="py-2 pr-4">When</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.slice(0, 100).map((l, i) => (
                  <tr key={i} className="border-b border-ink-100">
                    <td className="py-2 pr-4"><Badge tone="brand">{l.type}</Badge></td>
                    <td className="py-2 pr-4 text-ink-700">{l.topic}</td>
                    <td className="py-2 pr-4 text-green-600">{l.correct ?? '—'}</td>
                    <td className="py-2 pr-4 text-red-500">{l.incorrect ?? '—'}</td>
                    <td className="py-2 pr-4 text-ink-400">{new Date(l.ts).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
