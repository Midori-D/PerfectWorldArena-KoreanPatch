"use strict";

// Tools
function vueToUnicodeEscapeLower(str) {
  return String(str)
    .split("")
    .map((ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("");
}

function vueToUnicodeEscapeUpper(str) {
  return String(str)
    .split("")
    .map(
      (ch) =>
        "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase(),
    )
    .join("");
}

function vueToUnicodeEscapedJsString(str) {
  return `"${vueToUnicodeEscapeLower(str)}"`;
}

function vueMakeMapLiteral(mappings) {
  return `{${mappings
    .map(
      (mapping) =>
        `${vueToUnicodeEscapedJsString(mapping.zh)}:` +
        `${JSON.stringify(mapping.ko)}`,
    )
    .join(",")}}`;
}

function vueLogMappings(log, rel, mappings, patchName = "") {
  for (const mapping of mappings) {
    const typeLabel =
      mapping.type === "text" ? "Text" : mapping.type || "Mapping";

    const category = patchName
      ? `${typeLabel}, ${patchName}`
      : typeLabel;

    log(`[${rel}] ${category} ${mapping.zh} -> ${mapping.ko}`);
  }
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// "type": "text", "patchLiteral": true
// Literal 통합 패치
function vuePatchLiteralRules(state, textMappings, log) {
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

        vueLogMappings(log, state.rel, [rule], "patchLiteral");

        return `${quote}${before}${to}${after}${quote}`;
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

// "type": "text", "patchMainTab": true
// MainTab 패치
function vuePatchMainTab(state, textMappings, log) {
  const MainTabMappings = textMappings.filter(
    (mapping) => mapping.patchMainTab,
  );

  if (MainTabMappings.length === 0) {
    return;
  }

  if (
    !state.text.includes("dynamic-mode__item") ||
    !state.text.includes("dynamic-mode__title")
  ) {
    return;
  }

  const MainTabMapLiteral = vueMakeMapLiteral(MainTabMappings);

  // n("p",{class:e.$style["dynamic-mode__title"]},[e._v(e._s(t.title))])
  const mainTabRenderRegex =
    /([A-Za-z_$][\w$]*)\(\s*["']p["']\s*,\s*\{\s*class\s*:\s*([A-Za-z_$][\w$]*)\.\$style\[\s*["']dynamic-mode__title["']\s*\]\s*\}\s*,\s*\[\s*\2\._v\(\s*\2\._s\(\s*([A-Za-z_$][\w$]*)\.title\s*\)\s*\)\s*\]\s*,?\s*\)/g;

  state.text = state.text.replace(mainTabRenderRegex, (match, h, vm, item) => {
    state.changed++;
    state.total++;

    vueLogMappings(log, state.rel, MainTabMappings, "patchMainTab");

    return (
      `${h}("p",{class:${vm}.$style["dynamic-mode__title"]},[` +
      `${vm}._v(${vm}._s((` +
      `${MainTabMapLiteral}[${item}.title]||` +
      `${item}.title)))])`
    );
  });
}

// "type": "text", "patchCheatingReportLabel": true
// MainTab PAC 패치
function vuePatchCheatingReportLabel(state, textMappings, log) {
  const cheatingReportMappings = textMappings.filter(
    (mapping) =>
      mapping.patchCheatingReportLabel === true && mapping.zh && mapping.ko,
  );

  if (cheatingReportMappings.length === 0) {
    return;
  }

  if (
    !state.text.includes("cheating-report__label") ||
    !state.text.includes("showToday") ||
    !state.text.includes('"今日"') ||
    !state.text.includes('"昨日"')
  ) {
    return;
  }

  const mapLiteral = vueMakeMapLiteral(cheatingReportMappings);

  // e._v("\n        PAC"+ e._s(e.showToday?"今日":"昨日")+ "封禁\n      ")
  // e._v("\n        其他"+ e._s(e.showToday?"今日":"昨日")+ "封禁\n      ")
  const labelRenderRegex =
    /([A-Za-z_$][\w$]*)\._v\(\s*("(?:\\.|[^"\\])*?(PAC|其他)")\s*\+\s*\1\._s\(\s*\1\.showToday\s*\?\s*"今日"\s*:\s*"昨日"\s*\)\s*\+\s*("封禁(?:\\.|[^"\\])*")\s*\)/g;

  let changed = 0;

  state.text = state.text.replace(
    labelRenderRegex,
    (match, vm, beforeLiteral, label, afterLiteral) => {
      let before;
      let after;

      try {
        before = JSON.parse(beforeLiteral);
        after = JSON.parse(afterLiteral);
      } catch {
        return match;
      }

      if (!before.endsWith(label) || !after.startsWith("封禁")) {
        return match;
      }

      const leading = before.slice(0, -label.length);
      const trailing = after.slice("封禁".length);

      const zhExpression =
        `${JSON.stringify(label)}+` +
        `(${vm}.showToday?"今日":"昨日")+` +
        `"封禁"`;

      changed++;
      state.changed++;
      state.total++;

      return (
        `${vm}._v(${JSON.stringify(leading)}+` +
        `${vm}._s((` +
        `${mapLiteral}[${zhExpression}]||` +
        `${zhExpression}` +
        `))+${JSON.stringify(trailing)})`
      );
    },
  );

  vueLogMappings(log, state.rel, cheatingReportMappings, `patchCheatingReportLabel, changed=${changed}`);
}

// "type": "text", "patchFriendMapName": true
// 친구 탭 MapName 패치
function vuePatchFriendMapName(state, textMappings, log) {
  const gameMapMappings = textMappings.filter(
    (mapping) =>
      mapping &&
      mapping.patchFriendMapName === true &&
      mapping.zh &&
      mapping.ko,
  );

  if (
    gameMapMappings.length === 0 ||
    !state.text.includes('staticClass:"game-map"') ||
    !state.text.includes(".gameMap")
  ) {
    return;
  }

  const gameMapMapLiteral = vueMakeMapLiteral(gameMapMappings);

  //s("span",{staticClass:"game-map"},[t._v(t._s(t.gameMap))
  const gameMapRegex =
    /([A-Za-z_$][\w$]*)\("span",\{staticClass:"game-map"\},\[\s*([A-Za-z_$][\w$]*)\._v\(\2\._s\(([\s\S]*?)\)\)\s*\]\)/g;

  let changed = 0;

  state.text = state.text.replace(
    gameMapRegex,
    (match, h, vm, oldExpression) => {
      const expressionMatch =
        /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.gameMap)\b/.exec(
          oldExpression,
        );

      if (!expressionMatch) {
        return match;
      }

      const expression = expressionMatch[1];

      const mappedExpression =
        `(${gameMapMapLiteral}` +
        `[String(${expression}).trim()]||` +
        `${expression})`;

      const replacement =
        `${h}("span",{staticClass:"game-map"},[` +
        `${vm}._v(${vm}._s(${mappedExpression}))])`;

      if (replacement === match) {
        return match;
      }

      changed++;

      return replacement;
    },
  );

  if (changed === 0) {
    return;
  }

  state.changed += changed;
  state.total += changed;

  vueLogMappings(log, state.rel, gameMapMappings, `patchFriendMapName, changed=${changed}`);
}

// "type": "text", "patchPlaySidebarTitle": true
// 플레이 페이지 좌측 Title 패치
function vuepatchPlaySidebarTitle(state, textMappings, log) {
  const playSidebarTitleMappings = textMappings.filter(
    (mapping) => mapping.patchPlaySidebarTitle,
  );

  if (playSidebarTitleMappings.length === 0) {
    return;
  }

  const playSidebarTitleMapLiteral = vueMakeMapLiteral(playSidebarTitleMappings);

  if (
    !state.text.includes('staticClass:"play-link-list"') ||
    !state.text.includes("play-link-item") ||
    !state.text.includes('staticClass:"title"') ||
    !state.text.includes("._s(t.title)")
  ) {
    return;
  }

  // s("p",{staticClass:"title"},[e._v("\n              "+e._s(t.title)+"\n            ")])
  const playSidebarTitleRenderRegex =
    /([A-Za-z_$][\w$]*)\("p",\{staticClass:"title"\},\[\s*([A-Za-z_$][\w$]*)\._v\(("(?:(?:\\.|[^"\\])*)")\+\2\._s\(([A-Za-z_$][\w$]*)\.title\)\+("(?:(?:\\.|[^"\\])*)")\)\s*\]\)/g;

  state.text = state.text.replace(
    playSidebarTitleRenderRegex,
    (match, h, vm, before, item, after) => {
      state.changed++;
      state.total++;

      vueLogMappings(log, state.rel, playSidebarTitleMappings, "patchPlaySidebarTitle");

      return (
        `${h}("p",{staticClass:"title"},[` +
        `${vm}._v(${before}+${vm}._s((` +
        `${playSidebarTitleMapLiteral}[${item}.title]||` +
        `${item}.title))+${after})])`
      );
    },
  );
}

// "type": "text", "patchPlayModeTitle": true
// 플레이 페이지 진입 Title 패치
function vuePatchPlayModeTitle(state, textMappings, log) {
  const mappings = textMappings.filter(
    (mapping) => mapping.patchPlayModeTitle,
  );

  if (mappings.length === 0) {
    return;
  }

  const mapLiteral = vueMakeMapLiteral(mappings);

  const replaceTitleExpression = (regex) => {
    state.text = state.text.replace(regex, (match, vm, dataExpression) => {
      state.changed++;
      state.total++;

      vueLogMappings(log, state.rel, mappings, "patchPlayModeTitle");

      return (
        `${vm}._s("en"===${vm}.locale?` +
        `${dataExpression}.subtitle:(` +
        `${mapLiteral}[${dataExpression}.title]||` +
        `${dataExpression}.title))`
      );
    });
  };

  // e._s("en"===e.locale?e.currentData.subtitle:e.currentData.title)
  if (
    state.text.includes('staticClass:"play-content-title"') &&
    state.text.includes(".currentData.subtitle") &&
    state.text.includes(".currentData.title")
  ) {
    const currentTitleExpressionRe =
      /([A-Za-z_$][\w$]*)\._s\("en"===\1\.locale\?([A-Za-z_$][\w$]*\.currentData)\.subtitle:\2\.title\)/g;

    replaceTitleExpression(currentTitleExpressionRe);
  }

  // e._s("en"===e.locale?t.subtitle:t.title)
  if (
    state.text.includes("positionRespList") &&
    state.text.includes('staticClass:"enter"') &&
    state.text.includes('"enter-en"')
  ) {
    const enterTitleExpressionRe =
      /([A-Za-z_$][\w$]*)\._s\("en"===\1\.locale\?([A-Za-z_$][\w$]*)\.subtitle:\2\.title\)/g;

    replaceTitleExpression(enterTitleExpressionRe);
  }
}

// "type": "text", "patchPlayModeDescription": true
// 플레이 페이지 Description 패치
function vuePatchPlayModeDescription(state, textMappings, log) {
  const mappings = textMappings.filter(
    (mapping) =>
      mapping.patchPlayModeDescription === true &&
      typeof mapping.zh === "string" &&
      mapping.zh.length > 0 &&
      typeof mapping.ko === "string",
  );

  if (mappings.length === 0) {
    return;
  }

  if (
    !state.text.includes('staticClass:"play-content-desc"') ||
    !state.text.includes('staticClass:"desc"') ||
    !state.text.includes(".currentData.desc")
  ) {
    return;
  }

  // 매핑과 API 문장의 공백 형태를 동일하게 맞춘다.
  const normalizedMappings = mappings.map((mapping) => ({
    ...mapping,
    zh: mapping.zh
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  }));

  const mapLiteral = vueMakeMapLiteral(normalizedMappings);

  /*
   * API 설명의 HTML을 임시 요소에 넣어 엔티티를 해석한다.
   *
   * 예:
   * &ldquo;热浪争锋&rdquo; → “热浪争锋”
   * &nbsp;                → 일반 공백
   */
  const translateHtmlExpression =
    `(function(v,m){` +
    `v=String(v==null?"":v);` +
    `var d=document.createElement("div");` +
    `d.innerHTML=v;` +
    `var k=String(d.textContent||"")` +
    `.replace(/\\u00a0/g," ")` +
    `.replace(/\\s+/g," ")` +
    `.trim();` +
    `var t=m[k];` +
    `if(t===void 0)return v;` +
    `if(d.children.length===1){` +
    `d.children[0].textContent=t;` +
    `return d.innerHTML` +
    `}` +
    `return t` +
    `})`;

  // 원본:
  // innerHTML:e._s(e.currentData.desc)
  const descriptionRe =
    /(staticClass:"desc"\s*,\s*domProps:\{\s*innerHTML:)([A-Za-z_$][\w$]*)\._s\((\2\.currentData\.desc)\)(\s*\}\s*\})/g;

  let changed = 0;

  state.text = state.text.replace(
    descriptionRe,
    (match, before, vm, descriptionExpression, after) => {
      changed++;
      state.changed++;
      state.total++;

      return (
        `${before}${vm}._s(` +
        `${translateHtmlExpression}(` +
        `${descriptionExpression},${mapLiteral}` +
        `))${after}`
      );
    },
  );

  if (changed === 0) {
    return;
  }

  vueLogMappings(
    log,
    state.rel,
    mappings,
    `patchPlayModeDescription, changed=${changed}`,
  );
}

// patchMapSelectName
function vuePatchMapSelectName(state, textMappings, log) {
  const mapSelectMappings = textMappings.filter(
    (mapping) =>
      mapping.patchMapSelectName === true &&
      typeof mapping.zh === "string" &&
      typeof mapping.ko === "string",
  );

  if (mapSelectMappings.length === 0) {
    return;
  }

  // 맵 선택 창에서 사용하는 Vue 필터
  if (!state.text.includes('._f("mapName")(')) {
    return;
  }

  const mapLiteral = vueMakeMapLiteral(mapSelectMappings);

  function mapExpr(expr) {
    return (
      `(${mapLiteral}[${expr}]||` +
      `${mapLiteral}[String(${expr}).trim()]||` +
      `${expr})`
    );
  }

  /*
   * 원본:
   * e._s(e._f("mapName")(t["name_"+e.locale]))
   *
   * 또는:
   * e._s(
   *   e._f("mapName")(
   *     e.currentLuckyMap["name_"+e.locale]
   *   )
   * )
   */
  const mapSelectNameRegex =
    /([A-Za-z_$][\w$]*)\._s\(\1\._f\("mapName"\)\(([^()]+)\)\)/g;

  state.text = state.text.replace(
    mapSelectNameRegex,
    (match, vm, sourceExpr) => {
      state.changed++;
      state.total++;

      vueLogMappings(log, state.rel, mapSelectMappings);

      const filteredExpr = `${vm}._f("mapName")(${sourceExpr})`;

      return `${vm}._s(` + `${mapExpr(filteredExpr)}` + `)`;
    },
  );
}

// patchServerLocationName
function vuePatchServerLocationName(state, textMappings, log) {
  const serverLocationMappings = textMappings.filter(
    (mapping) =>
      mapping.patchServerLocationName === true &&
      typeof mapping.zh === "string" &&
      typeof mapping.ko === "string",
  );

  if (serverLocationMappings.length === 0) {
    return;
  }

  // 원본 코드에 이 필터가 없으면 처리하지 않음
  if (!state.text.includes('._f("returnServerLocle")(')) {
    return;
  }

  const mapLiteral = vueMakeMapLiteral(serverLocationMappings);

  function mapExpr(expr) {
    return (
      `(${mapLiteral}[${expr}]||` +
      `${mapLiteral}[String(${expr}).trim()]||` +
      `${expr})`
    );
  }

  /*
   * 원본:
   *
   * e._s(
   *   e._f("returnServerLocle")(
   *     t.location,
   *     e.locale
   *   )
   * )
   */
  const serverLocationRegex =
    /([A-Za-z_$][\w$]*)\._s\(\1\._f\("returnServerLocle"\)\(([^()]*)\)\)/g;

  state.text = state.text.replace(
    serverLocationRegex,
    (match, vm, filterArgs) => {
      state.changed++;
      state.total++;

      vueLogMappings(log, state.rel, serverLocationMappings);

      const filteredExpr = `${vm}._f("returnServerLocle")` + `(${filterArgs})`;

      return `${vm}._s(` + `${mapExpr(filteredExpr)}` + `)`;
    },
  );
}

// 변수 포함 템플릿 문자열 패치
function vuePatchVariableText(state, mappings, log) {
  const rules = mappings.filter(
    (rule) =>
      rule &&
      rule.type === "variableText" &&
      rule.profile === "template" &&
      Array.isArray(rule.source) &&
      Array.isArray(rule.target),
  );

  if (rules.length === 0 || !state.text.includes("${")) {
    return;
  }

  for (const rule of rules) {
    let ruleChanged = 0;
    const variableNames = [];

    const sourcePattern = rule.source
      .map((part) => {
        const match = /^\$\{var(\d+)\}$/.exec(part);

        if (match) {
          variableNames.push(`var${match[1]}`);

          return `(\\$\\{(?:[^{}]|\\{[^{}]*\\})+\\})\\s*`;
        }

        return `${escapeRegExp(part)}\\s*`;
      })
      .join("");

    const prefixPattern = rule.anchor
      ? `(${escapeRegExp(rule.anchor)}\\s*:\\s*\`)`
      : "(`)";

    const re = new RegExp(prefixPattern + sourcePattern + "(`)", "g");

    state.text = state.text.replace(re, (...args) => {
      const prefix = args[1];
      const variables = args.slice(2, 2 + variableNames.length);
      const suffix = args[2 + variableNames.length];

      const variableMap = {};

      variableNames.forEach((name, index) => {
        variableMap[name] = variables[index];
      });

      const result = rule.target
        .map((part) => {
          const match = /^\$\{var(\d+)\}$/.exec(part);

          if (match) {
            return variableMap[`var${match[1]}`] || "";
          }

          return part;
        })
        .join("");

      ruleChanged++;
      state.changed++;
      state.total++;

      return prefix + result + suffix;
    });

    if (ruleChanged > 0) {
      vueLogMappings(
        log,
        state.rel,
        [
          {
            zh: rule.source.join(""),
            ko: rule.target.join(""),
          },
        ],
        `VariableText, template, changed=${ruleChanged}`,
      );
    }
  }
}

// 경기 후 분석판 문장 끝 중국식 마침표 패치
function vuePatchPostMatchBoardPeriod(state, log) {
  if (
    !state.text.includes("打开赛后板") &&
    !state.text.includes("경기 후 분석판 열기")
  ) {
    return;
  }

  const re =
    /(打开赛后板|경기 후 분석판 열기)(["'`]\)\]\),[a-zA-Z_$][\w$]*\._v\(["'`])。(["'`]\))/g;

  state.text = state.text.replace(re, (match, text, middle, suffix) => {
    state.changed++;
    state.total++;

    log(`[${state.rel}] post match board period: 。 -> .`);

    return `${text}${middle}.${suffix}`;
  });
}

// 친구 신청 탭 패치
function vuePatchRelativeTimeText(state, log) {
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

  const re = /([A-Za-z_$][\w$]*)\._s\(\1\.timeLine\(([^()]+?)\)\)/g;

  state.text = state.text.replace(re, (match, vm, arg) => {
    if (match.includes("function(v)")) {
      return match;
    }

    state.changed++;
    state.total++;

    log(`[${state.rel}] Vue 친구 신청 탭 패치 완료`);

    return `${vm}._s(${helper}(${vm}.timeLine(${arg})))`;
  });
}

function patchVueRules(state, mappings, log = console.log) {
  if (typeof log !== "function") {
    throw new TypeError(
      `patchVueRules: log must be a function, got ${typeof log}`,
    );
  }

  const textMappings = mappings.filter((rule) => rule && rule.type === "text");
  vuePatchLiteralRules(state, textMappings, log);
  vuePatchMainTab(state, textMappings, log);
  vuePatchCheatingReportLabel(state, textMappings, log);
  vuePatchFriendMapName(state, mappings, log);
  vuepatchPlaySidebarTitle(state, mappings, log);
  vuePatchPlayModeTitle(state, mappings, log);

  vuePatchPlayModeDescription(state, textMappings, log);

  vuePatchMapSelectName(state, mappings, log);

  vuePatchServerLocationName(state, mappings, log);

  vuePatchVariableText(state, mappings, log);

  vuePatchPostMatchBoardPeriod(state, log);

  vuePatchRelativeTimeText(state, log);
}

module.exports = {
  patchVueRules,
};
