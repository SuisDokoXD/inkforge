// M9 Phase 3.1: Cmd+K command palette (cmdk-powered).
import { useMemo } from "react";
import { Command as Cmdk } from "cmdk";
import { useT } from "../lib/i18n";
import { buildCommands, type CommandContext } from "../lib/commands";
import { AnimatedDialog } from "./AnimatedDialog";

const GROUP_LABEL_KEY: Record<string, string> = {
  navigate: "palette.group.navigate",
  action: "palette.group.action",
  project: "palette.group.project",
  writer: "palette.group.writer",
  tool: "palette.group.tool",
};

// A4: 命令显示优先级（左侧分组先出现）
const GROUP_ORDER = ["navigate", "action", "project", "writer", "tool"] as const;

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  ctx: CommandContext;
  terminalEnabled?: boolean;
}

export function CommandPalette({
  open,
  onClose,
  ctx,
  terminalEnabled,
}: CommandPaletteProps): JSX.Element {
  const t = useT();
  const commands = useMemo(
    () => buildCommands({ terminalEnabled }),
    [terminalEnabled],
  );

  // A4: 按 GROUP_ORDER 分组，过滤 requiresProject（无项目时跳过）
  const groups = GROUP_ORDER
    .map((g): [string, typeof commands] => [
      g,
      commands.filter(
        (c) => c.group === g && (!c.requiresProject || ctx.hasProject),
      ),
    ])
    .filter(([, cmds]) => cmds.length > 0);

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      ariaLabel={t("palette.aria.label")}
      overlayClassName="flex items-start justify-center p-4 pt-[12vh]"
      zClassName="z-[60]"
      panelClassName="w-full max-w-xl overflow-hidden rounded-xl border border-ink-600 bg-ink-800 shadow-2xl"
    >
      <Cmdk label={t("palette.aria.label")} className="flex flex-col">
        <div className="border-b border-ink-700 px-4 py-3">
          <Cmdk.Input
            autoFocus
            placeholder={t("palette.placeholder")}
            className="w-full bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-500"
          />
        </div>
        <Cmdk.List className="max-h-[55vh] overflow-y-auto px-2 py-2 text-sm">
          <Cmdk.Empty className="px-3 py-6 text-center text-xs text-ink-400">
            {t("palette.empty")}
          </Cmdk.Empty>
          {groups.map(([groupId, groupCmds]) =>
            groupCmds.length === 0 ? null : (
              <Cmdk.Group
                key={groupId}
                heading={t(GROUP_LABEL_KEY[groupId]!)}
                className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-500"
              >
                {groupCmds.map((cmd) => {
                  const label = t(cmd.labelKey);
                  return (
                    <Cmdk.Item
                      key={cmd.id}
                      value={`${label} ${cmd.keywords.join(" ")}`}
                      onSelect={() => {
                        cmd.run(ctx);
                        onClose();
                      }}
                      className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-ink-200 aria-selected:bg-accent-500/15 aria-selected:text-accent-200"
                    >
                      <span>{label}</span>
                      {cmd.shortcut ? (
                        <span className="ml-3 shrink-0 text-[10px] text-ink-500">
                          {cmd.shortcut}
                        </span>
                      ) : null}
                    </Cmdk.Item>
                  );
                })}
              </Cmdk.Group>
            ),
          )}
        </Cmdk.List>
      </Cmdk>
    </AnimatedDialog>
  );
}
