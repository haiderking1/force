import { DiscoveryError } from "../errors.ts";
import { brutalLegendAdapter } from "./brutal-legend/adapter.ts";
import type { GameAdapter } from "./types.ts";

const ADAPTERS: Readonly<Record<string, GameAdapter>> = {
  [brutalLegendAdapter.id]: brutalLegendAdapter,
};

export function listGameIds(): string[] {
  return Object.keys(ADAPTERS);
}

export function getGameAdapter(id: string): GameAdapter {
  const adapter = ADAPTERS[id];
  if (adapter === undefined) {
    throw new DiscoveryError(
      "CONFIG",
      `Unknown game '${id}'. Known games: ${listGameIds().join(", ")}`,
    );
  }
  return adapter;
}
