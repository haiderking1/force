import path from "node:path";
import { realpath } from "node:fs/promises";

export async function assertArtifactOutsideGame(root: string, output: string): Promise<void> {
  const game = await realpath(root);
  const destination = path.join(await realpath(path.dirname(path.resolve(output))), path.basename(output));
  const relative = path.relative(game, destination);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)))
    throw new Error("Unity artifacts must be outside the installed game");
}
