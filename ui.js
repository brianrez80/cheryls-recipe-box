// UI Management and Rendering

// DOM element caching
const ui = {
  homeView: null,
  mainBrowser: null,
  ethnicityBrowser: null,
  recipeResults: null,
  formPanel: null,
  memberRecipeBoxPanel: null,
  memberFormPanel: null,
  ocrUploadPanel: null,
  reviewQueuePanel: null,
  reviewComparisonPanel: null,
  nexusPanel: null,
  mainChips: null,
  ethnicityChips: null,
  recipeList: null,
  resultsTitle: null,
  formTitle: null,
  form: null,
  memberForm: null,
  imageInput: null,
  backToTopBtn: null,
  pinScreen: null,
  pinForm: null,
  pinInput: null,
  pinError: null
};

function initializeUI() {
  // Cache DOM elements
  ui.homeView = document.getElementById('homeView');
  ui.mainBrowser = document.getElementById('mainBrowser');
  ui.ethnicityBrowser = document.getElementById('ethnicityBrowser');
  ui.recipeResults = document.getElementById('recipeResults');
  ui.formPanel = document.getElementById('formPanel');
  ui.memberRecipeBoxPanel = document.getElementById('memberRecipeBoxPanel');
  ui.memberFormPanel = document.getElementById('memberFormPanel');
  ui.ocrUploadPanel = document.getElementById('ocrUploadPanel');
  ui.reviewQueuePanel = document.getElementById('reviewQueuePanel');
  ui.reviewComparisonPanel = document.getElementById('reviewComparisonPanel');
  ui.nexusPanel = document.getElementById('nexusPanel');
  ui.mainChips = document.getElementById('mainChips');
  ui.ethnicityChips = document.getElementById('ethnicityChips');
  ui.recipeList = document.getElementById('recipeList');
  ui.resultsTitle = document.getElementById('resultsTitle');
  ui.formTitle = document.getElementById('formTitle');
  ui.form = document.getElementById('recipeForm');
  ui.memberForm = document.getElementById('familyMemberForm');
  ui.imageInput = document.getElementById('image');
  ui.backToTopBtn = document.getElementById('backToTopBtn');
  ui.pinScreen = document.getElementById('pinScreen');
  ui.pinForm = document.getElementById('pinForm');
  ui.pinInput = document.getElementById('pinInput');
  ui.pinError = document.getElementById('pinError');
  ensureImportCenterButtonLabels();
}

// Keep the primary import action as literal text in the final initialized DOM.
// This intentionally uses textContent rather than nested presentation markup.
function ensureImportCenterButtonLabels() {
  const importButtons = document.querySelectorAll?.(
    'button[data-action="nexus"], button[data-member-action="nexus"]'
  ) || [];
  importButtons.forEach(button => {
    const title = button.querySelector?.('.nexus-home-title');
    if (title) {
      title.textContent = 'Import Center';
    } else {
      button.textContent = '📥 Import Center';
    }
  });
}

function renderMemberRecipeBox(member) {
  if (!ui.memberRecipeBoxPanel || !member) return;
  const title = `${member.displayName}'s Recipe Box`;
  ui.memberRecipeBoxPanel.querySelector('[data-member-box-title]').textContent = title;
  ui.memberRecipeBoxPanel.querySelector('[data-member-box-description]').textContent = `Recipes saved for ${member.displayName}.`;
  ensureImportCenterButtonLabels();
}

function renderMemberSpaces(members) {
  const container = document.getElementById('memberSpaces');
  if (!container) return;

  const visibleNames = new Set(['cheryl', 'brian']);
  const activeMembers = (members || []).filter(member => member.active !== false
    && visibleNames.has(normalizeFamilyMemberName(member.displayName).toLocaleLowerCase()));
  container.innerHTML = activeMembers.map(member => `
    <button class="home-button member-space-button" data-member-id="${escapeHtml(member.id)}">
      ${escapeHtml(member.displayName)}'s Recipes
    </button>`).join('');
}

function hideAllPanels() {
  document.querySelectorAll('.panel, [data-panel="true"]').forEach(el => {
    el.classList.add('hidden');
  });
}

