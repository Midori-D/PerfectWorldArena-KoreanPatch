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

const INSTALL_DIR = process.env.PWA_DIR || "C:\\Program Files (x86)\\perfectworldarena";
const APP_ASAR = path.join(INSTALL_DIR, "resources", "app.asar");

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
  INSTALL_DIR,
  "resources",
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
  log(`[info] install dir: ${INSTALL_DIR}`);

  if (!fs.existsSync(APP_ASAR)) {
    throw new Error(`app.asar not found: ${APP_ASAR}`);
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
        /^js\/pvp\.[^.]+(\.worker)?\.js$/.test(rel) ||
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

  // 예:
  // [r["b"].HomePage]:"首页"
  // [r['b'].ReturnRoom]:'返回房间'
  return new RegExp(
    `(\\[[\\s\\S]{0,160}\\.${k}\\]\\s*:\\s*)(["'\`])${z}\\2`,
    "g"
  );
}

function makeDirectKeyRegex(key, zh) {
  const k = escapeRegExp(key);
  const z = escapeRegExp(zh);

  // 예:
  // HomePage:"首页"
  // "HomePage":"首页"
  return new RegExp(
    `((?:^|[,{]\\s*)(?:(?:${k})|(?:"${k}")|(?:'${k}'))\\s*:\\s*)(["'\`])${z}\\2`,
    "g"
  );
}

function makeFieldRegex(field, zh) {
  const f = escapeRegExp(field);
  const z = escapeRegExp(zh);

  // 예:
  // label:"首页"
  // "label":"首页"
  // title:'返回房间'
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
    { key: "PersonalPage", zh: "数据", ko: "데이터" },
    { key: "CommunityPage", zh: "创意工坊", ko: "창작마당" },
    { key: "GroupCommunity", zh: "社交", ko: "소셜" },
    { key: "SocialPage", zh: "大厅", ko: "로비" },
    { key: "SeeSeeTV", zh: "PRO TV", ko: "PRO TV" },
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

// 상단 탭 패치
function patchTopLabelFields(files) {
  const mappings = [
    { field: "label", zh: "首页", ko: "홈" },
    { field: "label", zh: "排行榜", ko: "랭킹" },
    { field: "label", zh: "任务中心", ko: "미션 센터" },
    { field: "label", zh: "服饰室", ko: "의상실" },
    { field: "label", zh: "创意工坊", ko: "창작마당" },
    { field: "label", zh: "PRO TV", ko: "PRO TV" }
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

    for (const { field, zh, ko } of mappings) {
      const re = makeFieldRegex(field, zh);

      text = text.replace(re, (match, prefix, quote) => {
        changed++;
        total++;
        log(`[${rel}] ${zh} -> ${ko}`);
        return `${prefix}${quote}${ko}${quote}`;
      });
    }

    if (changed > 0) {
      writeText(full, text);
    }
  }

  log(`[summary:top-label-fields] changed=${total}`);
}

function patchSafeFieldMappings(files) {
  const mappings = [
    // 오른쪽 메뉴처럼 필드 기반으로 확인된 것만
    { field: "label", zh: "账户", ko: "계정" },
    { field: "label", zh: "道具", ko: "아이템" },
    { field: "label", zh: "设置", ko: "설정" },
    { field: "label", zh: "会员", ko: "회원" },
    { field: "label", zh: "正义", ko: "제재" },
    { field: "label", zh: "正义大厅", ko: "제재 센터" },

    { field: "name", zh: "账户", ko: "계정" },
    { field: "name", zh: "道具", ko: "아이템" },
    { field: "name", zh: "设置", ko: "설정" },
    { field: "name", zh: "会员", ko: "회원" },
    { field: "name", zh: "正义", ko: "제재" },

    { field: "title", zh: "平台设置", ko: "플랫폼 설정" },
    { field: "title", zh: "个人主页", ko: "개인 페이지" },
    { field: "title", zh: "我的战绩", ko: "내 전적" },

    { field: "text", zh: "意见反馈", ko: "의견 보내기" },
    { field: "text", zh: "客服反馈", ko: "고객센터/피드백" }
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

    for (const { field, zh, ko } of mappings) {
      const re = makeFieldRegex(field, zh);

      text = text.replace(re, (match, prefix, quote) => {
        changed++;
        total++;
        log(`[${rel}] ${zh} -> ${ko}`);
        return `${prefix}${quote}${ko}${quote}`;
      });
    }

    if (changed > 0) {
      writeText(full, text);
    }
  }

  log(`[summary:safe-field-mappings] changed=${total}`);
}

function patchVueTextContext(files) {
  const rules = [
    // 게임 시작 버튼: 화면에서 성공 확인
    {
      name: "start-game-button",
      from: "开始游戏",
      to: "게임 시작",
      regex: /(matchStateEnum\.NONE[\s\S]{0,240}?_v\(["'`])开始游戏(["'`]\))/g
    },

    // 오른쪽 하단 / 홈 버튼의 방 복귀는 더 자연스럽게
    {
      name: "return-room-button",
      from: "返回房间",
      to: "방 복귀하기",
      regex: /(matchStateEnum\.HASMATCH[\s\S]{0,260}?_v\(["'`])返回房间(["'`]\))/g
    },

    // 이미 enum 패치 등으로 방 복귀가 들어간 상태에서 버튼만 보정
    {
      name: "return-room-button-ko-adjust",
      from: "방 복귀",
      to: "방 복귀하기",
      regex: /(matchStateEnum\.HASMATCH[\s\S]{0,260}?_v\(["'`])방 복귀(["'`]\))/g
    }
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

    for (const rule of rules) {
      text = text.replace(rule.regex, (match, prefix, suffix) => {
        changed++;
        total++;
        log(`[${rel}] ${rule.from} -> ${rule.to}`);
        return `${prefix}${rule.to}${suffix}`;
      });
    }

    if (changed > 0) {
      writeText(full, text);
    }
  }

  log(`[summary:vue-text-context] changed=${total}`);
}

function patchExactStringLiteral(files) {
  const mappings = [
    ["关闭", "닫기"],
    ["确认", "확인"],
    ["确定", "확인"],
    ["取消", "취소"],
    ["继续", "계속"],
    ["比赛结束", "경기 종료"],
    ["个人主页", "개인 페이지"],
    ["平台设置", "플랫폼 설정"],
    ["我的战绩", "내 전적"]
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

function patchExactStringLiteralExtra(files) {
  const mappings = [
    ["Steam未登录", "Steam 로그인 필요"],
    ["房间号/昵称/SteamID", "방 번호/닉네임/SteamID"]
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

  log(`[summary:exact-string-literal-extra] changed=${total}`);
}

// Debug
function findRemaining(files) {
  const targets = [
    "首页",
    "排行榜",
    "任务中心",
    "返回房间",
    "离开房间",
    "正义大厅",
    "正义",
    "开始游戏"
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

    for (const target of targets) {
      const count = text.split(target).length - 1;

      if (count > 0) {
        total += count;
        remain(`[${rel}] ${target} remains x${count}`);
      }
    }
  }

  remain(`total remaining checked strings: ${total}`);
}

function applyPatches() {
  const files = walk(UNPACKED_DIR);
  log(`[info] target files: ${files.length}`);

  patchEnumMappings(files);
  patchTopLabelFields(files);
  patchSafeFieldMappings(files);
  patchVueTextContext(files);
  patchExactStringLiteral(files);
  patchExactStringLiteralExtra(files);

  findRemaining(files);
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