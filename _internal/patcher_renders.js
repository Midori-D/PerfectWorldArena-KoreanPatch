"use strict";

/*
 * 서버 또는 내부 데이터에서 전달되는 동적 문자열을
 * Vue 렌더 단계에서 번역하는 패치 모음입니다.
 *
 * patcher.js에서는 patchVueRenderRules() 하나만 호출합니다.
 */

function vueToUnicodeEscapeLower(str) {
  return String(str)
    .split("")
    .map(
      ch =>
        "\\u" +
        ch.charCodeAt(0)
          .toString(16)
          .padStart(4, "0")
    )
    .join("");
}

function vueToUnicodeEscapedJsString(str) {
  return `"${vueToUnicodeEscapeLower(str)}"`;
}

function vueMakeMapLiteral(mappings) {
  return `{${mappings
    .map(
      mapping =>
        `${vueToUnicodeEscapedJsString(mapping.zh)}:` +
        `${JSON.stringify(mapping.ko)}`
    )
    .join(",")}}`;
}

function vueLogMappings(log, rel, mappings) {
  for (const mapping of mappings) {
    log(`[${rel}] ${mapping.zh} -> ${mapping.ko}`);
  }
}

function makePairMapLiteral(mappings) {
  return `{${mappings
    .map(
      ([zh, ko]) =>
        `${vueToUnicodeEscapedJsString(zh)}:` +
        `${JSON.stringify(ko)}`
    )
    .join(",")}}`;
}

