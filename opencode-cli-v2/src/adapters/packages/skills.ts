import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

import { PackageAdapter } from '../base';
import type { AdapterHealthInput } from '../health';
import {
  SkillExecutionRequestSchema,
  SkillExecutionResultSchema,
  SkillLoadRequestSchema,
  type SkillExecutionResult,
  type SkillMetadata,
  type SkillsPort
} from '../../ports/skills';
import { createSkillsAdapterError, normalizeSkillsAdapterError, type SkillsAdapterErrorInit } from './skills-errors';
import {
  findSkillDocumentByName,
  listSkillDocuments,
} from './skills-filesystem';
import { matchSkillForContext } from './skills-context-selection';
import {
  parseLegacySkillsRuntime,
  toLegacyExecutionPayload,
  type LegacySkillDocument,
  type LegacySkillsRuntime
} from './skills-mappings';

const DEFAULT_LEGACY_MODULE_PATH = '../../../../packages/opencode-skill-loader/src/index.js';

export interface SkillsAdapterOptions {
  readonly skillsDir?: string;
  readonly modulePath?: string;
  readonly loadLegacyModule?: () => Promise<unknown>;
}

export class SkillsAdapter extends PackageAdapter<SkillsPort> {
  public readonly name = 'opencode-skill-loader';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('skills');
  public readonly required = true;

  private runtime: LegacySkillsRuntime = {};
  private readonly loadedSkills = new Map<string, LegacySkillDocument>();

  public constructor(private readonly options: SkillsAdapterOptions = {}) {
    super();
  }

  public async load(): Promise<void> {
    if (!this.options.loadLegacyModule && !this.options.modulePath) {
      this.runtime = {};
      return;
    }

    try {
      this.runtime = parseLegacySkillsRuntime(await this.loadLegacyModule());
    } catch (error: unknown) {
      throw normalizeSkillsAdapterError(error, { code: 'UNKNOWN', message: 'Failed to load legacy skills module' });
    }
  }

  public initialize(): Promise<void> {
    this.setPort({
      listSkills: () => this.toPromise(() => this.listSkills()),
      getSkill: (name) => this.toPromise(() => this.getSkill(name)),
      loadSkill: (request) => this.toPromise(() => this.loadSkill(request)),
      unloadSkill: (name) => this.toPromise(() => this.unloadSkill(name)),
      executeSkill: (request) => this.toPromise(() => this.executeSkill(request))
    });
    return Promise.resolve();
  }

  public async healthCheck(): Promise<AdapterHealthInput> {
    const skills = await listSkillDocuments(this.getSkillsDir());
    return skills.length > 0 ? { status: 'healthy' } : { status: 'degraded', details: 'No skills discovered' };
  }

  public async shutdown(): Promise<void> {
    this.loadedSkills.clear();
    this.runtime = {};
  }

  public async selectSkillsForContext(context: Record<string, unknown>): Promise<string[]> {
    if (this.runtime.selectSkillsForContext) {
      const value = await Promise.resolve(this.runtime.selectSkillsForContext(context));
      return this.parseWithSchema(z.array(z.string().min(1)), value, 'Legacy selectSkillsForContext returned invalid payload');
    }

    const docs = await this.listDocuments();
    return docs
      .map((doc) => ({ id: doc.id, score: matchSkillForContext(doc.legacy, context) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.id);
  }

  public async validateSkill(name: string): Promise<boolean> {
    const doc = await this.findSkillDocument(name);
    if (!doc) {
      return false;
    }

    if (!this.runtime.validateSkill) {
      return true;
    }

    const result = await Promise.resolve(this.runtime.validateSkill(doc.metadata.name));
    return typeof result === 'boolean' ? result : true;
  }

  private async listSkills(): Promise<SkillMetadata[]> {
    const docs = await this.listDocuments();
    return docs.map((doc) => doc.metadata);
  }

  private async getSkill(name: string): Promise<SkillMetadata | null> {
    return (await this.findSkillDocument(name))?.metadata ?? null;
  }

  private async loadSkill(request: unknown): Promise<{ loaded: boolean; metadata?: SkillMetadata; reason?: string }> {
    const parsed = this.parseWithSchema(SkillLoadRequestSchema, request, 'Invalid skill load request payload');
    const doc = await this.findSkillDocument(parsed.name);
    if (!doc) {
      return { loaded: false, reason: `Skill not found: ${parsed.name}` };
    }

    if (parsed.version && parsed.version !== doc.metadata.version) {
      return { loaded: false, reason: `Version mismatch for skill: ${parsed.name}` };
    }

    if (this.runtime.loadSkill) {
      await Promise.resolve(this.runtime.loadSkill(doc.metadata.name, { preload: parsed.preload }));
    }

    this.loadedSkills.set(doc.metadata.name, doc);
    return { loaded: true, metadata: doc.metadata };
  }

  private async unloadSkill(name: string): Promise<void> {
    const doc = await this.findSkillDocument(name);
    if (!doc) {
      throw createSkillsAdapterError({ code: 'SKILL_NOT_FOUND', message: `Skill not found: ${name}` });
    }

    if (this.runtime.unloadSkill) {
      await Promise.resolve(this.runtime.unloadSkill(doc.metadata.name));
    }

    this.loadedSkills.delete(doc.metadata.name);
  }

  private async executeSkill(request: unknown): Promise<SkillExecutionResult> {
    const parsed = this.parseWithSchema(SkillExecutionRequestSchema, request, 'Invalid skill execution request payload');
    const loaded = this.loadedSkills.get(parsed.name) ?? (await this.findSkillDocument(parsed.name));
    if (!loaded) {
      throw createSkillsAdapterError({ code: 'SKILL_NOT_FOUND', message: `Skill not found: ${parsed.name}` });
    }

    const startedAt = Date.now();
    try {
      const payload = toLegacyExecutionPayload(parsed);
      const output = this.runtime.executeSkill
        ? await Promise.resolve(this.runtime.executeSkill(payload.name, payload.args, payload.context))
        : { description: loaded.legacy.description, steps: loaded.legacy.steps, args: payload.args, context: payload.context };
      return SkillExecutionResultSchema.parse({ success: true, output, logs: [`Executed ${loaded.metadata.name}`], durationMs: Date.now() - startedAt });
    } catch (error: unknown) {
      return SkillExecutionResultSchema.parse({ success: false, logs: [`Execution failed for ${loaded.metadata.name}`], durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
    }
  }
  private async listDocuments(): Promise<LegacySkillDocument[]> {
    return listSkillDocuments(this.getSkillsDir());
  }

  private async findSkillDocument(name: string): Promise<LegacySkillDocument | undefined> {
    return findSkillDocumentByName(await listSkillDocuments(this.getSkillsDir()), name);
  }

  private async loadLegacyModule(): Promise<unknown> {
    return this.options.loadLegacyModule ? this.options.loadLegacyModule() : import(this.options.modulePath ?? DEFAULT_LEGACY_MODULE_PATH);
  }

  private getSkillsDir(): string {
    return this.options.skillsDir ?? join(homedir(), '.config', 'opencode', 'skills');
  }

  private parseWithSchema<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
    const result = schema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    throw normalizeSkillsAdapterError(result.error, { code: 'VALIDATION_ERROR', message });
  }

  private toPromise<T>(operation: () => T | Promise<T>): Promise<T> {
    return Promise.resolve().then(operation).catch((error: unknown) => {
      throw normalizeSkillsAdapterError(error, { code: 'UNKNOWN', message: 'Skills adapter operation failed' } satisfies SkillsAdapterErrorInit);
    });
  }
}
