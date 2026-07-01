// C7: TTS 朗读组件——基于 Web Speech API 的章节朗读器。
// 支持播放/暂停、跳段、调速、语音选择。
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { DUR, EASE_STANDARD, fadeOnly, fadeSlideUp } from "../lib/motion-tokens";
import { IconButton } from "./ui";

interface ReadAloudProps {
  text: string;
}

/** 在可用的中文语音中优先选择 */
function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  // 优先：中文女声 > 中文男声 > 任意中文
  const zhVoices = voices.filter((v) => v.lang.startsWith("zh"));
  if (zhVoices.length === 0) return voices[0] ?? null;
  const female = zhVoices.find((v) => v.name.includes("Female") || v.name.includes("Tingting") || v.name.includes("Xiaoxiao"));
  return female ?? zhVoices[0];
}

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5];

export function ReadAloud({ text }: ReadAloudProps): JSX.Element | null {
  const reduce = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1); // 默认 1.0x
  const [currentPara, setCurrentPara] = useState(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // 按段落分割
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

  const speakParagraph = useCallback((index: number) => {
    if (index >= paragraphs.length) {
      setPlaying(false);
      setCurrentPara(0);
      return;
    }
    window.speechSynthesis.cancel();
    const para = paragraphs[index].trim();
    if (!para) {
      setCurrentPara(index + 1);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(para);
    utterance.rate = SPEED_OPTIONS[speedIdx];
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.onend = () => {
      setCurrentPara((p) => {
        const next = p + 1;
        if (next < paragraphs.length) speakParagraph(next);
        else { setPlaying(false); setCurrentPara(0); }
        return next;
      });
    };
    utterance.onerror = () => setPlaying(false);
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [paragraphs, speedIdx]);

  // 初始化语音选择
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) voiceRef.current = pickBestVoice(voices);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  useEffect(() => () => { window.speechSynthesis.cancel(); }, []);

  if (paragraphs.length === 0) return null;

  return (
    <motion.div
      className="flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-800/60 px-2 py-1.5"
      variants={reduce ? fadeOnly : fadeSlideUp}
      initial="initial"
      animate="animate"
    >
      <Volume2 className="h-3.5 w-3.5 text-accent-300 shrink-0" />
      <span className="text-[10px] text-ink-400 hidden sm:inline">
        {playing ? `§${currentPara + 1}/${paragraphs.length}` : "朗读"}
      </span>

      <IconButton size="xs" aria-label={playing ? "暂停朗读" : "开始朗读"}
        onClick={() => {
          if (playing) { window.speechSynthesis.cancel(); setPlaying(false); }
          else { setPlaying(true); speakParagraph(currentPara); }
        }}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </IconButton>

      {playing ? (
        <>
          <IconButton size="xs" aria-label="上一段" onClick={() => {
            window.speechSynthesis.cancel();
            const prev = Math.max(0, currentPara - 1);
            setCurrentPara(prev);
            speakParagraph(prev);
          }}>
            <SkipBack className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton size="xs" aria-label="下一段" onClick={() => {
            window.speechSynthesis.cancel();
            const next = Math.min(paragraphs.length - 1, currentPara + 1);
            setCurrentPara(next);
            speakParagraph(next);
          }}>
            <SkipForward className="h-3.5 w-3.5" />
          </IconButton>
        </>
      ) : null}

      {/* 调速 */}
      <button
        className="rounded px-1.5 py-0.5 text-[10px] text-ink-400 hover:bg-ink-700 hover:text-ink-200"
        onClick={() => setSpeedIdx((s) => (s + 1) % SPEED_OPTIONS.length)}
        title="朗读速度"
      >
        {SPEED_OPTIONS[speedIdx]}x
      </button>
    </motion.div>
  );
}
