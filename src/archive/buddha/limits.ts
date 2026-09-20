export const BUDDHA_MAGIC = "dfpf";
export const BUDDHA_SUPPORTED_MAJOR = 5;
export const BUDDHA_SUPPORTED_MINORS = [0, 1] as const;

export const BUDDHA_HEADER_PREFIX_SIZE = 88;
export const BUDDHA_ENTRY_SIZE = 16;
export const BUDDHA_MAX_HEADER_BYTES = 8 * 1024 * 1024;
export const BUDDHA_MAX_FILE_COUNT = 200_000;
export const BUDDHA_MAX_TYPE_COUNT = 1024;
export const BUDDHA_MAX_TYPE_NAME = 256;
export const BUDDHA_MAX_ENTRY_NAME = 1024;
export const BUDDHA_MAX_UNCOMPRESSED = 16 * 1024 * 1024;
export const BUDDHA_MAX_STORED = 8 * 1024 * 1024;

export const BUDDHA_CONTENT_BITS = 24;
export const BUDDHA_NAME_OFFSET_BITS = 21;
export const BUDDHA_UNKNOWN_BITS = 19;
export const BUDDHA_PAYLOAD_OFFSET_BITS = 29;
export const BUDDHA_STORED_SIZE_BITS = 23;

export const BUDDHA_COMPRESS_NONE = 4;
export const BUDDHA_COMPRESS_ZLIB = 8;
