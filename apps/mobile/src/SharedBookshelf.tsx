import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BookSummary, ProjectRecord } from '@inkforge/shared';
import { bookshelfApi } from '@renderer/lib/api';
import { BookListGrid } from '@renderer/components/bookshelf/BookListGrid';
import { NewBookDialog } from '@renderer/components/bookshelf/NewBookDialog';
import { EditBookDialog } from '@renderer/components/bookshelf/EditBookDialog';
import { BookSettingsDialog } from '@renderer/components/bookshelf/BookSettingsDialog';
import { DeleteBookConfirmDialog } from '@renderer/components/bookshelf/DeleteBookConfirmDialog';

export function SharedBookshelf({ onOpen }: { onOpen: (project: ProjectRecord) => Promise<void> }) {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<ProjectRecord | null>(null);
  const [editing, setEditing] = useState<ProjectRecord | null>(null);
  const [deleting, setDeleting] = useState<ProjectRecord | null>(null);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const query = useQuery({ queryKey: ['bookshelf-books'], queryFn: bookshelfApi.listBooks });
  const open = async (book: BookSummary) => {
    if (opening) return;
    setOpening(true); setError('');
    try { await onOpen(book.project); }
    catch { setError('无法打开书稿，请重试。'); }
    finally { setOpening(false); }
  };
  if (query.isPending) return <p role="status" className="p-6 text-ink-300">正在读取本地书架…</p>;
  if (query.isError) return <div role="alert" className="p-6 text-ink-200">无法读取书架。<button onClick={() => void query.refetch()}>重试</button></div>;
  return <div className="shared-bookshelf flex min-h-0 flex-1 flex-col">
    {error && <p role="alert" className="p-3 text-red-200">{error}</p>}
    {opening && <p role="status" className="px-4 py-2 text-ink-300">正在打开…</p>}
    <BookListGrid books={query.data} openIds={new Set()} persistentActions onPickBook={id => {
      const book = query.data.find(item => item.project.id === id);
      if (book) void open(book);
    }} onCreateBook={() => setCreating(true)} onRenameBook={book => setRenaming(book.project)} onOpenSettings={book => setEditing(book.project)} onDeleteBook={book => setDeleting(book.project)} />
    <NewBookDialog open={creating} onClose={() => setCreating(false)} showStoragePaths={false} />
    <EditBookDialog project={renaming} onClose={() => setRenaming(null)} />
    <BookSettingsDialog project={editing} onClose={() => setEditing(null)} />
    <DeleteBookConfirmDialog project={deleting} onClose={() => setDeleting(null)} localDatabaseOnly />
  </div>;
}
