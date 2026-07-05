const fs = require("fs");
const path = require("path");
const { createRequire } = require("node:module");

const PATCHER_DIR = __dirname;
const ROOT_DIR = path.resolve(PATCHER_DIR, "..");
const ASSETS_DIR = path.join(ROOT_DIR, "assets");
const MAPPINGS_DIR = path.join(ROOT_DIR, "mappings");
const LOCAL_NODE_DIR = path.join(ROOT_DIR, "tools", "node-v26.4.0-win-x64");
const LOCAL_ASAR_PATH = path.join(LOCAL_NODE_DIR, "node_modules", "@electron", "asar");

// ASAR
let asar;

try {
  const localRequire = createRequire(
    path.join(LOCAL_NODE_DIR, "__asar_resolver__.cjs")
  );

  asar = localRequire("@electron/asar");

  console.log(
    `[info] asar 모듈 로드 완료: ${localRequire.resolve("@electron/asar")}`
  );
} catch (err) {
  console.error("[error] asar 모듈을 불러오지 못했습니다.");
  console.error(`[error] 확인 경로: ${LOCAL_ASAR_PATH}`);
  console.error("이 오류를 발견하셨다면 Midori 개발자에게 제보해 주세요!");
  throw err;
}

if (!fs.existsSync(path.join(LOCAL_ASAR_PATH, "package.json"))) {
  throw new Error(
    `[error] asar package.json을 찾을 수 없습니다.\n${path.join(LOCAL_ASAR_PATH, "package.json")}`
  );
}

const DEBUG_MODE = process.argv.includes("--debug");
const {
  debugCheckPatchMappings,
  createStaticMappingDebugSession
} = require("./patcher_debug.js");

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
        "C:\\Program Files (x86)\\perfectworldarena"
      ].join("\r\n"),
      "utf8"
    );

    throw new Error(
      `경로 설정 파일을 생성했습니다: ${PATH_FILE}\n` +
      "pwa_path.txt에 완미 설치 폴더 경로를 적은 뒤 다시 실행해 주세요."
    );
  }

  const installDir = fs.readFileSync(PATH_FILE, "utf8")
    .split(/\r?\n/)
    .map(cleanPathLine)
    .find(line => line && !line.startsWith("#"));

  if (!installDir) {
    throw new Error(`pwa_path.txt에 완미 설치 폴더 경로가 없습니다: ${PATH_FILE}`);
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
  const backupDirs = [
    RESOURCES_DIR,
    WORK_DIR
  ].filter(Boolean).filter(dir => fs.existsSync(dir));

  const backupPatterns = [
  /^app\.asar\.backup$/i,
  /^app\.asar\.koreanpatch_backup_.+$/i
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

      const isBackup = backupPatterns.some(re => re.test(name));
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
    "g"
  );
}

function makeDirectKeyRegex(key, zh) {
  const k = escapeRegExp(key);
  const z = escapeRegExp(zh);

  return new RegExp(
    `((?:^|[,{]\\s*)(?:(?:${k})|(?:"${k}")|(?:'${k}'))\\s*:\\s*)(["'\`])${z}\\2`,
    "g"
  );
}

function makeFieldRegex(field, zh) {
  const f = escapeRegExp(field);
  const z = escapeRegExp(zh);

  return new RegExp(
    `((?:^|[,{]\\s*)(?:(?:${f})|(?:"${f}")|(?:'${f}'))\\s*:\\s*)(["'\`])${z}\\2`,
    "g"
  );
}

function loadJsonFile(fileName) {
  const fullPath = path.join(MAPPINGS_DIR, fileName);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`매핑 파일을 찾을 수 없습니다: ${fullPath}`);
  }

  try {
    const raw = fs
      .readFileSync(fullPath, "utf8")
      .replace(/^\uFEFF/, "");

    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `매핑 파일을 읽을 수 없습니다: ${fullPath}\n${err.message}`
    );
  }
}

