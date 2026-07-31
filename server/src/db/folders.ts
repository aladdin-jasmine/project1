import { randomUUID } from 'crypto';
import { readJson, writeJson } from './store.js';

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  docIds: string[];
  children: FolderNode[];
  createdAt: string;
}

interface FolderDB {
  root: FolderNode;
}

function load(): FolderDB {
  return readJson<FolderDB>('folders', {
    root: {
      id: 'root',
      name: 'All Documents',
      parentId: null,
      docIds: [],
      children: [],
      createdAt: new Date().toISOString()
    }
  });
}

function persist(db: FolderDB): void {
  writeJson('folders', db);
}

function findNode(node: FolderNode, id: string): FolderNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function removeNode(node: FolderNode, id: string): boolean {
  const idx = node.children.findIndex(c => c.id === id);
  if (idx >= 0) {
    node.children.splice(idx, 1);
    return true;
  }
  for (const child of node.children) {
    if (removeNode(child, id)) return true;
  }
  return false;
}

function flattenInto(node: FolderNode, target: FolderNode): void {
  target.docIds.push(...node.docIds);
  for (const child of node.children) {
    flattenInto(child, target);
    target.children.push(child);
  }
}

export function createFolder(name: string, parentId?: string): FolderNode {
  const db = load();
  const parent = parentId ? findNode(db.root, parentId) : db.root;
  if (!parent) throw new Error('Parent folder not found');
  const folder: FolderNode = {
    id: randomUUID(),
    name,
    parentId: parent.id === 'root' ? null : parent.id,
    docIds: [],
    children: [],
    createdAt: new Date().toISOString()
  };
  parent.children.push(folder);
  persist(db);
  return folder;
}

export function getTree(): FolderNode {
  return load().root;
}

export function renameFolder(id: string, name: string): FolderNode {
  const db = load();
  const node = findNode(db.root, id);
  if (!node) throw new Error('Folder not found');
  node.name = name;
  persist(db);
  return node;
}

export function deleteFolder(id: string): void {
  if (id === 'root') throw new Error('Cannot delete root');
  const db = load();
  const node = findNode(db.root, id);
  if (!node) throw new Error('Folder not found');
  // Move docs up to parent
  const parent = node.parentId ? findNode(db.root, node.parentId) : db.root;
  if (parent) {
    parent.docIds.push(...node.docIds);
    // Move children up
    for (const child of node.children) {
      child.parentId = parent.id === 'root' ? null : parent.id;
      parent.children.push(child);
    }
  }
  if (node.parentId) {
    const grandparent = findNode(db.root, node.parentId);
    if (grandparent) removeNode(grandparent, id);
  } else {
    removeNode(db.root, id);
  }
  persist(db);
}

export function moveDoc(docId: string, toFolderId: string, fromFolderId?: string): void {
  const db = load();
  const to = findNode(db.root, toFolderId);
  if (!to) throw new Error('Target folder not found');
  if (fromFolderId && fromFolderId !== 'root') {
    const from = findNode(db.root, fromFolderId);
    if (from) {
      from.docIds = from.docIds.filter(id => id !== docId);
    }
  } else {
    db.root.docIds = db.root.docIds.filter(id => id !== docId);
  }
  to.docIds.push(docId);
  persist(db);
}

export function autoOrganize(docId: string, metadata: { subject?: string; semester?: string; book?: string; chapter?: string }): string {
  const db = load();
  const parts: string[] = [];
  if (metadata.semester) parts.push(`Semester ${metadata.semester}`);
  if (metadata.subject) parts.push(metadata.subject);
  if (metadata.book) parts.push(metadata.book);

  let parent = db.root;
  for (const part of parts) {
    let existing = parent.children.find(c => c.name === part);
    if (!existing) {
      existing = {
        id: randomUUID(),
        name: part,
        parentId: parent.id === 'root' ? null : parent.id,
        docIds: [],
        children: [],
        createdAt: new Date().toISOString()
      };
      parent.children.push(existing);
    }
    parent = existing;
  }
  parent.docIds.push(docId);
  persist(db);
  return parent.id;
}

export function getAllFolderPaths(): { id: string; path: string }[] {
  const result: { id: string; path: string }[] = [];
  function walk(node: FolderNode, prefix: string) {
    const path = prefix ? `${prefix} / ${node.name}` : node.name;
    if (node.id !== 'root') result.push({ id: node.id, path });
    for (const child of node.children) walk(child, path);
  }
  walk(load().root, '');
  return result;
}
