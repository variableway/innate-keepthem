// Plugin manifest contract (docs/refactor/sprint-0/02-plugin-model.md §2).

export const PLUGIN_ENGINE_MAJOR = 1;

export type SlotName =
  | "nav"
  | "page"
  | "settings.section"
  | "downloads.form-tab"
  | "download-detail.action"
  | "command";

export interface SlotDeclaration {
  slot: SlotName;
  order?: number;
  /** page slot: the App Router route this plugin serves */
  route?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  /** required plugin-runtime major version, e.g. "^1" */
  engine: string;
  entry?: string;
  slots: SlotDeclaration[];
  /** capability whitelist: api:downloads, api:settings, api:analyze,
   *  api:metadata, api:media, shell:* */
  permissions: string[];
  i18n?: string;
  /** built-in plugins survive safe mode */
  builtin?: boolean;
}

export class ManifestError extends Error {}

/** Validate a manifest; throws ManifestError on contract violations. */
export function validateManifest(m: PluginManifest): void {
  if (!m || typeof m !== "object") throw new ManifestError("manifest is not an object");
  if (!m.id || !/^vytdl\.plugin\.[a-z0-9-]+$/.test(m.id)) {
    throw new ManifestError(`invalid plugin id: ${m?.id} (expected vytdl.plugin.<name>)`);
  }
  if (!m.name) throw new ManifestError(`${m.id}: name is required`);
  if (!m.version) throw new ManifestError(`${m.id}: version is required`);
  const engineMajor = parseEngineMajor(m.engine);
  if (engineMajor === null) {
    throw new ManifestError(`${m.id}: engine must look like "^1" (got "${m.engine}")`);
  }
  if (engineMajor !== PLUGIN_ENGINE_MAJOR) {
    throw new ManifestError(
      `${m.id}: engine ${m.engine} incompatible with runtime v${PLUGIN_ENGINE_MAJOR}`,
    );
  }
  if (!Array.isArray(m.slots)) throw new ManifestError(`${m.id}: slots must be an array`);
  for (const s of m.slots) {
    if (!s || typeof s.slot !== "string") throw new ManifestError(`${m.id}: malformed slot entry`);
    if (s.slot === "page" && !s.route) {
      throw new ManifestError(`${m.id}: page slot requires a route`);
    }
  }
  if (!Array.isArray(m.permissions)) throw new ManifestError(`${m.id}: permissions must be an array`);
}

/** "^1", "1.x", "1" → 1; invalid → null */
export function parseEngineMajor(engine: string): number | null {
  const m = /^\^?(\d+)(?:\.\S+)?$/.exec(String(engine ?? "").trim());
  return m ? Number(m[1]) : null;
}
