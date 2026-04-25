import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { log } from "./logger"

const PREFERENCE_FILENAME = "model-preference.json"
const PREFERENCE_VERSION = "1.0"

export interface ModelPreference {
  modelId: string
  timestamp: string
  version: string
}

export class UserPreference {
  private async getPreferencePath(): Promise<string> {
    const { getConfigDir } = await import("../cli/config-manager/config-context")
    return join(getConfigDir(), PREFERENCE_FILENAME)
  }

  async load(): Promise<string | null> {
    try {
      const filePath = await this.getPreferencePath()
      const raw = await readFile(filePath, "utf-8")
      const parsed = JSON.parse(raw) as Partial<ModelPreference>
      if (typeof parsed.modelId !== "string") {
        return null
      }
      const normalized = parsed.modelId.trim()
      return normalized.length > 0 ? normalized : null
    } catch {
      // Missing/corrupted preference should never break model resolution.
      return null
    }
  }

  async save(modelId: string): Promise<void> {
    const normalized = modelId.trim()
    if (normalized.length === 0) {
      return
    }

    try {
      const preference: ModelPreference = {
        modelId: normalized,
        timestamp: new Date().toISOString(),
        version: PREFERENCE_VERSION,
      }

      const filePath = await this.getPreferencePath()
      await mkdir(dirname(filePath), { recursive: true })

      const tmpPath = `${filePath}.tmp`
      await writeFile(tmpPath, `${JSON.stringify(preference, null, 2)}\n`, "utf-8")
      await rename(tmpPath, filePath)
    } catch (error) {
      log("[user-preference] Failed to persist preferred model", {
        modelId: normalized,
        error,
      })
    }
  }
}
