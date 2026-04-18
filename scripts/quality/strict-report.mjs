import { spawnSync } from "node:child_process";

const proc = spawnSync(
  "pnpm",
  [
    "exec",
    "tsc",
    "-p",
    "tsconfig.strict.json",
    "--noEmit",
    "--strict",
    "--pretty",
    "false",
  ],
  {
    encoding: "utf8",
  },
);

const output = `${proc.stdout ?? ""}\n${proc.stderr ?? ""}`;
const lines = output.split("\n");

/** @type {Record<string, number>} */
const files = {};

for (const line of lines) {
  const match = line.match(/^(src\/[^(:]+)\(\d+,\d+\): error TS\d+:/);
  if (!match) {
    continue;
  }

  const file = match[1];
  files[file] = (files[file] ?? 0) + 1;
}

const bucket = {
  "src/ts (legacy engine)": 0,
  "src/nostr-overlay": 0,
  "src/nostr": 0,
  "src/nostr-api": 0,
  "src/main.ts": 0,
  other: 0,
};

for (const [file, count] of Object.entries(files)) {
  if (file.startsWith("src/ts/")) {
    bucket["src/ts (legacy engine)"] += count;
  } else if (file.startsWith("src/nostr-overlay/")) {
    bucket["src/nostr-overlay"] += count;
  } else if (file.startsWith("src/nostr/")) {
    bucket["src/nostr"] += count;
  } else if (file.startsWith("src/nostr-api/")) {
    bucket["src/nostr-api"] += count;
  } else if (file === "src/main.ts") {
    bucket["src/main.ts"] += count;
  } else {
    bucket.other += count;
  }
}

const total = Object.values(files).reduce((sum, count) => sum + count, 0);

console.log(
  JSON.stringify(
    {
      total,
      bucket,
      files,
    },
    null,
    2,
  ),
);

process.exit(0);