function loadPatchData() {
  const staticData = loadJsonFile("static.json");
  const vueData = loadJsonFile("vue.json");
  const imageData = loadJsonFile("images.json");
  const dynamicData = loadJsonFile("dynamic.json");

  const staticMappings = (staticData.mappings || []).map(item => [
    item.zh,
    item.ko
  ]);

  // vue.json의 문자열 정규식을 실제 RegExp 객체로 변환
  const vueMappings = (vueData.mappings || []).map(item => {
    if (item.type !== "context") {
      return item;
    }

    return {
      ...item,
      regex: new RegExp(item.regex, item.regexFlags || "g")
    };
  });

  const dynamicRules = dynamicData.rules || [];

  const inlineImageMappings = (imageData.inlineBase64 || []).map(item => ({
    label: item.label || item.name,
    name: item.name,
    fromBase64Prefix: item.fromBase64Prefix,
    newImagePath: path.join(ASSETS_DIR, item.asset)
  }));

  const imageAssetReplacements = (
    imageData.assetReplacements || []
  ).map(item => ({
    label: item.label || item.asset,
    from: path.join(ASSETS_DIR, item.asset),

    // static/img/... 문자열을 운영체제 경로로 변환
    to: path.join(
      UNPACKED_DIR,
      ...String(item.target)
        .split(/[\\/]+/)
        .filter(Boolean)
    )
  }));

  log(
    `[mapping] static=${staticData.version}, ` +
    `vue=${vueData.version}, ` +
    `dynamic=${dynamicData.version}, ` +
    `images=${imageData.version}`
  );

  return {
    staticMappings,
    vueMappings,
    dynamicRules,
    inlineImageMappings,
    imageAssetReplacements
  };
}

