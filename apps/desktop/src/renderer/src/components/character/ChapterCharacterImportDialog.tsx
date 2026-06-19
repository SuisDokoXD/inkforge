import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Wand2, X } from "lucide-react";
import type {
  ChapterRecord,
  NovelCharacterExtractCandidate,
  NovelCharacterExtractRelation,
  NovelCharacterExtractResponse,
  NovelCharacterRecord,
  ProjectRecord,
} from "@inkforge/shared";
import { AnimatedDialog } from "../AnimatedDialog";
import { MotionSpinner } from "../MotionSpinner";
import { chapterApi, novelCharacterApi } from "../../lib/api";

interface ChapterCharacterImportDialogProps {
  open: boolean;
  projectId: string;
  projects: ProjectRecord[];
  preferredChapterId: string | null;
  characters: NovelCharacterRecord[];
  onProjectChange: (projectId: string) => void;
  onClose: () => void;
  onSelectCreated: (id: string) => void;
}

interface RelationRow extends NovelCharacterExtractRelation {
  id: string;
}

function keyOfName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
      .replace(/^Error invoking remote method '[^']+':\s*/i, "")
      .replace(/^Error:\s*/i, "")
      .trim();
  }
  return "操作失败，请稍后再试。";
}

function chapterLabel(chapter: ChapterRecord): string {
  const words = chapter.wordCount > 0 ? ` · ${chapter.wordCount} 字` : "";
  return `${chapter.title}${words}`;
}

