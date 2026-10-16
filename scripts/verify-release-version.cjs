const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const readPackage = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const rootPackage = readPackage("package.json");
const desktopPackage = readPackage("apps/desktop/package.json");
const mobilePackage = readPackage("apps/mobile/package.json");
const androidGradle = fs.readFileSync(
  path.join(root, "apps", "mobile", "android", "app", "build.gradle"),
  "utf8",
);
const androidVersionName = androidGradle.match(/^\s*versionName\s+["']([^"']+)["']/m)?.[1];
const androidVersionCode = Number(androidGradle.match(/^\s*versionCode\s+(\d+)/m)?.[1]);
const expectedTag = `v${desktopPackage.version}`;
const actualTag = process.env.GITHUB_REF_NAME || process.argv[2];

const mismatches = [
  ["root", rootPackage.version],
  ["desktop", desktopPackage.version],
  ["mobile", mobilePackage.version],
  ["Android versionName", androidVersionName],
].filter(([, version]) => version !== desktopPackage.version);

if (mismatches.length > 0 || !Number.isInteger(androidVersionCode) || androidVersionCode < 1) {
  console.error("release version metadata is inconsistent:");
  for (const [name, version] of mismatches) {
    console.error(`  ${name}: ${version ?? "missing"} (expected ${desktopPackage.version})`);
  }
  if (!Number.isInteger(androidVersionCode) || androidVersionCode < 1) {
    console.error(`  Android versionCode: ${androidVersionCode} (expected positive integer)`);
  }
  process.exit(1);
}

if (!actualTag) {
  console.log(`release versions verified: ${desktopPackage.version}; expected tag ${expectedTag}; Android versionCode ${androidVersionCode}`);
  process.exit(0);
}

if (actualTag !== expectedTag) {
  console.error(`release tag ${actualTag} does not match package version ${desktopPackage.version}`);
  process.exit(1);
}

console.log(`release version verified: ${actualTag}; Android versionCode ${androidVersionCode}`);
