// Main Application Controller

let recipes = [];
let editingId = null;
let familyMembers = [];
let activeMemberId = null;
let privateStateRevision = 0;

function captureRecipeOperation() {
  const started = privateStateRevision;
  return () => started === privateStateRevision &&
    (typeof isUserAuthenticated !== 'function' || isUserAuthenticated());
}

// Initialize the application
async function initializeApp() {
  console.log('Initializing Cheryl\'s Recipe Box...');

  // Initialize UI
  initializeUI();

  // Initialize Supabase
  initializeSupabase();

  // Setup event listeners
  setupEventListeners();

  // Setup scroll to top
  setupScrollToTop();

  // Initialize the Phase 2 Nexus workspace interactions
  initializeNexus();

  // Render initial UI
  renderCategoryChips();
  renderMemberSpaces(familyMembers);
  populateStaticMemberSelects();
  renderOCRUploadForm();

  document.querySelectorAll('[data-return-home]').forEach(button => button.addEventListener('click', returnToRecipeSpaceHome));
  document.querySelector('[data-cancel-recipe]')?.addEventListener('click', () => {
    editingId = null; ui.form.reset(); returnToRecipeSpaceHome();
  });
  document.querySelector('[data-new-recipe]')?.addEventListener('click', () => { hideAllPanels(); startNewRecipe(); });
  document.querySelector('[data-review-saved]')?.addEventListener('click', () => {
    activeMemberId = null; hideAllPanels(); void loadAndShowReviewQueue();
  });
  document.getElementById('recipeSearchForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const query = document.getElementById('recipeSearch').value.trim().toLocaleLowerCase();
    renderRecipes(getAllPublishedRecipes().filter(recipe =>
      [recipe.name,recipe.notes,recipe.mainCategory,recipe.ethnicity].some(value => String(value || '').toLocaleLowerCase().includes(query))
    ), query ? 'Search Results' : 'All Recipes');
  });
  await initializeAuth();
  console.log('App initialized successfully');
}

// Only called after verified identity AND successful database admission.
async function loadPrivateRecipeCollection() {
  const isCurrent = captureRecipeOperation();
  const [members, items] = await Promise.all([fetchFamilyMembers(), fetchAllRecipes()]);
  if (!isCurrent()) return;
  if (!Array.isArray(members) || !Array.isArray(items)) throw new Error('Private collection unavailable');
  familyMembers = getOrderedFamilyMembers(members);
  recipes = hydrateRecipeMembers(items);
  activeMemberId = null;
  renderMemberSpaces(familyMembers);
  populateStaticMemberSelects();
  returnToRecipeSpaceHome();
}

function clearPrivateRecipeState() {
  privateStateRevision += 1;
  recipes = []; familyMembers = []; editingId = null; activeMemberId = null;
  if (typeof clearPrivateImages === 'function') clearPrivateImages();
  if (typeof nexusImportState !== 'undefined') {
    nexusImportState.queue = []; nexusImportState.currentItem = null;
    nexusImportState.processing = false; nexusImportState.sessionId = null;
  }
  if (typeof ocrState !== 'undefined') {
    ocrState.contributorName = ''; ocrState.uploadedFiles = []; ocrState.processingRecipes = [];
  }
  try { window.sessionStorage.removeItem('nexusImportState'); window.sessionStorage.removeItem('cheryl-recipe-box-unlocked'); } catch {}
  document.querySelectorAll('main form').forEach(form => form.reset());
  for (const selector of ['#recipeList','#memberSpaces','[data-review-list]','[data-comparison-view]','[data-review-comparison]','.review-comparison']) {
    document.querySelectorAll(selector).forEach(node => { node.replaceChildren(); });
  }
  if (ui.nexusPanel && typeof renderNexusQueue === 'function') renderNexusQueue(ui.nexusPanel);
  hideAllPanels();
}

async function loadFamilyMembers() {
  try {
    const data = await fetchFamilyMembers();
    familyMembers = getOrderedFamilyMembers(Array.isArray(data) && data.length > 0 ? data : getDefaultFamilyMembers());
  } catch (error) {
    console.error('Error loading family members:', error);
    familyMembers = getOrderedFamilyMembers(getDefaultFamilyMembers());
  }
}

function isCherylMember(member) {
  if (!member) return false;
  return String(member.id || '').toLowerCase() === String(getDefaultFamilyMemberId()).toLowerCase()
    || normalizeFamilyMemberName(member.displayName).toLocaleLowerCase() === 'cheryl';
}

