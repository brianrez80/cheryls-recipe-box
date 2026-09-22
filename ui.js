// UI Management and Rendering

// DOM element caching
const ui = {
  homeView: null,
  mainBrowser: null,
  ethnicityBrowser: null,
  recipeResults: null,
  formPanel: null,
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
  ui.imageInput = document.getElementById('image');
  ui.backToTopBtn = document.getElementById('backToTopBtn');
  ui.pinScreen = document.getElementById('pinScreen');
  ui.pinForm = document.getElementById('pinForm');
  ui.pinInput = document.getElementById('pinInput');
  ui.pinError = document.getElementById('pinError');
}

function hideAllPanels() {
  document.querySelectorAll('.panel, [data-panel="true"]').forEach(el => {
    el.classList.add('hidden');
  });
}

function showPanel(panelElement) {
  if (!panelElement) return;
  panelElement.classList.remove('hidden');
  setTimeout(() => {
    panelElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
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
    const imageHtml = renderImageHtml(images, recipe.name);
    const meta = [
      recipe.mainCategory,
      recipe.ethnicity,
      recipe.time && `${recipe.time}`
    ].filter(Boolean).join(' • ');

    return `<article class="recipe-item">
      <h4>${escapeHtml(recipe.name)}</h4>
      <div class="meta">${escapeHtml(meta)}</div>
      ${imageHtml}
      <p>${escapeHtml(recipe.notes)}</p>
      <div class="actions">
        <button class="btn btn-edit" data-edit-id="${recipe.id}">Edit</button>
        <button class="btn btn-delete" data-delete-id="${recipe.id}">Delete</button>
      </div>
    </article>`;
  }).join('');
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
  const imageHtml = (originalImages || []).map((imageUrl, index) => {
    return `<div class="review-image-card">
      <img src="${imageUrl}" alt="${escapeHtml(recipe.name || 'Recipe image')} ${index + 1}" loading="lazy" onerror="this.style.display='none'">
      <div class="review-image-actions">
        <button type="button" class="btn secondary" data-review-image-move-up data-review-recipe-id="${recipe.id}" data-review-image-index="${index}">↑</button>
        <button type="button" class="btn secondary" data-review-image-move-down data-review-recipe-id="${recipe.id}" data-review-image-index="${index}">↓</button>
        <button type="button" class="btn danger" data-review-image-remove data-review-recipe-id="${recipe.id}" data-review-image-index="${index}">Remove</button>
      </div>
    </div>`;
  }).join('');

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
      ${Array.isArray(recipe.ocrWarnings) && recipe.ocrWarnings.length > 0 ? `<p class="review-hint">${escapeHtml(recipe.ocrWarnings[0])}</p>` : ''}
      <div class="image-grid">
        ${imageHtml}
      </div>
    </div>

    <form class="comparison-form" data-recipe-id="${recipe.id}">
      <div class="form-section">
        <label for="review-name">Recipe Name</label>
        <input type="text" id="review-name" name="name" value="${escapeHtml(recipe.name || '')}" placeholder="Please enter the recipe name.">
        ${recipe.name ? '' : '<p class="review-hint">Please enter the recipe name.</p>'}
      </div>

      <div class="form-row">
        <div class="form-section">
          <label for="review-time">Cook Time</label>
          <input type="text" id="review-time" name="time" value="${escapeHtml(recipe.time || '')}">
        </div>
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

      <div class="form-actions">
        <button type="button" class="btn secondary" data-cancel-review>Cancel</button>
        <button type="submit" class="btn danger" data-delete-review>Delete</button>
        <button type="submit" class="btn approve" data-approve-review>Approve & Publish</button>
      </div>
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
