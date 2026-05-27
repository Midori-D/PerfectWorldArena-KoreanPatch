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

function patchVueTextContext(files) {
  const mappings = [
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
      from: "방 복귀",
      to: "방 복귀",
      regex: /(matchStateEnum\.HASMATCH[\s\S]{0,260}?_v\(["'`])방 복귀(["'`]\))/g
    },
    {
      type: "text",
      zh: "完美助手",
      ko: "완미 도우미",
      patchPanelTitle: true
    },
    {
      type: "text",
      zh: "练枪服",
      ko: "연습 서버",
      patchPanelTitle: true
    },
    {
      type: "text",
      zh: "明星时刻",
      ko: "프로의 품격",
      patchPanelTitle: true
    },

    // 런처 상단 작업표시줄
    {
      type: "text",
      zh: "华东",
      ko: "화동",
      patchSignalLocation: true
    },
    {
      type: "text",
      zh: "南方",
      ko: "남부",
      patchSignalLocation: true
    },
    {
      type: "text",
      zh: "西南",
      ko: "서남",
      patchSignalLocation: true
    },
    {
      type: "text",
      zh: "北方",
      ko: "북부",
      patchSignalLocation: true
    },
    {
    type: "text",
    zh: "检测中",
    ko: "검사 중",
    patchTrimmedLiteral: true
    },

    // 친구 탭
    {
      type: "text",
      zh: "黑名单",
      ko: "차단 목록",
      patchBlacklistCountText: true
    },
  ];

  function toUnicodeEscapeLower(str) {
    return str
      .split("")
      .map(ch => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"))
      .join("");
  }

  function toUnicodeEscapeUpper(str) {
    return str
      .split("")
      .map(ch => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase())
      .join("");
  }

  function toUnicodeEscapedJsString(str) {
    return `"${toUnicodeEscapeLower(str)}"`;
  }

  const contextMappings = mappings.filter(m => m.type === "context");
  const textMappings = mappings.filter(m => m.type === "text");

  const panelTitleMapLiteral = `{${textMappings
    .filter(m => m.patchPanelTitle)
    .map(m => `${toUnicodeEscapedJsString(m.zh)}:${JSON.stringify(m.ko)}`)
    .join(",")}}`;

  const signalLocationMapLiteral = `{${textMappings
    .filter(m => m.patchSignalLocation)
    .map(m => `${toUnicodeEscapedJsString(m.zh)}:${JSON.stringify(m.ko)}`)
    .join(",")}}`;

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

    // 1. 기존 문맥 기반 패치
    for (const rule of contextMappings) {
      text = text.replace(rule.regex, (match, prefix, suffix) => {
        changed++;
        total++;
        log(`[${rel}] ${rule.from} -> ${rule.to}`);
        return `${prefix}${rule.to}${suffix}`;
      });
    }

    // 2. home-task 패널 제목 렌더링 패치
    // s("p",{class:e.$style["title"]},[e._v(e._s(t.title))])
    {
      const panelTitleRenderRegex =
        /([A-Za-z_$][\w$]*)\("p",\{class:([A-Za-z_$][\w$]*)\.\$style\["title"\]\},\[\2\._v\(\2\._s\(([A-Za-z_$][\w$]*)\.title\)\)\]\)/g;

      text = text.replace(panelTitleRenderRegex, (match, h, vm, panel) => {
        changed++;
        total++;

        for (const mapping of textMappings.filter(m => m.patchPanelTitle)) {
          log(`[${rel}] ${mapping.zh} -> ${mapping.ko}`);
        }

        return `${h}("p",{class:${vm}.$style["title"]},[${vm}._v(${vm}._s((${panelTitleMapLiteral}[${panel}.title]||${panel}.title)))])`;
      });
    }

    // 3. 공백/줄바꿈 포함 문자열 리터럴 패치
    // e._v("\n            华东\n          ")
    // "检测结果："
    // "\u534e\u4e1c"
    {
      const ws = String.raw`(?:(?:\\[nrt])|\s)*`;

      for (const mapping of textMappings.filter(m => m.patchTrimmedLiteral)) {
        const { zh, ko } = mapping;

        const variants = [
          zh,
          toUnicodeEscapeLower(zh),
          toUnicodeEscapeUpper(zh)
        ];

        for (const variant of variants) {
          const z = escapeRegExp(variant);

          const re = new RegExp(
            `(["'\`])(${ws})${z}(${ws})\\1`,
            "g"
          );

          text = text.replace(re, (match, quote, before, after) => {
            changed++;
            total++;
            log(`[${rel}] ${zh} -> ${ko}`);
            return `${quote}${before}${ko}${after}${quote}`;
          });
        }
      }
    }

    // 네트워크 상태 지역명 렌더링 패치
    // 실제 원본:
    // a("span",{staticClass:"city"},[
    //   a("i",{staticClass:"dot"}),
    //   e._v("\n            "+e._s(t.location)+"\n          ")
    // ])
    {
      const signalLocationRenderRegex =
        /([A-Za-z_$][\w$]*)\("span",\{staticClass:"city"\},\[\1\("i",\{staticClass:"dot"\}\),([A-Za-z_$][\w$]*)\._v\(("(?:(?:\\.|[^"\\])*)")\+\2\._s\(([A-Za-z_$][\w$]*)\.location\)\+("(?:(?:\\.|[^"\\])*)")\)\]\)/g;

      text = text.replace(signalLocationRenderRegex, (match, h, vm, before, item, after) => {
        changed++;
        total++;

        for (const mapping of textMappings.filter(m => m.patchSignalLocation)) {
          log(`[${rel}] ${mapping.zh} -> ${mapping.ko}`);
        }

        return `${h}("span",{staticClass:"city"},[${h}("i",{staticClass:"dot"}),${vm}._v(${before}+${vm}._s((${signalLocationMapLiteral}[${item}.location]||${item}.location))+${after})])`;
      });
    }

    // 블랙리스트 카운트 렌더링 패치
    // 원본 예:
    // e._v("\n                黑名单（"+e._s(e.blackList.length)+"/"+e._s(e.blackUpperLimit)+"）\n              ")
    {
      const blacklistCountMappings = textMappings.filter(m => m.patchBlacklistCountText);

      for (const mapping of blacklistCountMappings) {
        const zh = escapeRegExp(mapping.zh);
        const ko = mapping.ko;

        // "黑名单（" + ... 구조 패치
        const re = new RegExp(
          `(\\._v\\(\\s*)(["'\`])((?:(?:\\\\[nrt])|\\s)*)${zh}（\\2\\s*\\+`,
          "g"
        );

        text = text.replace(re, (match, prefix, quote, before) => {
          changed++;
          total++;
          log(`[${rel}] ${mapping.zh} -> ${mapping.ko}`);
          return `${prefix}${quote}${before}${ko} (${quote}+`;
        });

        // 닫는 괄호 "）" -> ")"
        // 예: +e._s(e.blackUpperLimit)+"）\n"
        const closeRe = new RegExp(
          `(blackUpperLimit\\)\\s*\\+\\s*)(["'\`])）`,
          "g"
        );

        text = text.replace(closeRe, (match, prefix, quote) => {
          return `${prefix}${quote})`;
        });
      }
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

    // 런처 실행 페이지
    ["正在检测当前客户端版本...", "버전 확인 중..."],
    ["正在检测steam登录", "Steam 로그인 확인 중..."],
    ["点击头像登录", "프로필 로그인"],
    ["其他方式登录", "다른 방법으로 로그인"],
    ["登录中...", "로그인 중..."],
    ["我已阅读并同意", "동의 항목:"],
    ["用户协议", "이용약관"],
    ["和", "및"],
    ["个人信息保护政策", "개인정보처리방침"],

    // 런처 상단 작업표시줄
    ["确定切换账号吗？", "계정을 전환하시겠습니까?"],
    ["消息中心", "알림 센터"],
    ["收起", "접기"],
    ["启动检测", "실행 환경 검사"],
    ["检测结果", "검사 결과"],
    ["您可以正常进行游戏", "정상적으로 게임을 진행할 수 있습니다"],
    ["关 闭", "닫기"],
    ["重新检测", "재검사"],

    // 메인 페이지
    ["Steam未登录", "Steam 로그인 필요"],
    ["房间号/昵称/SteamID", "방 번호/닉네임/SteamID"],
    ["前往查看详情>>", "자세히 보기>>"],
    ["系统检测您尚未登录Steam/蒸汽平台，请您开启并登录后重试", "Steam에 로그인되어 있지 않습니다. Steam을 실행하고 로그인한 뒤 다시 시도해 주세요."],
    ["完美战力未上榜", "완미 전투력 미랭크"],
    ["账户", "계정"],
    ["道具", "아이템"],
    ["设置", "설정"],
    ["正义", "제재"],
    ["会员", "회원"],
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
    ["排行榜", "랭킹"],
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

    // 숙련도 페이지
    ["绿色玩家", "녹색 계정"],
    ["绿色", "녹색"],
    ["玩家", "계정"],
    ["老兵玩家", "베테랑 계정"],
    ["新手玩家", "신규 계정"],
    ["优秀", "우수"],
    ["良好", "양호"],
    ["风险观察", "관찰 대상"],
    ["低优先", "낮은 우선순위"],
    ["较差", "불량"],

    // 마우스를 갖다대면 나오는 글
    ["正在匹配天梯赛", "매칭 중"],
    ["正在进行天梯赛", "경기 진행 중"]

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
  patchVueTextContext(files); // Vue 렌더링 번역
  patchCustomerCenterDynamicText(files); // 서버/데이터에서 내려온 값을 출력 직전에 번역
  patchStaticStringMappings(files); // 정확한 문자열 리터럴 번역
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