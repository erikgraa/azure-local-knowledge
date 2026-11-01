#!/usr/bin/env node
/**
 * Refresh the offline fixtures used by CI (`npm run build:index -- --fixtures`) and the tests.
 * Fetches a handful of representative files from the live sources and trims the large ones.
 *
 *   npm run fixtures:update
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rawFile } from './lib/fetch.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'test/fixtures');

const TSG_REPO = 'Azure/AzureLocal-Supportability';
const DOCS_REPO = 'MicrosoftDocs/azure-stack-docs';

const TSG_FILES = [
  'TSG/ArcRegistration/README.md',
  'TSG/ArcRegistration/TSG-Arc-registration-failing-with-error-42.md',
  'TSG/Deployment/README.md',
  'TSG/Deployment/TSG-Azure-LOCAL-HCI-missing-spn.md',
  'TSG/Deployment/Triggering-deployment-settings-validation-call-results-in-OperationTimeout-2411-0.md',
  'TSG/EnvironmentValidator/Troubleshooting-AzStackHci_Subscription_State.md',
  'TSG/Update/README.md',
  'TSG/Update/Update-CAU-run-fails-previous-CAU-run-status-was-Canceled.md',
  'TSG/Templates/Troubleshoot-Template.md',
];

async function write(rel, content) {
  const file = resolve(OUT, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
  console.log('wrote', rel, `${(content.length / 1024).toFixed(1)} KB`);
}

/** Keep the preamble plus the moniker blocks whose range matches one of `keep`. */
function trimKnownIssues(md, keep) {
  const lines = md.split('\n');
  const first = lines.findIndex((l) => l.startsWith('::: moniker range'));
  const out = lines.slice(0, first);
  let block = [];
  let wanted = false;
  let keptPrevious = false;
  for (const line of lines.slice(first)) {
    if (line.startsWith('::: moniker range')) {
      block = [line];
      const view = /=(azloc-[\w-]+)/.exec(line)?.[1];
      wanted = keep.includes(view) && !(view === 'azloc-previous' && keptPrevious);
      if (wanted && view === 'azloc-previous') keptPrevious = true;
      continue;
    }
    block.push(line);
    if (line.startsWith('::: moniker-end') && wanted) out.push(...block, '');
  }
  return out.join('\n');
}

async function main() {
  for (const path of TSG_FILES) {
    await write(`supportability/${path}`, await rawFile(TSG_REPO, 'main', path));
  }

  const ki = await rawFile(DOCS_REPO, 'main', 'azure-local/known-issues.md');
  await write('learn/known-issues.md', trimKnownIssues(ki, ['azloc-2610', 'azloc-2609', 'azloc-previous']));

  await write('learn/release-information-23h2.md', await rawFile(DOCS_REPO, 'main', 'azure-local/release-information-23h2.md'));

  const ki24 = await rawFile(DOCS_REPO, 'main', 'azure-local/previous-releases/known-issues-24.md');
  const cut = ki24.indexOf('## Known issues for version 2411.1');
  await write('learn/previous-releases/known-issues-24.md', cut > 0 ? ki24.slice(0, cut) : ki24);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
