const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const { spawn } = require("node:child_process");

const DEFAULT_MANIFEST_URL =
  "https://raw.githubusercontent.com/" +
  "Midori-D/PerfectWorldArena-KoreanPatch/main/" +
  "_internal/update_manifest.json";
const DEFAULT_PATCHER_URL =
  "https://github.com/" + "Midori-D/PerfectWorldArena-KoreanPatch";

const DEFAULT_PATCHER_VERSION = "1.0.0";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_FILE_SIZE = 25 * 1024 * 1024;

function parseVersion(value, name = "version") {
  const normalized = String(value ?? "")
    .trim()
    .replace(/^v/i, "");

  if (!/^\d+(?:\.\d+)*$/.test(normalized)) {
    throw new Error(`${name} 형식이 올바르지 않습니다: ${value}`);
  }

  return normalized.split(".").map(Number);
}

// a가 b보다 크면 1, 같으면 0, 작으면 -1
function compareVersions(a, b) {
  const left = parseVersion(a, "비교할 버전");
  const right = parseVersion(b, "비교 대상 버전");
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index++) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;

    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

function readJsonFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");

  return JSON.parse(text);
}

function resolveInsideRoot(rootDir, relativePath) {
  const targetPath = path.resolve(rootDir, relativePath);
  const relative = path.relative(rootDir, targetPath);

  if (
    !relative ||
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`허용되지 않은 업데이트 경로입니다: ${relativePath}`);
  }

  return targetPath;
}