function getOrderedFamilyMembers(members = []) {
  const ordered = Array.isArray(members) ? members.slice() : [];
  const cherylIndex = ordered.findIndex(isCherylMember);
  if (cherylIndex <= 0) return ordered;
  const [cherylMember] = ordered.splice(cherylIndex, 1);
  ordered.unshift(cherylMember);
  return ordered;
}

function getActiveFamilyMembers() {
  return getOrderedFamilyMembers(familyMembers.filter(member => member.active !== false));
}

function getActiveRecipeSpaceMember() {
  const member = activeMemberId ? getFamilyMember(activeMemberId) : null;
  return member?.active !== false ? member : null;
}

function getCurrentRecipeOwnerId() {
  return getRecipeOwnerForCurrentSpace();
}

function getRecipeOwnerForCurrentSpace(requestedMemberId = '') {
  return getActiveRecipeSpaceMember()?.id || requestedMemberId || getDefaultFamilyMemberId();
}

function getDefaultFamilyMemberId() {
  return typeof getDefaultMemberId === 'function'
    ? getDefaultMemberId()
    : '00000000-0000-4000-8000-000000000001';
}

function getRecipeMemberId(recipe) {
  return recipe?.memberId || getDefaultFamilyMemberId();
}

function getFamilyMember(memberId) {
  const defaults = typeof getDefaultFamilyMembers === 'function'
    ? getDefaultFamilyMembers()
    : [
      { id: '00000000-0000-4000-8000-000000000001', displayName: 'Cheryl', active: true },
      { id: '00000000-0000-4000-8000-000000000002', displayName: 'Tiffany', active: true }
    ];
  return familyMembers.find(member => member.id === memberId)
    || defaults.find(member => member.id === memberId)
    || null;
}

function hydrateRecipeMembers(items) {
  return (items || []).map(recipe => {
    const member = getFamilyMember(getRecipeMemberId(recipe));
    return {
      ...recipe,
      memberName: member?.displayName || 'Family',
      memberActive: member?.active !== false
    };
  });
}

function getAllPublishedRecipes() {
  return recipes.filter(recipe => recipe.status === 'approved');
}

function getScopedPublishedRecipes() {
  const activeMember = getActiveRecipeSpaceMember();
  return activeMember ? getPublishedRecipesForMember(activeMember.id) : getAllPublishedRecipes();
}

function getScopedRecipesByFilter(filterType, filterValue) {
  return getScopedPublishedRecipes().filter(recipe => recipe[filterType] === filterValue);
}

function getPublishedRecipesForMember(memberId) {
  return getAllPublishedRecipes().filter(recipe => getRecipeMemberId(recipe) === memberId);
}

