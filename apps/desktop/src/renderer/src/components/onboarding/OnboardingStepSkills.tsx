const BUILTIN_SKILLS = [
  { name: "剧情大纲生成", desc: "基于当前章节内容，智能推演后续剧情走向。" },
  { name: "人物言行一致性检查", desc: "分析人物对话是否符合其既定人设和语气。" },
  { name: "环境描写润色", desc: "为枯燥的场景描写添加生动的感官细节。" },
  { name: "逻辑漏洞扫描", desc: "识别故事中的时间线冲突或情节硬伤。" },
  { name: "灵感泡泡", desc: "在写作时实时浮现的词汇和意象联想。" },
];

export function OnboardingStepSkills(): JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink-100">预装写作辅助技能</h2>
        <p className="mt-2 text-sm text-ink-300">
          InkForge 已为你自动加载以下写作助手。你可以在“技能”页面随时管理它们。
        </p>
      </div>

      <div className="space-y-3">
        {BUILTIN_SKILLS.map((skill) => (
          <div key={skill.name} className="flex items-start gap-3 p-3 rounded-lg border border-ink-700 bg-ink-900/40">
            <div className="mt-1 h-2 w-2 rounded-full bg-accent-500 shadow-[0_0_8px_rgba(0,122,255,0.5)]" />
            <div>
              <div className="text-sm font-medium text-ink-100">{skill.name}</div>
              <div className="text-xs text-ink-400 mt-1 leading-relaxed">{skill.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-ink-500 italic">
        * 这些技能将默认启用，部分技能通过快捷键 Ctrl+Enter 触发。
      </p>
    </div>
  );
}
