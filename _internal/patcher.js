const fs = require("fs");
const path = require("path");
const { createRequire } = require("node:module");

const PATCHER_DIR = __dirname;
const ROOT_DIR = path.resolve(PATCHER_DIR, "..");
const ASSETS_DIR = path.join(ROOT_DIR, "assets");
const MAPPINGS_DIR = path.join(ROOT_DIR, "mappings");
const LOCAL_NODE_DIR = path.join(ROOT_DIR, "tools", "node-v26.4.0-win-x64");
const LOCAL_ASAR_PATH = path.join(LOCAL_NODE_DIR, "node_modules", "@electron", "asar",);

// ASAR
let asar;

try {
  const localRequire = createRequire(
    path.join(LOCAL_NODE_DIR, "__asar_resolver__.cjs"),
  );

  asar = localRequire("@electron/asar");

  console.log(`[info] asar loaded: ${localRequire.resolve("@electron/asar")}`);
} catch (err) {
  console.error("[error] asar 모듈을 불러오지 못했습니다.");
  console.error(`[error] 확인 경로: ${LOCAL_ASAR_PATH}`);
  console.error("이 오류를 발견하셨다면 개발자 Midori에게 제보해 주세요!");
  throw err;
}

// debug
const DEBUG_MODE = process.argv.includes("--debug");
const {
  debugCheckPatchMappings,
  createStaticMappingDebugSession,
} = require("./patcher_debug.js");
const { patchVueRenderRules } = require("./patcher_renders.js");

// paw_path.txt
const PATH_FILE = path.join(ROOT_DIR, "pwa_path.txt");

