import { homedir } from "node:os";
import path from "node:path";

// An empty or blank value counts as unset, so `BRUTAL_LEGEND_ROOT=` never resolves to the working directory.
export function nonBlank(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

export function resolveBrutalLegendRoot(
  env: Readonly<Record<string, string | undefined>>,
  explicitRoot?: string,
): string {
  return (
    nonBlank(explicitRoot) ??
    nonBlank(env.BRUTAL_LEGEND_ROOT) ??
    path.join(homedir(), ".local/share/Steam/steamapps/common/BrutalLegend")
  );
}
