import { isDiscoveryError } from "../errors.ts";
import { sortByJevRoles, uncertaintyFromRoles } from "../report/rank.ts";
import type { DiscoveryReport, RankedResource } from "../report/types.ts";
import { classificationCacheKey, evidenceHash, readCache, writeCache } from "./cache.ts";
import type { JevClient } from "./client.ts";
import { JEV_CONTRACT_SOURCES, JEV_QUESTION_SET_VERSION } from "./contract.ts";
import { mapLimit } from "./concurrency.ts";
import { hasClassifiableEvidence, buildJevState } from "./state.ts";

export type ClassifyReportOptions = {
  readonly client: JevClient;
  readonly model: string;
  readonly concurrency: number;
  readonly signal?: AbortSignal;
  readonly cacheDir?: string;
  readonly now?: () => string;
};

export async function classifyReport(
  report: DiscoveryReport,
  options: ClassifyReportOptions,
): Promise<DiscoveryReport> {
  let resolvedModel: string | undefined;
  const classified = await mapLimit(report.resources, options.concurrency, options.signal, async (resource) => {
    const next = await classifyResource(resource, options);
    if (next.resource.status === "classified" && resolvedModel === undefined) {
      resolvedModel = next.resolvedModel ?? options.model;
    }
    return next.resource;
  });
  return {
    ...report,
    generatedAt: options.now?.() ?? new Date().toISOString(),
    mode: "classified",
    rankingMethod: "jev-roles",
    jev: {
      ran: true,
      model: options.model,
      resolvedModel,
      questionSetVersion: JEV_QUESTION_SET_VERSION,
      contractSources: JEV_CONTRACT_SOURCES,
    },
    resources: sortByJevRoles(classified),
  };
}

async function classifyResource(
  resource: RankedResource,
  options: ClassifyReportOptions,
): Promise<{ resource: RankedResource; resolvedModel?: string }> {
  if (!hasClassifiableEvidence(resource)) {
    return {
      resource: {
        ...resource,
        roles: undefined,
        status: "insufficient-evidence",
        uncertainty: 1,
        classificationError: undefined,
      },
    };
  }

  const state = buildJevState(resource);
  const key = classificationCacheKey(options.model, evidenceHash(state));
  if (options.cacheDir !== undefined) {
    const cached = await readCache(options.cacheDir, key);
    if (cached !== undefined) {
      return {
        resolvedModel: cached.resolvedModel,
        resource: {
          ...resource,
          roles: cached.roles,
          status: "classified",
          uncertainty: uncertaintyFromRoles(cached.roles),
          classificationError: undefined,
        },
      };
    }
  }

  try {
    const result = await options.client.evaluate(state, options.signal);
    if (options.cacheDir !== undefined) {
      await writeCache(options.cacheDir, key, result);
    }
    return {
      resolvedModel: result.resolvedModel,
      resource: {
        ...resource,
        roles: result.roles,
        status: "classified",
        uncertainty: uncertaintyFromRoles(result.roles),
        classificationError: undefined,
      },
    };
  } catch (error) {
    const message = isDiscoveryError(error) ? error.message : error instanceof Error ? error.message : "classification failed";
    return {
      resource: {
        ...resource,
        roles: undefined,
        status: "classification-error",
        uncertainty: 1,
        classificationError: message,
      },
    };
  }
}
