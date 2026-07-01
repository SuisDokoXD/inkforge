// C13: AI image generation dialog — sends prompt to ComfyUI/SD WebUI via IPC
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { Image, Loader2 } from "lucide-react";
import { imageGenApi, coverApi } from "../lib/api";
import { AnimatedDialog } from "./AnimatedDialog";
import { Button, Select, Textarea } from "./ui";
import { fadeOnly, fadeSlideUp } from "../lib/motion-tokens";

interface ImageGenDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

export function ImageGenDialog({ open, onClose, projectId }: ImageGenDialogProps): JSX.Element {
  const reduce = useReducedMotion();
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [width, setWidth] = useState(768);
  const [height, setHeight] = useState(512);
  const [result, setResult] = useState<{ dataUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateMut = useMutation({
    mutationFn: () => imageGenApi.generate({ prompt, negativePrompt, width, height, projectId }),
    onSuccess: (res) => {
      if (res.success && res.dataUrl) setResult({ dataUrl: res.dataUrl });
      else setError(res.error ?? "未知错误");
    },
    onError: (err) => setError(err instanceof Error ? err.message : String(err)),
  });

  const saveCoverMut = useMutation({
    mutationFn: async () => {
      if (!result?.dataUrl) return;
      const base64 = result.dataUrl.split(",")[1] ?? result.dataUrl;
      await coverApi.upload({ projectId, fileName: "cover.png", base64, mime: "image/png" });
    },
    onSuccess: () => onClose(),
    onError: (err) => setError(err instanceof Error ? err.message : "设置封面失败"),
  });

  return (
    <AnimatedDialog open={open} onClose={onClose} ariaLabel="AI 图片生成"
      overlayClassName="flex items-center justify-center p-4"
      panelClassName="w-full max-w-lg max-h-[85vh] overflow-auto rounded-xl border border-ink-700 bg-ink-900 p-5 shadow-2xl">
      <motion.div variants={reduce ? fadeOnly : fadeSlideUp} initial="initial" animate="animate" className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-100">
          <Image className="h-4 w-4 text-accent-300" /> AI 图片生成
        </h3>

        <Textarea placeholder="提示词，描述你想要的画面…" rows={3} className="bg-ink-800"
          value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <input type="text" className="w-full rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-xs text-ink-100"
          placeholder="负面提示词（可选）" value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} />

        <div className="flex gap-2">
          <Select className="bg-ink-800 text-xs" value={String(width)} onChange={(e) => setWidth(Number(e.target.value))}>
            <option value="512">512×512</option><option value="768">768×512</option><option value="768">768×768</option>
          </Select>
        </div>

        <Button variant="primary" className="w-full" disabled={!prompt.trim() || generateMut.isPending}
          onClick={() => { setError(null); setResult(null); generateMut.mutate(); }}>
          {generateMut.isPending ? (<><Loader2 className="mr-1 h-4 w-4 animate-spin" />生成中…</>) : "生成"}
        </Button>

        {error ? <div className="rounded bg-red-500/15 px-3 py-2 text-xs text-red-200" role="alert">{error}</div> : null}

        {result ? (
          <div className="space-y-3">
            <img src={result.dataUrl} alt="Generated" className="w-full rounded-lg border border-ink-700" />
            <div className="flex gap-2">
              <Button variant="accentSoft" className="flex-1" disabled={saveCoverMut.isPending}
                onClick={() => saveCoverMut.mutate()}>
                {saveCoverMut.isPending ? "设置中…" : "设为封面"}
              </Button>
              <Button variant="secondary" onClick={() => { generateMut.mutate(); }} disabled={generateMut.isPending}>
                重新生成
              </Button>
            </div>
          </div>
        ) : null}
      </motion.div>
    </AnimatedDialog>
  );
}
