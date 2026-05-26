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
    { field: "text", zh: "客服反馈", ko: "고객센터/피드백" },

    { field: "label", zh: "首页", ko: "홈" },
    { field: "label", zh: "排行榜", ko: "랭킹" },
    { field: "label", zh: "任务中心", ko: "미션 센터" },
    { field: "label", zh: "服饰室", ko: "의상실" },
    { field: "label", zh: "创意工坊", ko: "창작마당" }
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
    {
      name: "start-game-button",
      from: "开始游戏",
      to: "게임 시작",
      regex: /(matchStateEnum\.NONE[\s\S]{0,240}?_v\(["'`])开始游戏(["'`]\))/g
    },

    {
      name: "return-room-button",
      from: "返回房间",
      to: "방 복귀하기",
      regex: /(matchStateEnum\.HASMATCH[\s\S]{0,260}?_v\(["'`])返回房间(["'`]\))/g
    },

    {
      name: "return-room-button-ko-adjust",
      from: "방 복귀",
      to: "방 복귀",
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

// 서버/캐시 데이터로 들어오는 문구를 화면 출력 직전에 한국어로 매핑
function patchCustomerCenterDynamicText(files) {
  const rules = [
    {
      from: "e._s(e.categoryInfo.entryTitle)",
      to: `e._s(({"游戏启动慢如何解决?":"게임 실행이 느릴 때 어떻게 하나요?","游戏启动慢如何解决？":"게임 실행이 느릴 때 어떻게 하나요?","游戏启动如何解决?":"게임 실행이 안 되나요?","游戏启动如何解决？":"게임 실행이 안 되나요?"}[e.categoryInfo.entryTitle]||e.categoryInfo.entryTitle))`,
      logFrom: "游戏启动慢如何解决?",
      logTo: "게임 실행이 느릴 때 어떻게 하나요?"
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
      if (!text.includes(rule.from)) continue;

      const count = text.split(rule.from).length - 1;
      text = text.split(rule.from).join(rule.to);

      for (let i = 0; i < count; i++) {
        changed++;
        total++;
        log(`[${rel}] ${rule.logFrom} -> ${rule.logTo}`);
      }
    }

    if (changed > 0) {
      writeText(full, text);
    }
  }

  log(`[summary:customer-center-dynamic-text] changed=${total}`);
}

// 문자열 전체가 정확히 일치할 때만 매핑
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
    ["我的战绩", "내 전적"],

    // 마우스를 갖다대면 나오는 글
    ["正在匹配天梯赛", "매칭 중"],
    ["正在进行天梯赛", "경기 진행 중"],

    // 메인 페이지
    ["Steam未登录", "Steam 로그인 필요"],
    ["房间号/昵称/SteamID", "방 번호/닉네임/SteamID"],
    ["前往查看详情>>", "자세히 보기>>"],
    ["系统检测您尚未登录Steam/蒸汽平台，请您开启并登录后重试", "Steam에 로그인되어 있지 않습니다. Steam을 실행하고 로그인한 뒤 다시 시도해 주세요."],
    ["完美战力未上榜", "완미 전투력 미랭크"],
    ["本周举报", "주간 신고"],
    ["已处理", "처리됨"],
    ["正义审核", "제재 심사"],
    ["已判决", "판정 완료"],
    ["待审核", "대기 중"],
    ["昨日封禁", "어제의 제재"],
    ["PAC封禁", "PAC 제재"],
    ["其他封禁", "기타 제재"],

    // 숙련도 페이지
    ["老兵玩家", "베테랑"],
    ["优秀", "우수"],
    ["老兵", "베테랑"]

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

// 프로필 번역
function patchProfileVueTextContext(files) {
  const mappings = [
    // 메인 페이지
    ["当前身份:", "현재 신분:"],
    ["信誉等级:", "신용 등급:"]
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
      if (!text.includes(zh)) continue;

      const count = text.split(zh).length - 1;
      text = text.split(zh).join(ko);

      for (let i = 0; i < count; i++) {
        changed++;
        total++;
        log(`[${rel}] ${zh} -> ${ko}`);
      }
    }

    if (changed > 0) {
      writeText(full, text);
    }
  }

  log(`[summary:profile-vue-text-context] changed=${total}`);
}

// 이미지 에셋 패치
function patchImageAssets() {
  const assetsDir = path.join(PATCHER_DIR, "assets");

  const imageMappings = [
    {
      from: path.join(assetsDir, "rabbit.8094b2dc.png"),
      to: path.join(UNPACKED_DIR, "static", "img", "rabbit.8094b2dc.png"),
      label: "rabbit.8094b2dc.png"
    },
    {
      from: path.join(assetsDir, "zl2026s1_1.d9ccaced.png"),
      to: path.join(UNPACKED_DIR, "static", "img", "zl2026s1_1.d9ccaced.png"),
      label: "zl2026s1_1.d9ccaced.png"
    },
    // 정의 평가단 이벤트 베너
    {
      from: path.join(assetsDir, "justice.e15ebd35.png"),
      to: path.join(UNPACKED_DIR, "static", "img", "justice.e15ebd35.png"),
      label: "justice.e15ebd35.png"
    },
    // 베테랑 아이콘
    {
      from: path.join(assetsDir, "green7.286d29d5.svg"),
      to: path.join(UNPACKED_DIR, "static", "img", "green7.286d29d5.svg"),
      label: "green7.286d29d5.svg"
    },
    // 베테랑 아이콘
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
  patchSafeFieldMappings(files); // 안전한 필드 번역
  patchVueTextContext(files); // Vue 렌더링 번역
  patchCustomerCenterDynamicText(files); // 서버/데이터에서 내려온 값을 출력 직전에 번역
  patchExactStringLiteral(files); // 정확한 문자열 리터럴 번역
  patchProfileVueTextContext(files); // 프로필 번역
  patchImageAssets(); // 이미지 리소스 교체
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