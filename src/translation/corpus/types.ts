export type CorpusSourceMapping = {
  readonly archiveHeader: string;
  readonly archivePayload: string | undefined;
  readonly entryName: string;
  readonly entryType: string | undefined;
  readonly entryIndex: number;
  readonly payloadOffset: number | undefined;
  readonly storedSize: number | undefined;
  readonly contentSize: number | undefined;
  readonly recordId: string;
  readonly sourceByteOffset: number | undefined;
  readonly extra: Readonly<Record<string, string | number | undefined>>;
};

export type CorpusItem = {
  readonly id: string;
  readonly text: string;
  readonly context?: string;
  readonly source: CorpusSourceMapping;
};

export type CorpusBatch = {
  readonly index: number;
  readonly items: readonly CorpusItem[];
};

export type CheckpointIdentity = {
  readonly schemaVersion: 1;
  readonly sourceHash: string;
  readonly sourceCount: number;
  readonly targetLanguage: string;
  readonly promptHash: string;
  readonly placeholders: readonly string[];
  readonly provider: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly temperature: number;
  readonly batchSize: number;
};

export type CorpusPlan = {
  readonly items: readonly CorpusItem[];
  readonly batches: readonly CorpusBatch[];
  readonly placeholders: readonly string[];
  readonly targetLanguage: string;
  readonly workers: number;
  readonly batchSize: number;
  readonly identity: CheckpointIdentity;
};
