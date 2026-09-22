#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'ui.js'), 'utf8');

function section(id) {
  const match = html.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`));
  assert(match, `${id} section should exist`);
  return match[0];
}

const home = section('homeView');
const memberBox = section('memberRecipeBoxPanel');

['new', 'ocr-upload', 'review-queue'].forEach(action => {
  assert.doesNotMatch(home, new RegExp(`data-action="${action}"`));
  assert.doesNotMatch(memberBox, new RegExp(`data-member-action="${action}"`));
});

assert.match(home, /data-action="nexus"/);
assert.match(memberBox, /data-member-action="nexus"/);
assert.match(home, /class="home-button nexus-home-button" data-action="nexus"[\s\S]*class="nexus-home-title">Import Center<\/span>/);
assert.match(home, /class="nexus-home-description">Bring recipes into your box from photos or shared links\.<\/small>/);
assert.match(home, /class="nexus-home-art" src="butterfly\.svg"/);
assert.match(memberBox, /class="home-button nexus-home-button" data-member-action="nexus"[\s\S]*class="nexus-home-title">Import Center<\/span>/);

// The primary controls are hidden from these navigation surfaces, not removed.
assert.match(app, /case 'new'/);
assert.match(app, /case 'ocr-upload'/);
assert.match(app, /case 'review-queue'/);

const initializedButtons = [
  { dataset: { action: 'nexus' }, textContent: '📥' },
  { dataset: { memberAction: 'nexus' }, textContent: '📥' }
];
const runtimeContext = {
  document: {
    querySelectorAll: selector => {
      assert.equal(selector, 'button[data-action="nexus"], button[data-member-action="nexus"]');
      return initializedButtons;
    },
    getElementById: () => null
  }
};
vm.createContext(runtimeContext);
vm.runInContext(`${ui}\nthis.ensureImportCenterButtonLabels = ensureImportCenterButtonLabels;`, runtimeContext);
runtimeContext.ensureImportCenterButtonLabels();
assert.deepEqual(initializedButtons.map(button => button.textContent), ['📥 Import Center', '📥 Import Center']);

const memberContainer = { innerHTML: '' };
const memberContext = {
  document: {
    getElementById: id => id === 'memberSpaces' ? memberContainer : null,
    createElement: () => {
      let textContent = '';
      return {
        set textContent(value) { textContent = String(value); },
        get innerHTML() { return textContent; }
      };
    }
  },
  normalizeFamilyMemberName: value => String(value || '').trim().replace(/\s+/g, ' '),
  escapeHtml: value => String(value || '')
};
vm.createContext(memberContext);
vm.runInContext(`${ui}\nthis.renderMemberSpaces = renderMemberSpaces;`, memberContext);
memberContext.renderMemberSpaces([
  { id: 'cheryl', displayName: 'Cheryl', active: true },
  { id: 'brian', displayName: 'Brian', active: true },
  { id: 'tiffany', displayName: 'Tiffany', active: true },
  { id: 'bonnie-john', displayName: 'Bonnie and john', active: true }
]);
assert.match(memberContainer.innerHTML, /Cheryl's Recipes/);
assert.match(memberContainer.innerHTML, /Brian's Recipes/);
assert.doesNotMatch(memberContainer.innerHTML, /Tiffany|Bonnie/);

console.log('Simplified home controls tests passed.');