function showPanel(panelElement) {
  if (!panelElement) return;
  renderMemberSpaceContext(panelElement);
  panelElement.classList.remove('hidden');
  setTimeout(() => {
    panelElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

function renderMemberSpaceContext(panelElement) {
  panelElement.querySelector?.('.member-space-context')?.remove();
  const member = typeof getActiveRecipeSpaceMember === 'function' ? getActiveRecipeSpaceMember() : null;
  if (!member || panelElement === ui.memberRecipeBoxPanel || panelElement === ui.nexusPanel) return;

  const context = document.createElement('div');
  context.className = 'member-space-context';
  context.innerHTML = `<strong>${escapeHtml(member.displayName)}'s Recipe Box</strong>
    <button type="button" class="btn secondary" data-return-to-member-box>Back to ${escapeHtml(member.displayName)}'s Recipe Box</button>`;
  panelElement.prepend(context);
}

// Render category chips for filtering
function renderCategoryChips() {
  if (ui.mainChips) {
    ui.mainChips.innerHTML = MAIN_CATEGORIES.map(category =>
      `<button class="chip" data-filter-type="mainCategory" data-filter-value="${category}">
        ${category}
      </button>`
    ).join('');
  }

  if (ui.ethnicityChips) {
    ui.ethnicityChips.innerHTML = ETHNICITIES.map(eth =>
      `<button class="chip" data-filter-type="ethnicity" data-filter-value="${eth}">
        ${eth}
      </button>`
    ).join('');
  }
}

// Render approved recipes
function renderRecipes(recipes, title = 'Recipes') {
  if (!ui.recipeResults || !ui.recipeList) return;
  
  ui.resultsTitle.textContent = title;
  showPanel(ui.recipeResults);

  if (!recipes || recipes.length === 0) {
    ui.recipeList.innerHTML = '<p>No recipes found.</p>';
    return;
  }

  ui.recipeList.innerHTML = recipes.map(recipe => {
    const images = getRecipeImages(recipe);
    const imageHtml = renderImageHtml(images, recipe.name, 'recipe-image-gallery');
    const meta = [
      recipe.mainCategory,
      recipe.ethnicity,
      recipe.time && `${recipe.time}`
    ].filter(Boolean).join(' • ');

    return `<article class="recipe-item" data-recipe-id="${escapeHtml(recipe.id)}">
      <h4>${escapeHtml(recipe.name)}</h4>
      <div class="meta">${escapeHtml(meta)}</div>
      <div class="recipe-owner">${escapeHtml(recipe.memberName || 'Family')}’s Recipe</div>
      ${imageHtml}
      <p>${escapeHtml(recipe.notes)}</p>
      <div class="actions">
        <button class="btn btn-edit" data-edit-id="${recipe.id}">Edit</button>
        <button class="btn btn-delete" data-delete-id="${recipe.id}">Delete</button>
      </div>
    </article>`;
  }).join('');

  ui.recipeList.querySelectorAll?.('.recipe-item[data-recipe-id]').forEach(card => {
    const recipe = recipes.find(item => String(item.id) === card.dataset.recipeId);
    if (recipe) appendRecipeLinks(card, recipe);
  });
}

function appendRecipeLinks(card, recipe) {
  const videoUrl = normalizeRecipeUrl(recipe.videoUrl).url;
  const sourceUrl = normalizeRecipeUrl(recipe.sourceUrl).url;
  const embedUrl = getYouTubeEmbedUrl(videoUrl);
  const actions = card.querySelector('.actions');

  if (embedUrl) {
    const container = document.createElement('div');
    container.className = 'recipe-video-container';
    const iframe = document.createElement('iframe');
    iframe.className = 'recipe-video-iframe';
    iframe.src = embedUrl;
    iframe.title = `${recipe.name || 'Recipe'} video`;
    iframe.loading = 'lazy';
    iframe.allowFullscreen = true;
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    container.appendChild(iframe);
    card.insertBefore(container, actions);
  } else if (videoUrl) {
    const watch = document.createElement('a');
    watch.className = 'btn recipe-video-button';
    watch.href = videoUrl;
    watch.target = '_blank';
    watch.rel = 'noopener noreferrer';
    watch.textContent = '▶ Watch Recipe Video';
    card.insertBefore(watch, actions);
  }

  if (sourceUrl) {
    const source = document.createElement('a');
    source.className = 'recipe-source-link';
    source.href = sourceUrl;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = 'View Original Recipe →';
    card.insertBefore(source, actions);
  }
}

// Render draft recipes waiting for review
function renderReviewQueue(recipes) {
  if (!ui.reviewQueuePanel) return;
  
  const list = ui.reviewQueuePanel.querySelector('[data-review-list]');
  if (!list) return;

  if (!recipes || recipes.length === 0) {
    list.innerHTML = '<p>No recipes pending review.</p>';
    return;
  }

  list.innerHTML = recipes.map(recipe => {
    const images = getRecipeImages(recipe);
    const imageHtml = renderImageHtml(images, recipe.name);

    return `<article class="review-item" data-recipe-id="${recipe.id}">
      <div class="review-header">
        <h4>${escapeHtml(recipe.name || 'Untitled')}</h4>
        <span class="badge badge-draft">Draft - from ${escapeHtml(recipe.contributorName || 'Contributor')}</span>
      </div>
      <div class="review-images">
        ${imageHtml}
      </div>
      <div class="review-content">
        <div class="field">
          <strong>Categories:</strong> ${escapeHtml((recipe.mainCategory || '') + ' • ' + (recipe.ethnicity || ''))}
        </div>
        <div class="field">
          <strong>Cook Time:</strong> ${escapeHtml(recipe.time || 'Not specified')}
        </div>
        <div class="field">
          <strong>Notes/Instructions:</strong>
          <p>${escapeHtml(recipe.notes || '')}</p>
        </div>
      </div>
      <div class="review-actions">
        <button class="btn btn-edit" data-review-edit="${recipe.id}">Review & Edit</button>
        <button class="btn btn-delete" data-review-delete="${recipe.id}">Delete</button>
      </div>
    </article>`;
  }).join('');

  showPanel(ui.reviewQueuePanel);
}

// Show review comparison/edit view
function showReviewComparison(recipe) {
  if (!ui.reviewComparisonPanel) return;

  const originalImages = getRecipeImages(recipe);
  const imageHtml = renderImageHtml(originalImages, recipe.name);

  const panel = ui.reviewComparisonPanel;
  const comparison = panel.querySelector('[data-comparison-view]');
  if (!comparison) return;

  comparison.innerHTML = `
    <div class="comparison-header">
      <h3>Review Recipe: ${escapeHtml(recipe.name || 'Untitled')}</h3>
      <p class="meta">Submitted by ${escapeHtml(recipe.contributorName || 'Contributor')}</p>
    </div>
    
    <div class="comparison-images">
      <h4>Original Images</h4>
      <div class="image-grid">
        ${imageHtml}
      </div>
    </div>

    <form class="comparison-form" data-recipe-id="${recipe.id}">
      <div class="form-section">
        <label for="review-name">Recipe Name</label>
        <input type="text" id="review-name" name="name" value="${escapeHtml(recipe.name || '')}" required>
      </div>

      <div class="form-row">
        <div class="form-section">
          <label for="review-time">Cook Time</label>
          <input type="text" id="review-time" name="time" value="${escapeHtml(recipe.time || '')}">
        </div>
      </div>

      <div class="form-section">
        <label for="review-member">Who does this recipe belong to?</label>
        <select id="review-member" name="memberId" data-member-select required>
          ${getFamilyMemberOptionsHtml(getRecipeMemberId(recipe))}
        </select>
      </div>

      <div class="form-row">
        <div class="form-section">
          <label for="review-category">Main Category</label>
          <select id="review-category" name="mainCategory" required>
            <option value="">Choose category</option>
            ${MAIN_CATEGORIES.map(cat => 
              `<option value="${cat}" ${recipe.mainCategory === cat ? 'selected' : ''}>${cat}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-section">
          <label for="review-ethnicity">Ethnicity/Cuisine</label>
          <select id="review-ethnicity" name="ethnicity" required>
            <option value="">Choose ethnicity</option>
            ${ETHNICITIES.map(eth => 
              `<option value="${eth}" ${recipe.ethnicity === eth ? 'selected' : ''}>${eth}</option>`
            ).join('')}
          </select>
        </div>
      </div>

      <div class="form-section">
        <label for="review-notes">Ingredients / Instructions</label>
        <textarea id="review-notes" name="notes" required>${escapeHtml(recipe.notes || '')}</textarea>
      </div>

      <div class="form-section full">
        <label for="review-video-url">Recipe Video Link</label>
        <input type="url" id="review-video-url" name="videoUrl" value="${escapeHtml(recipe.videoUrl || '')}" placeholder="https://www.youtube.com/watch?v=...">
        <small>Paste a YouTube or other recipe video link.</small>
      </div>

      <div class="form-section full">
        <label for="review-source-url">Original Recipe Link</label>
        <input type="url" id="review-source-url" name="sourceUrl" value="${escapeHtml(recipe.sourceUrl || '')}" placeholder="https://example.com/my-recipe">
        <small>Optional link to the original recipe page.</small>
      </div>

      <div class="form-actions">
        <button type="button" class="btn secondary" data-cancel-review>Cancel</button>
        <button type="button" class="btn danger" data-delete-review>Delete</button>
        <button type="submit" class="btn approve" data-approve-review>Approve & Publish</button>
      </div>
      <p class="review-publish-status hidden" data-review-publish-status role="status" aria-live="polite"></p>
    </form>
  `;

  showPanel(ui.reviewComparisonPanel);
}

// Scroll to top button handler
function setupScrollToTop() {
  if (!ui.backToTopBtn) return;

  window.addEventListener('scroll', () => {
    ui.backToTopBtn.style.display = window.scrollY > 300 ? 'block' : 'none';
  });

  ui.backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// Utility: Escape HTML to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
