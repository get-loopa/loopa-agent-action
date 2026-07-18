import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { actionConfigSchema } from '../src/contracts.js';
import { RepositoryReader } from '../src/repository.js';

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('RepositoryReader', () => {
  it('excludes secrets and refuses paths outside the workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'loopa-action-'));
    roots.push(root);
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'index.ts'), 'export const value = 1;');
    await writeFile(path.join(root, '.env'), 'SECRET=value');
    const reader = new RepositoryReader(root, actionConfigSchema.parse({ version: 1 }));
    expect(await reader.listFiles()).toEqual(['src/index.ts']);
    await expect(reader.readText('../outside')).rejects.toThrow(/outside/);
  });

  it('refuses symlink reads', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'loopa-action-'));
    roots.push(root);
    await writeFile(path.join(root, 'target.txt'), 'content');
    await symlink(path.join(root, 'target.txt'), path.join(root, 'link.txt'));
    const reader = new RepositoryReader(root, actionConfigSchema.parse({ version: 1 }));
    await expect(reader.readText('link.txt')).rejects.toThrow(/non-symlink/);
  });
});