function escapeMemberOption(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function getFamilyMemberOptionsHtml(selectedMemberId = getDefaultFamilyMemberId()) {
  const selectedMember = getFamilyMember(selectedMemberId);
  const members = getActiveFamilyMembers().slice();
  if (selectedMember && !members.some(member => member.id === selectedMember.id)) {
    members.push(selectedMember);
  }

  return members.map(member => `
    <option value="${escapeMemberOption(member.id)}" ${member.id === selectedMemberId ? 'selected' : ''}>
      ${escapeMemberOption(member.displayName)}${member.active === false ? ' (inactive)' : ''}
    </option>`).join('');
}

function populateMemberSelect(select, selectedMemberId = getDefaultFamilyMemberId()) {
  if (!select) return;
  const ownerId = getActiveRecipeSpaceMember()?.id || selectedMemberId;
  select.innerHTML = getFamilyMemberOptionsHtml(ownerId);
  const isMemberScoped = Boolean(getActiveRecipeSpaceMember());
  select.disabled = isMemberScoped;
  select.setAttribute('aria-label', isMemberScoped ? 'Recipe owner is set by this recipe space' : 'Who does this recipe belong to?');
}

function populateStaticMemberSelects() {
  document.querySelectorAll('[data-member-select]').forEach(select => {
    populateMemberSelect(select, select.value || getDefaultFamilyMemberId());
  });
}

function openMemberRecipeBox(memberId) {
  const member = getFamilyMember(memberId);
  if (!member || member.active === false) return;
  activeMemberId = member.id;
  renderMemberRecipeBox(member);
  populateStaticMemberSelects();
  hideAllPanels();
  showPanel(ui.memberRecipeBoxPanel);
}

function closeMemberRecipeBox() {
  activeMemberId = null;
  hideAllPanels();
  showPanel(ui.homeView);
}

function returnToRecipeSpaceHome() {
  const member = getActiveRecipeSpaceMember();
  hideAllPanels();
  if (member) {
    renderMemberRecipeBox(member);
    showPanel(ui.memberRecipeBoxPanel);
  } else {
    showPanel(ui.homeView);
  }
}

function addFamilyMemberToState(member) {
  familyMembers = getOrderedFamilyMembers([...familyMembers, member]);
  renderMemberSpaces(familyMembers);
  populateStaticMemberSelects();
  return member;
}

function normalizeFamilyMemberName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function isDuplicateFamilyMemberName(displayName) {
  const normalizedName = normalizeFamilyMemberName(displayName).toLocaleLowerCase();
  return familyMembers.some(member => member.displayName.trim().toLocaleLowerCase() === normalizedName);
}

// Load recipes from database
async function loadRecipes() {
  const isCurrent = captureRecipeOperation();
  try {
    const data = await fetchAllRecipes();
    if (!isCurrent()) return;
    
    if (data === null) {
      recipes = [];
      if (typeof recipeAuth !== 'undefined') recipeAuth?.lock('Recipes could not be loaded. Check your session and try again.');
    } else {
      if (!isCurrent()) return;
      recipes = hydrateRecipeMembers(data);
      console.log(`Loaded ${recipes.length} recipes`);
    }
  } catch (error) {
    console.error('Error loading recipes:', error);
    recipes = [];
  }
}

// Setup main event listeners
function setupEventListeners() {
  setupHomeViewListeners();
  setupFormListeners();
  setupRecipeListeners();
  setupReviewListeners();
}

// Home view button handlers
function setupHomeViewListeners() {
  const homeView = document.getElementById('homeView');
  if (!homeView) return;

  homeView.addEventListener('click', async (e) => {
    const memberButton = e.target.closest?.('[data-member-id]');
    if (memberButton) {
      const member = getFamilyMember(memberButton.dataset.memberId);
      if (member) {
        openMemberRecipeBox(member.id);
      }
      return;
    }

    const action = e.target.closest?.('[data-action]')?.dataset.action;
    if (!action) return;

    hideAllPanels();

    switch (action) {
      case 'new':
        startNewRecipe();
        break;
      case 'add-member':
        showPanel(ui.memberFormPanel);
        break;
      case 'main':
        showPanel(ui.mainBrowser);
        break;
      case 'ethnicity':
        showPanel(ui.ethnicityBrowser);
        break;
      case 'all':
        renderRecipes(
          getAllPublishedRecipes(),
          'All Recipes'
        );
        break;
      case 'ocr-upload':
        renderOCRUploadForm();
        showPanel(ui.ocrUploadPanel);
        break;
      case 'review-queue':
        await loadAndShowReviewQueue();
        break;
      case 'nexus':
        showPanel(ui.nexusPanel);
        break;
    }
  });

  ui.memberRecipeBoxPanel?.addEventListener('click', async (e) => {
    const action = e.target.closest?.('[data-member-action]')?.dataset.memberAction;
    if (!action) return;
    hideAllPanels();

    switch (action) {
      case 'home':
        closeMemberRecipeBox();
        break;
      case 'new':
        startNewRecipe();
        break;
      case 'main':
        showPanel(ui.mainBrowser);
        break;
      case 'ethnicity':
        showPanel(ui.ethnicityBrowser);
        break;
      case 'all':
        renderRecipes(getScopedPublishedRecipes(), `${getActiveRecipeSpaceMember()?.displayName}'s Recipes`);
        break;
      case 'ocr-upload':
        renderOCRUploadForm();
        showPanel(ui.ocrUploadPanel);
        break;
      case 'review-queue':
        await loadAndShowReviewQueue();
        break;
      case 'nexus':
        showPanel(ui.nexusPanel);
        break;
    }
  });
}

// Recipe form handlers
function setupFormListeners() {
  if (!ui.form) return;

  ui.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleFormSubmit();
  });

  ui.memberForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleAddFamilyMember();
  });
}

