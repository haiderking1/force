import path from "node:path";
import { payloadPathFromHeader } from "../../../archive/companion-path.ts";
import { nonBlank, resolveBrutalLegendRoot } from "../root.ts";

export function resolveOriginalGameRoot(env: Readonly<Record<string, string | undefined>>): string {
  return nonBlank(env.FORCE_TEST_ORIGINAL_GAME_ROOT) ?? resolveBrutalLegendRoot(env);
}

export async function originalGamePack(
  relativeHeader: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<{ headerPath: string; payloadPath: string }> {
  const headerPath = path.join(resolveOriginalGameRoot(env), relativeHeader);
  const payloadPath = payloadPathFromHeader(headerPath);
  for (const filePath of [headerPath, payloadPath]) {
    if (!(await Bun.file(filePath).exists())) {
      throw new Error(
        `Missing original Brütal Legend fixture file: ${filePath}. Set FORCE_TEST_ORIGINAL_GAME_ROOT to an UNPATCHED game root or backup files directory containing this pack pair.`,
      );
    }
  }
  return { headerPath, payloadPath };
}