function escapeRegExp(str) {
  return String(str).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

// patchPanelTitle
function vuePatchPanelTitleRender(
  state,
  textMappings,
  log
) {
  const panelTitleMappings = textMappings.filter(
    mapping => mapping.patchPanelTitle
  );

  if (panelTitleMappings.length === 0) {
    return;
  }

  const panelTitleMapLiteral = vueMakeMapLiteral(
    panelTitleMappings
  );

  // s("p",{class:e.$style["title"]},[e._v(e._s(t.title))])
  const panelTitleRenderRegex =
    /([A-Za-z_$][\w$]*)\("p",\{class:([A-Za-z_$][\w$]*)\.\$style\["title"\]\},\[\2\._v\(\2\._s\(([A-Za-z_$][\w$]*)\.title\)\)\]\)/g;

  state.text = state.text.replace(
    panelTitleRenderRegex,
    (match, h, vm, panel) => {
      state.changed++;
      state.total++;

      vueLogMappings(
        log,
        state.rel,
        panelTitleMappings
      );

      return (
        `${h}("p",{class:${vm}.$style["title"]},[` +
        `${vm}._v(${vm}._s((` +
        `${panelTitleMapLiteral}[${panel}.title]||` +
        `${panel}.title)))])`
      );
    }
  );
}

// patchSignalLocation
function vuePatchSignalLocationRender(
  state,
  textMappings,
  log
) {
  const signalLocationMappings = textMappings.filter(
    mapping => mapping.patchSignalLocation
  );

  if (signalLocationMappings.length === 0) {
    return;
  }

  const signalLocationMapLiteral = vueMakeMapLiteral(
    signalLocationMappings
  );

  // a("span",{staticClass:"city"},[
  //   a("i",{staticClass:"dot"}),
  //   e._v("\n            "+e._s(t.location)+"\n          ")
  // ])
  const signalLocationRenderRegex =
    /([A-Za-z_$][\w$]*)\("span",\{staticClass:"city"\},\[\1\("i",\{staticClass:"dot"\}\),([A-Za-z_$][\w$]*)\._v\(("(?:(?:\\.|[^"\\])*)")\+\2\._s\(([A-Za-z_$][\w$]*)\.location\)\+("(?:(?:\\.|[^"\\])*)")\)\]\)/g;

  state.text = state.text.replace(
    signalLocationRenderRegex,
    (match, h, vm, before, item, after) => {
      state.changed++;
      state.total++;

      vueLogMappings(
        log,
        state.rel,
        signalLocationMappings
      );

      return (
        `${h}("span",{staticClass:"city"},[` +
        `${h}("i",{staticClass:"dot"}),` +
        `${vm}._v(${before}+${vm}._s((` +
        `${signalLocationMapLiteral}[${item}.location]||` +
        `${item}.location))+${after})])`
      );
    }
  );
}

// patchPlayLinkTitle
function vuePatchPlayLinkTitleRender(
  state,
  textMappings,
  log
) {
  const playLinkTitleMappings = textMappings.filter(
    mapping => mapping.patchPlayLinkTitle
  );

  if (playLinkTitleMappings.length === 0) {
    return;
  }

  const playLinkTitleMapLiteral = vueMakeMapLiteral(
    playLinkTitleMappings
  );

  if (
    !state.text.includes('staticClass:"play-link-list"') ||
    !state.text.includes("play-link-item") ||
    !state.text.includes('staticClass:"title"') ||
    !state.text.includes("._s(t.title)")
  ) {
    return;
  }

  // s("p",{staticClass:"title"},[
  //   e._v("\n              "+e._s(t.title)+"\n            ")
  // ])
  const playLinkTitleRenderRegex =
    /([A-Za-z_$][\w$]*)\("p",\{staticClass:"title"\},\[\s*([A-Za-z_$][\w$]*)\._v\(("(?:(?:\\.|[^"\\])*)")\+\2\._s\(([A-Za-z_$][\w$]*)\.title\)\+("(?:(?:\\.|[^"\\])*)")\)\s*\]\)/g;

  state.text = state.text.replace(
    playLinkTitleRenderRegex,
    (match, h, vm, before, item, after) => {
      state.changed++;
      state.total++;

      vueLogMappings(
        log,
        state.rel,
        playLinkTitleMappings
      );

      return (
        `${h}("p",{staticClass:"title"},[` +
        `${vm}._v(${before}+${vm}._s((` +
        `${playLinkTitleMapLiteral}[${item}.title]||` +
        `${item}.title))+${after})])`
      );
    }
  );
}

// patchPlayTitleExpression
function vuePatchPlayTitleExpression(
  state,
  textMappings,
  log
) {
  const playTitleExpressionMappings = textMappings.filter(
    mapping => mapping.patchPlayTitleExpression
  );

  if (playTitleExpressionMappings.length === 0) {
    return;
  }

  const playTitleExpressionMapLiteral = vueMakeMapLiteral(
    playTitleExpressionMappings
  );

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

  state.text = state.text.replace(
    originalRe,
    (match, vm, expr, item) => {
      state.changed++;
      state.total++;

      vueLogMappings(
        log,
        state.rel,
        playTitleExpressionMappings
      );

      return (
        `${vm}._s("en"===${vm}.locale?` +
        `${item}.subtitle:(` +
        `${playTitleExpressionMapLiteral}[${item}.title]||` +
        `${item}.title))`
      );
    }
  );

  // 이미 한 번 잘못 패치된 경우 복구:
  // e._s(({"旧map":...}["en"===e.locale?t.subtitle:t.title]||
  // "en"===e.locale?t.subtitle:t.title))
  const alreadyPatchedRe =
    /([A-Za-z_$][\w$]*)\._s\(\(\{[^{}]*\}\[("en"===[A-Za-z_$][\w$]*\.locale\?[A-Za-z_$][\w$]*\.subtitle:([A-Za-z_$][\w$]*)\.title)\]\|\|\2\)\)/g;

  state.text = state.text.replace(
    alreadyPatchedRe,
    (match, vm, expr, item) => {
      state.changed++;
      state.total++;

      vueLogMappings(
        log,
        state.rel,
        playTitleExpressionMappings
      );

      return (
        `${vm}._s("en"===${vm}.locale?` +
        `${item}.subtitle:(` +
        `${playTitleExpressionMapLiteral}[${item}.title]||` +
        `${item}.title))`
      );
    }
  );
}

// patchGameMapName
function vuePatchGameMapName(
  state,
  textMappings,
  log
) {
  const gameMapMappings = textMappings.filter(
    mapping => mapping.patchGameMapName
  );

  if (gameMapMappings.length === 0) {
    return;
  }

  const gameMapMapLiteral = vueMakeMapLiteral(
    gameMapMappings
  );

  if (
    !state.text.includes('staticClass:"game-map"') ||
    !state.text.includes(".gameMap")
  ) {
    return;
  }

  function mapExpr(expr) {
    return (
      `(${gameMapMapLiteral}[${expr}]||` +
      `${gameMapMapLiteral}[String(${expr}).trim()]||` +
      `${expr})`
    );
  }

  // 원본:
  // s("span",{staticClass:"game-map"},[t._v(t._s(t.gameMap))])
  const gameMapRegex1 =
    /([A-Za-z_$][\w$]*)\("span",\{staticClass:"game-map"\},\[\s*([A-Za-z_$][\w$]*)\._v\(\2\._s\(([A-Za-z_$][\w$]*)\.gameMap\)\)\s*\]\)/g;

  state.text = state.text.replace(
    gameMapRegex1,
    (match, h, vm, item) => {
      state.changed++;
      state.total++;

      vueLogMappings(
        log,
        state.rel,
        gameMapMappings
      );

      const expr = `${item}.gameMap`;

      return (
        `${h}("span",{staticClass:"game-map"},[` +
        `${vm}._v(${vm}._s(${mapExpr(expr)}))])`
      );
    }
  );

  // 이미 예전 방식으로 패치된 경우 복구:
  // s("span",{staticClass:"game-map"},[
  //   t._v(t._s(({"...":"..."}[t.gameMap]||t.gameMap)))
  // ])
  const alreadyPatchedRegex1 =
    /([A-Za-z_$][\w$]*)\("span",\{staticClass:"game-map"\},\[\s*([A-Za-z_$][\w$]*)\._v\(\2\._s\(\(\{[^{}]*\}\[([A-Za-z_$][\w$]*)\.gameMap\]\|\|\3\.gameMap\)\)\)\s*\]\)/g;

  state.text = state.text.replace(
    alreadyPatchedRegex1,
    (match, h, vm, item) => {
      state.changed++;
      state.total++;

      vueLogMappings(
        log,
        state.rel,
        gameMapMappings
      );

      const expr = `${item}.gameMap`;

      return (
        `${h}("span",{staticClass:"game-map"},[` +
        `${vm}._v(${vm}._s(${mapExpr(expr)}))])`
      );
    }
  );

  // 혹시 공백 문자열이 붙은 형태:
  // s("span",{staticClass:"game-map"},[t._v(" "+t._s(t.gameMap))])
  const gameMapRegex2 =
    /([A-Za-z_$][\w$]*)\("span",\{staticClass:"game-map"\},\[\s*([A-Za-z_$][\w$]*)\._v\(("(?:(?:\\.|[^"\\])*)")\+\2\._s\(([A-Za-z_$][\w$]*)\.gameMap\)\)\s*\]\)/g;

  state.text = state.text.replace(
    gameMapRegex2,
    (match, h, vm, before, item) => {
      state.changed++;
      state.total++;

      vueLogMappings(
        log,
        state.rel,
        gameMapMappings
      );

      const expr = `${item}.gameMap`;

      return (
        `${h}("span",{staticClass:"game-map"},[` +
        `${vm}._v(${before}+${vm}._s(${mapExpr(expr)}))])`
      );
    }
  );
}

function vuePatchCustomerCenterDynamicText(
  state,
  dynamicRules,
  log
) {
  if (!Array.isArray(dynamicRules) || dynamicRules.length === 0) {
    return;
  }

  for (const rule of dynamicRules) {
    if (
      !rule ||
      typeof rule.objectPath !== "string" ||
      !Array.isArray(rule.mappings) ||
      rule.mappings.length === 0
    ) {
      continue;
    }

    const validMappings = rule.mappings.filter(
      item =>
        Array.isArray(item) &&
        item.length >= 2 &&
        item[0] &&
        item[1]
    );

    if (validMappings.length === 0) {
      continue;
    }

    const mapLiteral = makePairMapLiteral(
      validMappings
    );

    const pathRe = escapeRegExp(
      rule.objectPath
    );

    /*
     * 다음처럼 앞뒤 Vue 변수명이 같은 표현만 잡습니다.
     *
     * e._s(e.categoryInfo.entryTitle)
     * t._s(t.categoryInfo.entryTitle)
     * n._s(n.categoryInfo.propagandaTitle)
     */
    const re = new RegExp(
      `([A-Za-z_$][\\w$]*)` +
      `\\._s\\(` +
      `\\1\\.${pathRe}` +
      `\\)`,
      "g"
    );

    state.text = state.text.replace(
      re,
      (match, vm) => {
        state.changed++;
        state.total++;

        for (const [zh, ko] of validMappings) {
          log(
            `[${state.rel}] ` +
            `${zh} -> ${ko}`
          );
        }

        const expr =
          `${vm}.${rule.objectPath}`;

        return (
          `${vm}._s((` +
          `${mapLiteral}[${expr}]||${expr}` +
          `))`
        );
      }
    );
  }
}

function patchVueRenderRules(
  state,
  mappings,
  log = console.log
) {
  if (typeof log !== "function") {
    throw new TypeError(
      `patchVueRenderRules: log must be a function, got ${typeof log}`
    );
  }

  const dynamicRules = mappings.filter(
    rule =>
      rule &&
      rule.type === "dynamicRender" &&
      rule.profile === "objectPathMap"
  );

  vuePatchPanelTitleRender(
    state,
    mappings,
    log
  );

  vuePatchSignalLocationRender(
    state,
    mappings,
    log
  );

  vuePatchPlayLinkTitleRender(
    state,
    mappings,
    log
  );

  vuePatchPlayTitleExpression(
    state,
    mappings,
    log
  );

  vuePatchGameMapName(
    state,
    mappings,
    log
  );

  vuePatchCustomerCenterDynamicText(
    state,
    dynamicRules,
    log
  );
}

module.exports = {
  patchVueRenderRules
};