async function handleAddFamilyMember() {
  const isCurrent = captureRecipeOperation();
  const input = document.getElementById('familyMemberName');
  const status = document.getElementById('familyMemberStatus');
  const name = normalizeFamilyMemberName(input?.value);

  if (!name) {
    if (status) status.textContent = 'Please enter a family member name.';
    return;
  }
  if (isDuplicateFamilyMemberName(name)) {
    if (status) status.textContent = 'That family member already exists.';
    return;
  }

  try {
    const member = await createFamilyMember(name);
    if (!isCurrent()) return;
    addFamilyMemberToState(member);
    if (input) input.value = '';
    if (status) status.textContent = `Contributor label ${member.displayName} was added. Account access is unchanged.`;
  } catch (error) {
    const message = /duplicate|unique/i.test(error.message)
      ? 'That family member already exists.'
      : `Could not add family member: ${error.message}`;
    if (status) status.textContent = message;
  }
}

// Handle recipe form submission
async function handleFormSubmit() {
  const isCurrent = captureRecipeOperation();
  const recipeName = document.getElementById('name')?.value?.trim();
  const recipeTime = document.getElementById('time')?.value?.trim();
  const mainCategory = document.getElementById('mainCategory')?.value;
  const ethnicity = document.getElementById('ethnicity')?.value;
  const notes = document.getElementById('notes')?.value?.trim();
  const videoLink = normalizeRecipeUrl(document.getElementById('videoUrl')?.value);
  const sourceLink = normalizeRecipeUrl(document.getElementById('sourceUrl')?.value);
  const requestedMemberId = document.getElementById('memberId')?.value;
  const memberId = getRecipeOwnerForCurrentSpace(requestedMemberId);
  const imageFiles = Array.from(ui.imageInput?.files || []);

  if (!recipeName || !mainCategory || !ethnicity || !notes) {
    alert('Please fill in all required fields.');
    return;
  }

  if (videoLink.error || sourceLink.error) {
    alert(videoLink.error || sourceLink.error);
    return;
  }

  try {
    const wasEditing = Boolean(editingId);
    const recipeId = editingId || generateId();
    const existing = wasEditing ? recipes.find(r => r.id === editingId) : null;
    let images = [];

    // Upload new images if provided
    if (imageFiles.length > 0) {
      const uploaded = await uploadSelectedImages(recipeId, imageFiles);
      if (!isCurrent()) return;
      if (!uploaded) {
        alert('Image upload failed. Please try again before saving.');
        return;
      }
      images = uploaded;
    } else if (editingId) {
      // Keep existing images when editing
      const existing = recipes.find(r => r.id === editingId);
      images = getRecipeImages(existing) || [];
    }

    // Create recipe object
    const recipe = {
      ...existing,
      id: recipeId,
      name: recipeName,
      time: recipeTime,
      mainCategory,
      ethnicity,
      notes,
      images,
      imageUrl: JSON.stringify(images),
      videoUrl: videoLink.url,
      sourceUrl: sourceLink.url,
      memberId,
      status: 'approved'
    };

    // Save to database
    if (editingId) {
      await updateRecipe(recipeId, recipe);
      if (!isCurrent()) return;
      recipes = recipes.map(r => r.id === recipeId ? hydrateRecipeMembers([recipe])[0] : r);
    } else {
      await saveNewRecipe(recipe);
      if (!isCurrent()) return;
      recipes.push(hydrateRecipeMembers([recipe])[0]);
    }

    // Reset form and show results
    ui.form.reset();
    editingId = null;
    ui.formTitle.textContent = 'Add New Recipe';
    hideAllPanels();
    renderRecipes(
      getScopedPublishedRecipes(),
      wasEditing ? 'Recipe Updated' : 'Recipe Added'
    );

  } catch (error) {
    console.error('Error saving recipe:', error);
    alert(`Error saving recipe: ${error.message}`);
  }
}

// Start new recipe form
function startNewRecipe() {
  editingId = null;
  ui.form.reset();
  populateMemberSelect(document.getElementById('memberId'), getCurrentRecipeOwnerId());
  ui.formTitle.textContent = 'Add New Recipe';
  showPanel(ui.formPanel);
}

// Edit recipe
function startEditRecipe(recipeId) {
  const recipe = recipes.find(r => r.id === recipeId);
  if (!recipe) return;

  editingId = recipeId;
  ui.formTitle.textContent = 'Edit Recipe';
  
  document.getElementById('name').value = recipe.name || '';
  document.getElementById('time').value = recipe.time || '';
  document.getElementById('mainCategory').value = recipe.mainCategory || '';
  document.getElementById('ethnicity').value = recipe.ethnicity || '';
  document.getElementById('notes').value = recipe.notes || '';
  document.getElementById('videoUrl').value = recipe.videoUrl || '';
  document.getElementById('sourceUrl').value = recipe.sourceUrl || '';
  populateMemberSelect(document.getElementById('memberId'), getRecipeMemberId(recipe));
  
  if (ui.imageInput) {
    ui.imageInput.value = '';
  }

  hideAllPanels();
  showPanel(ui.formPanel);
}

