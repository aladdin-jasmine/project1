import { chatText } from '../llm/client.js';
import { retrieve } from '../rag/retrieve.js';
import { getDoc } from '../rag/vectorstore.js';
import type { GenRequest } from './_shared.js';
import type { KnowledgeGraph } from '../types.js';

const SCHEMA = `{
  "nodes": [{"id":string,"label":string,"doc":string}],
  "edges": [{"source":string,"target":string,"label":string}]
}`;

// Multi-document knowledge graph: combines concepts retrieved across all docs.
export async function knowledgeGraph(req: GenRequest, topic?: string): Promise<KnowledgeGraph> {
  const chunks = await retrieve(topic || req.source.value || 'core concepts', 8);
  const ctx = chunks.map((c) => `[doc:${getDoc(c.docId)?.name || c.docId}] ${c.text}`).join('\n\n');

  const out = await chatText({
    projectId: req.projectId,
    providerId: req.providerId,
    model: req.model,
    messages: [
      {
        role: 'system',
        content:
          'Build a knowledge graph connecting the key concepts found across the provided materials (which may come from multiple documents). Return ONLY valid JSON.'
      },
      { role: 'user', content: `${topic ? `Focus topic: ${topic}\n\n` : ''}Materials:\n${ctx}\n\n${SCHEMA}` }
    ],
    temperature: 0.4,
    maxTokens: 1400
  });
  let t = out.trim();
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (f) t = f[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s !== -1 && e !== -1) t = t.slice(s, e + 1);
  
  let p: any;
  try {
    p = JSON.parse(t);
  } catch (err) {
    // Return minimal valid graph
    return {
      nodes: [{ id: 'n0', label: topic || 'Concept', doc: '' }],
      edges: []
    };
  }
  
  if (!p || typeof p !== 'object') {
    p = {};
  }
  
  const nodes = Array.isArray(p?.nodes)
    ? p.nodes
        .filter((n: any) => n && typeof n === 'object')
        .map((n: any, i: number) => ({ 
          id: String(n?.id || 'n' + i), 
          label: String(n?.label || 'Node'), 
          doc: String(n?.doc || '') 
        }))
    : [];
  const edges = Array.isArray(p?.edges)
    ? p.edges
        .filter((ed: any) => ed && typeof ed === 'object')
        .map((ed: any) => ({ 
          source: String(ed?.source), 
          target: String(ed?.target), 
          label: ed?.label ? String(ed.label) : undefined 
        }))
    : [];
  return { nodes, edges };
}
