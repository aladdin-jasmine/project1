import { getContext, generateJSON, type GenRequest } from './_shared.js';
import type { MindMap, MindNode } from '../types.js';

const SYSTEM = `You are a learning scientist. Build a hierarchical concept mind map of the topic.
The root is the central topic. Each node has a unique id, a parent id (null for root), a short label, and an optional description.
Use 8-20 nodes. Keep labels short (1-4 words).`;

const SCHEMA = `{
  "root": string,
  "nodes": [
    { "id": string, "parent": string|null, "label": string, "desc": string }
  ]
}`;

function normalize(m: any, fallbackRoot: string): MindMap {
  if (!m || typeof m !== 'object') {
    return { root: fallbackRoot, nodes: [] };
  }
  
  const nodes: MindNode[] = Array.isArray(m?.nodes)
    ? m.nodes.slice(0, 40)
        .filter((n: any) => n && typeof n === 'object')
        .map((n: any) => ({
          id: String(n?.id || Math.random().toString(36).slice(2)),
          parent: n?.parent === null || n?.parent === undefined ? null : String(n.parent),
          label: String(n?.label || 'node'),
          desc: n?.desc ? String(n.desc) : undefined
        }))
    : [];
  return { root: String(m?.root || fallbackRoot), nodes };
}

export async function generateMindMap(req: GenRequest): Promise<MindMap> {
  const ctx = await getContext(req.source);
  const topic = req.source.type === 'text' ? (req.source.value || '').slice(0, 80) : req.source.type === 'topic' ? req.source.value || 'Topic' : 'Knowledge Map';
  let map: any;
  try {
    map = await generateJSON(
      SYSTEM,
      `Build a mind map for the following material:\n\n${ctx}`,
      req,
      SCHEMA
    );
  } catch (e) {
    return { root: topic, nodes: [] };
  }
  return normalize(map, topic);
}
