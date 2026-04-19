import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const translationsDir = path.join(root, "src", "i18n", "translations");
const localesPath = path.join(root, "src", "i18n", "locales.ts");
const srcDir = path.join(root, "src");
const baseLocale = "en-US.ts";

const keyPattern = /"([^"]+)":/g;
const formattedMessagePattern = /<FormattedMessage\s+[^>]*id=["']([^"']+)["']/g;
const translateCallPattern = /\bt\(\s*["']([^"']+)["']/g;

function readKeys(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const keys = new Set();
  let match;

  while ((match = keyPattern.exec(content)) !== null) {
    keys.add(match[1]);
  }

  return keys;
}

function listSourceFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function readUsedTranslationKeys() {
  const keys = new Set();

  for (const file of listSourceFiles(srcDir)) {
    const content = fs.readFileSync(file, "utf8");
    for (const pattern of [formattedMessagePattern, translateCallPattern]) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        keys.add(match[1]);
      }
    }
  }

  return keys;
}

function readConfiguredTranslationFiles() {
  const content = fs.readFileSync(localesPath, "utf8");
  const files = new Set();
  const importPattern = /from\s+["']\.\/translations\/([^"']+)["']/g;
  let match;

  while ((match = importPattern.exec(content)) !== null) {
    files.add(`${match[1]}.ts`);
  }

  return [...files]
    .filter((file) => fs.existsSync(path.join(translationsDir, file)))
    .sort();
}

const translationFiles = readConfiguredTranslationFiles().sort();

const basePath = path.join(translationsDir, baseLocale);
const baseKeys = readKeys(basePath);
const failures = [];

for (const file of translationFiles) {
  const filePath = path.join(translationsDir, file);
  const keys = readKeys(filePath);

  const missing = [...baseKeys].filter((key) => !keys.has(key));
  const extra = [...keys].filter((key) => !baseKeys.has(key));

  if (missing.length > 0 || extra.length > 0) {
    failures.push({
      file,
      missing,
      extra,
    });
  }
}

const usedKeys = readUsedTranslationKeys();
const missingFromBase = [...usedKeys].filter(
  (key) => !key.endsWith(".") && !baseKeys.has(key),
);

if (missingFromBase.length > 0) {
  failures.push({
    file: "source usage",
    missing: missingFromBase,
    extra: [],
  });
}

if (failures.length > 0) {
  console.error("i18n translation files are not synchronized.");

  for (const failure of failures) {
    console.error(`\n${failure.file}`);
    if (failure.missing.length > 0) {
      console.error(`  Missing: ${failure.missing.join(", ")}`);
    }
    if (failure.extra.length > 0) {
      console.error(`  Extra: ${failure.extra.join(", ")}`);
    }
  }

  process.exit(1);
}

console.log(
  `i18n translation files are synchronized (${baseKeys.size} keys, ${translationFiles.length} locales).`,
);
