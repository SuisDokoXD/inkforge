// =============================================================================
// usePackCover —— 卡牌封面 dataURL 读取 Hook
// =============================================================================
// 把"按 packId/coverPath 读封面 → dataURL"统一封到 react-query 里。
// 之前 WorldPackCard / WorldPackEditDialog / PackSlotPanel 各写了一遍，
// queryKey 不统一会导致 cover 上传后无法批量失效；统一后调用方只管：
//   const { dataUrl } = usePackCover(pack);
// 失效统一用 queryClient.invalidateQueries({ queryKey: ["world-pack-cover"] }).
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { worldPackApi } from "../lib/api";
import type { WorldPackRecord } from "@inkforge/shared";

export interface UsePackCoverResult {
  dataUrl: string | null;
  isLoading: boolean;
}

// 接受 pack 整对象或 {id, coverPath} 子集；coverPath 为空时不发请求
export function usePackCover(
  pack: Pick<WorldPackRecord, "id" | "coverPath"> | undefined | null,
): UsePackCoverResult {
  const id = pack?.id ?? "";
  const coverPath = pack?.coverPath ?? null;
  const query = useQuery({
    queryKey: ["world-pack-cover", id, coverPath],
    queryFn: async () => {
      if (!coverPath) return { dataUrl: null as string | null };
      return worldPackApi.coverRead({ packId: id, coverPath });
    },
    enabled: !!id && !!coverPath,
    staleTime: 60_000,
  });
  return {
    dataUrl: query.data?.dataUrl ?? null,
    isLoading: query.isLoading,
  };
}
