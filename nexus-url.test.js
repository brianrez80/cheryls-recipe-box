#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('nexus.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
let savedRecipe;
let reviewRecipe;
const context = {
  window: { sessionStorage: { removeItem() {}, setItem() {} } },
  FormData: class { constructor(form) { this.form = form; } get() { return this.form.url; } },
  classifyRecipeLink: value => value.startsWith('https://youtu.be/')
    ? { url: value, kind: 'video', error: '' }
    : { url: value, kind: 'source', error: '' },
  generateId: () => 'draft-url-1',
  getRecipeOwnerForCurrentSpace: memberId => memberId,
  saveNewRecipe: async recipe => { savedRecipe = recipe; },
  recipes: [],
  hideAllPanels() {},
  showReviewComparison: recipe => { reviewRecipe = recipe; },
  document: { getElementById: id => id === 'nexusMemberId' ? { value: 'member-from-top-selector' } : null }, console
};
vm.createContext(context);
vm.runInContext(`${source}\nthis.testHooks = { openNexusRecipeLinkForm, handleNexusRecipeLinkImport };`, context);

const input = { focused: false, focus() { this.focused = true; } };
const classList = { hidden: true, remove(name) { if (name === 'hidden') this.hidden = false; }, add(name) { if (name === 'hidden') this.hidden = true; } };
const status = { textContent: '' };
const button = { disabled: false };
const form = { url: 'https://youtu.be/dQw4w9WgXcQ', classList, reset() {}, querySelector(selector) {
  if (selector === 'input') return input;
  if (selector === '[data-nexus-url-status]') return status;
  if (selector === 'button[type="submit"]') return button;
  return null;
} };

context.testHooks.openNexusRecipeLinkForm(form);
assert.equal(classList.hidden, false);
assert.equal(input.focused, true);
context.testHooks.handleNexusRecipeLinkImport({ preventDefault() {}, currentTarget: form }).then(() => {
  assert.equal(savedRecipe.videoUrl, 'https://youtu.be/dQw4w9WgXcQ');
  assert.equal(savedRecipe.sourceUrl, '');
  assert.equal(savedRecipe.memberId, 'member-from-top-selector');
  assert.equal(reviewRecipe.id, 'draft-url-1');
  assert.equal((html.match(/id="nexusMemberId"/g) || []).length, 1);
  assert.doesNotMatch(html, /id="nexusLinkMemberId"/);
  console.log('Nexus URL-entry tests passed.');
}).catch(error => { console.error(error); process.exit(1); });
