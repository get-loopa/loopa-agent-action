import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { githubRunContext } from '../src/github-context.js';

const roots: string[] = [];
const originalEnvironment = { ...process.env };

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

afterEach(async () => {
  process.env = { ...originalEnvironment };
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('githubRunContext', () => {
  it('uses the previous release tag as the base of a release analysis', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'loopa-release-context-'));
    roots.push(root);
    git(root, 'init');
    git(root, 'config', 'user.name', 'Loopa Test');
    git(root, 'config', 'user.email', 'test@getloopa.com');
    await writeFile(path.join(root, 'README.md'), 'first\n');
    git(root, 'add', 'README.md');
    git(root, 'commit', '-m', 'first release');
    const previousSha = git(root, 'rev-parse', 'HEAD');
    git(root, 'tag', 'v1.0.0');
    await writeFile(path.join(root, 'README.md'), 'second\n');
    git(root, 'commit', '-am', 'second release');
    const headSha = git(root, 'rev-parse', 'HEAD');
    git(root, 'tag', 'v1.1.0');

    const eventPath = path.join(root, 'event.json');
    await writeFile(eventPath, JSON.stringify({ release: { tag_name: 'v1.1.0' } }));
    process.env.GITHUB_EVENT_PATH = eventPath;
    process.env.GITHUB_EVENT_NAME = 'release';
    process.env.GITHUB_WORKSPACE = root;
    process.env.GITHUB_SHA = headSha;

    const context = await githubRunContext();
    expect(context.run.headSha).toBe(headSha);
    expect(context.run.baseSha).toBe(previousSha);
  });
});
