import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { normalizeSkillIdFromPath, parseLegacySkillDocument, type LegacySkillDocument } from './skills-mappings';

const SKILL_FILENAME = 'SKILL.md';

export async function listSkillDocuments(skillsDir: string): Promise<LegacySkillDocument[]> {
  await access(skillsDir);
  const files = await listSkillFiles(skillsDir);
  const docs = await Promise.all(
    files.map(async (file) =>
      parseLegacySkillDocument(normalizeSkillIdFromPath(skillsDir, file), file, await readFile(file, 'utf8'))
    )
  );

  return docs.sort((a, b) => a.id.localeCompare(b.id));
}

export function findSkillDocumentByName(
  docs: readonly LegacySkillDocument[],
  name: string
): LegacySkillDocument | undefined {
  return docs.find((doc) => doc.id === name || doc.metadata.name === name);
}

async function listSkillFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => listSkillFiles(join(directory, entry.name)))
  );

  return [
    ...entries
      .filter((entry) => entry.isFile() && entry.name === SKILL_FILENAME)
      .map((entry) => join(directory, entry.name)),
    ...nested.flat()
  ];
}
