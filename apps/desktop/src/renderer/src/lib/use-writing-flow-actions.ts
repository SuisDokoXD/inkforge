import { useCallback } from "react";
import { useAppStore } from "../stores/app-store";
import { outlineApi } from "./api";

export interface WritingFlowActions {
  openChapter: (chapterId: string) => void;
  reviewChapter: (chapterId: string) => void;
  autoWriteChapter: (chapterId: string) => void;
  autoWriteOutlineCard: (projectId: string, outlineCardId: string) => Promise<void>;
  researchChapter: (chapterId: string, query?: string | null) => void;
  openOutline: (cardId?: string | null) => void;
}

export function useWritingFlowActions(): WritingFlowActions {
  const setChapter = useAppStore((state) => state.setChapter);
  const setMainView = useAppStore((state) => state.setMainView);
  const setOutlineFocusCard = useAppStore((state) => state.setOutlineFocusCard);
  const setResearchDraftQuery = useAppStore((state) => state.setResearchDraftQuery);

  const openChapter = useCallback(
    (chapterId: string) => {
      setChapter(chapterId);
      setMainView("writing");
    },
    [setChapter, setMainView],
  );

  const reviewChapter = useCallback(
    (chapterId: string) => {
      setChapter(chapterId);
      setMainView("review");
    },
    [setChapter, setMainView],
  );

  const autoWriteChapter = useCallback(
    (chapterId: string) => {
      setChapter(chapterId);
      setMainView("auto-writer");
    },
    [setChapter, setMainView],
  );

  const autoWriteOutlineCard = useCallback(
    async (projectId: string, outlineCardId: string) => {
      const { chapter } = await outlineApi.prepareChapter({ projectId, outlineCardId });
      setChapter(chapter.id);
      setMainView("auto-writer");
    },
    [setChapter, setMainView],
  );

  const researchChapter = useCallback(
    (chapterId: string, query?: string | null) => {
      setChapter(chapterId);
      const trimmed = query?.trim();
      setResearchDraftQuery(trimmed ? trimmed : null);
      setMainView("research");
    },
    [setChapter, setMainView, setResearchDraftQuery],
  );

  const openOutline = useCallback(
    (cardId?: string | null) => {
      setOutlineFocusCard(cardId ?? null);
      setMainView("outline");
    },
    [setMainView, setOutlineFocusCard],
  );

  return {
    openChapter,
    reviewChapter,
    autoWriteChapter,
    autoWriteOutlineCard,
    researchChapter,
    openOutline,
  };
}
