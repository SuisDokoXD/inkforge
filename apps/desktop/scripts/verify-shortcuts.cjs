#!/usr/bin/env node
/**
 * M9 Phase 1.1 verify-shortcuts
 *
 * Static check: every shortcut combo displayed by ActivityBar must appear as a
 * binding in lib/shortcuts.ts NAV_SHORTCUTS. Prevents regressions of the
 * "fake shortcut" UX bug (tooltip promised, handler missing).
 *
 * The check is intentionally text-based to avoid pulling in TS/electron deps
 * (matches the pattern of the other verify-*.cjs scripts in this dir).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SHORTCUTS_FILE = path.join(ROOT, "src/renderer/src/lib/shortcuts.ts");
const ACTIVITY_BAR_FILE = path.join(ROOT, "src/renderer/src/components/ActivityBar.tsx");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function extractCombos(src) {
  const out = [];
  const re = /combo:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

function fail(msg) {
  console.error("\u2717 " + msg);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(SHORTCUTS_FILE)) fail("shortcuts.ts not found at " + SHORTCUTS_FILE);
  if (!fs.existsSync(ACTIVITY_BAR_FILE)) fail("ActivityBar.tsx not found");

  const shortcutsSrc = read(SHORTCUTS_FILE);
  const activityBarSrc = read(ACTIVITY_BAR_FILE);

  const combos = extractCombos(shortcutsSrc);
  if (combos.length === 0) fail("no combos parsed from shortcuts.ts");

  // ActivityBar must import NAV_SHORTCUTS (single source of truth).
  if (!/from\s+"\.\.\/lib\/shortcuts"/.test(activityBarSrc)) {
    fail("ActivityBar.tsx does not import from ../lib/shortcuts");
  }
  if (!/NAV_SHORTCUTS/.test(activityBarSrc)) {
    fail("ActivityBar.tsx no longer references NAV_SHORTCUTS");
  }

  // Sanity: must include the previously broken shortcuts so we never regress.
  const required = ["Ctrl+1", "Ctrl+`", "Ctrl+2", "Ctrl+3", "Ctrl+4", "Ctrl+5", "Ctrl+6", "Ctrl+7", "Ctrl+8", "Ctrl+9", "Ctrl+0", "Ctrl+Shift+A", "Ctrl+M"];
  for (const r of required) {
    if (!combos.includes(r)) fail("required shortcut missing in NAV_SHORTCUTS: " + r);
  }

  console.log("\u2713 verify-shortcuts: " + combos.length + " navigation shortcuts wired correctly");
}

main();
