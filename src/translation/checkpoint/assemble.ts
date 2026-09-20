import type { CorpusPlan } from "../corpus/types.ts";
import { writeJsonAtomic } from "./atomic.ts";
import type { AssembledOutput, AssembledTranslation } from "./types.ts";
import { CHECKPOINT_SCHEMA_VERSION } from "./types.ts";
import { loadCompletedTranslations } from "./store.ts";
import { checkpointPaths } from "./paths.ts";

export async function assembleTranslations(outDir: string, plan: CorpusPlan): Promise<AssembledOutput> {
  const completed = await loadCompletedTranslations(outDir, plan);
  const translations: AssembledTranslation[] = [];
  for (const item of plan.items) {
    const text = completed.get(item.id);
    if (text === undefined) {
      continue;
    }
    translations.push({
      id: item.id,
      text,
      sourceText: item.text,
      source: item.source,
    });
  }
  const output: AssembledOutput = {
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    identity: plan.identity,
    translations,
  };
  await writeJsonAtomic(checkpointPaths(outDir).assembled, output);
  return output;
}
