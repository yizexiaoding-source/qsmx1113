export type DraftCategory = 'imitate' | 'polish' | 'review';
export type DraftSaveType = 'manual' | 'auto';

export interface ImitationDirectionItem {
  title: string;
  summary: string;
  events: string[];
  pace: string;
}

export interface ImitationDraftSlot {
  text: string;
  status: string;
  error?: string;
  resumable?: boolean;
}

export interface ImitateDraftPayload {
  mode: 'directions' | 'standard';
  moduleId: string;
  moduleTitle: string;
  promptId?: string;
  promptTitle?: string;
  formState: Record<string, string>;
  freeInput: string;
  selectedAssetIds: string[];
  model: string;
  temperature: number;
  topP: number;
  targetChars: number;
  generatedText: string;
  imitationState?: {
    promptSnapshot: string;
    planModel: string | null;
    verifiedServerModel: string | null;
    plans: ImitationDirectionItem[];
    originalPlans: ImitationDirectionItem[];
    selected: number[];
    active: number;
    drafts: Record<number, ImitationDraftSlot>;
  };
}

export interface PolishDraftPayload {
  task: any;
  activeMode: 'light' | 'deep' | 'editorial';
}

export interface ReviewDraftPayload {
  originalText: string;
  imitationText: string;
  selectedModel: string;
  report: any | null;
  auditCache: any | null;
  ignoredConflictKeys: string[];
  customAddedCharacters: string[];
  excludedCharacters: string[];
  auditError: string | null;
}

export type WorkbenchDraftPayload =
  | ImitateDraftPayload
  | PolishDraftPayload
  | ReviewDraftPayload;

export interface WorkbenchDraftRecord {
  id: string;
  autoSlotKey?: string;
  category: DraftCategory;
  saveType: DraftSaveType;
  title: string;
  model: string;
  requirementsNote: string;
  outputPreview: string;
  outputCharCount: number;
  sourceCharCount: number;
  statusLabel: string;
  updatedAt: string;
  payload: WorkbenchDraftPayload;
}

export interface SaveWorkbenchDraftInput {
  id?: string;
  autoSlotKey?: string;
  category: DraftCategory;
  saveType: DraftSaveType;
  title: string;
  model: string;
  requirementsNote: string;
  outputPreview: string;
  outputCharCount: number;
  sourceCharCount: number;
  statusLabel: string;
  payload: WorkbenchDraftPayload;
}

export const WORKBENCH_DRAFTS_EVENT = 'qisimiaoxie:workbench-drafts-updated';
const MAX_DRAFTS = 50;

export function getWorkbenchDraftsStorageKey(userId: string | null): string {
  return `qisimiaoxie_workbench_drafts_v1_${userId || 'guest'}`;
}

export function getDraftCategoryLabel(category: DraftCategory): string {
  if (category === 'imitate') return '仿写';
  if (category === 'polish') return '润色';
  return '审稿';
}

export function countDraftChars(text: string): number {
  return (text || '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/\s+/g, '')
    .trim().length;
}

export function buildDraftPreview(text: string, maxLen = 140): string {
  const clean = (text || '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}

export function deriveDraftTitle(text: string, fallback = '未命名草稿'): string {
  const firstLine = (text || '')
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find((line) => line.length > 0);
  if (!firstLine) return fallback;
  return firstLine.length > 26 ? `${firstLine.slice(0, 26)}…` : firstLine;
}

function notifyDraftsUpdated(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(WORKBENCH_DRAFTS_EVENT));
  }
}

export function loadWorkbenchDrafts(userId: string | null): WorkbenchDraftRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getWorkbenchDraftsStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is WorkbenchDraftRecord =>
          Boolean(
            item &&
              typeof item.id === 'string' &&
              (item.category === 'imitate' || item.category === 'polish' || item.category === 'review') &&
              item.payload &&
              typeof item.payload === 'object'
          )
      )
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  } catch {
    return [];
  }
}

function persistDraftsList(userId: string | null, drafts: WorkbenchDraftRecord[]): boolean {
  if (typeof localStorage === 'undefined') return false;
  const key = getWorkbenchDraftsStorageKey(userId);
  try {
    localStorage.setItem(key, JSON.stringify(drafts.slice(0, MAX_DRAFTS)));
    return true;
  } catch {
    // Quota fallback: prune older auto drafts first, then oldest entries
    const manualOnly = drafts.filter((d) => d.saveType === 'manual');
    const autoRecent = drafts.filter((d) => d.saveType === 'auto').slice(0, 8);
    const compacted = [...manualOnly, ...autoRecent]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 20);
    try {
      localStorage.setItem(key, JSON.stringify(compacted));
      return true;
    } catch {
      try {
        localStorage.setItem(key, JSON.stringify(compacted.slice(0, 8)));
        return true;
      } catch {
        return false;
      }
    }
  }
}

export function saveWorkbenchDraft(
  userId: string | null,
  input: SaveWorkbenchDraftInput
): WorkbenchDraftRecord {
  const existing = loadWorkbenchDrafts(userId);
  const now = new Date().toISOString();

  const matchIdx = input.id
    ? existing.findIndex((d) => d.id === input.id)
    : input.saveType === 'auto' && input.autoSlotKey
      ? existing.findIndex((d) => d.saveType === 'auto' && d.autoSlotKey === input.autoSlotKey)
      : -1;

  const existingRecord = matchIdx >= 0 ? existing[matchIdx] : null;
  const record: WorkbenchDraftRecord = {
    id: existingRecord?.id || input.id || `draft-${input.category}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    autoSlotKey: input.autoSlotKey,
    category: input.category,
    saveType: input.saveType,
    title: (input.title || '').trim() || '未命名草稿',
    model: input.model || '',
    requirementsNote: (input.requirementsNote || '').trim(),
    outputPreview: input.outputPreview || '',
    outputCharCount: Math.max(0, input.outputCharCount || 0),
    sourceCharCount: Math.max(0, input.sourceCharCount || 0),
    statusLabel: input.statusLabel || (input.saveType === 'auto' ? '退出自动保留' : '手动保存草稿'),
    updatedAt: now,
    payload: input.payload,
  };

  const rest = existing.filter((_, idx) => idx !== matchIdx);
  const next = [record, ...rest].slice(0, MAX_DRAFTS);
  persistDraftsList(userId, next);
  notifyDraftsUpdated();
  return record;
}

export function deleteWorkbenchDraft(userId: string | null, draftId: string): WorkbenchDraftRecord[] {
  const existing = loadWorkbenchDrafts(userId);
  const next = existing.filter((d) => d.id !== draftId);
  persistDraftsList(userId, next);
  notifyDraftsUpdated();
  return next;
}
