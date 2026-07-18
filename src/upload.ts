import * as core from '@actions/core';
import { reportSchema, type LoopaReport } from './contracts.js';

const MAX_REPORT_BYTES = 2 * 1024 * 1024;

export async function uploadReport(
  apiBase: string,
  report: LoopaReport,
): Promise<{ reportId: string; status: string }> {
  const base = new URL(apiBase);
  if (base.protocol !== 'https:' && base.hostname !== 'localhost') {
    throw new Error('loopa-api-url must use HTTPS');
  }
  const payload = JSON.stringify(reportSchema.parse(report));
  if (Buffer.byteLength(payload) > MAX_REPORT_BYTES) {
    throw new Error('Validated report exceeds the 2 MiB delivery limit');
  }
  const audience = new URL('/github-actions', base).toString().replace(/\/$/, '');
  const token = await core.getIDToken(audience);
  core.setSecret(token);
  const endpoint = new URL('/api/github/actions/reports', base);
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'user-agent': 'loopa-agent-action/1.0.0',
        },
        body: payload,
        signal: AbortSignal.timeout(30_000),
      });
      const body = (await response.json().catch(() => ({}))) as {
        reportId?: string;
        status?: string;
        message?: string;
      };
      if (response.ok && body.reportId) {
        return { reportId: body.reportId, status: body.status ?? 'accepted' };
      }
      if (response.status < 500 && response.status !== 429) {
        throw new Error(body.message ?? `Loopa rejected the report (${response.status})`);
      }
      lastError = new Error(body.message ?? `Loopa upload failed (${response.status})`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw lastError ?? new Error('Loopa upload failed');
}
