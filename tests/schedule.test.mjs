import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../src/features/rollouts/schedule.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const { buildCalendarBatch } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const slot = {network:'instagram',aspect:'vertical',caption:'A new story',scheduledFor:'2026-09-25T10:00:00+12:00'};
test('batch preserves per-channel copy and formats, creates independent draft IDs', () => {
  const slots = [slot,{...slot,network:'youtube',aspect:'widescreen',caption:'Longer story'}];
  const batch = buildCalendarBatch('project-1',slots);
  assert.equal(batch.length,2);
  assert.notEqual(batch[0].id,batch[1].id);
  assert.equal(batch[1].caption,'Longer story');
  assert.equal(batch[1].aspect,'widescreen');
  assert.ok(batch.every(p => p.projectId === 'project-1' && p.status === 'draft' && !p.reminded && p.rolloutId === null));
  assert.equal(slots[0],slot);
});
test('preserves the scheduled instant across timezone conversion', () => {
  assert.equal(buildCalendarBatch('project-1',[slot])[0].scheduledFor,'2026-09-24T22:00:00.000Z');
});
test('rejects incomplete batches', () => {
  assert.throws(() => buildCalendarBatch('',[slot]));
  assert.throws(() => buildCalendarBatch('project-1',[]));
});
test('rejects invalid dates instead of scheduling immediately', () => {
  assert.throws(() => buildCalendarBatch('project-1',[{...slot,scheduledFor:''}]));
});
