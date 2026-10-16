import { describe, expect, it } from 'vitest';
import { SaveQueue } from './save-queue';
import type { Draft } from './platform';

const draft = (text: string): Draft => ({ id: 'chapter', bookId: 'book', title: '第一章', text, updatedAt: 1 });

describe('mobile save queue', () => {
  it('serializes writes and snapshots input before asynchronous persistence', async () => {
    const saved: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const queue = new SaveQueue({ loadBooks: async () => [], loadDrafts: async () => [], saveBook: async () => {}, save: async value => {
      if (value.text === '旧') await gate;
      saved.push(value.text);
    } });
    const initial = draft('旧');
    const first = queue.save(initial);
    initial.text = '不应写入';
    const second = queue.save(draft('新'));
    release();
    await Promise.all([first, second, queue.flush()]);
    expect(saved).toEqual(['旧', '新']);
  });
  it('does not let an older queued snapshot overwrite a newer edit', async () => {
    const saved: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const queue = new SaveQueue({ loadBooks: async () => [], loadDrafts: async () => [], saveBook: async () => {}, save: async value => {
      if (value.text === '新版') await gate;
      saved.push(value.text);
    } });
    const newer = queue.save({ ...draft('新版'), updatedAt: 2 });
    const older = queue.save({ ...draft('旧版'), updatedAt: 1 });
    release();
    await Promise.all([newer, older, queue.flush()]);
    expect(saved).toEqual(['新版']);
  });

  it('reports a failed save while allowing a later retry', async () => {
    let attempt = 0;
    const queue = new SaveQueue({ loadBooks: async () => [], loadDrafts: async () => [], saveBook: async () => {}, save: async () => {
      if (++attempt === 1) throw new Error('disk unavailable');
    } });
    await expect(queue.save(draft('正文'))).rejects.toThrow('disk unavailable');
    await expect(queue.save(draft('正文'))).resolves.toBeUndefined();
  });
});
