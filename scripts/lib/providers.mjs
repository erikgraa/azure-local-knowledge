import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MODEL_RE = /^[\w.:/-]{1,80}$/;

/**
 * Run the GitHub Copilot CLI non-interactively. The prompt goes in on stdin, the answer comes
 * back on stdout. Every tool is denied and the process runs in an empty temp directory, so the
 * (untrusted) documents in the prompt cannot cause side effects - it is pure text in, text out.
 * Auth: COPILOT_GITHUB_TOKEN (fine-grained PAT with the "Copilot Requests" permission).
 */
export async function runCopilotCli(prompt, { model, timeoutMs = 5 * 60_000, bin = process.env.COPILOT_BIN || 'copilot' } = {}) {
  if (model && !MODEL_RE.test(model)) throw new Error(`Refusing suspicious model name: ${model}`);
  const args = [
    '-s',
    '--no-ask-user',
    '--no-color',
    '--no-custom-instructions',
    '--disable-builtin-mcps',
    '--deny-tool=shell',
    '--deny-tool=write',
    ...(model ? ['--model', model] : []),
  ];
  const cwd = await mkdtemp(join(tmpdir(), 'azlocal-enrich-'));
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(bin, args, {
        cwd,
        shell: process.platform === 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1' },
      });
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`copilot timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 && out.trim()) resolve(out);
        else reject(new Error(`copilot exited ${code}: ${(err || out).trim().slice(0, 400)}`));
      });
      child.stdin.on('error', () => {});
      child.stdin.end(prompt);
    });
  } finally {
    await rm(cwd, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * GitHub Models alternative that needs no extra secret: the workflow's GITHUB_TOKEN with
 * `models: read` permission.
 */
export async function runGitHubModels(prompt, { model = 'openai/gpt-4.1', token = process.env.GITHUB_TOKEN, timeoutMs = 3 * 60_000 } = {}) {
  if (!token) throw new Error('GITHUB_TOKEN is required for the github-models provider');
  const res = await fetch('https://models.github.ai/inference/chat/completions', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`GitHub Models ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('GitHub Models returned no content');
  return content;
}

export const PROVIDERS = {
  'copilot-cli': {
    run: runCopilotCli,
    // In Actions the default GITHUB_TOKEN only works when the workflow opts in (COPILOT_USE_GITHUB_TOKEN=true,
    // with `copilot-requests: write`); otherwise the dedicated PAT secret is required.
    available: () =>
      Boolean(process.env.COPILOT_GITHUB_TOKEN) || process.env.COPILOT_USE_GITHUB_TOKEN === 'true' || !process.env.GITHUB_ACTIONS,
  },
  'github-models': { run: runGitHubModels, available: () => Boolean(process.env.GITHUB_TOKEN) },
  // Test double (no network): answers every ITEM in the prompt. ENRICH_MOCK_MODE=invalid returns garbage.
  mock: { run: runMock, available: () => true },
};

async function runMock(prompt) {
  if (process.env.ENRICH_MOCK_MODE === 'invalid') return 'sorry, I cannot help with that';
  if (process.env.ENRICH_MOCK_MODE === 'schema') return JSON.stringify({ results: [{ id: 'x', confidence: 'certain' }] });
  const ids = [...prompt.matchAll(/^### ITEM (\S+)$/gm)].map((m) => m[1]);
  return JSON.stringify({
    results: ids.map((id) => ({
      id,
      confidence: 'medium',
      versionRanges: [],
      osVersions: [],
      errorAliases: [`alias for ${id}`],
      normalizedErrors: [],
      symptomSummary: `Summary of ${id}`,
      mitigationSummary: null,
      related: [],
      flags: [],
    })),
  });
}
