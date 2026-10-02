import { resolveBrutalLegendRoot } from "../root.ts";
import type { GameAdapter } from "../../../discovery/games/types.ts";
import {
  BRUTAL_LEGEND_ALWAYS_EVIDENCE_EXTENSIONS,
  BRUTAL_LEGEND_GAME_ID,
  BRUTAL_LEGEND_INTERESTING_TYPES,
  BRUTAL_LEGEND_SCALEFORM_EXTENSIONS,
  BRUTAL_LEGEND_SKIP_EVIDENCE_EXTENSIONS,
  BRUTAL_LEGEND_SKIP_EVIDENCE_MIN_SIZE,
  BRUTAL_LEGEND_TEXT_EXTENSIONS,
} from "./config.ts";

export const brutalLegendAdapter: GameAdapter = {
  id: BRUTAL_LEGEND_GAME_ID,
  displayName: "Brütal Legend",
  defaultRoot: resolveBrutalLegendRoot,
  headerSuffix: ".~h",
  payloadSuffix: ".~p",
  manifestSuffixes: [".txt"],
  textExtensions: BRUTAL_LEGEND_TEXT_EXTENSIONS,
  scaleformExtensions: BRUTAL_LEGEND_SCALEFORM_EXTENSIONS,
  skipEvidenceExtensions: BRUTAL_LEGEND_SKIP_EVIDENCE_EXTENSIONS,
  skipEvidenceMinSize: BRUTAL_LEGEND_SKIP_EVIDENCE_MIN_SIZE,
  alwaysEvidenceExtensions: BRUTAL_LEGEND_ALWAYS_EVIDENCE_EXTENSIONS,
  interestingManifestTypes: BRUTAL_LEGEND_INTERESTING_TYPES,
};
