import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCli } from "../../cli/run.ts";
import { JEV_ENV } from "../classify/config.ts";

function capture() {
  let stdout = "";
  let stderr = "";
  return {
    stdout: { write(text: string) { stdout += text; } },
    stderr: { write(text: string) { stderr += text; } },
    read() {
      return { stdout, stderr };
    },
  };
}

test("discover scan writes a local report and never calls fetch", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "force-scan-"));
  await mkdir(path.join(root, "Win", "Packs"), { recursive: true });
  await writeFile(path.join(root, "Win", "Packs", "Loc_enUS.~h"), "dfpfxxxx");
  await writeFile(path.join(root, "Win", "Packs", "Loc_enUS.~p"), "payload");
  await writeFile(
    path.join(root, "Win", "Packs", "loc_enus.txt"),
    "Packfile Loc_enUS.~p\nstringtable/brutallegend:Story\n",
  );
  const out = path.join(root, "report.json");
  const io = capture();
  let calls = 0;
  const code = await runCli(
    ["discover", "scan", "--game", "brutal-legend", "--root", root, "--out", out],
    {
      env: {},
      fetch: async () => {
        calls += 1;
        return new Response("no");
      },
      ...io,
    },
  );
  expect(code).toBe(0);
  expect(calls).toBe(0);
  const report = JSON.parse(await readFile(out, "utf8")) as {
    mode: string;
    rankingMethod: string;
    jev: { ran: boolean };
    resources: { relativePath: string; status: string }[];
  };
  expect(report.mode).toBe("scan");
  expect(report.rankingMethod).toBe("local-evidence");
  expect(report.jev.ran).toBe(false);
  expect(report.resources.every((item) => item.status === "unclassified")).toBe(true);
  expect(io.read().stdout).toContain("not run");
});

test("discover classify refuses to run without FORCE_JEV_API_KEY and does not call fetch", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "force-cls-"));
  const reportPath = path.join(root, "scan.json");
  await writeFile(
    reportPath,
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      gameId: "brutal-legend",
      root,
      mode: "scan",
      rankingMethod: "local-evidence",
      jev: { ran: false },
      coverage: {
        root,
        filesSeen: 0,
        filesInventoried: 0,
        walkExclusions: [],
        evidenceSkipped: [],
        unsupportedFormats: [],
        packEntryExtraction: "unsupported",
        notes: [],
      },
      resources: [],
    }),
  );
  const io = capture();
  let calls = 0;
  const code = await runCli(["discover", "classify", "--report", reportPath], {
    env: {},
    fetch: async () => {
      calls += 1;
      return new Response("no");
    },
    ...io,
  });
  expect(code).toBe(1);
  expect(calls).toBe(0);
  expect(io.read().stderr).toContain(JEV_ENV.API_KEY);
});