function cleanPathLine(line) {
  return line
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/^["']|["']$/g, "");
}

function readInstallDirFromTxt() {
  if (!fs.existsSync(PATH_FILE)) {
    fs.writeFileSync(
      PATH_FILE,
      [
        "# Perfect World Arena 설치 폴더를 적어 주세요.",
        "# 예시:",
        "# C:\\Program Files (x86)\\perfectworldarena",
        "",
        "C:\\Program Files (x86)\\perfectworldarena",
      ].join("\r\n"),
      "utf8",
    );

    throw new Error(
      `경로 설정 파일을 생성했습니다: ${PATH_FILE}\n` +
        "pwa_path.txt에 완미 설치 폴더 경로를 적은 뒤 다시 실행해 주세요.",
    );
  }

  const installDir = fs
    .readFileSync(PATH_FILE, "utf8")
    .split(/\r?\n/)
    .map(cleanPathLine)
    .find((line) => line && !line.startsWith("#"));

  if (!installDir) {
    throw new Error(
      `pwa_path.txt에 완미 설치 폴더 경로가 없습니다: ${PATH_FILE}`,
    );
  }

  return path.normalize(installDir);
}

// ASAR work
const INSTALL_DIR = readInstallDirFromTxt();
const RESOURCES_DIR = path.join(INSTALL_DIR, "resources");
const APP_ASAR = path.join(RESOURCES_DIR, "app.asar");
const APP_ASAR_UNPACKED = path.join(RESOURCES_DIR, "app.asar.unpacked");

const WORK_DIR = path.join(ROOT_DIR, ".work");
const UNPACKED_DIR = path.join(WORK_DIR, "app_unpacked");
const PATCHED_ASAR = path.join(WORK_DIR, "app.patched.asar");
const LOG_DIR = path.join(WORK_DIR, "logs");

const nowTag = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .replace("T", "_")
  .slice(0, 19);

const BACKUP_ASAR = path.join(RESOURCES_DIR, "app.asar.backup");
const LOG_PATH = path.join(LOG_DIR, `patch_log_${nowTag}.txt`);
const REMAIN_PATH = path.join(LOG_DIR, `remaining_log_${nowTag}.txt`);

const logs = [];
const remains = [];

function log(line) {
  logs.push(line);
  console.log(line);
}

function remain(line) {
  remains.push(line);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function checkEnvironment() {
  log("[info] Perfect World Arena Korean Patch");
  log(`[info] path file: ${PATH_FILE}`);
  log(`[info] install dir: ${INSTALL_DIR}`);
  log(`[info] resources dir: ${RESOURCES_DIR}`);
  log(`[info] app.asar: ${APP_ASAR}`);
  log(`[info] app.asar.unpacked: ${APP_ASAR_UNPACKED}`);

  if (!fs.existsSync(APP_ASAR)) {
    throw new Error(`app.asar not found: ${APP_ASAR}`);
  }

  if (!fs.existsSync(APP_ASAR_UNPACKED)) {
    log(`[warn] app.asar.unpacked not found: ${APP_ASAR_UNPACKED}`);
  }

  if (!asar) {
    throw new Error("local asar module not loaded");
  }

  ensureDir(WORK_DIR);
  ensureDir(LOG_DIR);
}

function prepareWorkDir() {
  if (fs.existsSync(UNPACKED_DIR)) {
    fs.rmSync(UNPACKED_DIR, { recursive: true, force: true });
  }

  if (fs.existsSync(PATCHED_ASAR)) {
    fs.rmSync(PATCHED_ASAR, { force: true });
  }
}

function cleanupOldBackupFiles() {
  const backupDirs = [RESOURCES_DIR, WORK_DIR]
    .filter(Boolean)
    .filter((dir) => fs.existsSync(dir));

  const backupPatterns = [
    /^app\.asar\.backup$/i,
    /^app\.asar\.koreanpatch_backup_.+$/i,
  ];

  let deleted = 0;

  for (const dir of backupDirs) {
    let names;

    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }

    for (const name of names) {
      if (name === "app.asar") continue;
      if (name === "app.asar.unpacked") continue;
      if (name === "app.asar.patched") continue;

      const isBackup = backupPatterns.some((re) => re.test(name));
      if (!isBackup) continue;

      const full = path.join(dir, name);

      try {
        const stat = fs.statSync(full);

        if (!stat.isFile()) continue;

        fs.unlinkSync(full);
        deleted++;

        log(`[backup-cleanup] deleted: ${full}`);
      } catch (err) {
        log(`[backup-cleanup] failed: ${full}`);
        log(`[backup-cleanup] reason: ${err.message}`);
      }
    }
  }

  log(`[summary:backup-cleanup] deleted=${deleted}`);
}

function backupOriginalAsar() {
  cleanupOldBackupFiles();

  const backupPath = path.join(RESOURCES_DIR, "app.asar.backup");

  fs.copyFileSync(APP_ASAR, backupPath);

  log(`[backup] created: ${backupPath}`);
}

function extractAsar() {
  log(`[run] asar extract "${APP_ASAR}" "${UNPACKED_DIR}"`);
  asar.extractAll(APP_ASAR, UNPACKED_DIR);
}

async function packAsar() {
  log(`[run] asar pack "${UNPACKED_DIR}" "${PATCHED_ASAR}"`);
  await asar.createPackage(UNPACKED_DIR, PATCHED_ASAR);
}

function replaceOriginal() {
  fs.copyFileSync(PATCHED_ASAR, APP_ASAR);
  log(`[replace] ${PATCHED_ASAR} -> ${APP_ASAR}`);
}

// Core
function shouldSkip(full) {
  return (
    full.includes(`${path.sep}node_modules${path.sep}`) ||
    full.includes(`${path.sep}ckplayer${path.sep}`) ||
    full.includes(`${path.sep}video${path.sep}`) ||
    full.includes(`${path.sep}zip${path.sep}`)
  );
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (shouldSkip(full)) continue;

    const st = fs.statSync(full);

    if (st.isDirectory()) {
      walk(full, out);
    } else {
      const rel = path.relative(UNPACKED_DIR, full).replaceAll("\\", "/");

      if (
        rel === "background.js" ||
        /\.js$/i.test(rel) ||
        /\.(html|json|css|txt)$/i.test(rel)
      ) {
        out.push(full);
      }
    }
  }

  return out;
}

function readText(full) {
  return fs.readFileSync(full, "utf8");
}

function writeText(full, text) {
  fs.writeFileSync(full, text, "utf8");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeEnumRegex(key, zh) {
  const k = escapeRegExp(key);
  const z = escapeRegExp(zh);

  return new RegExp(
    `(\\[[\\s\\S]{0,160}\\.${k}\\]\\s*:\\s*)(["'\`])${z}\\2`,
    "g",
  );
}

function makeDirectKeyRegex(key, zh) {
  const k = escapeRegExp(key);
  const z = escapeRegExp(zh);

  return new RegExp(
    `((?:^|[,{]\\s*)(?:(?:${k})|(?:"${k}")|(?:'${k}'))\\s*:\\s*)(["'\`])${z}\\2`,
    "g",
  );
}

function makeFieldRegex(field, zh) {
  const f = escapeRegExp(field);
  const z = escapeRegExp(zh);

  return new RegExp(
    `((?:^|[,{]\\s*)(?:(?:${f})|(?:"${f}")|(?:'${f}'))\\s*:\\s*)(["'\`])${z}\\2`,
    "g",
  );
}

function loadJsonFile(fileName) {
  const fullPath = path.join(MAPPINGS_DIR, fileName);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`매핑 파일을 찾을 수 없습니다: ${fullPath}`);
  }

  try {
    const raw = fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, "");

    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `매핑 파일을 읽을 수 없습니다: ${fullPath}\n${err.message}`,
    );
  }
}

