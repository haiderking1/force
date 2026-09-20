import { DiscoveryError } from "../errors.ts";

export type DiscoverScanArgs = {
  readonly command: "discover";
  readonly action: "scan";
  readonly game: string;
  readonly root: string | undefined;
  readonly out: string | undefined;
  readonly help: boolean;
};

export type DiscoverClassifyArgs = {
  readonly command: "discover";
  readonly action: "classify";
  readonly report: string;
  readonly out: string | undefined;
  readonly help: boolean;
};

export type DiscoverSummaryArgs = {
  readonly command: "discover";
  readonly action: "summary";
  readonly report: string;
  readonly help: boolean;
};

export type DiscoverShowArgs = {
  readonly command: "discover";
  readonly action: "show";
  readonly report: string;
  readonly id: string;
  readonly help: boolean;
};

export type DiscoverHelpArgs = {
  readonly command: "discover";
  readonly action: "help";
};

export type DiscoverPackListArgs = {
  readonly command: "discover";
  readonly action: "pack-list";
  readonly header: string;
  readonly payload: string | undefined;
  readonly out: string | undefined;
  readonly help: boolean;
};

export type DiscoverPackExtractArgs = {
  readonly command: "discover";
  readonly action: "pack-extract";
  readonly header: string;
  readonly payload: string | undefined;
  readonly entry: string;
  readonly out: string | undefined;
  readonly raw: boolean;
  readonly help: boolean;
};

export type DiscoverPackStringsArgs = {
  readonly command: "discover";
  readonly action: "pack-strings";
  readonly game: string | undefined;
  readonly root: string | undefined;
  readonly header: string | undefined;
  readonly payload: string | undefined;
  readonly out: string | undefined;
  readonly match: readonly string[];
  readonly help: boolean;
};

export type DiscoverArgs =
  | DiscoverScanArgs
  | DiscoverClassifyArgs
  | DiscoverSummaryArgs
  | DiscoverShowArgs
  | DiscoverPackListArgs
  | DiscoverPackExtractArgs
  | DiscoverPackStringsArgs
  | DiscoverHelpArgs;

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--") || value === "-h") {
    throw new DiscoveryError("VALIDATION", `${flag} requires a value`);
  }
  return value;
}

export function parseDiscoverArgs(argv: readonly string[]): DiscoverArgs {
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    return { command: "discover", action: "help" };
  }
  if (argv[0] === "pack") {
    return parsePackArgs(argv.slice(1));
  }
  const action = argv[0];
  if (action !== "scan" && action !== "classify" && action !== "summary" && action !== "show") {
    throw new DiscoveryError("VALIDATION", `Unknown discover action: ${action}`);
  }

  let game: string | undefined;
  let root: string | undefined;
  let out: string | undefined;
  let report: string | undefined;
  let id: string | undefined;
  let help = false;

  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "-h" || flag === "--help") {
      help = true;
      continue;
    }
    if (flag === "--game") {
      game = requiredValue(argv, index, "--game");
      index += 1;
      continue;
    }
    if (flag === "--root") {
      root = requiredValue(argv, index, "--root");
      index += 1;
      continue;
    }
    if (flag === "--out") {
      out = requiredValue(argv, index, "--out");
      index += 1;
      continue;
    }
    if (flag === "--report") {
      report = requiredValue(argv, index, "--report");
      index += 1;
      continue;
    }
    if (flag === "--id") {
      id = requiredValue(argv, index, "--id");
      index += 1;
      continue;
    }
    throw new DiscoveryError("VALIDATION", `Unknown argument: ${flag}`);
  }

  if (action === "scan") {
    if (game === undefined) {
      throw new DiscoveryError("VALIDATION", "discover scan requires --game");
    }
    return { command: "discover", action: "scan", game, root, out, help };
  }
  if (action === "classify") {
    if (report === undefined) {
      throw new DiscoveryError("VALIDATION", "discover classify requires --report");
    }
    return { command: "discover", action: "classify", report, out, help };
  }
  if (action === "summary") {
    if (report === undefined) {
      throw new DiscoveryError("VALIDATION", "discover summary requires --report");
    }
    return { command: "discover", action: "summary", report, help };
  }
  if (id === undefined || report === undefined) {
    throw new DiscoveryError("VALIDATION", "discover show requires --report and --id");
  }
  return { command: "discover", action: "show", report, id, help };
}

function parsePackArgs(argv: readonly string[]): DiscoverArgs {
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    return { command: "discover", action: "help" };
  }
  const action = argv[0];
  if (action !== "list" && action !== "extract" && action !== "strings") {
    throw new DiscoveryError("VALIDATION", `Unknown discover pack action: ${action}`);
  }

  let header: string | undefined;
  let payload: string | undefined;
  let entry: string | undefined;
  let out: string | undefined;
  let game: string | undefined;
  let root: string | undefined;
  let raw = false;
  let help = false;
  const match: string[] = [];

  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "-h" || flag === "--help") {
      help = true;
      continue;
    }
    if (flag === "--raw") {
      raw = true;
      continue;
    }
    if (flag === "--header") {
      header = requiredValue(argv, index, "--header");
      index += 1;
      continue;
    }
    if (flag === "--payload") {
      payload = requiredValue(argv, index, "--payload");
      index += 1;
      continue;
    }
    if (flag === "--entry") {
      entry = requiredValue(argv, index, "--entry");
      index += 1;
      continue;
    }
    if (flag === "--out") {
      out = requiredValue(argv, index, "--out");
      index += 1;
      continue;
    }
    if (flag === "--game") {
      game = requiredValue(argv, index, "--game");
      index += 1;
      continue;
    }
    if (flag === "--root") {
      root = requiredValue(argv, index, "--root");
      index += 1;
      continue;
    }
    if (flag === "--match") {
      match.push(requiredValue(argv, index, "--match"));
      index += 1;
      continue;
    }
    throw new DiscoveryError("VALIDATION", `Unknown argument: ${flag}`);
  }

  if (action === "list") {
    if (header === undefined) {
      throw new DiscoveryError("VALIDATION", "discover pack list requires --header");
    }
    return { command: "discover", action: "pack-list", header, payload, out, help };
  }
  if (action === "extract") {
    if (header === undefined || entry === undefined) {
      throw new DiscoveryError("VALIDATION", "discover pack extract requires --header and --entry");
    }
    return { command: "discover", action: "pack-extract", header, payload, entry, out, raw, help };
  }
  return { command: "discover", action: "pack-strings", game, root, header, payload, out, match, help };
}
