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
export const BUDDHA_MAX_STORED = 8 * 1024 * 1024;

export const BUDDHA_CONTENT_BITS = 24;
export const BUDDHA_NAME_OFFSET_BITS = 21;
// Record bits 45-63: an extra content size, then one reserved bit. The decoded
// length is the 24-bit content size plus the extra size.
export const BUDDHA_EXTRA_CONTENT_BITS = 18;
export const BUDDHA_RESERVED_BITS = 1;
export const BUDDHA_EXTENSION_BITS = BUDDHA_EXTRA_CONTENT_BITS + BUDDHA_RESERVED_BITS;
// Largest decoded size the index can describe: (2^24 - 1) + (2^18 - 1).
export const BUDDHA_MAX_UNCOMPRESSED = (2 ** BUDDHA_CONTENT_BITS - 1) + (2 ** BUDDHA_EXTRA_CONTENT_BITS - 1);
export const BUDDHA_PAYLOAD_OFFSET_BITS = 29;
export const BUDDHA_STORED_SIZE_BITS = 23;

export const BUDDHA_COMPRESS_NONE = 4;
export const BUDDHA_COMPRESS_ZLIB = 8;