// Recipe list handlers (browse, filter)
function setupRecipeListeners() {
  document.body.addEventListener('click', (e) => {
    if (e.target.closest?.('[data-return-to-member-box]')) {
      returnToRecipeSpaceHome();
      return;
    }

    // Filter by category or ethnicity
    if (e.target.classList.contains('chip')) {
      const filterType = e.target.dataset.filterType;
      const filterValue = e.target.dataset.filterValue;

      if (filterType && filterValue) {
        const filtered = getScopedRecipesByFilter(filterType, filterValue);
        const prefix = getActiveRecipeSpaceMember()?.displayName ? `${getActiveRecipeSpaceMember().displayName}'s ` : '';
        renderRecipes(filtered, `${prefix}${filterValue} Recipes`);
      }
    }

    // Edit recipe
    if (e.target.dataset.editId) {
      startEditRecipe(e.target.dataset.editId);
    }

    // Delete recipe
    if (e.target.dataset.deleteId) {
      handleDeleteRecipe(e.target.dataset.deleteId);
    }
  });
}

// Delete recipe
async function handleDeleteRecipe(recipeId) {
  const isCurrent = captureRecipeOperation();
  if (!confirm('Are you sure you want to delete this recipe?')) return;

  try {
    const recipe = recipes.find(r => r.id === recipeId);
    const images = recipe ? getRecipeImages(recipe) : [];
    // Confirm the recipe delete before cleaning up its attachments. A failed
    // record delete must not leave an existing recipe with missing images.
    await deleteRecipe(recipeId);
    if (!isCurrent()) return;
    recipes = recipes.filter(r => r.id !== recipeId);
    for (const imageUrl of images) {
      if (!isCurrent()) return;
      await deleteImage(imageUrl);
    }
    if (!isCurrent()) return;

    // Refresh view
    renderRecipes(
      getScopedPublishedRecipes(),
      'Recipe Deleted'
    );

  } catch (error) {
    console.error('Error deleting recipe:', error);
    alert(`Error deleting recipe: ${error.message}`);
  }
}

// Review workflow handlers
async function setupReviewListeners() {
  document.body.addEventListener('click', async (e) => {
    // Review & Edit button
    if (e.target.dataset.reviewEdit) {
      const recipeId = e.target.dataset.reviewEdit;
      const recipe = recipes.find(r => r.id === recipeId);
      if (recipe) {
        hideAllPanels();
        showReviewComparison(recipe);
      }
    }

    // Delete draft
    if (e.target.dataset.reviewDelete) {
      const recipeId = e.target.dataset.reviewDelete;
      if (confirm('Delete this draft recipe?')) {
        try {
          await deleteRecipe(recipeId);
          recipes = recipes.filter(r => r.id !== recipeId);
          await loadAndShowReviewQueue();
        } catch (error) {
          alert(`Error: ${error.message}`);
        }
      }
    }

    const cancelReviewButton = e.target.closest?.('[data-cancel-review]');
    if (cancelReviewButton) {
      hideAllPanels();
      showPanel(ui.reviewQueuePanel);
      return;
    }

    const deleteReviewButton = e.target.closest?.('[data-delete-review]');
    if (deleteReviewButton) {
      const form = deleteReviewButton.closest('.comparison-form');
      const recipeId = form?.dataset.recipeId;
      if (!recipeId || !confirm('Delete this draft recipe?')) return;

      try {
        await deleteRecipe(recipeId);
        recipes = recipes.filter(r => r.id !== recipeId);
        hideAllPanels();
        await loadAndShowReviewQueue();
      } catch (error) {
        console.error('Error deleting draft recipe:', error);
        setReviewPublishStatus(form, `Unable to delete this draft: ${getUsefulErrorMessage(error)}`, 'error');
      }
    }
  });

  // The only submit control in the comparison form is Approve & Publish.
  // This stays reliable for dynamically rendered forms and keyboard submits.
  document.addEventListener('submit', async (e) => {
    if (!e.target.matches('.comparison-form')) return;

    e.preventDefault();
    await submitReviewApproval(e.target);
  });
}

