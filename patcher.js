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
    // 런처 실행 페이지
    {
      type: "text",
      zh: "扫码登录",
      ko: " QR 로그인",
      patchTrimmedLiteral: true
    },
    {
      type: "text",
      zh: "使用手机自带扫码即可下载APP",
      ko: "휴대폰으로 스캔하여 앱 다운로드",
      patchTrimmedLiteral: true
    },
    {
      type: "text",
      zh: "前往认证",
      ko: "인증하러 가기",
      patchTrimmedLiteral: true
    },
    {
      type: "text",
      zh: "账号检测",
      ko: "계정 확인",
      patchTrimmedLiteral: true
    },

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

    // 닫기 창
    {
      type: "text",
      zh: "随时查战绩、看回放",
      ko: "전적 확인·다시보기",
      patchTrimmedLiteral: true
    },

    // 런처 상단 작업표시줄 - 런처 상단만 영향
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
    {
      type: "text",
      zh: "实时观战",
      ko: "실시간 관전",
      patchTrimmedLiteral: true
    },

    // 플레이 진입 페이지
    {
      type: "text",
      zh: "竞技模式",
      ko: "경쟁 모드",
      patchPlayLinkTitle: true
    },
    {
      type: "text",
      zh: "练习模式",
      ko: "연습 모드",
      patchPlayLinkTitle: true
    },
    {
      type: "text",
      zh: "娱乐模式",
      ko: "캐주얼 모드",
      patchPlayLinkTitle: true
    },
    {
      type: "text",
      zh: "赛事约战",
      ko: "이벤트 매치",
      patchPlayLinkTitle: true
    },
    {
      type: "text",
      zh: "特训营",
      ko: "훈련장",
      patchPlayLinkTitle: true
    },
    {
      type: "text",
      zh: "社区服",
      ko: "커뮤니티",
      patchPlayLinkTitle: true
    },

    // 플레이 페이지 - 경쟁 모드
    {
      type: "text",
      zh: "天梯匹配",
      ko: "랭크 매칭",
      patchPlayTitleExpression: true
    },
    {
      type: "text",
      zh: "快速模式",
      ko: "빠른 매칭",
      patchPlayTitleExpression: true
    },
    {
      type: "text",
      zh: "官匹PRO",
      ko: "공식매칭 PRO",
      patchPlayTitleExpression: true
    },
    {
      type: "text",
      zh: "国服官匹",
      ko: "중국 서버 공식매칭",
      patchPlayTitleExpression: true
    },
    {
      type: "text",
      zh: "天梯单挑",
      ko: "랭크 1대1",
      patchPlayTitleExpression: true
    },
    {
      type: "text",
      zh: "天梯搭档",
      ko: "랭크 듀오",
      patchPlayTitleExpression: true
    }
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

    // 왼쪽 플레이 모드 탭 title 표시 전용 패치
    // 내부 title 값은 그대로 두고, 화면 출력만 한국어로 바꾼다.
    // 원본 예:
    // s("p",{staticClass:"title"},[
    //   e._v("\n              "+e._s(t.title)+"\n            ")
    // ])
    {
      const playLinkTitleMappings = textMappings.filter(m => m.patchPlayLinkTitle);

      if (playLinkTitleMappings.length > 0) {
        const playLinkTitleMapLiteral = `{${playLinkTitleMappings
          .map(m => `${toUnicodeEscapedJsString(m.zh)}:${JSON.stringify(m.ko)}`)
          .join(",")}}`;

        // 이 컴포넌트가 아닌 파일은 건드리지 않기 위한 안전장치
        if (
          text.includes('staticClass:"play-link-list"') &&
          text.includes('play-link-item') &&
          text.includes('staticClass:"title"') &&
          text.includes('._s(t.title)')
        ) {
          const playLinkTitleRenderRegex =
            /([A-Za-z_$][\w$]*)\("p",\{staticClass:"title"\},\[\s*([A-Za-z_$][\w$]*)\._v\(("(?:(?:\\.|[^"\\])*)")\+\2\._s\(([A-Za-z_$][\w$]*)\.title\)\+("(?:(?:\\.|[^"\\])*)")\)\s*\]\)/g;

          text = text.replace(playLinkTitleRenderRegex, (match, h, vm, before, item, after) => {
            changed++;
            total++;

            for (const mapping of playLinkTitleMappings) {
              log(`[${rel}] ${mapping.zh} -> ${mapping.ko}`);
            }

            return `${h}("p",{staticClass:"title"},[${vm}._v(${before}+${vm}._s((${playLinkTitleMapLiteral}[${item}.title]||${item}.title))+${after})])`;
          });
        }
      }
    }

    // 플레이 진입 페이지 세부 모드명 표시 전용 패치
    // p.enter 전체를 잡지 않고,
    // e._s("en"===e.locale?t.subtitle:t.title) 표현식만 안전하게 바꾼다.
    {
      const playTitleExpressionMappings = textMappings.filter(m => m.patchPlayTitleExpression);

      if (playTitleExpressionMappings.length > 0) {
        const playTitleExpressionMapLiteral = `{${playTitleExpressionMappings
          .map(m => `${toUnicodeEscapedJsString(m.zh)}:${JSON.stringify(m.ko)}`)
          .join(",")}}`;

        // 이 파일/컴포넌트 쪽에서만 작동하게 제한
        if (
          text.includes("positionRespList") &&
          text.includes('staticClass:"enter"') &&
          text.includes('"enter-en"') &&
          text.includes(".subtitle") &&
          text.includes(".title")
        ) {
          // 원본:
          // e._s("en"===e.locale?t.subtitle:t.title)
          const originalRe =
            /([A-Za-z_$][\w$]*)\._s\(("en"===[A-Za-z_$][\w$]*\.locale\?[A-Za-z_$][\w$]*\.subtitle:([A-Za-z_$][\w$]*)\.title)\)/g;

          text = text.replace(originalRe, (match, vm, expr, item) => {
            changed++;
            total++;

            for (const mapping of playTitleExpressionMappings) {
              log(`[${rel}] ${mapping.zh} -> ${mapping.ko}`);
            }

            return `${vm}._s("en"===${vm}.locale?${item}.subtitle:(${playTitleExpressionMapLiteral}[${item}.title]||${item}.title))`;
          });

          // 이미 한 번 잘못 패치된 경우 복구:
          // e._s(({"旧map":...}["en"===e.locale?t.subtitle:t.title]||"en"===e.locale?t.subtitle:t.title))
          const alreadyPatchedRe =
            /([A-Za-z_$][\w$]*)\._s\(\(\{[^{}]*\}\[("en"===[A-Za-z_$][\w$]*\.locale\?[A-Za-z_$][\w$]*\.subtitle:([A-Za-z_$][\w$]*)\.title)\]\|\|\2\)\)/g;

          text = text.replace(alreadyPatchedRe, (match, vm, expr, item) => {
            changed++;
            total++;

            for (const mapping of playTitleExpressionMappings) {
              log(`[${rel}] ${mapping.zh} -> ${mapping.ko}`);
            }

            return `${vm}._s("en"===${vm}.locale?${item}.subtitle:(${playTitleExpressionMapLiteral}[${item}.title]||${item}.title))`;
          });
        }
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
    ["平台设置", "플랫폼 설정"], // 트레이 창 영향
    ["我的战绩", "내 전적"],

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
    ["账号检测异常，请前往steam重新登录认证", "계정 확인 중 문제가 발생했습니다. Steam에서 다시 인증해 주세요"],

    // 런처 상단 작업표시줄
    ["确定切换账号吗？", "계정을 전환하시겠습니까?"],
    ["消息中心", "알림 센터"],
    ["收起", "접기"],
    ["启动检测", "실행 환경 검사"],
    ["检测结果", "검사 결과"],
    ["您可以正常进行游戏", "정상적으로 게임을 진행할 수 있습니다"],
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
    ["当前steam/蒸汽平台登录账号与平台绑定账号不一致", "Steam 계정이 연동 계정과 일치하지 않습니다"],
    ["完美战力未上榜", "완미 전투력 미랭크"],
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

    // 플레이 페이지 - 경쟁 모드
    ["天梯匹配", "랭크 매칭"],
    ["快速模式", "빠른 매칭"],
    ["完美官匹PRO", "공식매칭PRO"],
    ["天梯单挑", "랭크 1대1"],
    ["天梯搭档", "랭크 듀오"],
    ["军团战争", "클랜전"],
    ["房间号：", "방 번호:"],
    ["离开比赛房间", "나가기"],
    // ["招募列表", "모집 공고"],
    // ["收起", "접기"],

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
    ["于以下日期被系统封禁", "사유로 아래 날짜에 시스템에 의해 제재되었습니다"],
    ["已惩罚坐挂车队友", "핵 버스에 동행한 팀원이 제재되었습니다"],
    ["破坏游戏秩序", "게임 질서 위반"],
    ["信誉等级过低", "낮은 신뢰도"],
    ["骚扰谩骂", "괴롭힘 및 욕설"],
    ["传播违规信息", "부적절한 정보 유포"],
    ["外挂作弊", "불법 프로그램 사용"],
    ["破坏游戏秩序-坐挂车", "게임 질서 위반 - 핵 버스 탑승"],
    ["小号炸鱼", "부계정 양학"],
    ["战绩异常", "비정상적인 전적"],
    ["游戏环境异常", "비정상적인 게임 환경"],
    ["账号异常", "비정상적인 계정"],
    ["使用DMA设备", "DMA 장비 사용"],
    ["游戏开始前被拦截", "매치 시작 전 차단됨"],
    ["“正义可能会迟到,但从不会缺席”", "“정의는 늦을 수는 있어도, 결코 사라지지 않는다”"],

    // 마우스 오버
    ["正在匹配天梯赛", "매칭 중"], // 왼쪽 탭
    ["正在进行天梯赛", "경기 진행 중"], // 왼쪽 탭
    ["客服", "문의"], // 친구 탭

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
    ["观战体验次数已用完哦~成为大会员将刷新次数", "관전 체험 횟수를 모두 사용했습니다~ 회원이 되면 횟수가 갱신됩니다."],
    ["当前账号与steam账号不匹配！", "현재 계정과 Steam 계정이 일치하지 않습니다!"],
    ["请先登录steam/蒸汽平台", "먼저 Steam 계정에 로그인해 주세요"],
    ["无法进入天梯", "랭크 방에 입장할 수 없습니다"],

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
    ["死城之谜", "무기창고"],
    ["炙热沙城Ⅱ", "더스트 II"],
    ["炼狱小镇", "인페르노"],
    ["荒漠迷城", "신기루"],
    ["核子危机", "핵시설"],
    ["死亡游乐园", "오버패스"],
    ["列车停放站", "열차"],
    ["殒命大厦", "버티고"],
    ["远古遗迹", "고대"],
    ["阿努比斯", "아누비스"] // 어디가 바뀐지 모르겠음 확인 필요

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

// Base64로 인코딩된 이미지 데이터 패치
function patchInlineBase64Images(files) {
  const imageMappings = [
    {
      name: "profile-stat-label-image",
      fromBase64Prefix: "iVBORw0KGgoAAAANSUhEUgAAAM8AAABqCAMAAAAsjvUw",
      newImagePath: path.join(__dirname, "assets", "profile-stat-ko.png")
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
    // 메인 화면 상단 이벤트 아이콘 - 주기적으로 바뀜
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
  patchStaticStringMappings(files); // 정확한 문자열 리터럴 번역
  patchInlineBase64Images(files); // Base64로 인코딩된 이미지 데이터 번역
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