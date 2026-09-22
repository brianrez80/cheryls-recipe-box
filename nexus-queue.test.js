#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const nexusSource = fs.readFileSync(path.join(__dirname, 'nexus.js'), 'utf8');
const imagesSource = fs.readFileSync(path.join(__dirname, 'images.js'), 'utf8');
const context = {
  console,
  window: {
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    addEventListener: () => {},
    setTimeout: (fn) => { fn(); }
  },
  document: {
    getElementById: () => null,
    querySelectorAll: () => []
  },
  hideAllPanels: () => {},
  showPanel: () => {},
  ui: {},
  recipes: [],
  performOCR: async () => ({ title: 'Test Recipe', ingredients: '1 egg', instructions: 'Mix', categories: { main: 'Breakfast', ethnicity: 'American' }, cookTime: '10 min', rawText: 'Test' }),
  createDraftFromOCR: async () => ({ id: 'draft-1', name: 'Test Recipe', notes: 'Ingredients\n1 egg\n\nInstructions\nMix', status: 'draft' }),
  showReviewComparison: () => {}
};

vm.runInNewContext(`${nexusSource}\n${imagesSource}\nthis.__nexusTests = { getNexusDuplicateKey, isNexusDuplicate, clearIncompleteNexusImports, getNextNexusPendingEntry, removeNexusEntry, markNexusEntryFailed, buildNexusBatchEntry, renderImageHtml };`, context);

const { getNexusDuplicateKey, isNexusDuplicate, clearIncompleteNexusImports, getNextNexusPendingEntry, removeNexusEntry, markNexusEntryFailed, buildNexusBatchEntry, renderImageHtml } = context.__nexusTests;

const firstFile = { name: 'one.jpg', size: 100, lastModified: 10 };
const duplicateFile = { name: 'one.jpg', size: 100, lastModified: 10 };
const secondFile = { name: 'two.jpg', size: 200, lastModified: 11 };

assert.strictEqual(getNexusDuplicateKey(firstFile), 'one.jpg::100::10');
assert.strictEqual(isNexusDuplicate(firstFile, [{ key: getNexusDuplicateKey(firstFile) }]), true);
assert.strictEqual(isNexusDuplicate(secondFile, [{ key: getNexusDuplicateKey(firstFile) }]), false);

const queue = [
  { id: 'pending-1', status: 'pending' },
  { id: 'processing-1', status: 'processing' },
  { id: 'error-1', status: 'error' }
];
assert.strictEqual(getNextNexusPendingEntry(queue, false).id, 'pending-1');
assert.strictEqual(getNextNexusPendingEntry(queue, true), null);
assert.strictEqual(clearIncompleteNexusImports(queue).length, 1);
assert.strictEqual(removeNexusEntry(queue, 'pending-1').length, 2);
const failed = { status: 'processing' };
assert.strictEqual(markNexusEntryFailed(failed, 'bad image').status, 'error');
assert.strictEqual(markNexusEntryFailed(failed, 'bad image').error, 'bad image');
assert.strictEqual(getNexusDuplicateKey(firstFile), getNexusDuplicateKey(duplicateFile));
assert.strictEqual(isNexusDuplicate(duplicateFile, [{ key: getNexusDuplicateKey(firstFile) }]), true);
assert.strictEqual(isNexusDuplicate(secondFile, [{ key: getNexusDuplicateKey(firstFile) }]), false);

const batchFiles = [
  { name: 'one.jpg', size: 100, lastModified: 10 },
  { name: 'two.png', size: 200, lastModified: 11 },
  { name: 'three.jpeg', size: 300, lastModified: 12 }
];
const batchEntry = buildNexusBatchEntry(batchFiles, { id: 'batch-1' });
assert.strictEqual(batchEntry.files.length, 3);
assert.strictEqual(batchEntry.files[0].name, 'one.jpg');
assert.strictEqual(batchEntry.files[2].name, 'three.jpeg');

const reviewImagesMarkup = renderImageHtml(['https://img1', 'https://img2'], 'Test Recipe');
assert.match(reviewImagesMarkup, /https:\/\/img1/);
assert.match(reviewImagesMarkup, /https:\/\/img2/);

console.log('Nexus queue tests passed.');
