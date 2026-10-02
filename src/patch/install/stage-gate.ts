import { isRecord } from "../../shared/validation/is-record.ts";
import { PatchError } from "../errors.ts";

export function assertStageFontComplete(manifest: unknown): void {
  if (!isRecord(manifest)) {
    throw new PatchError("SAFETY", "Refusing to apply a stage whose install manifest is not an object");
  }
  if (manifest.fontResourcesVerified !== true) {
    throw new PatchError(
      "SAFETY",
      "Refusing to apply a font-incomplete stage. Arabic will not render from a Latin-only DefineFont3 code table.",
    );
  }
  if (!Array.isArray(manifest.fontResources) || manifest.fontResources.length === 0) {
    throw new PatchError("SAFETY", "Refusing to apply a stage that lists no verified font resources");
  }
  for (const resource of manifest.fontResources) {
    if (!isRecord(resource) || resource.verified !== true || typeof resource.name !== "string") {
      throw new PatchError("SAFETY", "Refusing to apply a stage with an unverified font resource entry");
    }
  }
}
