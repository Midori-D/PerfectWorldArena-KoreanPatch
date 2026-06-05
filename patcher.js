const fs = require("fs");
const path = require("path");

const PATCHER_DIR = __dirname;
const LOCAL_NODE_DIR = path.join(PATCHER_DIR, "tools", "node-v26.2.0-win-x64");
const LOCAL_ASAR_PATH = path.join(LOCAL_NODE_DIR, "node_modules", "asar");

let asar;
try {
  asar = require(LOCAL_ASAR_PATH);
} catch (err) {
  console.error("[error] asar 모듈을 찾을 수 없습니다.");
  console.error("[error] 아래 명령어를 먼저 실행해 주세요:");
  console.error(`"${path.join(LOCAL_NODE_DIR, "npm.cmd")}" install asar --prefix "${LOCAL_NODE_DIR}"`);
  throw err;
}

const PATH_FILE = path.join(PATCHER_DIR, "pwa_path.txt");

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

const INSTALL_DIR = readInstallDirFromTxt();
const RESOURCES_DIR = path.join(INSTALL_DIR, "resources");
const APP_ASAR = path.join(RESOURCES_DIR, "app.asar");
const APP_ASAR_UNPACKED = path.join(RESOURCES_DIR, "app.asar.unpacked");

const WORK_DIR = path.join(process.env.USERPROFILE || process.cwd(), "Desktop", "pwa_korean_patch_work");
const UNPACKED_DIR = path.join(WORK_DIR, "app_unpacked");
const PATCHED_ASAR = path.join(WORK_DIR, "app.patched.asar");
const LOG_DIR = path.join(WORK_DIR, "logs");

const nowTag = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .replace("T", "_")
  .slice(0, 19);

const BACKUP_ASAR = path.join(
  RESOURCES_DIR,
  `app.asar.koreanpatch_backup_${nowTag}`
);

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
    log("[warn] 앱에 따라 필요 없을 수도 있지만, 완미는 보통 app.asar.unpacked도 함께 있어야 합니다.");
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

function backupOriginal() {
  fs.copyFileSync(APP_ASAR, BACKUP_ASAR);
  log(`[backup] ${APP_ASAR} -> ${BACKUP_ASAR}`);
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

// 왼쪽 탭 패치
function patchEnumMappings(files) {
  const mappings = [
    { key: "HomePage", zh: "首页", ko: "홈" },
    { key: "CsgoRoom", zh: "玩", ko: "플레이" },
    { key: "ReturnRoom", zh: "返回房间", ko: "방 복귀" },
    { key: "CupPage", zh: "赛事", ko: "대회" },
    { key: "PersonalPage", zh: "数据", ko: "전적" },
    { key: "CommunityPage", zh: "创意工坊", ko: "창작마당" },
    { key: "GroupCommunity", zh: "社交", ko: "소셜" },
    { key: "SocialPage", zh: "大厅", ko: "로비" },
    { key: "JusticePage", zh: "正义大厅", ko: "제재 센터" },
    { key: "Justice", zh: "正义", ko: "제재" },
    { key: "ActivityPage", zh: "活动", ko: "이벤트" },

    { key: "TeamPage", zh: "战队", ko: "팀" },
    { key: "AssistPage", zh: "小助手", ko: "도우미" },
    { key: "Shop", zh: "商城", ko: "상점" },
    { key: "Guild", zh: "公会", ko: "길드" },
    { key: "Im", zh: "聊天", ko: "채팅" }
  ];

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

    for (const { key, zh, ko } of mappings) {
      for (const re of [makeEnumRegex(key, zh), makeDirectKeyRegex(key, zh)]) {
        text = text.replace(re, (match, prefix, quote) => {
          changed++;
          total++;
          log(`[${rel}] ${zh} -> ${ko}`);
          return `${prefix}${quote}${ko}${quote}`;
        });
      }
    }

    if (changed > 0) {
      writeText(full, text);
    }
  }

  log(`[summary:enum-mappings] changed=${total}`);
}

