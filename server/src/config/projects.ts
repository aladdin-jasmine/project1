import { randomUUID } from 'crypto';
import { readJson, writeJson } from '../db/store.js';
import type { Project } from '../types.js';

const FILE = 'projects';

function load(): Project[] {
  return readJson<Project[]>(FILE, []);
}
function save(list: Project[]): void {
  writeJson(FILE, list);
}

// Ensure a default project exists
export function ensureDefaultProject(): Project {
  const list = load();
  if (list.length === 0) {
    const p: Project = {
      id: randomUUID(),
      name: 'My Study Project',
      kbId: 'default',
      createdAt: new Date().toISOString()
    };
    list.push(p);
    save(list);
    return p;
  }
  return list[0];
}

export function listProjects(): Project[] {
  const list = load();
  if (list.length === 0) return [ensureDefaultProject()];
  return list;
}

export function getProject(id?: string): Project | undefined {
  const list = load();
  if (id) return list.find((x) => x.id === id);
  return list[0];
}

export function createProject(name: string): Project {
  const list = load();
  const p: Project = {
    id: randomUUID(),
    name: name.trim() || `Project ${list.length + 1}`,
    kbId: randomUUID().slice(0, 8),
    createdAt: new Date().toISOString()
  };
  list.push(p);
  save(list);
  return p;
}

export function updateProject(
  id: string,
  patch: Partial<{ name: string; providerId: string; defaultModel: string }>
): Project {
  const list = load();
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) throw new Error('Project not found');
  const p = list[idx];
  if (patch.name !== undefined) p.name = patch.name.trim();
  if (patch.providerId !== undefined) p.providerId = patch.providerId;
  if (patch.defaultModel !== undefined) p.defaultModel = patch.defaultModel;
  list[idx] = p;
  save(list);
  return p;
}

export function deleteProject(id: string): void {
  const list = load().filter((x) => x.id !== id);
  save(list);
}
