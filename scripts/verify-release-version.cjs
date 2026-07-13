const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const desktopPackage = JSON.parse(
  fs.readFileSync(path.join(root, "apps", "desktop", "package.json"), "utf8"),
);
const expectedTag = `v${desktopPackage.version}`;
const actualTag = process.env.GITHUB_REF_NAME || process.argv[2];

if (!actualTag) {
  console.log(`desktop version ${desktopPackage.version}; expected release tag ${expectedTag}`);
  process.exit(0);
}

if (actualTag !== expectedTag) {
  console.error(`release tag ${actualTag} does not match desktop version ${expectedTag}`);
  process.exit(1);
}

console.log(`release version verified: ${actualTag}`);
