export interface StableChapterListSnapshot<TChapter> {
  projectId: string | null;
  chapters: TChapter[];
}

export function selectStableChapterList<TChapter>(
  current: TChapter[] | undefined,
  projectId: string | null,
  isFetching: boolean,
  snapshot: StableChapterListSnapshot<TChapter>,
): TChapter[] {
  if (current && current.length > 0) return current;
  if (isFetching && snapshot.projectId === projectId && snapshot.chapters.length > 0) {
    return snapshot.chapters;
  }
  return current ?? [];
}
