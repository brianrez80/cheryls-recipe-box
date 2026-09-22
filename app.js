// Main Application Controller

let recipes = [];
let editingId = null;

// Initialize the application
async function initializeApp() {
  console.log('Initializing Cheryl\'s Recipe Box...');

  // Initialize UI
  initializeUI();

  // Initialize Supabase
  initializeSupabase();

  // Initialize Authentication
  initializeAuth();

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
  renderOCRUploadForm();

  console.log('App initialized successfully');
}

// Load recipes from database
async function loadRecipes() {
  try {
    const data = await fetchAllRecipes();
    
    if (data === null) {
      // Fall back to default recipes if fetch fails
      recipes = getDefaultRecipes();
      console.warn('Could not load recipes from Supabase, using defaults');
    } else {
      recipes = data;
      console.log(`Loaded ${recipes.length} recipes`);
    }
  } catch (error) {
    console.error('Error loading recipes:', error);
    recipes = getDefaultRecipes();
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
    const action = e.target.dataset.action;
    if (!action) return;

    hideAllPanels();

    switch (action) {
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
        renderRecipes(
          recipes.filter(r => r.status === 'approved'),
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
}

// Recipe form handlers
function setupFormListeners() {
  if (!ui.form) return;

  ui.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleFormSubmit();
  });
}

// Handle recipe form submission
async function handleFormSubmit() {
  const recipeName = document.getElementById('name')?.value?.trim();
  const recipeTime = document.getElementById('time')?.value?.trim();
  const mainCategory = document.getElementById('mainCategory')?.value;
  const ethnicity = document.getElementById('ethnicity')?.value;
  const notes = document.getElementById('notes')?.value?.trim();
  const imageFiles = Array.from(ui.imageInput?.files || []);

  if (!recipeName || !mainCategory || !ethnicity || !notes) {
    alert('Please fill in all required fields.');
    return;
  }

  try {
    const recipeId = editingId || generateId();
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
      id: recipeId,
      name: recipeName,
      time: recipeTime,
      mainCategory,
      ethnicity,
      notes,
      images,
      status: 'approved'
    };

    // Save to database
    if (editingId) {
      await updateRecipe(recipeId, recipe);
      recipes = recipes.map(r => r.id === recipeId ? recipe : r);
    } else {
      await saveNewRecipe(recipe);
      recipes.push(recipe);
    }

    // Reset form and show results
    ui.form.reset();
    editingId = null;
    ui.formTitle.textContent = 'Add New Recipe';
    hideAllPanels();
    renderRecipes(
      recipes.filter(r => r.status === 'approved'),
      editingId ? 'Recipe Updated' : 'Recipe Added'
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
  
  if (ui.imageInput) {
    ui.imageInput.value = '';
  }

  hideAllPanels();
  showPanel(ui.formPanel);
}

// Recipe list handlers (browse, filter)
function setupRecipeListeners() {
  document.body.addEventListener('click', (e) => {
    // Filter by category or ethnicity
    if (e.target.classList.contains('chip')) {
      const filterType = e.target.dataset.filterType;
      const filterValue = e.target.dataset.filterValue;

      if (filterType && filterValue) {
        const filtered = recipes.filter(
          r => r[filterType] === filterValue && r.status === 'approved'
        );
        renderRecipes(filtered, `${filterValue} Recipes`);
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
      recipes.filter(r => r.status === 'approved'),
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
    const imageMoveUpButton = e.target.closest('[data-review-image-move-up]');
    if (imageMoveUpButton) {
      const recipeId = imageMoveUpButton.dataset.reviewRecipeId;
      const index = Number(imageMoveUpButton.dataset.reviewImageIndex || 0);
      const recipe = recipes.find(r => r.id === recipeId);
      if (recipe) {
        const images = Array.isArray(recipe.images) ? [...recipe.images] : [];
        const sourceFiles = Array.isArray(recipe.sourceFiles) ? [...recipe.sourceFiles] : [];
        if (index > 0 && images[index - 1]) {
          [images[index - 1], images[index]] = [images[index], images[index - 1]];
          if (sourceFiles[index - 1] || sourceFiles[index]) {
            [sourceFiles[index - 1], sourceFiles[index]] = [sourceFiles[index], sourceFiles[index - 1]];
          }
          recipe.images = images;
          recipe.sourceFiles = sourceFiles;
          showReviewComparison(recipe);
        }
      }
      return;
    }

    const imageMoveDownButton = e.target.closest('[data-review-image-move-down]');
    if (imageMoveDownButton) {
      const recipeId = imageMoveDownButton.dataset.reviewRecipeId;
      const index = Number(imageMoveDownButton.dataset.reviewImageIndex || 0);
      const recipe = recipes.find(r => r.id === recipeId);
      if (recipe) {
        const images = Array.isArray(recipe.images) ? [...recipe.images] : [];
        const sourceFiles = Array.isArray(recipe.sourceFiles) ? [...recipe.sourceFiles] : [];
        if (index < images.length - 1) {
          [images[index], images[index + 1]] = [images[index + 1], images[index]];
          if (sourceFiles[index] || sourceFiles[index + 1]) {
            [sourceFiles[index], sourceFiles[index + 1]] = [sourceFiles[index + 1], sourceFiles[index]];
          }
          recipe.images = images;
          recipe.sourceFiles = sourceFiles;
          showReviewComparison(recipe);
        }
      }
      return;
    }

    const imageRemoveButton = e.target.closest('[data-review-image-remove]');
    if (imageRemoveButton) {
      const recipeId = imageRemoveButton.dataset.reviewRecipeId;
      const index = Number(imageRemoveButton.dataset.reviewImageIndex || 0);
      const recipe = recipes.find(r => r.id === recipeId);
      if (recipe) {
        const images = Array.isArray(recipe.images) ? [...recipe.images] : [];
        const sourceFiles = Array.isArray(recipe.sourceFiles) ? [...recipe.sourceFiles] : [];
        images.splice(index, 1);
        if (sourceFiles[index]) {
          sourceFiles.splice(index, 1);
        }
        recipe.images = images;
        recipe.sourceFiles = sourceFiles;
        showReviewComparison(recipe);
      }
      return;
    }

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
  });

  // Handle review comparison form submission
  document.addEventListener('submit', async (e) => {
    if (!e.target.matches('.comparison-form')) return;

    e.preventDefault();
    
    const recipeId = e.target.dataset.recipeId;
    const formData = new FormData(e.target);

    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;

    // Check which button was clicked
    const submitButton = e.submitter;
    if (submitButton?.dataset.approveReview) {
      await handleApproveRecipe(recipeId, formData);
    }
  });
}

// Load and display review queue
async function loadAndShowReviewQueue() {
  try {
    const draftRecipes = recipes.filter(r => r.status === 'draft');
    renderReviewQueue(draftRecipes);
  } catch (error) {
    console.error('Error loading review queue:', error);
    alert(`Error loading review queue: ${error.message}`);
  }
}

// Approve and publish recipe
async function handleApproveRecipe(recipeId, formData) {
  try {
    const editorName = 'Cheryl'; // In production, get from authenticated user
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;

    const updates = {
      name: formData.get('name')?.toString().trim() || '',
      time: formData.get('time')?.toString().trim() || '',
      mainCategory: formData.get('mainCategory')?.toString().trim() || '',
      ethnicity: formData.get('ethnicity')?.toString().trim() || '',
      notes: formData.get('notes')?.toString().trim() || ''
    };

    if (!updates.name) {
      alert('Please enter the recipe name.');
      return;
    }

    let finalImages = recipe.images || [];
    if (Array.isArray(recipe.sourceFiles) && recipe.sourceFiles.length > 0) {
      const uploadedImages = await uploadSelectedImages(recipeId, recipe.sourceFiles);
      if (!uploadedImages) {
        throw new Error('Image upload failed. Please try again before saving.');
      }
      finalImages = uploadedImages;
    }

    const approvedRecipe = {
      ...recipe,
      ...updates,
      images: finalImages,
      status: 'approved',
      reviewedBy: editorName,
      reviewedAt: new Date().toISOString(),
      persisted: true
    };

    if (recipe.persisted === false) {
      await saveNewRecipe(approvedRecipe);
    } else {
      await approveDraftRecipe(recipeId, editorName, approvedRecipe);
    }

    recipes = recipes.map(r =>
      r.id === recipeId ? approvedRecipe : r
    );

    alert('Recipe approved and published!');
    hideAllPanels();
    showPanel(ui.homeView);

    await loadAndShowReviewQueue();

  } catch (error) {
    console.error('Error approving recipe:', error);
    alert(`Error: ${error.message}`);
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