export function ChapterCharacterImportDialog({
  open,
  projectId,
  projects,
  preferredChapterId,
  characters,
  onProjectChange,
  onClose,
  onSelectCreated,
}: ChapterCharacterImportDialogProps): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");
  const [result, setResult] = useState<NovelCharacterExtractResponse | null>(null);
  const [checkedNames, setCheckedNames] = useState<Set<string>>(new Set());
  const [relationRows, setRelationRows] = useState<RelationRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const chaptersQuery = useQuery({
    queryKey: ["chapters", projectId],
    queryFn: () => chapterApi.list({ projectId }),
    enabled: open && !!projectId,
  });

  const chapters = chaptersQuery.data ?? [];
  const existingNameSet = useMemo(
    () => new Set(characters.map((c) => keyOfName(c.name))),
    [characters],
  );

  useEffect(() => {
    if (!open || chapters.length === 0) return;
    const preferred =
      preferredChapterId && chapters.some((chapter) => chapter.id === preferredChapterId)
        ? preferredChapterId
        : chapters[0].id;
    if (!selectedChapterId || !chapters.some((chapter) => chapter.id === selectedChapterId)) {
      setSelectedChapterId(preferred);
    }
  }, [chapters, open, preferredChapterId, selectedChapterId]);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setCheckedNames(new Set());
      setRelationRows([]);
      setNotice(null);
    }
  }, [open]);

  useEffect(() => {
    setSelectedChapterId("");
    setResult(null);
    setCheckedNames(new Set());
    setRelationRows([]);
    setNotice(null);
  }, [projectId]);

  const extractMut = useMutation({
    mutationFn: () =>
      novelCharacterApi.extractFromChapter({
        projectId,
        chapterId: selectedChapterId,
        maxCandidates: 8,
      }),
    onSuccess: (data) => {
      setResult(data);
      setNotice(null);
      setCheckedNames(
        new Set(
          data.candidates
            .map((candidate) => keyOfName(candidate.name))
            .filter((key) => !existingNameSet.has(key)),
        ),
      );
      setRelationRows(
        data.relationships.map((relation, index) => ({
          ...relation,
          id: `${relation.sourceName}-${relation.targetName}-${relation.label}-${index}`,
        })),
      );
    },
  });

  const selectedCandidates = useMemo(() => {
    if (!result) return [];
    return result.candidates.filter((candidate) => {
      const key = keyOfName(candidate.name);
      return checkedNames.has(key) && !existingNameSet.has(key);
    });
  }, [checkedNames, existingNameSet, result]);

  const editableNames = useMemo(() => {
    const names = new Set<string>();
    characters.forEach((character) => names.add(character.name));
    result?.candidates.forEach((candidate) => names.add(candidate.name));
    return Array.from(names).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }, [characters, result]);

  const importableNameSet = useMemo(() => {
    const names = new Set(existingNameSet);
    selectedCandidates.forEach((candidate) => names.add(keyOfName(candidate.name)));
    return names;
  }, [existingNameSet, selectedCandidates]);

  const selectedRelationships = useMemo(
    () =>
      relationRows.filter((relation) => {
        const source = keyOfName(relation.sourceName);
        const target = keyOfName(relation.targetName);
        return (
          source &&
          target &&
          source !== target &&
          relation.label.trim().length > 0 &&
          importableNameSet.has(source) &&
          importableNameSet.has(target)
        );
      }),
    [importableNameSet, relationRows],
  );

  const importMut = useMutation({
    mutationFn: () =>
      novelCharacterApi.importCandidates({
        projectId,
        chapterId: result?.chapterId,
        candidates: selectedCandidates,
        relationships: selectedRelationships,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["novelCharacters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["novelCharacters"] });
      if (response.created[0]) {
        onSelectCreated(response.created[0].id);
        onClose();
        return;
      }
      if (response.relationships.length > 0) {
        setNotice(`已写入 ${response.relationships.length} 条人物关系。`);
        return;
      }
      setNotice("没有写入新内容，候选人物或关系已存在。");
    },
  });

  const toggleCandidate = (candidate: NovelCharacterExtractCandidate): void => {
    const key = keyOfName(candidate.name);
    if (existingNameSet.has(key)) return;
    setCheckedNames((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updateRelation = (
    id: string,
    field: keyof Omit<RelationRow, "id" | "confidence">,
    value: string,
  ): void => {
    setRelationRows((prev) =>
      prev.map((relation) =>
        relation.id === id ? { ...relation, [field]: value } : relation,
      ),
    );
  };

  const addRelation = (): void => {
    setRelationRows((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        sourceName: editableNames[0] ?? "",
        targetName: editableNames[1] ?? "",
        label: "",
        evidence: "",
        confidence: 1,
      },
    ]);
  };

  const removeRelation = (id: string): void => {
    setRelationRows((prev) => prev.filter((relation) => relation.id !== id));
  };

  const canExtract = Boolean(selectedChapterId) && !extractMut.isPending;
  const canImport =
    (selectedCandidates.length > 0 || selectedRelationships.length > 0) &&
    !importMut.isPending;

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      labelledBy="chapter-character-import-title"
      panelClassName="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-900 shadow-2xl"
    >
      <header className="flex items-start justify-between gap-4 border-b border-ink-700 px-5 py-4">
        <div>
          <h2 id="chapter-character-import-title" className="text-base font-semibold text-ink-50">
            从章节识别人物
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-400">
            选择一篇章节，识别结果会先作为候选项展示，确认后才写入人物库。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-100"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-[220px_1fr_auto]">
          <label className="block">
            <span className="mb-1 block text-xs text-ink-400">书籍</span>
            <select
              value={projectId}
              onChange={(event) => onProjectChange(event.target.value)}
              disabled={projects.length === 0}
              className="h-9 w-full rounded-md border border-ink-700 bg-ink-950 px-3 text-sm text-ink-100 outline-none focus:border-accent-400 disabled:opacity-60"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-400">章节</span>
            <select
              value={selectedChapterId}
              onChange={(event) => {
                setSelectedChapterId(event.target.value);
                setResult(null);
                setCheckedNames(new Set());
                setRelationRows([]);
                setNotice(null);
              }}
              disabled={chaptersQuery.isLoading || chapters.length === 0}
              className="h-9 w-full rounded-md border border-ink-700 bg-ink-950 px-3 text-sm text-ink-100 outline-none focus:border-accent-400 disabled:opacity-60"
            >
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapterLabel(chapter)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => extractMut.mutate()}
            disabled={!canExtract || chapters.length === 0}
            className="mt-auto inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent-500 px-3 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-60"
          >
            {extractMut.isPending ? (
              <MotionSpinner className="h-4 w-4" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            识别人物
          </button>
        </div>

        {chapters.length === 0 && !chaptersQuery.isLoading ? (
          <div className="mt-5 rounded-md border border-ink-700 bg-ink-950/50 px-4 py-5 text-sm text-ink-400">
            当前项目还没有章节。
          </div>
        ) : null}

        {extractMut.error ? (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {getErrorMessage(extractMut.error)}
          </div>
        ) : null}
        {importMut.error ? (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {getErrorMessage(importMut.error)}
          </div>
        ) : null}
        {notice ? (
          <div className="mt-4 rounded-md border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-xs text-accent-100">
            {notice}
          </div>
        ) : null}

        {result ? (
          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-100">
                <FileText className="h-4 w-4 text-accent-300" />
                {result.chapterTitle}
              </div>
              <span className="text-xs text-ink-500">{result.candidates.length} 个候选</span>
            </div>

            {result.candidates.length === 0 ? (
              <div className="rounded-md border border-ink-700 bg-ink-950/50 px-4 py-6 text-center text-sm text-ink-400">
                没有识别到适合加入人物库的新人物。
              </div>
            ) : (
              <div className="space-y-2">
                {result.candidates.map((candidate) => {
                  const key = keyOfName(candidate.name);
                  const exists = existingNameSet.has(key);
                  const checked = checkedNames.has(key);
                  return (
                    <button
                      key={`${candidate.name}-${candidate.evidence}`}
                      type="button"
                      onClick={() => toggleCandidate(candidate)}
                      disabled={exists}
                      className={`grid w-full grid-cols-[auto_1fr] gap-3 rounded-md border p-3 text-left transition ${
                        exists
                          ? "border-ink-700 bg-ink-950/40 opacity-70"
                          : checked
                            ? "border-accent-400/70 bg-accent-500/10"
                            : "border-ink-700 bg-ink-950/50 hover:border-ink-600"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border ${
                          checked
                            ? "border-accent-300 bg-accent-400 text-ink-950"
                            : "border-ink-600 text-transparent"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-ink-50">
                            {candidate.name}
                          </span>
                          {candidate.aliases.length > 0 ? (
                            <span className="truncate text-[11px] text-ink-500">
                              又名 {candidate.aliases.join("、")}
                            </span>
                          ) : null}
                          <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-400">
                            {Math.round(candidate.confidence * 100)}%
                          </span>
                          {exists ? (
                            <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-400">
                              已在人物库
                            </span>
                          ) : null}
                        </span>
                        {candidate.persona ? (
                          <span className="mt-1 block text-xs text-ink-300">
                            {candidate.persona}
                          </span>
                        ) : null}
                        <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-ink-400">
                          {candidate.backstory || candidate.evidence || "没有更多描述"}
                        </span>
                        {candidate.evidence ? (
                          <span className="mt-2 block rounded border border-ink-800 bg-ink-900/70 px-2 py-1 text-[11px] leading-relaxed text-ink-500">
                            {candidate.evidence}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-5 rounded-md border border-ink-700 bg-ink-950/40">
              <div className="flex items-center justify-between gap-3 border-b border-ink-700 px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-ink-100">关系草图</div>
                  <div className="mt-0.5 text-[11px] text-ink-500">
                    两端都能匹配到人物时才会写入；这里可以先改错再保存。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={addRelation}
                  className="rounded-md border border-ink-700 px-2 py-1 text-xs text-ink-300 hover:bg-ink-800"
                >
                  新增关系
                </button>
              </div>
              <datalist id="character-import-name-options">
                {editableNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {relationRows.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-ink-500">
                  还没有识别到关系，可以手动新增。
                </div>
              ) : (
                <div className="divide-y divide-ink-800">
                  {relationRows.map((relation) => {
                    const sourceReady = importableNameSet.has(keyOfName(relation.sourceName));
                    const targetReady = importableNameSet.has(keyOfName(relation.targetName));
                    const relationDomId = relation.id.replace(/[^a-zA-Z0-9_-]/g, "-");
                    const sourceInputId = `character-import-source-${relationDomId}`;
                    const labelInputId = `character-import-label-${relationDomId}`;
                    const targetInputId = `character-import-target-${relationDomId}`;
                    const evidenceInputId = `character-import-evidence-${relationDomId}`;

                    return (
                      <div key={relation.id} className="grid gap-2 px-3 py-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                        <label className="block" htmlFor={sourceInputId}>
                          <span className="mb-1 block text-[10px] text-ink-500">起点人物</span>
                          <input
                            id={sourceInputId}
                            list="character-import-name-options"
                            value={relation.sourceName}
                            onChange={(event) =>
                              updateRelation(relation.id, "sourceName", event.target.value)
                            }
                            className={`h-8 w-full rounded border bg-ink-900 px-2 text-xs text-ink-100 outline-none focus:border-accent-400 ${
                              sourceReady ? "border-ink-700" : "border-amber-500/50"
                            }`}
                          />
                        </label>
                        <label className="block" htmlFor={labelInputId}>
                          <span className="mb-1 block text-[10px] text-ink-500">关系</span>
                          <input
                            id={labelInputId}
                            value={relation.label}
                            onChange={(event) =>
                              updateRelation(relation.id, "label", event.target.value)
                            }
                            placeholder="例如：同伴、敌对、师徒"
                            className="h-8 w-full rounded border border-ink-700 bg-ink-900 px-2 text-xs text-ink-100 outline-none placeholder:text-ink-600 focus:border-accent-400"
                          />
                        </label>
                        <label className="block" htmlFor={targetInputId}>
                          <span className="mb-1 block text-[10px] text-ink-500">终点人物</span>
                          <input
                            id={targetInputId}
                            list="character-import-name-options"
                            value={relation.targetName}
                            onChange={(event) =>
                              updateRelation(relation.id, "targetName", event.target.value)
                            }
                            className={`h-8 w-full rounded border bg-ink-900 px-2 text-xs text-ink-100 outline-none focus:border-accent-400 ${
                              targetReady ? "border-ink-700" : "border-amber-500/50"
                            }`}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => removeRelation(relation.id)}
                          className="mt-auto h-8 rounded border border-ink-700 px-2 text-xs text-ink-400 hover:border-red-500/50 hover:text-red-300"
                        >
                          删除
                        </button>
                        <label className="md:col-span-4" htmlFor={evidenceInputId}>
                          <span className="mb-1 block text-[10px] text-ink-500">证据</span>
                          <input
                            id={evidenceInputId}
                            value={relation.evidence}
                            onChange={(event) =>
                              updateRelation(relation.id, "evidence", event.target.value)
                            }
                            placeholder="可留空，也可以保留原文依据"
                            className="h-8 w-full rounded border border-ink-800 bg-ink-900/70 px-2 text-xs text-ink-300 outline-none placeholder:text-ink-600 focus:border-accent-400"
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-ink-700 px-5 py-3">
        <div className="text-xs text-ink-500">
          {selectedCandidates.length > 0 || selectedRelationships.length > 0
            ? `将创建 ${selectedCandidates.length} 个角色，写入 ${selectedRelationships.length} 条关系`
            : "选择候选后再创建"}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-ink-700 px-3 py-1.5 text-sm text-ink-300 hover:bg-ink-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => importMut.mutate()}
            disabled={!canImport}
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-accent-500 px-3 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-60"
          >
            {importMut.isPending ? (
              <MotionSpinner className="h-4 w-4" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            写入人物和关系
          </button>
        </div>
      </footer>
    </AnimatedDialog>
  );
}
