"use strict";

// Tools
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addGlobalFlag(flags = "g") {
  return flags.includes("g") ? flags : `${flags}g`;
}

// targets.json 규칙을 한 번만 정규식으로 변환
function compileTargetsRules(mappings = []) {
  return mappings.map((rule, index) => {
    const label = rule.label || rule.section || `rule-${index + 1}`;

    if (
      typeof rule.anchor !== "string" ||
      !rule.anchor ||
      typeof rule.before !== "string" ||
      typeof rule.from !== "string" ||
      !rule.from ||
      typeof rule.to !== "string" ||
      typeof rule.after !== "string"
    ) {
      throw new Error(
        `targets 규칙이 올바르지 않습니다: ${label}`,
      );
    }

    const regex = new RegExp(
      `(?<targetsPrefix>${rule.before})` +
        `${escapeRegExp(rule.from)}` +
        `(?<targetsSuffix>${rule.after})`,
      addGlobalFlag(rule.regexFlags || "g"),
    );

    const pathRegex =
      typeof rule.pathRegex === "string"
        ? new RegExp(
            rule.pathRegex,
            rule.pathRegexFlags || "i",
          )
        : null;

    return {
      ...rule,
      label,
      regex,
      pathRegex,
    };
  });
}

// 짧거나 중복되는 문자열을 지정된 문맥에서만 패치
function patchTargetsRules(state, mappings, log = console.log) {
  for (const rule of mappings) {
    if (rule.pathRegex && !rule.pathRegex.test(state.rel)) {
      continue;
    }

    // 해당 코드가 없는 파일은 정규식 검사도 하지 않음
    if (!state.text.includes(rule.anchor)) {
      continue;
    }

    const re = new RegExp(rule.regex.source, rule.regex.flags);
    const matches = [...state.text.matchAll(re)];

    if (matches.length === 0) {
      continue;
    }

    if (
      Number.isInteger(rule.maxMatchesPerFile) &&
      matches.length > rule.maxMatchesPerFile
    ) {
      log(
        `[warn:targets] [${state.rel}] ${rule.label} ` +
          `matched=${matches.length}, ` +
          `max=${rule.maxMatchesPerFile}, skipped`,
      );

      continue;
    }

    re.lastIndex = 0;

    state.text = state.text.replace(re, (...args) => {
      const groups = args[args.length - 1];

      return (
        `${groups.targetsPrefix}` +
        `${rule.to}` +
        `${groups.targetsSuffix}`
      );
    });

    state.changed += matches.length;
    state.total += matches.length;

    log(
      `[${state.rel}] Text, targets(${rule.label}) ` +
        `${rule.from} -> ${rule.to}, ` +
        `changed=${matches.length}`,
    );
  }
}

module.exports = {
  compileTargetsRules,
  patchTargetsRules,
};