function validateHttpsUrl(value, name) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} URL이 올바르지 않습니다: ${value}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${name} URL은 HTTPS여야 합니다: ${value}`);
  }

  return parsed;
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("업데이트 매니페스트가 객체가 아닙니다.");
  }

  if (manifest.manifestVersion !== 1) {
    throw new Error(
      `지원하지 않는 manifestVersion입니다: ` + `${manifest.manifestVersion}`,
    );
  }

  parseVersion(manifest.mappingVersion, "mappingVersion");

  parseVersion(manifest.minimumPatcherVersion, "minimumPatcherVersion");

  parseVersion(manifest.latestPatcherVersion, "latestPatcherVersion");

  if (
    !manifest.files ||
    typeof manifest.files !== "object" ||
    Array.isArray(manifest.files)
  ) {
    throw new Error("매니페스트에 files 객체가 없습니다.");
  }

  const entries = Object.entries(manifest.files);

  if (entries.length === 0) {
    throw new Error("매니페스트의 files가 비어 있습니다.");
  }

  for (const [name, file] of entries) {
    if (!file || typeof file !== "object") {
      throw new Error(`files.${name} 항목이 올바르지 않습니다.`);
    }

    validateHttpsUrl(file.url, `files.${name}`);

    if (typeof file.path !== "string" || !file.path.trim()) {
      throw new Error(`files.${name}.path가 없습니다.`);
    }

    if (path.extname(file.path).toLowerCase() !== ".json") {
      throw new Error(`JSON이 아닌 업데이트 파일입니다: ${file.path}`);
    }
  }

  return manifest;
}

function makeNoCacheUrl(value) {
  const url = validateHttpsUrl(value, "다운로드");

  url.searchParams.set("_", Date.now().toString());

  return url.href;
}

function openUrlInBrowser(url, warn = console.warn) {
  try {
    const parsedUrl = validateHttpsUrl(
      url,
      "패처 다운로드",
    );

    const child = spawn(
      "rundll32.exe",
      [
        "url.dll,FileProtocolHandler",
        parsedUrl.href,
      ],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      },
    );

    child.once("error", (err) => {
      warn(
        `[warn:update] 브라우저를 열지 못했습니다: ` +
          `${err.message}`,
      );
    });

    child.unref();

    return true;
  } catch (err) {
    warn(
      `[warn:update] GitHub 주소를 열 수 없습니다: ` +
        `${err.message}`,
    );

    return false;
  }
}

async function fetchText(
  url,
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    fetchImpl = globalThis.fetch,
  } = {},
) {
  if (typeof fetchImpl !== "function") {
    throw new Error("현재 Node.js에서 fetch를 사용할 수 없습니다.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(makeNoCacheUrl(url), {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        accept: "application/json, text/plain;q=0.9, */*;q=0.1",
        "user-agent": "PerfectWorldArena-KoreanPatch-Updater",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const contentLength = Number(response.headers.get("content-length"));

    if (Number.isFinite(contentLength) && contentLength > maxFileSize) {
      throw new Error(`파일이 너무 큽니다: ${contentLength} bytes`);
    }

    const text = await response.text();

    if (Buffer.byteLength(text, "utf8") > maxFileSize) {
      throw new Error(`파일이 너무 큽니다: ${url}`);
    }

    return text.replace(/^\uFEFF/, "");
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error(`다운로드 시간이 초과되었습니다: ${url}`);
    }

    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, options) {
  const text = await fetchText(url, options);

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`다운로드한 JSON을 읽을 수 없습니다: ${err.message}`);
  }
}

async function checkForUpdates({
  rootDir = path.resolve(__dirname, ".."),
  localManifestPath = path.join(__dirname, "update_manifest.json"),
  manifestUrl = DEFAULT_MANIFEST_URL,
  currentPatcherVersion = DEFAULT_PATCHER_VERSION,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  fetchImpl = globalThis.fetch,
} = {}) {
  parseVersion(currentPatcherVersion, "현재 패처 버전");

  let localManifest = null;

  if (fs.existsSync(localManifestPath)) {
    localManifest = validateManifest(readJsonFile(localManifestPath));
  }

  const remoteManifest = validateManifest(
    await fetchJson(manifestUrl, {
      timeoutMs,
      maxFileSize,
      fetchImpl,
    }),
  );

  const localMappingVersion = localManifest?.mappingVersion ?? "0";

  const remoteMappingVersion = remoteManifest.mappingVersion;

  const minimumPatcherVersion = remoteManifest.minimumPatcherVersion;

  const latestPatcherVersion = remoteManifest.latestPatcherVersion;

  return {
    rootDir,
    localManifestPath,
    localManifest,
    remoteManifest,
    currentPatcherVersion,
    localMappingVersion,
    remoteMappingVersion,
    minimumPatcherVersion,
    latestPatcherVersion,
    patcherUrl: DEFAULT_PATCHER_URL,

    mappingUpdateAvailable:
      compareVersions(remoteMappingVersion, localMappingVersion) > 0,

    patcherUpdateAvailable:
      compareVersions(latestPatcherVersion, currentPatcherVersion) > 0,

    patcherTooOld:
      compareVersions(currentPatcherVersion, minimumPatcherVersion) < 0,

    message:
      typeof remoteManifest.message === "string"
        ? remoteManifest.message.trim()
        : "",

    timeoutMs,
    maxFileSize,
    fetchImpl,
  };
}

async function downloadAndValidateMappings(checkResult) {
  const downloaded = [];

  for (const [name, file] of Object.entries(checkResult.remoteManifest.files)) {
    const targetPath = resolveInsideRoot(checkResult.rootDir, file.path);

    const text = await fetchText(file.url, {
      timeoutMs: checkResult.timeoutMs,
      maxFileSize: checkResult.maxFileSize,
      fetchImpl: checkResult.fetchImpl,
    });

    try {
      const parsed = JSON.parse(text);

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("최상위 값이 객체가 아닙니다.");
      }
    } catch (err) {
      throw new Error(`${file.path} 검증 실패: ${err.message}`);
    }

    downloaded.push({
      name,
      path: file.path,
      targetPath,
      text,
    });
  }

  return downloaded;
}

function writeUpdatesWithRollback(downloaded, manifestPath, manifest) {
  const token = `${process.pid}-${Date.now()}`;

  const writes = [
    ...downloaded.map((file) => ({
      label: file.path,
      targetPath: file.targetPath,
      text: file.text,
    })),
    {
      label: path.basename(manifestPath),
      targetPath: manifestPath,
      text: `${JSON.stringify(manifest, null, 2)}\n`,
    },
  ];

  const backups = [];

  try {
    for (const item of writes) {
      fs.mkdirSync(path.dirname(item.targetPath), { recursive: true });

      const existed = fs.existsSync(item.targetPath);

      const backupPath = `${item.targetPath}.update-backup-${token}`;

      if (existed) {
        fs.copyFileSync(item.targetPath, backupPath);
      }

      backups.push({
        targetPath: item.targetPath,
        backupPath,
        existed,
      });

      fs.writeFileSync(item.targetPath, item.text, "utf8");
    }
  } catch (err) {
    for (const backup of backups.reverse()) {
      try {
        if (backup.existed && fs.existsSync(backup.backupPath)) {
          fs.copyFileSync(backup.backupPath, backup.targetPath);
        } else if (!backup.existed && fs.existsSync(backup.targetPath)) {
          fs.unlinkSync(backup.targetPath);
        }
      } catch {
        // 가능한 파일만 복구하고 원래 오류를 전달합니다.
      }
    }

    throw err;
  } finally {
    for (const backup of backups) {
      try {
        if (fs.existsSync(backup.backupPath)) {
          fs.unlinkSync(backup.backupPath);
        }
      } catch {
        // 임시 백업 정리 실패는 업데이트 결과를 바꾸지 않습니다.
      }
    }
  }
}

async function applyMappingUpdate(checkResult) {
  if (!checkResult.mappingUpdateAvailable) {
    return [];
  }

  if (checkResult.patcherTooOld) {
    throw new Error(
      `패처 ${checkResult.minimumPatcherVersion} 이상이 ` +
        "필요하여 번역 데이터를 업데이트할 수 없습니다.",
    );
  }

  /*
   * 모든 파일을 먼저 다운로드하고 JSON을 검증합니다.
   * 하나라도 잘못됐다면 기존 파일은 건드리지 않습니다.
   */
  const downloaded = await downloadAndValidateMappings(checkResult);

  writeUpdatesWithRollback(
    downloaded,
    checkResult.localManifestPath,
    checkResult.remoteManifest,
  );

  return downloaded.map((file) => file.path);
}

async function askToUpdate(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = (await terminal.question(`${question} (Y/n): `))
      .trim()
      .toLowerCase();

    return answer === "" || answer === "y" || answer === "yes";
  } finally {
    terminal.close();
  }
}

async function runUpdateFlow({
  log = console.log,
  warn = console.warn,
  autoUpdate,
  ...options
} = {}) {
  log("[update] GitHub 번역 데이터 업데이트를 확인합니다...");

  let result;

  try {
    result = await checkForUpdates(options);
  } catch (err) {
    warn(`[warn:update] 업데이트 확인 실패: ${err.message}`);

    warn("[warn:update] 기존 번역 데이터로 계속 진행합니다.");

    return {
      checked: false,
      updated: false,
      canContinue: true,
      error: err,
    };
  }

  log(
    `[update] mapping: ${result.localMappingVersion} -> ` +
      `${result.remoteMappingVersion}`,
  );

  log(
    `[update] patcher: ${result.currentPatcherVersion} ` +
      `(latest=${result.latestPatcherVersion}, ` +
      `minimum=${result.minimumPatcherVersion})`,
  );

  if (result.message) {
    log(`[update] ${result.message}`);
  }

  if (result.patcherTooOld) {
    warn("[update:required] 패처 업데이트가 반드시 필요합니다.");

    warn(
      `[update:required] 현재=${result.currentPatcherVersion}, ` +
        `최소=${result.minimumPatcherVersion}, ` +
        `최신=${result.latestPatcherVersion}`,
    );

    warn(
      "[update:required] 최신 패처를 GitHub에서 " +
        "수동으로 다운로드한 뒤 다시 실행해 주세요.",
    );

    warn(`[update:required] GitHub: ${result.patcherUrl}`);

    warn( "[update:required] GitHub 페이지를 브라우저로 엽니다.", );

    openUrlInBrowser(result.patcherUrl, warn);

    return {
      ...result,
      checked: true,
      updated: false,
      canContinue: false,
    };
  }

  if (result.patcherUpdateAvailable) {
    warn(
      `[update:patcher] 새 패처 ` +
        `${result.latestPatcherVersion}이 있습니다.`,
    );

    warn(
      "[update:patcher] GitHub에서 최신 패처를 " +
        "수동으로 다운로드해 주세요.",
    );

    warn(`[update:patcher] GitHub: ${result.patcherUrl}`);
  }

  if (!result.mappingUpdateAvailable) {
    log("[update] 번역 데이터가 최신 상태입니다.");

    return {
      ...result,
      checked: true,
      updated: false,
      canContinue: true,
    };
  }

  log(
    `[update:available] 새 번역 데이터 ` +
      `${result.remoteMappingVersion}이 있습니다.`,
  );

  const shouldUpdate =
    autoUpdate === true
      ? true
      : autoUpdate === false
        ? false
        : await askToUpdate("지금 번역 데이터를 업데이트하시겠습니까?");

  if (!shouldUpdate) {
    log("[update] 번역 데이터 업데이트를 건너뜁니다.");

    return {
      ...result,
      checked: true,
      updated: false,
      canContinue: true,
    };
  }

  try {
    const updatedFiles = await applyMappingUpdate(result);

    for (const file of updatedFiles) {
      log(`[update:file] ${file}`);
    }

    log(
      `[update:success] 번역 데이터를 ` +
        `${result.remoteMappingVersion}으로 ` +
        "업데이트했습니다.",
    );

    return {
      ...result,
      checked: true,
      updated: true,
      updatedFiles,
      canContinue: true,
    };
  } catch (err) {
    warn(`[warn:update] 번역 데이터 업데이트 실패: ` + `${err.message}`);

    warn("[warn:update] 기존 번역 데이터로 계속 진행합니다.");

    return {
      ...result,
      checked: true,
      updated: false,
      canContinue: true,
      error: err,
    };
  }
}

function printHelp() {
  console.log("Perfect World Arena Korean Patch Updater");

  console.log("");
  console.log("사용법:");

  console.log(
    "  node patcher_update.js              " + "업데이트 확인 후 질문",
  );

  console.log(
    "  node patcher_update.js --check-only " + "업데이트 확인만 수행",
  );

  console.log("  node patcher_update.js --yes        " + "질문 없이 업데이트");
}

if (require.main === module) {
  const args = new Set(process.argv.slice(2));

  if (args.has("--help") || args.has("-h")) {
    printHelp();
  } else {
    runUpdateFlow({
      currentPatcherVersion:
        process.env.PWA_PATCHER_VERSION || DEFAULT_PATCHER_VERSION,

      autoUpdate: args.has("--yes")
        ? true
        : args.has("--check-only")
          ? false
          : undefined,
    })
      .then((result) => {
        if (!result.canContinue) {
          process.exitCode = 2;
        }
      })
      .catch((err) => {
        console.error(`[error:update] ${err.message}`);

        process.exitCode = 1;
      });
  }
}

module.exports = {
  DEFAULT_MANIFEST_URL,
  DEFAULT_PATCHER_VERSION,
  compareVersions,
  validateManifest,
  checkForUpdates,
  applyMappingUpdate,
  runUpdateFlow,
};
