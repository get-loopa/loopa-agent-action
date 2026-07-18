import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { actionConfigSchema, type ActionConfig } from './contracts.js';

export async function loadConfig(
  workspace: string,
  configPath: string,
): Promise<ActionConfig> {
  const absolute = path.resolve(workspace, configPath);
  const relative = path.relative(workspace, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('config-path must resolve inside GITHUB_WORKSPACE');
  }
  const source = await readFile(absolute, 'utf8');
  return actionConfigSchema.parse(parse(source));
}