// Vue text patch helpers
function vueToUnicodeEscapeLower(str) {
  return str
    .split("")
    .map(ch => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("");
}

function vueToUnicodeEscapeUpper(str) {
  return str
    .split("")
    .map(ch => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase())
    .join("");
}

function vueToUnicodeEscapedJsString(str) {
  return `"${vueToUnicodeEscapeLower(str)}"`;
}

function vueMakeMapLiteral(mappings) {
  return `{${mappings
    .map(m => `${vueToUnicodeEscapedJsString(m.zh)}:${JSON.stringify(m.ko)}`)
    .join(",")}}`;
}

function vueLogMappings(rel, mappings) {
  for (const mapping of mappings) {
    log(`[${rel}] ${mapping.zh} -> ${mapping.ko}`);
  }
}

// patchEnumMappings
function vuePatchEnumMappings(state, textMappings) {
  const mappings = textMappings.filter(
    item =>
      item.patchEnumMapping === true &&
      item.key &&
      item.zh &&
      item.ko
  );

  if (mappings.length === 0) return;

  for (const { key, zh, ko } of mappings) {
    const regexList = [
      makeEnumRegex(key, zh),
      makeDirectKeyRegex(key, zh)
    ];

    for (const re of regexList) {
      state.text = state.text.replace(re, (match, prefix, quote) => {
        state.changed++;
        state.total++;

        log(`[${state.rel}] ${key}: ${zh} -> ${ko}`);

        return `${prefix}${quote}${ko}${quote}`;
      });
    }
  }
}

function vuePatchContextMappings(state, contextMappings) {
  for (const rule of contextMappings) {
    state.text = state.text.replace(rule.regex, (match, prefix, suffix) => {
      state.changed++;
      state.total++;
      log(`[${state.rel}] ${rule.from} -> ${rule.to}`);
      return `${prefix}${rule.to}${suffix}`;
    });
  }
}

// vuePatchRoundWinText, 매치 탭 ~라운드 승리 패치 - 검토 필요!!
function vuePatchRoundWinText(state) {
  const roundWinTextRegex =
    /(\._v\(\s*)(["'`])((?:(?:\\[nrt])|\s)*)(\d+)回合胜利((?:(?:\\[nrt])|\s)*)\2(\s*\))/g;

  state.text = state.text.replace(roundWinTextRegex, (match, prefix, quote, before, num, after, suffix) => {
    state.changed++;
    state.total++;
    log(`[${state.rel}] ${num}回合胜利 -> ${num}라운드 승리`);
    return `${prefix}${quote}${before}${num}라운드 승리${after}${quote}${suffix}`;
  });
}

// patchBlacklistCountText
function vuePatchBlacklistCountText(state, textMappings) {
  const blacklistCountMappings = textMappings.filter(m => m.patchBlacklistCountText);
  if (blacklistCountMappings.length === 0) return;

  for (const mapping of blacklistCountMappings) {
    const zh = escapeRegExp(mapping.zh);
    const ko = mapping.ko;

    // e._v("\n                黑名单（"+e._s(e.blackList.length)+"/"+e._s(e.blackUpperLimit)+"）\n              ")
    const openRe = new RegExp(
      `(\\._v\\(\\s*)(["'\`])((?:(?:\\\\[nrt])|\\s)*)${zh}（\\2\\s*\\+`,
      "g"
    );

    state.text = state.text.replace(openRe, (match, prefix, quote, before) => {
      state.changed++;
      state.total++;
      log(`[${state.rel}] ${mapping.zh} -> ${mapping.ko}`);
      return `${prefix}${quote}${before}${ko} (${quote}+`;
    });

    // "）" -> ")"
    const closeRe = new RegExp(
      `(blackUpperLimit\\)\\s*\\+\\s*)(["'\`])）`,
      "g"
    );

    state.text = state.text.replace(closeRe, (match, prefix, quote) => {
      return `${prefix}${quote})`;
    });
  }
}

function vuePatchAnchoredLiterals(state, textMappings) {
  const mappings = textMappings.filter(
    item =>
      item.patchAnchoredLiteral === true &&
      item.anchorRegex &&
      item.zh &&
      item.ko
  );

  if (mappings.length === 0) return;

  const ws = String.raw`(?:(?:\\[nrt])|\s)*`;

  for (const rule of mappings) {
    const {
      zh,
      ko,
      anchorRegex,
      direction = "after"
    } = rule;

    const maxDistance = Number.isFinite(rule.maxDistance)
      ? rule.maxDistance
      : 300;

    let anchorFlags = rule.anchorFlags || "g";

    if (!anchorFlags.includes("g")) {
      anchorFlags += "g";
    }

    let anchorRe;

    try {
      anchorRe = new RegExp(anchorRegex, anchorFlags);
    } catch (err) {
      log(
        `[skip:anchored-literal] 잘못된 anchorRegex: ${anchorRegex} (${err.message})`
      );
      continue;
    }

    const anchors = [...state.text.matchAll(anchorRe)];

    if (anchors.length === 0) {
      continue;
    }

    const targetVariants = [
      zh,
      vueToUnicodeEscapeLower(zh),
      vueToUnicodeEscapeUpper(zh)
    ];

    /*
      뒤쪽 anchor부터 처리해야 번역 후 문자열 길이가 달라져도
      앞쪽 anchor 위치가 어긋나지 않습니다.
    */
    for (let i = anchors.length - 1; i >= 0; i--) {
      const anchor = anchors[i];
      const anchorStart = anchor.index;
      const anchorEnd = anchorStart + anchor[0].length;

      let rangeStart;
      let rangeEnd;

      if (direction === "before") {
        rangeStart = Math.max(0, anchorStart - maxDistance);
        rangeEnd = anchorStart;
      } else if (direction === "both") {
        rangeStart = Math.max(0, anchorStart - maxDistance);
        rangeEnd = Math.min(
          state.text.length,
          anchorEnd + maxDistance
        );
      } else {
        rangeStart = anchorEnd;
        rangeEnd = Math.min(
          state.text.length,
          anchorEnd + maxDistance
        );
      }

      let segment = state.text.slice(rangeStart, rangeEnd);
      let patched = false;

      for (const variant of targetVariants) {
        if (patched) break;

        const escaped = escapeRegExp(variant);

        /*
          다음 형태를 찾습니다.

          "邀请"
          "\n      邀请\n    "
          '\n 邀请 \n'
        */
        const targetRe = new RegExp(
          `(["'\`])(${ws})${escaped}(${ws})\\1`
        );

        segment = segment.replace(
          targetRe,
          (match, quote, before, after) => {
            patched = true;
            state.changed++;
            state.total++;

            log(
              `[${state.rel}] anchor 번역: ${zh} -> ${ko}`
            );

            return `${quote}${before}${ko}${after}${quote}`;
          }
        );
      }

      if (patched) {
        state.text =
          state.text.slice(0, rangeStart) +
          segment +
          state.text.slice(rangeEnd);
      }
    }
  }
}

// patchTrimmedLiteral
function vuePatchTrimmedLiterals(state, textMappings) {
  const ws = String.raw`(?:(?:\\[nrt])|\s)*`;

  for (const mapping of textMappings.filter(m => m.patchTrimmedLiteral)) {
    const { zh, ko } = mapping;

    const variants = [
      zh,
      vueToUnicodeEscapeLower(zh),
      vueToUnicodeEscapeUpper(zh)
    ];

    for (const variant of variants) {
      const z = escapeRegExp(variant);

      const re = new RegExp(
        `(["'\`])(${ws})${z}(${ws})\\1`,
        "g"
      );

      state.text = state.text.replace(re, (match, quote, before, after) => {
        state.changed++;
        state.total++;
        log(`[${state.rel}] ${zh} -> ${ko}`);
        return `${quote}${before}${ko}${after}${quote}`;
      });
    }
  }
}

// patchPanelTitle
function vuePatchPanelTitleRender(state, textMappings) {
  const panelTitleMappings = textMappings.filter(m => m.patchPanelTitle);
  if (panelTitleMappings.length === 0) return;

  const panelTitleMapLiteral = vueMakeMapLiteral(panelTitleMappings);

  // s("p",{class:e.$style["title"]},[e._v(e._s(t.title))])
  const panelTitleRenderRegex =
    /([A-Za-z_$][\w$]*)\("p",\{class:([A-Za-z_$][\w$]*)\.\$style\["title"\]\},\[\2\._v\(\2\._s\(([A-Za-z_$][\w$]*)\.title\)\)\]\)/g;

  state.text = state.text.replace(panelTitleRenderRegex, (match, h, vm, panel) => {
    state.changed++;
    state.total++;

    vueLogMappings(state.rel, panelTitleMappings);

    return `${h}("p",{class:${vm}.$style["title"]},[${vm}._v(${vm}._s((${panelTitleMapLiteral}[${panel}.title]||${panel}.title)))])`;
  });
}

// patchSignalLocation
function vuePatchSignalLocationRender(state, textMappings) {
  const signalLocationMappings = textMappings.filter(m => m.patchSignalLocation);
  if (signalLocationMappings.length === 0) return;

  const signalLocationMapLiteral = vueMakeMapLiteral(signalLocationMappings);

  // a("span",{staticClass:"city"},[
  //   a("i",{staticClass:"dot"}),
  //   e._v("\n            "+e._s(t.location)+"\n          ")
  // ])
  const signalLocationRenderRegex =
    /([A-Za-z_$][\w$]*)\("span",\{staticClass:"city"\},\[\1\("i",\{staticClass:"dot"\}\),([A-Za-z_$][\w$]*)\._v\(("(?:(?:\\.|[^"\\])*)")\+\2\._s\(([A-Za-z_$][\w$]*)\.location\)\+("(?:(?:\\.|[^"\\])*)")\)\]\)/g;

  state.text = state.text.replace(signalLocationRenderRegex, (match, h, vm, before, item, after) => {
    state.changed++;
    state.total++;

    vueLogMappings(state.rel, signalLocationMappings);

    return `${h}("span",{staticClass:"city"},[${h}("i",{staticClass:"dot"}),${vm}._v(${before}+${vm}._s((${signalLocationMapLiteral}[${item}.location]||${item}.location))+${after})])`;
  });
}

// patchPlayLinkTitle
function vuePatchPlayLinkTitleRender(state, textMappings) {
  const playLinkTitleMappings = textMappings.filter(m => m.patchPlayLinkTitle);
  if (playLinkTitleMappings.length === 0) return;

  const playLinkTitleMapLiteral = vueMakeMapLiteral(playLinkTitleMappings);

  if (
    !state.text.includes('staticClass:"play-link-list"') ||
    !state.text.includes('play-link-item') ||
    !state.text.includes('staticClass:"title"') ||
    !state.text.includes('._s(t.title)')
  ) {
    return;
  }

  // s("p",{staticClass:"title"},[
  //   e._v("\n              "+e._s(t.title)+"\n            ")
  // ])
  const playLinkTitleRenderRegex =
    /([A-Za-z_$][\w$]*)\("p",\{staticClass:"title"\},\[\s*([A-Za-z_$][\w$]*)\._v\(("(?:(?:\\.|[^"\\])*)")\+\2\._s\(([A-Za-z_$][\w$]*)\.title\)\+("(?:(?:\\.|[^"\\])*)")\)\s*\]\)/g;

  state.text = state.text.replace(playLinkTitleRenderRegex, (match, h, vm, before, item, after) => {
    state.changed++;
    state.total++;

    vueLogMappings(state.rel, playLinkTitleMappings);

    return `${h}("p",{staticClass:"title"},[${vm}._v(${before}+${vm}._s((${playLinkTitleMapLiteral}[${item}.title]||${item}.title))+${after})])`;
  });
}

// patchPlayTitleExpression
function vuePatchPlayTitleExpression(state, textMappings) {
  const playTitleExpressionMappings = textMappings.filter(m => m.patchPlayTitleExpression);
  if (playTitleExpressionMappings.length === 0) return;

  const playTitleExpressionMapLiteral = vueMakeMapLiteral(playTitleExpressionMappings);

  if (
    !state.text.includes("positionRespList") ||
    !state.text.includes('staticClass:"enter"') ||
    !state.text.includes('"enter-en"') ||
    !state.text.includes(".subtitle") ||
    !state.text.includes(".title")
  ) {
    return;
  }

  // 원본:
  // e._s("en"===e.locale?t.subtitle:t.title)
  const originalRe =
    /([A-Za-z_$][\w$]*)\._s\(("en"===[A-Za-z_$][\w$]*\.locale\?[A-Za-z_$][\w$]*\.subtitle:([A-Za-z_$][\w$]*)\.title)\)/g;

  state.text = state.text.replace(originalRe, (match, vm, expr, item) => {
    state.changed++;
    state.total++;

    vueLogMappings(state.rel, playTitleExpressionMappings);

    return `${vm}._s("en"===${vm}.locale?${item}.subtitle:(${playTitleExpressionMapLiteral}[${item}.title]||${item}.title))`;
  });

  // 이미 한 번 잘못 패치된 경우 복구:
  // e._s(({"旧map":...}["en"===e.locale?t.subtitle:t.title]||"en"===e.locale?t.subtitle:t.title))
  const alreadyPatchedRe =
    /([A-Za-z_$][\w$]*)\._s\(\(\{[^{}]*\}\[("en"===[A-Za-z_$][\w$]*\.locale\?[A-Za-z_$][\w$]*\.subtitle:([A-Za-z_$][\w$]*)\.title)\]\|\|\2\)\)/g;

  state.text = state.text.replace(alreadyPatchedRe, (match, vm, expr, item) => {
    state.changed++;
    state.total++;

    vueLogMappings(state.rel, playTitleExpressionMappings);

    return `${vm}._s("en"===${vm}.locale?${item}.subtitle:(${playTitleExpressionMapLiteral}[${item}.title]||${item}.title))`;
  });
}

// PatchGameMapName
function vuePatchGameMapName(state, textMappings) {
  const gameMapMappings = textMappings.filter(m => m.patchGameMapName);
  if (gameMapMappings.length === 0) return;

  const gameMapMapLiteral = vueMakeMapLiteral(gameMapMappings);

  if (
    !state.text.includes('staticClass:"game-map"') ||
    !state.text.includes(".gameMap")
  ) {
    return;
  }

  function mapExpr(expr) {
    return `(${gameMapMapLiteral}[${expr}]||${gameMapMapLiteral}[String(${expr}).trim()]||${expr})`;
  }

  // 원본:
  // s("span",{staticClass:"game-map"},[t._v(t._s(t.gameMap))])
  const gameMapRegex1 =
    /([A-Za-z_$][\w$]*)\("span",\{staticClass:"game-map"\},\[\s*([A-Za-z_$][\w$]*)\._v\(\2\._s\(([A-Za-z_$][\w$]*)\.gameMap\)\)\s*\]\)/g;

  state.text = state.text.replace(gameMapRegex1, (match, h, vm, item) => {
    state.changed++;
    state.total++;

    vueLogMappings(state.rel, gameMapMappings);

    const expr = `${item}.gameMap`;
    return `${h}("span",{staticClass:"game-map"},[${vm}._v(${vm}._s(${mapExpr(expr)}))])`;
  });

  // 이미 예전 방식으로 패치된 경우 복구:
  // s("span",{staticClass:"game-map"},[t._v(t._s(({"...":"..."}[t.gameMap]||t.gameMap)))])
  const alreadyPatchedRegex1 =
    /([A-Za-z_$][\w$]*)\("span",\{staticClass:"game-map"\},\[\s*([A-Za-z_$][\w$]*)\._v\(\2\._s\(\(\{[^{}]*\}\[([A-Za-z_$][\w$]*)\.gameMap\]\|\|\3\.gameMap\)\)\)\s*\]\)/g;

  state.text = state.text.replace(alreadyPatchedRegex1, (match, h, vm, item) => {
    state.changed++;
    state.total++;

    vueLogMappings(state.rel, gameMapMappings);

    const expr = `${item}.gameMap`;
    return `${h}("span",{staticClass:"game-map"},[${vm}._v(${vm}._s(${mapExpr(expr)}))])`;
  });

  // 혹시 공백 문자열이 붙은 형태:
  // s("span",{staticClass:"game-map"},[t._v(" "+t._s(t.gameMap))])
  const gameMapRegex2 =
    /([A-Za-z_$][\w$]*)\("span",\{staticClass:"game-map"\},\[\s*([A-Za-z_$][\w$]*)\._v\(("(?:(?:\\.|[^"\\])*)")\+\2\._s\(([A-Za-z_$][\w$]*)\.gameMap\)\)\s*\]\)/g;

  state.text = state.text.replace(gameMapRegex2, (match, h, vm, before, item) => {
    state.changed++;
    state.total++;

    vueLogMappings(state.rel, gameMapMappings);

    const expr = `${item}.gameMap`;
    return `${h}("span",{staticClass:"game-map"},[${vm}._v(${before}+${vm}._s(${mapExpr(expr)}))])`;
  });
}

// vuePatchRelativeTimeText, 친구 추가 탭의 ~분전 패치
function vuePatchRelativeTimeText(state) {
  if (
    !state.text.includes(".timeLine(") ||
    !state.text.includes("$style.stTime")
  ) {
    return;
  }

  const helper =
    `(function(v){` +
    `v=String(v==null?"":v).trim();` +
    `return v` +
    `.replace(/^(\\d+)天前$/,"$1일 전")` +
    `.replace(/^(\\d+)分钟前$/,"$1분 전")` +
    `.replace(/^(\\d+)小时前$/,"$1시간 전")` +
    `.replace(/^刚刚$/,"방금 전");` +
    `})`;

  const re =
    /([A-Za-z_$][\w$]*)\._s\(\1\.timeLine\(([^()]+?)\)\)/g;

  state.text = state.text.replace(re, (match, vm, arg) => {
    if (match.includes("function(v)")) return match;

    state.changed++;
    state.total++;

    log(`[${state.rel}] 친구 추가 탭 시간 텍스트 패치 완료`);

    return `${vm}._s(${helper}(${vm}.timeLine(${arg})))`;
  });
}

// Main Vue text patcher
function patchVueTextContext(files, mappings) {
  const contextMappings = mappings.filter(m => m.type === "context");
  const textMappings = mappings.filter(m => m.type === "text");

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
      total: 0
    };

    vuePatchEnumMappings(state, mappings); // 제거 
    vuePatchContextMappings(state, contextMappings); // 제거
    vuePatchRoundWinText(state); // 제거
    vuePatchBlacklistCountText(state, textMappings); // 제거
    vuePatchPanelTitleRender(state, textMappings);
    vuePatchAnchoredLiterals(state, textMappings);
    vuePatchTrimmedLiterals(state, textMappings);
    vuePatchSignalLocationRender(state, textMappings);
    vuePatchPlayLinkTitleRender(state, textMappings);
    vuePatchPlayTitleExpression(state, textMappings);
    vuePatchGameMapName(state, textMappings);
    vuePatchRelativeTimeText(state);
    if (state.changed > 0) {
      writeText(full, state.text);
      total += state.total;
    }
  }

  log(`[summary:vue-text-context] changed=${total}`);
}

// patchCustomerCenterDynamicText
function patchCustomerCenterDynamicText(files, dynamicRules = []) {
  function toUnicodeEscapedJsString(str) {
    return `"${str
      .split("")
      .map(ch => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"))
      .join("")}"`;
  }

  function makeMapLiteral(mappings) {
    return `{${mappings
      .map(([zh, ko]) => `${toUnicodeEscapedJsString(zh)}:${JSON.stringify(ko)}`)
      .join(",")}}`;
  }

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

    for (const rule of dynamicRules) {
      const mapLiteral = makeMapLiteral(rule.mappings);
      const pathRe = rule.objectPath.replace(/\./g, "\\.");

      // e._s(e.categoryInfo.entryTitle)
      // t._s(t.categoryInfo.entryTitle)
      // n._s(n.categoryInfo.propagandaTitle)
      // 앞 변수명과 뒤 변수명이 같은 경우만 잡음
      const re = new RegExp(
        `([A-Za-z_$][\\w$]*)\\._s\\(\\1\\.${pathRe}\\)`,
        "g"
      );

      text = text.replace(re, (match, vm) => {
        changed++;
        total++;

        for (const [zh, ko] of rule.mappings) {
          log(`[${rel}] ${zh} -> ${ko}`);
        }

        const expr = `${vm}.${rule.objectPath}`;
        return `${vm}._s((${mapLiteral}[${expr}]||${expr}))`;
      });
    }

    if (changed > 0) {
      writeText(full, text);
    }
  }

  log(`[summary:customer-center-dynamic-text] changed=${total}`);
}

// 문자열 전체가 정확히 일치할 때만 매핑
function patchStaticStringMappings(files, mappings = []) {
  const staticDebug = createStaticMappingDebugSession({
    enabled: DEBUG_MODE,
    mappings,
    patcherDir: PATCHER_DIR,
    unpackedDir: UNPACKED_DIR,
    readText,
    log
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

    for (let i = 0; i < mappings.length; i++) {
      const [zh, ko] = mappings[i];
      const z = escapeRegExp(zh);

      const re = new RegExp(`(["'\`])${z}\\1`, "g");

      text = text.replace(re, (match, quote) => {
        changed++;
        total++;

        staticDebug.record(rel, i, 1);

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
      "data:image/png;base64," + fs.readFileSync(img.newImagePath).toString("base64");

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

  patchVueTextContext(
    files,
    patchData.vueMappings
  );

  patchCustomerCenterDynamicText(
    files,
    patchData.dynamicRules
  );

  patchStaticStringMappings(
    files,
    patchData.staticMappings
  );

  patchInlineBase64Images(
    files,
    patchData.inlineImageMappings
  );

  patchImageAssets(
    patchData.imageAssetReplacements
  );

  debugCheckPatchMappings(files, {
    enabled: DEBUG_MODE,
    patcherDir: PATCHER_DIR,
    unpackedDir: UNPACKED_DIR,
    readText,
    log,
    mappingGroups: [
      {
        source: "vue.json",
        mappings: patchData.vueMappings.filter(
          item => item.zh && item.ko
        )
      }
    ]
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
    console.error("이 오류를 발견하셨다면 Midori 개발자에게 제보해 주세요!");
    console.error(BACKUP_ASAR);
    process.exit(1);
  }
}

main();