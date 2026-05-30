/**
 * 单一吉祥物的"第一人称"人格设定。
 * 收敛自原 4 物种（猫/狐/鸮/章鱼）映射——现在只有一个吉祥物，故用常量。
 * 用法：将气泡 / 聊天文本中的占位符 {self} {sound} {name} 替换为对应值。
 */
export const PET_PRONOUN = "我";
export const PET_SOUND = "唔";
/** 默认名字（未起名时备用，可在桌宠菜单里改） */
export const PET_DEFAULT_NAME = "墨墨";
/** 聊天/气泡里对吉祥物自身的称呼 */
export const PET_LABEL = "可爱的写作伙伴";

/**
 * 把模板里的 {self} {sound} {name} 占位符替换成代词/音效/名字。
 * 没起名 → 用默认名；外部传入 customName 优先。
 */
export function applyPersona(template: string, customName: string): string {
  const name = customName || PET_DEFAULT_NAME;
  return template
    .replaceAll("{self}", PET_PRONOUN)
    .replaceAll("{sound}", PET_SOUND)
    .replaceAll("{name}", name);
}
