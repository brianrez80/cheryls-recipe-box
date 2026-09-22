// Main Application Controller

let recipes = [];
let editingId = null;
let familyMembers = [];
let activeMemberId = null;

// Initialize the application
async function initializeApp() {
  console.log('Initializing Cheryl\'s Recipe Box...');

  // Initialize UI
  initializeUI();

  // Initialize Supabase
  initializeSupabase();

  // Initialize Authentication
  initializeAuth();

  // Load members before recipes so legacy recipes can safely fall back to Cheryl.
  await loadFamilyMembers();

  // Load recipes
  await loadRecipes();

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

  window.dispatchEvent(new Event('recipe-box-ready'));
  console.log('App initialized successfully');
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
  return recipes.filter(recipe => recipe.status === 'approved' && recipe.memberActive !== false);
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
  try {
    const data = await fetchAllRecipes();
    
    if (data === null) {
      // Fall back to default recipes if fetch fails
      recipes = hydrateRecipeMembers(getDefaultRecipes());
      console.warn('Could not load recipes from Supabase, using defaults');
    } else {
      recipes = hydrateRecipeMembers(data);
      console.log(`Loaded ${recipes.length} recipes`);
    }
  } catch (error) {
    console.error('Error loading recipes:', error);
    recipes = hydrateRecipeMembers(getDefaultRecipes());
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
    addFamilyMemberToState(member);
    if (input) input.value = '';
    if (status) status.textContent = `${member.displayName}'s Recipe Box is ready.`;
  } catch (error) {
    const message = /duplicate|unique/i.test(error.message)
      ? 'That family member already exists.'
      : `Could not add family member: ${error.message}`;
    if (status) status.textContent = message;
  }
}

// Handle recipe form submission
async function handleFormSubmit() {
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
      videoUrl: videoLink.url,
      sourceUrl: sourceLink.url,
      memberId,
      status: 'approved'
    };

    // Save to database
    if (editingId) {
      await updateRecipe(recipeId, recipe);
      recipes = recipes.map(r => r.id === recipeId ? hydrateRecipeMembers([recipe])[0] : r);
    } else {
      await saveNewRecipe(recipe);
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
  if (!confirm('Are you sure you want to delete this recipe?')) return;

  try {
    // Delete all associated images
    const recipe = recipes.find(r => r.id === recipeId);
    if (recipe) {
      const images = getRecipeImages(recipe);
      for (const imageUrl of images) {
        await deleteImage(imageUrl);
      }
    }

    // Delete from database
    await deleteRecipe(recipeId);
    recipes = recipes.filter(r => r.id !== recipeId);

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
  const editorName = 'Cheryl'; // In production, get from authenticated user
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
