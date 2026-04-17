import type { Artifact } from "../domain";

export interface ArtifactStore {
  put(runId: string, artifact: Artifact, content?: Uint8Array | string): Promise<Artifact>;
  list(runId: string): Promise<Artifact[]>;
}
