import { readFileSync } from 'node:fs';
import Ajv from 'ajv';

const load = (name) => JSON.parse(readFileSync(new URL(`../../schema/${name}`, import.meta.url), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });

export const validateIndex = ajv.compile(load('index.schema.json'));
export const validateEnrichment = ajv.compile(load('enrichment.schema.json'));

export function formatErrors(validate, limit = 8) {
  return (validate.errors ?? [])
    .slice(0, limit)
    .map((e) => `${e.instancePath || '/'} ${e.message}`)
    .join('; ');
}
