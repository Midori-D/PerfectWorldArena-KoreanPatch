const fs = require("fs");
const path = require("path");

function makeStamp() {
  const now = new Date();

  const stamp =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    "_" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");

  return { now, stamp };
}

function ensureLogDir(patcherDir) {
  const logDir = path.join(patcherDir, ".work", "logs");
  fs.mkdirSync(logDir, { recursive: true });
  return logDir;
}

function safeRelPath(unpackedDir, full) {
  return path.relative(unpackedDir, full).replaceAll("\\", "/");
}

function countTextIncludes(text, value) {
  if (!value) return 0;
  return String(text).split(String(value)).length - 1;
}

function toUnicodeEscapeLower(str) {
  return String(str)
    .split("")
    .map(ch => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("");
}

function toUnicodeEscapeUpper(str) {
  return String(str)
    .split("")
    .map(ch => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase())
    .join("");
}

function includesAny(text, value) {
  if (!value) return false;

  const raw = String(value);
  const lower = toUnicodeEscapeLower(raw);
  const upper = toUnicodeEscapeUpper(raw);

  return (
    text.includes(raw) ||
    text.includes(lower) ||
    text.includes(upper)
  );
}

function makeSnippet(text, value) {
  const raw = String(value);
  let idx = text.indexOf(raw);

  if (idx < 0) {
    idx = text.indexOf(toUnicodeEscapeLower(raw));
  }

  if (idx < 0) {
    idx = text.indexOf(toUnicodeEscapeUpper(raw));
  }

  if (idx < 0) return "";

  const start = Math.max(0, idx - 100);
  const end = Math.min(text.length, idx + raw.length + 100);

  return text
    .slice(start, end)
    .replace(/\r?\n/g, "\\n")
    .replace(/\s+/g, " ")
    .trim();
}

function collectTextFiles(files, unpackedDir, readText) {
  const items = [];

  for (const full of files) {
    const rel = safeRelPath(unpackedDir, full);
    if (!/\.(js|css|html|json)$/i.test(rel)) continue;

    let text;
    try {
      text = readText(full);
    } catch {
      continue;
    }

    items.push({ full, rel, text });
  }

  return items;
}

function normalizeMapping(sourceName, mapping) {
  if (Array.isArray(mapping) && mapping.length >= 2) {
    return {
      source: sourceName,
      zh: mapping[0],
      ko: mapping[1]
    };
  }

  if (mapping && typeof mapping === "object" && mapping.zh && mapping.ko) {
    return {
      source: sourceName,
      zh: mapping.zh,
      ko: mapping.ko
    };
  }

  return null;
}

function normalizeMappingGroups(mappingGroups) {
  const result = [];

  for (const group of mappingGroups || []) {
    if (!group || !Array.isArray(group.mappings)) continue;

    const sourceName = group.source || group.name || "UNKNOWN_MAPPINGS";

    for (const mapping of group.mappings) {
      const normalized = normalizeMapping(sourceName, mapping);
      if (normalized) result.push(normalized);
    }
  }

  return result;
}

/**
 * 패치 목록 전체 점검용 디버그
 *
 * 상태:
 * - OK       : 한국어 결과가 패치된 JS/CSS/HTML/JSON 안에 있음
 * - MISS     : 중국어 원문은 있는데 한국어 결과가 없음
 * - CHANGED? : 중국어 원문도 한국어 결과도 없음. 원문/구조 변경 가능성
 */
function debugCheckPatchMappings(files, options) {
  const {
    enabled,
    patcherDir,
    unpackedDir,
    readText,
    log = console.log,
    mappingGroups = []
  } = options || {};

  if (!enabled) return;

  const { now, stamp } = makeStamp();
  const logDir = ensureLogDir(patcherDir);
  const outPath = path.join(logDir, `mapping_check_${stamp}.log`);

  const textFiles = collectTextFiles(files, unpackedDir, readText);
  const mappings = normalizeMappingGroups(mappingGroups);

  const lines = [];

  lines.push("============================================================");
  lines.push(" Perfect World Arena Korean Patch - Mapping Check Log");
  lines.push("============================================================");
  lines.push("");
  lines.push(`Created At : ${now.toLocaleString()}`);
  lines.push(`Total Mappings: ${mappings.length}`);
  lines.push("");
  lines.push("상태 설명:");
  lines.push("[OK]       한국어 결과가 패치된 JS/CSS/HTML/JSON 안에 있음");
  lines.push("[MISS]     중국어 원문은 남아 있는데 한국어 결과가 없음");
  lines.push("[CHANGED?] 중국어 원문도 한국어 결과도 없음. 업데이트로 원문/구조 변경 가능성");
  lines.push("");

  let ok = 0;
  let miss = 0;
  let changed = 0;

  const seen = new Set();

  for (const mapping of mappings) {
    const key = `${mapping.source}::${mapping.zh}=>${mapping.ko}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const zhHits = [];
    const koHits = [];

    for (const file of textFiles) {
      if (includesAny(file.text, mapping.zh)) {
        zhHits.push(file);
      }

      if (includesAny(file.text, mapping.ko)) {
        koHits.push(file);
      }
    }

    let status;

    if (koHits.length > 0) {
      status = "OK";
      ok++;
    } else if (zhHits.length > 0) {
      status = "MISS";
      miss++;
    } else {
      status = "CHANGED?";
      changed++;
    }

    lines.push("------------------------------------------------------------");
    lines.push(`[${status}] ${mapping.zh} -> ${mapping.ko}`);
    lines.push(`[SOURCE] ${mapping.source}`);

    if (zhHits.length > 0) {
      lines.push("[ZH FOUND]");
      for (const file of zhHits.slice(0, 5)) {
        lines.push(`  - ${file.rel}`);
        lines.push(`    ${makeSnippet(file.text, mapping.zh)}`);
      }
    }

    if (koHits.length > 0) {
      lines.push("[KO FOUND]");
      for (const file of koHits.slice(0, 5)) {
        lines.push(`  - ${file.rel}`);
        lines.push(`    ${makeSnippet(file.text, mapping.ko)}`);
      }
    }

    lines.push("");
  }

  lines.unshift(`Summary: OK=${ok}, MISS=${miss}, CHANGED=${changed}`);
  lines.unshift("");

  fs.writeFileSync(outPath, lines.join("\r\n"), "utf8");

  log(`[debug] mapping check log created: ${outPath}`);
  log(`[debug] mapping check summary: OK=${ok}, MISS=${miss}, CHANGED=${changed}`);
}

/**
 * patchStaticStringMappings(files) 안에서 쓰는 디버그 세션
 *
 * mappings를 함수 밖으로 빼지 않아도 됨.
 *
 * 사용 예:
 *
 * const staticDebug = createStaticMappingDebugSession({
 *   enabled: DEBUG_MODE,
 *   mappings,
 *   patcherDir: PATCHER_DIR,
 *   unpackedDir: UNPACKED_DIR,
 *   readText,
 *   log
 * });
 *
 * staticDebug.record(rel, i, 1);
 * staticDebug.finish(files);
 */
function createStaticMappingDebugSession(options) {
  const {
    enabled,
    mappings,
    patcherDir,
    unpackedDir,
    readText,
    log = console.log
  } = options || {};

  const disabled = {
    record() {},
    finish() {}
  };

  if (!enabled || !Array.isArray(mappings)) {
    return disabled;
  }

  const rows = mappings.map(mapping => {
    const normalized = normalizeMapping("STATIC_STRING_MAPPINGS", mapping);

    return {
      from: normalized ? normalized.zh : "",
      to: normalized ? normalized.ko : "",
      replaced: 0,
      koFoundAfter: 0,
      files: new Map()
    };
  });

  return {
    record(rel, mappingIndex, count) {
      const row = rows[mappingIndex];
      if (!row || !count) return;

      row.replaced += count;
      row.files.set(rel, (row.files.get(rel) || 0) + count);
    },

    finish(files) {
      const { now, stamp } = makeStamp();
      const logDir = ensureLogDir(patcherDir);
      const outPath = path.join(logDir, `static_mapping_check_${stamp}.log`);

      for (const full of files) {
        const rel = safeRelPath(unpackedDir, full);
        if (!/\.(js|css|html|json)$/i.test(rel)) continue;

        let text;
        try {
          text = readText(full);
        } catch {
          continue;
        }

        for (const row of rows) {
          row.koFoundAfter += countTextIncludes(text, row.to);
        }
      }

      let ok = 0;
      let already = 0;
      let changed = 0;

      const lines = [];

      lines.push("============================================================");
      lines.push(" Perfect World Arena Korean Patch - Static Mapping Check");
      lines.push("============================================================");
      lines.push("");
      lines.push(`Created At : ${now.toLocaleString()}`);
      lines.push(`Total Mappings: ${rows.length}`);
      lines.push("");
      lines.push("상태 설명:");
      lines.push("[OK]       이번 실행에서 치환됨");
      lines.push("[ALREADY]  이미 한국어가 있음");
      lines.push("[CHANGED?] 중국어 원문도 한국어 결과도 없음. 업데이트로 문구 변경 가능성");
      lines.push("");

      for (const row of rows) {
        let status;

        if (row.replaced > 0) {
          status = "OK";
          ok++;
        } else if (row.koFoundAfter > 0) {
          status = "ALREADY";
          already++;
        } else {
          status = "CHANGED?";
          changed++;
        }

        lines.push("------------------------------------------------------------");
        lines.push(`[${status}] ${row.from} -> ${row.to}`);
        lines.push(`[REPLACED] ${row.replaced}`);

        if (row.files.size > 0) {
          lines.push("[FILES]");
          for (const [file, count] of row.files.entries()) {
            lines.push(`  - ${file} (${count})`);
          }
        }

        lines.push("");
      }

      lines.unshift(`Summary: OK=${ok}, ALREADY=${already}, CHANGED=${changed}`);
      lines.unshift("");

      fs.writeFileSync(outPath, lines.join("\r\n"), "utf8");

      log(`[debug] static mapping check log created: ${outPath}`);
      log(`[debug] static mapping summary: OK=${ok}, ALREADY=${already}, CHANGED=${changed}`);
    }
  };
}

module.exports = {
  debugCheckPatchMappings,
  createStaticMappingDebugSession
};