// Load .json mapping files
function loadPatchData() {
  const staticData = loadJsonFile("static.json");
  const vueData = loadJsonFile("vue.json");
  const imageData = loadJsonFile("images.json");
  const eventData = loadJsonFile("event.json");

  const staticMappings = (staticData.mappings || []).map((item) => [
    item.zh,
    item.ko,
  ]);

  const vueMappings = [
    ...(vueData.mappings || []),
    ...(eventData.mappings || []),
  ].map((item) => {
    if (typeof item.regex !== "string") {
      return item;
    }

    return {
      ...item,
      regex: new RegExp(item.regex, item.regexFlags || "g"),
    };
  });

  const inlineImageMappings = (imageData.inlineBase64 || []).map((item) => ({
    label: item.label || item.name,
    name: item.name,
    fromBase64Prefix: item.fromBase64Prefix,
    newImagePath: path.join(ASSETS_DIR, item.asset),
  }));

  const imageAssetReplacements = (imageData.assetReplacements || []).map(
    (item) => ({
      label: item.label || item.asset,
      from: path.join(ASSETS_DIR, item.asset),

      // static/img/... 문자열을 운영체제 경로로 변환
      to: path.join(
        UNPACKED_DIR,
        ...String(item.target)
          .split(/[\\/]+/)
          .filter(Boolean),
      ),
    }),
  );

  log(
    `[mapping] static=${staticData.version}, ` +
      `vue=${vueData.version}, ` +
      `images=${imageData.version}, ` +
      `event=${eventData.version}`,
  );

  return {
    staticMappings,
    vueMappings,
    inlineImageMappings,
    imageAssetReplacements,
  };
}