const VUE_TEXT_MAPPINGS = [
  // 런처 실행 페이지
  { type: "text", zh: "扫码登录", ko: "QR 로그인", patchTrimmedLiteral: true },
  { type: "text", zh: "使用手机自带扫码即可下载APP", ko: "휴대폰으로 스캔하여 앱 다운로드", patchTrimmedLiteral: true },
  { type: "text", zh: "前往认证", ko: "인증하러 가기", patchTrimmedLiteral: true },
  { type: "text", zh: "账号检测", ko: "계정 확인", patchTrimmedLiteral: true },

  // 메인 페이지
  {
    type: "context",
    from: "开始游戏",
    to: "게임 시작",
    regex: /(matchStateEnum\.NONE[\s\S]{0,240}?_v\(["'`])开始游戏(["'`]\))/g
  },
  {
    type: "context",
    from: "返回房间",
    to: "방 복귀하기",
    regex: /(matchStateEnum\.HASMATCH[\s\S]{0,260}?_v\(["'`])返回房间(["'`]\))/g
  },
  {
    type: "context",
    from: "匹配中...",
    to: "매칭 중...",
    regex: /(matchStateEnum\.MATCHING[\s\S]{0,260}?_v\(["'`])匹配中\.\.\.(["'`]\))/g
  },
  { type: "text", zh: "当前身份:", ko: "현재 신분:", patchTrimmedLiteral: true },
  { type: "text", zh: "信誉等级:", ko: "신뢰 등급:", patchTrimmedLiteral: true },
  { type: "text", zh: "完美助手", ko: "완미 도우미", patchPanelTitle: true },
  { type: "text", zh: "练枪服", ko: "연습 서버", patchPanelTitle: true },
  { type: "text", zh: "明星时刻", ko: "프로의 품격", patchPanelTitle: true },

  // 닫기 창
  { type: "text", zh: "随时查战绩、看回放", ko: "전적 확인·다시보기", patchTrimmedLiteral: true },

  // 런처 상단 작업표시줄
  { type: "text", zh: "华东", ko: "화동", patchSignalLocation: true },
  { type: "text", zh: "南方", ko: "남부", patchSignalLocation: true },
  { type: "text", zh: "西南", ko: "서남", patchSignalLocation: true },
  { type: "text", zh: "北方", ko: "북부", patchSignalLocation: true },
  { type: "text", zh: "检测中", ko: "검사 중", patchTrimmedLiteral: true },

  // 친구 탭
  { type: "text", zh: "黑名单", ko: "차단 목록", patchBlacklistCountText: true },
  { type: "text", zh: "实时观战", ko: "실시간 관전", patchTrimmedLiteral: true },
  
  { type: "text", zh: "炙热沙城Ⅱ", ko: "더스트Ⅱ", patchGameMapName: true },
  { type: "text", zh: "荒漠迷城", ko: "신기루", patchGameMapName: true },
  { type: "text", zh: "炼狱小镇", ko: "인페르노", patchGameMapName: true },
  { type: "text", zh: "核子危机", ko: "핵시설", patchGameMapName: true },
  { type: "text", zh: "远古遗迹", ko: "고대", patchGameMapName: true },
  { type: "text", zh: "阿努比斯", ko: "아누비스", patchGameMapName: true },
  { type: "text", zh: "殒命大厦", ko: "버티고", patchGameMapName: true },
  { type: "text", zh: "死亡游乐园", ko: "오버패스", patchGameMapName: true },
  { type: "text", zh: "死城之谜", ko: "무기창고", patchGameMapName: true },
  { type: "text", zh: "列车停放站", ko: "열차", patchGameMapName: true },

  // 플레이 진입 페이지
  { type: "text", zh: "竞技模式", ko: "경쟁 모드", patchPlayLinkTitle: true },
  { type: "text", zh: "练习模式", ko: "연습 모드", patchPlayLinkTitle: true },
  { type: "text", zh: "娱乐模式", ko: "캐주얼 모드", patchPlayLinkTitle: true },
  { type: "text", zh: "赛事约战", ko: "이벤트 매치", patchPlayLinkTitle: true },
  { type: "text", zh: "特训营", ko: "훈련장", patchPlayLinkTitle: true },
  { type: "text", zh: "社区服", ko: "커뮤니티", patchPlayLinkTitle: true },

  // 플레이 페이지 - 경쟁 모드
  { type: "text", zh: "天梯匹配", ko: "랭크 매칭", patchPlayTitleExpression: true },
  { type: "text", zh: "快速模式", ko: "빠른 매칭", patchPlayTitleExpression: true },
  { type: "text", zh: "官匹PRO", ko: "공식매칭 PRO", patchPlayTitleExpression: true },
  { type: "text", zh: "国服官匹", ko: "중국 서버 공식매칭", patchPlayTitleExpression: true },
  { type: "text", zh: "天梯单挑", ko: "랭크 1대1", patchPlayTitleExpression: true },
  { type: "text", zh: "天梯搭档", ko: "랭크 듀오", patchPlayTitleExpression: true },
  { type: "text", zh: "检测到本设备当前CFG配置信息未完成云备份", ko: "현재 기기의 CFG 설정이 클라우드에 백업되지 않았습니다.", patchTrimmedLiteral: true },
  { type: "text", zh: "招募列表", ko: "모집 목록", patchTrimmedLiteral: true },
  { type: "text", zh: "收起", ko: "접기", patchTrimmedLiteral: true }
];

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

  // 원본:
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

    // 닫는 괄호 "）" -> ")"
    const closeRe = new RegExp(
      `(blackUpperLimit\\)\\s*\\+\\s*)(["'\`])）`,
      "g"
    );

    state.text = state.text.replace(closeRe, (match, prefix, quote) => {
      return `${prefix}${quote})`;
    });
  }
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

  // 원본:
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

// 숫자+回合胜利 패치
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

// ===== Main Vue text patcher =====

function patchVueTextContext(files) {
  const contextMappings = VUE_TEXT_MAPPINGS.filter(m => m.type === "context");
  const textMappings = VUE_TEXT_MAPPINGS.filter(m => m.type === "text");

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

    vuePatchContextMappings(state, contextMappings);
    vuePatchPanelTitleRender(state, textMappings);
    vuePatchTrimmedLiterals(state, textMappings);
    vuePatchSignalLocationRender(state, textMappings);
    vuePatchBlacklistCountText(state, textMappings);
    vuePatchPlayLinkTitleRender(state, textMappings);
    vuePatchPlayTitleExpression(state, textMappings);
    vuePatchGameMapName(state, textMappings);
    vuePatchRoundWinText(state);
    if (state.changed > 0) {
      writeText(full, state.text);
      total += state.total;
    }
  }

  log(`[summary:vue-text-context] changed=${total}`);
}

// 서버/캐시 데이터로 들어오는 문구를 화면 출력 직전에 한국어로 매핑
function patchCustomerCenterDynamicText(files) {
  const dynamicRules = [
    {
      name: "customer-center-entry-title",
      expression: "e.categoryInfo.entryTitle",
      mappings: [
        ["游戏启动慢如何解决?", "게임 실행이 느릴 때 어떻게 하나요?"],
        ["游戏启动慢如何解决？", "게임 실행이 느릴 때 어떻게 하나요?"]
      ]
    },
    {
      name: "customer-center-propaganda-title",
      expression: "e.categoryInfo.propagandaTitle",
      mappings: [
        ["兔管答疑", "토끼상담"]
      ]
    }
  ];

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
      const from = `e._s(${rule.expression})`;
      const mapLiteral = makeMapLiteral(rule.mappings);
      const to = `e._s((${mapLiteral}[${rule.expression}]||${rule.expression}))`;

      if (!text.includes(from)) continue;

      const count = text.split(from).length - 1;
      text = text.split(from).join(to);

      for (let i = 0; i < count; i++) {
        changed++;
        total++;

        for (const [zh, ko] of rule.mappings) {
          log(`[${rel}] ${zh} -> ${ko}`);
        }
      }
    }

    if (changed > 0) {
      writeText(full, text);
    }
  }

  log(`[summary:customer-center-dynamic-text] changed=${total}`);
}

// 문자열 전체가 정확히 일치할 때만 매핑
function patchStaticStringMappings(files) {
  const mappings = [
    // 통합
    ["关闭", "닫기"],
    ["确认", "확인"],
    ["确定", "확인"],
    ["取消", "취소"],
    ["继续", "계속"],
    ["比赛结束", "경기 종료"],
    ["个人主页", "개인 페이지"],
    ["平台设置", "플랫폼 설정"],
    ["我的战绩", "내 전적"],
    [", 进入将会离开当前房间", ", 입장하면 현재 방에서 나가게 됩니다"],

    // 런처 실행 페이지
    ["正在检测当前客户端版本...", "버전 확인 중... with Ataks, Midori"],
    ["检测到新版本，正在更新...", "새 버전 감지, 업데이트 중..."],
    ["正在检测steam登录", "Steam 로그인 확인 중..."],
    ["点击头像登录", "프로필 로그인"],
    ["其他方式登录", "다른 방법으로 로그인"],
    ["登录中...", "로그인 중..."],
    ["我已阅读并同意", "동의 항목:"],
    ["用户协议", "이용약관"],
    ["和", "및"],
    ["个人信息保护政策", "개인정보처리방침"],
    ["完美世界电竞APP", "완미 e스포츠 앱"],
    ["返回快捷登录", "간편 로그인으로 돌아가기"],
    ["正在检测steam/蒸汽平台登录状态", "Steam 플랫폼 로그인 상태 확인 중"],
    ["账号检测异常，请前往steam重新登录认证", "계정 확인 중 문제가 발생했습니다. Steam에서 다시 인증해 주세요."],

    // 런처 상단 작업표시줄
    ["确定切换账号吗？", "계정을 전환하시겠습니까?"],
    ["消息中心", "알림 센터"],
    ["收起", "접기"],
    ["启动检测", "실행 환경 검사"],
    ["检测结果", "검사 결과"],
    ["您可以正常进行游戏", "정상적으로 게임을 진행할 수 있습니다."],
    ["关 闭", "닫기"],
    ["重新检测", "재검사"],

    // 닫기 창
    ["是否将平台最小化到托盘?", "플랫폼을 트레이로 최소화할까요?"],
    ["退出平台", "플랫폼 종료"], // 트레이 창 영향
    ["最小化", "최소화"],
    ["不再提醒", "다시 알리지 않음"],
    ["下载完美世界电竞APP", "완미세계 APP 다운로드"],
    ["随时查战绩、看回放", "언제든 전적 확인, 리플레이 시청"],

    // 메인 페이지
    ["Steam未登录", "Steam 로그인 필요"],
    ["房间号/昵称/SteamID", "방 번호/닉네임/SteamID"],
    ["前往查看详情>>", "자세히 보기>>"],
    ["系统检测您尚未登录Steam/蒸汽平台，请您开启并登录后重试", "Steam에 로그인되어 있지 않습니다. Steam을 실행하고 로그인한 뒤 다시 시도해 주세요."],
    ["当前steam/蒸汽平台登录账号与平台绑定账号不一致", "Steam 계정이 연동 계정과 일치하지 않습니다."],
    ["完美战力未上榜", "완미 전투력 미랭크"],
    ["点击右侧按钮升级绿色玩家", "녹색 계정으로 업그레이드"],
    ["账户", "계정"],
    ["道具", "아이템"],
    ["设置", "설정"],
    ["正义", "제재"],
    ["会员", "회원"],
    ["处理中", "처리 중"], // PAC 페이지에 영향
    ["今日封禁", "오늘의 신고"],
    ["本周举报", "주간 신고"],
    ["已处理", "처리됨"],
    ["正义审核", "제재 심사"],
    ["已判决", "판정 완료"],
    ["待审核", "대기 중"],
    ["昨日封禁", "어제의 제재"],
    ["PAC封禁", "PAC 제재"],
    ["其他封禁", "기타 제재"],
    ["开启优先匹配可获得官匹掉落哦！", "우선 매칭으로 공식서버 보상 획득!"],

    // 메인 상단 페이지
    ["首页", "홈"],
    ["排行榜", "랭킹"], // TOP LEAGUE의 상단 랭킹 탭도 영향
    ["任务中心", "미션 센터"],

    // 친구 탭
    ["在线", "ONLINE"],
    ["隐身", "OFFLINE"],
    ["搜索我的好友（昵称/备注）", "내 친구 검색(닉네임/메모)"],
    ["消息", "메시지"],
    ["联系人", "친구 목록"],
    ["我的好友", "내 친구"],
    ["正在游戏", "게임 중"],
    ["当前在线", "온라인"],
    ["离线", "오프라인"],
    ["黑名单", "차단 목록"],

    // 친구 탭 우클릭
    ["天梯模式", "랭크 매치"],
    ["练枪模式", "연습 매치"],
    ["发送消息", "메시지 보내기"],
    ["查看资料", "프로필 보기"],
    ["修改备注", "메모 수정"],
    ["删除好友", "친구 삭제"],
    ["拉黑好友", "친구 차단"],
    ["发起决斗", "결투 신청"],
    ["邀请房间", "방 초대하기"],
    ["加入房间", "방 참가"],
    ["加入游戏", "게임 참가"],

    // 플레이 페이지 통합
    ["房间号：", "방 번호:"],
    ["离开比赛房间", "나가기"],
    ["地图", "맵"],
    ["服务器", "서버"],

    // 플레이 페이지 - 경쟁 모드
    ["天梯匹配", "랭크 매칭"],
    ["快速模式", "빠른 매칭"],
    ["完美官匹PRO", "공식매칭PRO"],
    ["天梯单挑", "랭크 1대1"],
    ["天梯搭档", "랭크 듀오"],
    ["军团战争", "클랜전"],
    ["点击前往CFG配置→", "CFG 설정으로 이동 →"],
    ["指定地图", "맵 선택"],
    ["地图BP", "맵 밴픽"],
    ["模式全选", "전체선택"],
    ["匹配模式", "매칭모드"],
    ["今日幸运地图", "오늘 행운의 맵"],
    ["首胜奖励", "첫 승 보상"],
    ["未获得", "미획득"],
    ["快速练枪", "에임연습"],
    ["绝对单排", "솔로 전용"],
    ["绝对绿色", "녹계 전용"],
    ["开始匹配", "매치 시작"],
    ["赛前准备", "매치 준비"],

    // 녹색 인증 페이지
    ["绿色玩家", "녹색 계정"],
    ["绿色", "녹색"],
    ["玩家", "계정"], // 방 입장 자동채팅도 영향
    ["老兵玩家", "베테랑 계정"],
    ["新手玩家", "신규 계정"],
    ["优秀", "우수"],
    ["良好", "양호"],
    ["风险观察", "관찰 대상"],
    ["低优先", "낮은 우선순위"],
    ["较差", "불량"],

    // PAC 페이지
    ["违规行为封禁", "위반 행위로 인한 정지"],
    ["该用户因", "해당 사용자는"],
    ["已被系统封禁至", "사유로 시스템에 의해 다음 시각까지 제재되었습니다:"],
    ["于以下日期被系统封禁", "사유로 아래 날짜에 시스템에 의해 제재되었습니다."],
    ["已惩罚坐挂车队友", "핵 버스에 동행한 팀원이 제재되었습니다."],
    ["外挂作弊", "불법 프로그램 사용"],
    ["消极游戏", "비매너 플레이"],
    ["骚扰谩骂", "괴롭힘 및 욕설"],
    ["挂机", "잠수"],
    ["骚扰", "괴롭힘"],
    ["硬件异常", "하드웨어 이상"],
    ["破坏游戏秩序", "게임 질서 위반"],
    ["信誉等级过低", "낮은 신뢰도"],
    ["传播违规信息", "부적절한 정보 유포"],
    ["破坏游戏秩序-坐挂车", "게임 질서 위반 - 핵 버스 탑승"],
    ["小号炸鱼", "부계정 양학"],
    ["战绩异常", "비정상적인 전적"],
    ["游戏环境异常", "비정상적인 게임 환경"],
    ["账号异常", "비정상적인 계정"],
    ["使用DMA设备", "DMA 장비 사용"],
    ["游戏开始前被拦截", "매치 시작 전 차단됨"],
    ["恶意伤害队友", "고의 팀킬"],
    ["坐挂车", "핵 버스 탑승"],
    ["“正义可能会迟到,但从不会缺席”", "“정의는 늦을 수는 있어도, 결코 사라지지 않는다.”"],
    ["被禁止登陆，如有疑问咨询客服", "로그인이 금지되었습니다. 문의사항은 고객센터로 문의해 주세요"],

    // 마우스 오버
    ["正在匹配天梯赛", "매칭 중"], // 왼쪽 탭
    ["正在进行天梯赛", "경기 진행 중"], // 왼쪽 탭
    ["客服", "문의"], // 친구 탭
    ["显示房间号", "방 번호 표시"], // 플레이 페이지
    ["隐藏房间号", "방 번호 숨기기"], // 플레이 페이지
    ["仅可匹配到单排玩家", "솔로 플레이어만 매칭됩니다."], // 플레이 페이지
    ["仅可匹配到绿色认证玩家", "녹색 계정 플레이어만 매칭됩니다."], // 플레이 페이지
    ["小游戏", "미니게임"], // 플레이 페이지

    // 프로필 마우스 오버, 매치 결과 창에 영향
    ["心态超好", "멘탈 최고"],
    ["枪法神准", "에임 최고"],
    ["指挥得当", "지휘 능숙"],
    ["残局高手", "클러치 고수"],
    ["道具专业", "유틸 전문가"],
    ["擅长沟通", "소통왕"],
    ["暂未加入公会", "가입한 길드 없음"],

    // 알람 창
    ["获取地图列表失败", "지도 목록을 불러오지 못했습니다."],
    ["重试", "다시 시도"],
    ["当前登陆的Steam账号与平台账号不一致，请更换登录账号后再重试", "Steam 계정이 플랫폼 계정과 일치하지 않습니다. 계정을 변경한 후 다시 시도해 주세요."],
    ["当前Steam/蒸汽平台登录账号与平台绑定账号不一致", "Steam 계정이 플랫폼에 연동된 계정과 일치하지 않습니다."],
    ["您正在军团战争中, 进入将会离开当前房间", "현재 클랜전 중입니다. 입장하면 현재 방에서 나가게 됩니다."],

    // 상단 중앙 빨간색 글 알림 창
    ["请求失败", "요청 실패"],
    ["成功", "처리 완료"],
    ["获取本周举报信息失败", "신고 내역 불러오기 실패"],
    ["获取比赛状态超时", "매치 상태 확인 시간 초과"],
    ["请勿重复点击", "중복 클릭하지 마세요."],
    ["当前账号与steam账号不匹配！", "현재 계정과 Steam 계정이 일치하지 않습니다!"],
    ["请先登录steam/蒸汽平台", "먼저 Steam 계정에 로그인해 주세요."],
    ["观战体验次数已用完哦~成为大会员将刷新次数", "관전 체험 횟수를 모두 사용했습니다~ 회원이 되면 횟수가 갱신됩니다."], // 친구 창
    ["只有房间内全部为绿色认证玩家且信誉等级优秀才可选择", "방 안의 모든 플레이어가 녹색 계정이며 신뢰 등급이 우수해야 설정할 수 있습니다."], // 이하 플레이 창
    ["只有房主才能开始匹配", "방장만 매칭을 시작할 수 있습니다."],
    ["匹配中无法设置！", "매칭 중에는 설정할 수 없습니다!"],
    ["正在匹配中", "매칭 중"],
    ["匹配中无法修改地图！", "매칭 중에는 맵을 변경할 수 없습니다!"],
    ["匹配中无法修改大区！", "매칭 중에는 지역을 변경할 수 없습니다!"],
    ["匹配中无法切换房间！", "매칭 중에는 방을 변경할 수 없습니다!"],
    ["检测到您本地没有对应游戏地图", "로컬에 해당 게임 맵이 없습니다."],
    ["版本维护，暂无法跳转", "버전 점검 중이라 이동할 수 없습니다."],
    ["无法进入天梯", "랭크 방에 입장할 수 없습니다."], 
    ["没有足够的房间", "방이 부족합니다."],
    ["无效的请求参数", "잘못된 요청입니다."],
    ["不是队长", "방장이 아닙니다."],
    ["无效的请求", "잘못된 요청입니다."],
    ["玩家已经在匹配池或者在组队中", "플레이어가 이미 매칭 대기열 또는 파티에 있습니다."],

    // 상단 중앙 초록색 글 알림 창
    ["复制成功，快去邀请好友吧", "복사 완료! 친구를 초대해 보세요."],

    // 매치 결과 창
    ["顶级突破手", "엔트리왕"],
    ["枪响人亡", "원샷원킬"],
    ["一锤定音", "결정적 한방"],
    ["残局主宰者", "클러치 장인"],
    ["一人成军", "원맨쇼"],
    ["战场收割者", "사냥꾼"],
    ["应援之手", "지원의 손길"],
    ["无私队友", "헌신적 팀원"],
    ["比赛掌控者", "경기 지배자"],
    ["道具鬼才", "유틸 천재"],

    // 맵
    ["炙热沙城Ⅱ", "더스트 II"],
    ["荒漠迷城", "신기루"],
    ["炼狱小镇", "인페르노"],
    ["核子危机", "핵시설"],
    ["远古遗迹", "고대"],
    ["阿努比斯", "아누비스"],
    ["殒命大厦", "버티고"],
    ["死亡游乐园", "오버패스"],
    ["死城之谜", "무기창고"],
    ["列车停放站", "열차"]  // 어디가 바뀐지 모르겠음 확인 필요

  ];

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

    for (const [zh, ko] of mappings) {
      const z = escapeRegExp(zh);

      const re = new RegExp(`(["'\`])${z}\\1`, "g");

      text = text.replace(re, (match, quote) => {
        changed++;
        total++;
        log(`[${rel}] ${zh} -> ${ko}`);
        return `${quote}${ko}${quote}`;
      });
    }

    if (changed > 0) {
      writeText(full, text);
    }
  }

  log(`[summary:exact-string-literal] changed=${total}`);
}

// Base64로 인코딩된 이미지 패치
function patchInlineBase64Images(files) {
  const imageMappings = [
    // 마우스 오버 시 보이는 프로필
    {
      name: "data-v-68912e80",
      fromBase64Prefix: "iVBORw0KGgoAAAANSUhEUgAAAM8AAABqCAMAAAAsjvUw",
      newImagePath: path.join(__dirname, "assets", "data-v-68912e80.png")
    },
    // 메인화면 토끼
    {
      name: "index_rabbit_16sEq",
      fromBase64Prefix: "iVBORw0KGgoAAAANSUhEUgAAAFAAAABnCAMAAACgsDWK",
      newImagePath: path.join(__dirname, "assets", "index_rabbit_16sEq.png")
    },
    // 프로필 랭크 없음
    {
      name: "data-v-38d905a6",
      fromBase64Prefix: "iVBORw0KGgoAAAANSUhEUgAAAFEAAAAgCAMAAABdL2Rg",
      newImagePath: path.join(__dirname, "assets", "data-v-38d905a6.png")
    }
  ];

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
function patchImageAssets() {
  const assetsDir = path.join(PATCHER_DIR, "assets");

  const imageMappings = [
    // 런처 실행 페이지 스팀 로그인 아이콘
    {
      from: path.join(assetsDir, "steam_zh.7cd84a6e.svg"),
      to: path.join(UNPACKED_DIR, "static", "img", "steam_zh.7cd84a6e.svg"),
      label: "steam_zh.7cd84a6e.svg"
    },
    // 런처 실행 페이지 스팀 로그인 아이콘 2
    {
      from: path.join(assetsDir, "icon_undetected.2d4102e1.png"),
      to: path.join(UNPACKED_DIR, "static", "img", "icon_undetected.2d4102e1.png"),
      label: "icon_undetected.2d4102e1.png"
    },
    // 정의 평가단 이벤트 베너
    {
      from: path.join(assetsDir, "justice.e15ebd35.png"),
      to: path.join(UNPACKED_DIR, "static", "img", "justice.e15ebd35.png"),
      label: "justice.e15ebd35.png"
    },
    // 메인 화면 공식서버 아이콘
    {
      from: path.join(assetsDir, "gf.ca1c9e7d.svg"),
      to: path.join(UNPACKED_DIR, "static", "img", "gf.ca1c9e7d.svg"),
      label: "gf.ca1c9e7d.svg"
    },
    // 메인 화면 공식서버 아이콘 (클릭)
    {
      from: path.join(assetsDir, "gf-hover.8f4ccfe3.svg"),
      to: path.join(UNPACKED_DIR, "static", "img", "gf-hover.8f4ccfe3.svg"),
      label: "gf-hover.8f4ccfe3.svg"
    },
    // 베테랑 아이콘
    {
      from: path.join(assetsDir, "green7.286d29d5.svg"),
      to: path.join(UNPACKED_DIR, "static", "img", "green7.286d29d5.svg"),
      label: "green7.286d29d5.svg"
    },
    // 베테랑 아이콘 2
    {
      from: path.join(assetsDir, "green7.h.f4e4240c.svg"),
      to: path.join(UNPACKED_DIR, "static", "img", "green7.h.f4e4240c.svg"),
      label: "green7.h.f4e4240c.svg"
    }
  ];

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
  log(`[info] target files: ${files.length}`);

  patchEnumMappings(files);
  patchVueTextContext(files); // Vue 렌더링 번역
  patchCustomerCenterDynamicText(files); // 서버/데이터에서 내려온 값을 출력 직전에 번역
  patchStaticStringMappings(files);
  patchInlineBase64Images(files);
  patchImageAssets();
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
    backupOriginal();
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
    console.error("복구하려면 아래 백업 파일을 app.asar로 되돌리세요:");
    console.error(BACKUP_ASAR);
    process.exit(1);
  }
}

main();