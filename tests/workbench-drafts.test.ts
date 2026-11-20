import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveWorkbenchDraft,
  loadWorkbenchDrafts,
  deleteWorkbenchDraft,
  getWorkbenchDraftsStorageKey,
  getDraftCategoryLabel,
  countDraftChars,
  buildDraftPreview,
  deriveDraftTitle,
} from '../utils/workbenchDrafts.ts';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

test('workbenchDrafts saves manual drafts separately, deduplicates auto drafts by autoSlotKey, and deletes cleanly', () => {
  const mockStorage = createMemoryStorage();
  (globalThis as any).localStorage = mockStorage;

  const userId = 'user-test-1';
  const auto1 = saveWorkbenchDraft(userId, {
    autoSlotKey: 'auto-imitate-imitate-style',
    category: 'imitate',
    saveType: 'auto',
    title: '仿写草稿一',
    model: 'deepseek-chat',
    requirementsNote: '强化紧张节奏',
    outputPreview: '第一次自动保存内容',
    outputCharCount: 120,
    sourceCharCount: 300,
    statusLabel: '退出自动保留',
    payload: {
      mode: 'standard',
      moduleId: 'imitate-style',
      moduleTitle: '文风仿写',
      formState: { story: '原文内容' },
      freeInput: '',
      selectedAssetIds: [],
      model: 'deepseek-chat',
      temperature: 1,
      topP: 0.95,
      targetChars: 2000,
      generatedText: '第一次自动保存内容',
    },
  });

  const auto2 = saveWorkbenchDraft(userId, {
    autoSlotKey: 'auto-imitate-imitate-style',
    category: 'imitate',
    saveType: 'auto',
    title: '仿写草稿一更新',
    model: 'qwen3.8-flash',
    requirementsNote: '改为冷峻节奏',
    outputPreview: '第二次自动覆盖内容',
    outputCharCount: 240,
    sourceCharCount: 300,
    statusLabel: '中断自动保留',
    payload: {
      mode: 'standard',
      moduleId: 'imitate-style',
      moduleTitle: '文风仿写',
      formState: { story: '原文内容' },
      freeInput: '',
      selectedAssetIds: [],
      model: 'qwen3.8-flash',
      temperature: 1,
      topP: 0.95,
      targetChars: 2000,
      generatedText: '第二次自动覆盖内容',
    },
  });

  assert.equal(auto2.id, auto1.id);

  const manual1 = saveWorkbenchDraft(userId, {
    category: 'polish',
    saveType: 'manual',
    title: '润色手动草稿',
    model: 'deepseek-chat',
    requirementsNote: '精简修饰',
    outputPreview: '润色正文预览',
    outputCharCount: 180,
    sourceCharCount: 220,
    statusLabel: '手动存为草稿',
    payload: {
      activeMode: 'deep',
      task: { id: 'task-1' },
    },
  });

  const review1 = saveWorkbenchDraft(userId, {
    category: 'review',
    saveType: 'manual',
    title: '审稿草稿',
    model: 'deepseek-chat',
    requirementsNote: '关注同名冲突',
    outputPreview: '审稿内容预览',
    outputCharCount: 500,
    sourceCharCount: 520,
    statusLabel: '手动存为草稿',
    payload: {
      originalText: '原稿',
      imitationText: '仿写',
      selectedModel: 'deepseek-chat',
      report: null,
      auditCache: null,
      ignoredConflictKeys: [],
      customAddedCharacters: [],
      excludedCharacters: [],
      auditError: null,
    },
  });

  const loaded = loadWorkbenchDrafts(userId);
  assert.equal(loaded.length, 3);
  assert.ok(loaded.some((d) => d.id === auto2.id && d.outputPreview === '第二次自动覆盖内容'));
  assert.ok(loaded.some((d) => d.id === manual1.id && d.category === 'polish'));
  assert.ok(loaded.some((d) => d.id === review1.id && d.category === 'review'));

  // Storage key scopes per user
  assert.equal(getWorkbenchDraftsStorageKey(null), 'qisimiaoxie_workbench_drafts_v1_guest');
  assert.equal(loadWorkbenchDrafts(null).length, 0);

  // Delete one draft
  const afterDelete = deleteWorkbenchDraft(userId, manual1.id);
  assert.equal(afterDelete.length, 2);
  assert.equal(loadWorkbenchDrafts(userId).length, 2);
});

test('workbenchDrafts falls back safely when localStorage throws QuotaExceededError', () => {
  const store = new Map<string, string>();
  let failFirst = true;
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failFirst) {
        failFirst = false;
        throw new Error('QuotaExceededError');
      }
      store.set(k, v);
    },
  };

  // Seed one manual draft cleanly first
  failFirst = false;
  saveWorkbenchDraft('u2', {
    category: 'polish',
    saveType: 'manual',
    title: '重要手动草稿',
    model: 'deepseek-chat',
    requirementsNote: '',
    outputPreview: '保留内容',
    outputCharCount: 50,
    sourceCharCount: 50,
    statusLabel: '手动保存',
    payload: { activeMode: 'light', task: { id: 't1' } },
  });

  // Trigger quota error on next save -> fallback compaction succeeds and retains manual draft
  failFirst = true;
  const saved = saveWorkbenchDraft('u2', {
    autoSlotKey: 'auto-review-current',
    category: 'review',
    saveType: 'auto',
    title: '自动审稿',
    model: 'deepseek-chat',
    requirementsNote: '',
    outputPreview: '审稿预览',
    outputCharCount: 100,
    sourceCharCount: 100,
    statusLabel: '自动保留',
    payload: {
      originalText: 'a',
      imitationText: 'b',
      selectedModel: 'deepseek-chat',
      report: null,
      auditCache: null,
      ignoredConflictKeys: [],
      customAddedCharacters: [],
      excludedCharacters: [],
      auditError: null,
    },
  });

  const all = loadWorkbenchDrafts('u2');
  assert.equal(all.length, 2);
  assert.ok(all.some((d) => d.id === saved.id));
});

test('draft formatting helpers strip think tags and derive readable titles', () => {
  assert.equal(getDraftCategoryLabel('imitate'), '仿写');
  assert.equal(getDraftCategoryLabel('polish'), '润色');
  assert.equal(getDraftCategoryLabel('review'), '审稿');
  assert.equal(countDraftChars('<think>内部推演</think>你好 世界'), 4);
  assert.equal(buildDraftPreview('<think>内部推演</think>  第一行   第二行 '), '第一行 第二行');
  assert.equal(deriveDraftTitle('\n# 雨夜来客\n第二行'), '雨夜来客');
});