// Vue text patch helpers
function vueToUnicodeEscapeLower(str) {
  return str
    .split("")
    .map((ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("");
}

function vueToUnicodeEscapeUpper(str) {
  return str
    .split("")
    .map(
      (ch) =>
        "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase(),
    )
    .join("");
}

// vuePatch*Regex* 패치
function vuePatchRegexRules(state, mappings) {
  const rules = mappings.filter(
    (item) => item.type === "regex" && item.profile,
  );

  if (rules.length === 0) return;

  for (const rule of rules) {
    switch (rule.profile) {
      // "profile": "enum" 번역, [e.key]&#58; "zh"
      case "enum": {
        if (!rule.key || !rule.zh || !rule.ko) {
          break;
        }

        const regexList = [
          makeEnumRegex(rule.key, rule.zh),
          makeDirectKeyRegex(rule.key, rule.zh),
        ];

        for (const re of regexList) {
          state.text = state.text.replace(re, (match, prefix, quote) => {
            state.changed++;
            state.total++;

            log(
              `[${state.rel}] Regex, profile:${rule.profile} ` +
                `${rule.zh} -> ${rule.ko}`,
            );

            return `${prefix}${quote}` + `${rule.ko}` + `${quote}`;
          });
        }

        break;
      }

      // "profile": "context" 번역, `${prefix(regex)}${rule.to}${suffix(regex)}`
      case "context": {
        if (!(rule.regex instanceof RegExp) || !rule.to) {
          break;
        }

        const re = new RegExp(rule.regex.source, rule.regex.flags);

        state.text = state.text.replace(re, (match, prefix, suffix) => {
          state.changed++;
          state.total++;

          log(
            `[${state.rel}] Regex, profile:${rule.profile} ` +
              `${rule.from || "context"} -> ${rule.to}`,
          );

          return `${prefix}${rule.to}${suffix}`;
        });

        break;
      }

      // "profile": "blacklistCount" 번역, '"\n                黑名单 ("'
      case "blacklistCount": {
        if (!rule.zh || !rule.ko) {
          break;
        }

        const zh = escapeRegExp(rule.zh);

        const re = new RegExp(
          `(\\._v\\(\\s*["'\`]` + `(?:(?:\\\\[nrt])|\\s)*)` + `${zh}`,
          "g",
        );

        state.text = state.text.replace(re, (match, prefix) => {
          state.changed++;
          state.total++;

          log(
            `[${state.rel}] Regex, profile:${rule.profile} ` +
              `${rule.zh} -> ${rule.ko}`,
          );

          return `${prefix}${rule.ko}`;
        });

        break;
      }

      default:
        break;
    }
  }
}

// vuePatch*Literal* 패치
function vuePatchLiteralRules(state, textMappings) {
  // "patchLiteral": true 번역, "\n      {rule.to}\n    "
  const rules = textMappings.filter(
    (item) => item.patchLiteral === true && item.zh && item.ko,
  );

  if (rules.length === 0) return;

  const ws = String.raw`(?:(?:\\[nrt])|\s)*`;

  function makeVariants(zh, ko) {
    const variants = [
      {
        from: zh,
        to: ko,
      },
      {
        from: vueToUnicodeEscapeLower(zh),
        to: vueToUnicodeEscapeLower(ko),
      },
      {
        from: vueToUnicodeEscapeUpper(zh),
        to: vueToUnicodeEscapeUpper(ko),
      },
    ];

    return variants.filter(
      (item, index, array) =>
        item.from &&
        array.findIndex((other) => other.from === item.from) === index,
    );
  }

  function patchSegment(segment, rule) {
    let changed = 0;

    const variants = makeVariants(rule.zh, rule.ko);

    for (const { from, to } of variants) {
      const escaped = escapeRegExp(from);

      const targetRe = new RegExp(
        `(["'\`])` + `(${ws})` + `${escaped}` + `(${ws})` + `\\1`,
        "g",
      );

      segment = segment.replace(targetRe, (match, quote, before, after) => {
        changed++;
        state.changed++;
        state.total++;

        log(`[${state.rel}] Text, patchLiteral ` + `${rule.zh} -> ${rule.ko}`);

        return `${quote}${before}` + `${to}${after}${quote}`;
      });
    }

    return {
      text: segment,
      changed,
    };
  }

  for (const rule of rules) {
    const result = patchSegment(state.text, rule);

    state.text = result.text;
  }
}

// vuePatch"RelativeTimeText" 패치
function vuePatchRelativeTimeText(state) {
  if (
    !state.text.includes(".timeLine(") ||
    !state.text.includes("$style.stTime")
  ) {
    return;
  }

  // 친구 추가 탭의 ~분전 패치
  const helper =
    `(function(v){` +
    `v=String(v==null?"":v).trim();` +
    `return v` +
    `.replace(/^(\\d+)天前$/,"$1일 전")` +
    `.replace(/^(\\d+)分钟前$/,"$1분 전")` +
    `.replace(/^(\\d+)小时前$/,"$1시간 전")` +
    `.replace(/^刚刚$/,"방금 전");` +
    `})`;

  const re = /([A-Za-z_$][\w$]*)\._s\(\1\.timeLine\(([^()]+?)\)\)/g;

  state.text = state.text.replace(re, (match, vm, arg) => {
    if (match.includes("function(v)")) return match;

    state.changed++;
    state.total++;

    log(`[${state.rel}] 친구 추가 탭 시간 텍스트 패치 완료`);

    return `${vm}._s(${helper}(${vm}.timeLine(${arg})))`;
  });
}

// Vue 텍스트 통합 패치
function patchVueTextContext(files, mappings) {
  const textMappings = mappings.filter((m) => m.type === "text");

  let total = 0;

  for (const full of files) {
    const rel = path.relative(UNPACKED_DIR, full).replaceAll("\\", "/");

    let text;
    try {
      text = readText(full);
    } catch {
      continue;
    }

    const state = {
      text,
      rel,
      changed: 0,
      total: 0,
    };

    vuePatchRegexRules(state, mappings);
    vuePatchLiteralRules(state, textMappings);
    vuePatchRelativeTimeText(state);
    patchVueRenderRules(state, mappings, log); // patcher_renders.js

    if (state.changed > 0) {
      writeText(full, state.text);
      total += state.total;
    }
  }

  log(`[summary:vue-text-context] changed=${total}`);
}

// 문자열 완전일치 패치
function patchStaticStringMappings(files, mappings = []) {
  const staticDebug = createStaticMappingDebugSession({
    enabled: DEBUG_MODE,
    mappings,
    patcherDir: PATCHER_DIR,
    unpackedDir: UNPACKED_DIR,
    readText,
    log,
  });

  const compiledMappings = mappings.map((mapping, index) => {
    const [zh, ko] = mapping;
    const z = escapeRegExp(zh);
    return {
      zh,
      ko,
      re: new RegExp(`(["'\`])${z}\\1`, "g"),
      originalIndex: index, // 디버그 세션 기록용 원래 인덱스 유지
    };
  });

  let total = 0;

  for (const full of files) {
    const rel = path.relative(UNPACKED_DIR, full).replaceAll("\\", "/");

    let text;
    try {
      text = readText(full);
    } catch {
      continue;
    }

    let changed = 0;

    for (let i = 0; i < compiledMappings.length; i++) {
      const { zh, ko, re, originalIndex } = compiledMappings[i];

      text = text.replace(re, (match, quote) => {
        changed++;
        total++;

        staticDebug.record(rel, originalIndex, 1);

        log(`[${rel}] ${zh} -> ${ko}`);
        return `${quote}${ko}${quote}`;
      });
    }

    if (changed > 0) {
      writeText(full, text);
    }
  }

  log(`[summary:exact-string-literal] changed=${total}`);
  staticDebug.finish(files);
}

// Base64로 인코딩된 이미지 패치
function patchInlineBase64Images(files, imageMappings = []) {
  let total = 0;

  for (const img of imageMappings) {
    if (!fs.existsSync(img.newImagePath)) {
      log(`[warn] image not found: ${img.newImagePath}`);
      continue;
    }

    const newBase64 =
      "data:image/png;base64," +
      fs.readFileSync(img.newImagePath).toString("base64");

    log(`[info] image asset loaded: ${img.newImagePath}`);
    log(`[info] new image base64 length: ${newBase64.length}`);

    for (const full of files) {
      const rel = path.relative(UNPACKED_DIR, full).replaceAll("\\", "/");

      let text;
      try {
        text = readText(full);
      } catch {
        continue;
      }

      if (!text.includes(img.fromBase64Prefix)) continue;

      log(`[info] inline image target found in: ${rel}`);

      let changed = 0;

      const re = /data:image\/png;base64,[A-Za-z0-9+/=]+/g;

      text = text.replace(re, (dataUrl) => {
        if (!dataUrl.includes(img.fromBase64Prefix)) return dataUrl;

        changed++;
        total++;
        log(`[${rel}] ${img.name} -> patched`);

        return newBase64;
      });

      if (changed > 0) {
        writeText(full, text);
      } else {
        log(`[warn] prefix found but data-url regex did not patch: ${rel}`);
      }
    }
  }

  log(`[summary:inline-base64-images] changed=${total}`);
}

// 이미지 에셋 패치
function patchImageAssets(imageMappings = []) {
  let total = 0;

  for (const item of imageMappings) {
    if (!fs.existsSync(item.from)) {
      log(`[skip:image] missing patch asset: ${item.from}`);
      continue;
    }

    if (!fs.existsSync(item.to)) {
      log(`[skip:image] target not found in app.asar: ${item.to}`);
      continue;
    }

    fs.copyFileSync(item.from, item.to);
    total++;

    log(`[image] ${item.label} -> patched`);
  }

  log(`[summary:image-assets] changed=${total}`);
}

function applyPatches() {
  const files = walk(UNPACKED_DIR);
  const patchData = loadPatchData();

  patchVueTextContext(files, patchData.vueMappings);

  patchStaticStringMappings(files, patchData.staticMappings);

  patchInlineBase64Images(files, patchData.inlineImageMappings);

  patchImageAssets(patchData.imageAssetReplacements);

  debugCheckPatchMappings(files, {
    enabled: DEBUG_MODE,
    patcherDir: PATCHER_DIR,
    unpackedDir: UNPACKED_DIR,
    readText,
    log,
    mappingGroups: [
      {
        source: "vue.json",
        mappings: patchData.vueMappings.filter((item) => item.zh && item.ko),
      },
    ],
  });
}

function saveLogs() {
  logs.push(`saved log: ${LOG_PATH}`);
  fs.writeFileSync(LOG_PATH, logs.join("\n"), "utf8");

  remains.push(`saved log: ${REMAIN_PATH}`);
  fs.writeFileSync(REMAIN_PATH, remains.join("\n"), "utf8");

  console.log("");
  console.log(`[done] saved log: ${LOG_PATH}`);
  console.log(`[done] saved remaining log: ${REMAIN_PATH}`);
  console.log(`[done] backup: ${BACKUP_ASAR}`);
}

async function main() {
  try {
    checkEnvironment();
    prepareWorkDir();
    backupOriginalAsar();
    extractAsar();
    applyPatches();
    await packAsar();
    replaceOriginal();
    saveLogs();

    console.log("");
    console.log("[success] Korean patch applied.");
  } catch (err) {
    console.error("");
    console.error("[error]", err.message);
    console.error("");
    console.error("이 오류를 발견하셨다면 개발자 Midori에게 제보해 주세요!");
    console.error(BACKUP_ASAR);
    process.exit(1);
  }
}

main();
