import { expect, test } from "bun:test";
import { homedir } from "node:os";
import path from "node:path";
import { resolveBrutalLegendRoot } from "./root.ts";

test("explicit Brütal Legend root overrides the provided environment", () => {
  expect(resolveBrutalLegendRoot({ BRUTAL_LEGEND_ROOT: "/env/game" }, "/explicit/game")).toBe("/explicit/game");
});

test("Brütal Legend root uses the provided environment when no root is explicit", () => {
  expect(resolveBrutalLegendRoot({ BRUTAL_LEGEND_ROOT: "/env/game" })).toBe("/env/game");
});

test("Brütal Legend root defaults to Steam under the current home directory", () => {
  expect(resolveBrutalLegendRoot({})).toBe(path.join(homedir(), ".local/share/Steam/steamapps/common/BrutalLegend"));
});

test("blank Brütal Legend roots count as unset", () => {
  const steam = path.join(homedir(), ".local/share/Steam/steamapps/common/BrutalLegend");
  expect(resolveBrutalLegendRoot({ BRUTAL_LEGEND_ROOT: "" })).toBe(steam);
  expect(resolveBrutalLegendRoot({ BRUTAL_LEGEND_ROOT: "  " }, "")).toBe(steam);
  expect(resolveBrutalLegendRoot({ BRUTAL_LEGEND_ROOT: "/env/game" }, " ")).toBe("/env/game");
});