async function submitReviewApproval(form) {
  const isCurrent = captureRecipeOperation();
  const recipeId = form.dataset.recipeId;
  const recipe = recipes.find(r => r.id === recipeId);
  if (!recipe) {
    setReviewPublishStatus(form, 'This draft is no longer available. Refresh the review queue and try again.', 'error');
    return;
  }

  if (form.dataset.publishing === 'true') return;

  const approveButton = form.querySelector('[data-approve-review]');
  form.dataset.publishing = 'true';
  if (approveButton) {
    approveButton.disabled = true;
    approveButton.dataset.label = approveButton.textContent;
    approveButton.textContent = 'Publishing...';
  }
  setReviewPublishStatus(form, 'Publishing your approved recipe...', 'publishing');

  try {
    await handleApproveRecipe(recipeId, new FormData(form));
    if (!isCurrent()) return;
    hideAllPanels();
    renderRecipes(getScopedPublishedRecipes(), getActiveRecipeSpaceMember() ? `${getActiveRecipeSpaceMember().displayName}'s Recipes` : 'All Recipes');
  } catch (error) {
    const message = getUsefulErrorMessage(error);
    console.error('Failed to publish draft recipe:', error);
    setReviewPublishStatus(form, `Unable to publish this recipe: ${message}`, 'error');
  } finally {
    form.dataset.publishing = 'false';
    if (approveButton) {
      approveButton.disabled = false;
      approveButton.textContent = approveButton.dataset.label || 'Approve & Publish';
    }
  }
}

function setReviewPublishStatus(form, message, state) {
  const status = form?.querySelector('[data-review-publish-status]');
  if (!status) return;
  status.textContent = message;
  status.className = `review-publish-status${state ? ` is-${state}` : ''}`;
}

function getUsefulErrorMessage(error) {
  return error?.message || 'The database update could not be completed. Please try again.';
}

// Load and display review queue
async function loadAndShowReviewQueue() {
  try {
    const activeMember = getActiveRecipeSpaceMember();
    const draftRecipes = recipes.filter(recipe => recipe.status === 'draft'
      && (!activeMember || getRecipeMemberId(recipe) === activeMember.id));
    renderReviewQueue(draftRecipes);
  } catch (error) {
    console.error('Error loading review queue:', error);
    alert(`Error loading review queue: ${error.message}`);
  }
}

// Approve and publish recipe
async function handleApproveRecipe(recipeId, formData) {
  const isCurrent = captureRecipeOperation();
  const editorName = typeof recipeAuth !== 'undefined' ? recipeAuth?.currentUserId() : 'Cheryl';
  if (!editorName) throw new Error('Sign in again before publishing.');
  const existingRecipe = recipes.find(recipe => recipe.id === recipeId);
  if (!existingRecipe) throw new Error('This draft is no longer available');

  const videoField = formData.get('videoUrl');
  const sourceField = formData.get('sourceUrl');
  const videoLink = normalizeRecipeUrl(videoField);
  const sourceLink = normalizeRecipeUrl(sourceField);
  if (videoLink.error || sourceLink.error) throw new Error(videoLink.error || sourceLink.error);

  const updates = {
    name: formData.get('name'),
    time: formData.get('time'),
    mainCategory: formData.get('mainCategory'),
    ethnicity: formData.get('ethnicity'),
    notes: formData.get('notes'),
    // Keep links from older review forms that do not include the new controls;
    // an explicit blank field still intentionally removes a saved link.
    videoUrl: videoField == null ? (existingRecipe.videoUrl || '') : videoLink.url,
    sourceUrl: sourceField == null ? (existingRecipe.sourceUrl || '') : sourceLink.url
  };
  const memberId = formData.get('memberId');
  if (getActiveRecipeSpaceMember()) {
    updates.memberId = getCurrentRecipeOwnerId();
  } else if (memberId != null) {
    updates.memberId = memberId || getRecipeMemberId(existingRecipe);
  }

  const approvalUpdate = await approveDraftRecipe(recipeId, editorName, updates);
  if (!isCurrent()) throw new Error('Session changed before publishing completed. Sign in again.');
  const approvedRecipe = hydrateRecipeMembers([{ ...existingRecipe, ...updates, ...approvalUpdate }])[0];

  // Merge rather than replace so imported images, OCR metadata, and contributor
  // data remain available in the approved recipe flow.
  recipes = recipes.map(recipe => recipe.id === recipeId ? approvedRecipe : recipe);
  console.log('Recipe approved and published:', recipeId);
  return approvedRecipe;
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
