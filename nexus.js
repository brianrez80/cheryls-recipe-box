// Trixie Nexus Import Center — Phase 2 UI interactions only.
// The import flow now processes image files one at a time using the existing OCR pipeline.

let nexusImportState = {
  queue: [],
  processing: false,
  currentItem: null,
  sessionId: null
};

function getNexusDuplicateKey(file) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function isNexusDuplicate(file, existingItems) {
  const key = getNexusDuplicateKey(file);
  return existingItems.some(item => item.key === key);
}

function clearIncompleteNexusImports(queue) {
  return queue.filter(item => item.status !== 'pending' && item.status !== 'processing');
}

function getNextNexusPendingEntry(queue, isProcessing) {
  if (isProcessing) return null;
  return queue.find(item => item.status === 'pending') || null;
}

function removeNexusEntry(queue, itemId) {
  return queue.filter(item => item.id !== itemId);
}

function markNexusEntryFailed(entry, errorMessage) {
  if (!entry) return null;
  entry.status = 'error';
  entry.error = errorMessage || 'We could not read this recipe image.';
  return entry;
}

function initializeNexus() {
  const panel = document.getElementById('nexusPanel');
  if (!panel || panel.dataset.initialized === 'true') return;

  const dropzone = panel.querySelector('[data-nexus-dropzone]');
  const fileInput = panel.querySelector('#nexusFileInput');
  const browseButton = panel.querySelector('[data-nexus-browse]');
  const closeButton = panel.querySelector('[data-nexus-close]');
  const messageBox = panel.querySelector('[data-nexus-message]');

  panel.dataset.initialized = 'true';
  browseButton.addEventListener('click', (event) => {
    event.stopPropagation();
    fileInput.click();
  });
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });

  ['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragging');
  }));
  dropzone.addEventListener('drop', event => addNexusSources(event.dataTransfer.files, panel));
  fileInput.addEventListener('change', () => {
    addNexusSources(fileInput.files, panel);
    fileInput.value = '';
  });
  closeButton.addEventListener('click', () => {
    hideAllPanels();
    showPanel(ui.homeView);
  });

  window.sessionStorage.removeItem('nexusImportState');
  nexusImportState.queue = [];
  nexusImportState.processing = false;
  nexusImportState.currentItem = null;
  renderNexusQueue(panel);

  panel.addEventListener('click', async (event) => {
    const removeButton = event.target.closest('[data-nexus-remove]');
    if (removeButton) {
      const itemId = removeButton.dataset.nexusRemove;
      removeNexusSource(itemId, panel);
      return;
    }

    const retryButton = event.target.closest('[data-nexus-retry]');
    if (retryButton) {
      const itemId = retryButton.dataset.nexusRetry;
      retryNexusSource(itemId, panel);
      return;
    }
  });

  panel.addEventListener('click', (event) => {
    const sourceItem = event.target.closest('.source-item');
    if (sourceItem && sourceItem.dataset.nexusItemId && sourceItem.dataset.nexusStatus === 'ready') {
      const recipe = sourceItem.dataset.nexusRecipe ? JSON.parse(sourceItem.dataset.nexusRecipe) : null;
      if (recipe) {
        showRecipeReviewFromImport(recipe, panel);
      }
    }
  });

  if (messageBox) {
    messageBox.textContent = '';
  }

  window.addEventListener('beforeunload', () => {
    if (nexusImportState.processing || nexusImportState.queue.some(item => item.status === 'pending' || item.status === 'processing')) {
      window.sessionStorage.removeItem('nexusImportState');
    }
  });
}

function buildNexusBatchEntry(files, options = {}) {
  const batchFiles = Array.from(files || []).filter(Boolean);
  const id = options.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    files: batchFiles,
    file: batchFiles[0] || null,
    key: options.key || batchFiles.map(file => getNexusDuplicateKey(file)).join('||'),
    status: options.status || 'pending',
    error: '',
    recipe: null,
    images: [],
    sourceFiles: batchFiles
  };
}

function createNexusSource(files, options = {}) {
  const imageFiles = Array.isArray(files) ? files : [files];
  const file = imageFiles[0];
  const extension = (file?.name.split('.').pop() || 'FILE').toUpperCase();
  const iconType = /PNG|JPG|JPEG|WEBP|GIF/.test(extension)
    ? 'img'
    : /DOC|DOCX/.test(extension) ? 'doc' : /TXT/.test(extension) ? 'txt' : extension.toLowerCase();
  const totalSize = imageFiles.reduce((sum, currentFile) => sum + (currentFile?.size || 0), 0);
  const size = totalSize > 1048576
    ? `${(totalSize / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(totalSize / 1024))} KB`;
  const item = document.createElement('article');
  item.className = 'source-item is-learning';
  item.dataset.nexusItemId = options.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  item.dataset.nexusStatus = options.status || 'pending';

  const icon = document.createElement('span');
  icon.className = `source-icon source-icon-${iconType}`;
  icon.textContent = extension.slice(0, 4);
  const details = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = imageFiles.length > 1 ? `${file?.name || 'Recipe'} +${imageFiles.length - 1}` : file?.name || 'Recipe';
  const meta = document.createElement('small');
  meta.textContent = `${imageFiles.length > 1 ? `${imageFiles.length} images` : extension} · ${size}`;
  details.append(name, meta);
  const actions = document.createElement('div');
  actions.className = 'source-item-actions';
  const status = document.createElement('span');
  status.className = 'source-status';
  status.title = 'Pending';
  status.innerHTML = '<i></i>';
  actions.append(status);
  item.append(icon, details, actions);
  return item;
}

function createNexusSourceEntry(item, panel) {
  const sourceList = panel.querySelector('[data-source-list]');
  const emptyState = panel.querySelector('[data-source-empty]');
  if (!sourceList) return;
  sourceList.appendChild(item);
  if (emptyState) {
    emptyState.classList.add('hidden');
  }
  updateNexusSourceCount(panel);
}

function updateNexusSourceCount(panel) {
  const sourceList = panel.querySelector('[data-source-list]');
  const count = panel.querySelector('[data-source-count]');
  if (sourceList && count) {
    count.textContent = String(sourceList.children.length);
  }
}

function addNexusSources(fileList, panel) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const sourceList = panel.querySelector('[data-source-list]');
  const messageBox = panel.querySelector('[data-nexus-message]');
  const existingItems = Array.from(sourceList?.children || []).map(node => ({
    key: node.dataset.nexusFileKey,
    element: node
  })).filter(Boolean);

  const acceptedFiles = [];
  files.forEach(file => {
    if (!file || !/\.(jpe?g|png)$/i.test(file.name)) {
      return;
    }
    if (!file.size || file.size > 12 * 1024 * 1024) {
      if (messageBox) {
        messageBox.textContent = `${file.name} is larger than 12 MB. Please use a smaller image.`;
      }
      return;
    }
    if (isNexusDuplicate(file, existingItems)) {
      if (messageBox) {
        messageBox.textContent = 'This recipe image is already in the import list.';
      }
      return;
    }
    const duplicateWithinSelection = acceptedFiles.some(candidate => getNexusDuplicateKey(candidate) === getNexusDuplicateKey(file));
    if (duplicateWithinSelection) {
      if (messageBox) {
        messageBox.textContent = 'This recipe image is already in the import list.';
      }
      return;
    }
    acceptedFiles.push(file);
    existingItems.push({ key: getNexusDuplicateKey(file) });
  });

  if (!acceptedFiles.length) {
    return;
  }

  const batchEntry = buildNexusBatchEntry(acceptedFiles, { id: `${Date.now()}-${Math.random().toString(16).slice(2)}` });
  const item = createNexusSource(batchEntry.files, { id: batchEntry.id, status: 'pending' });
  item.dataset.nexusFileKey = batchEntry.key;
  createNexusSourceEntry(item, panel);
  nexusImportState.queue.push(batchEntry);
  syncNexusState();

  renderNexusQueue(panel);
  processNexusQueue(panel);
}

function syncNexusState() {
  window.sessionStorage.setItem('nexusImportState', JSON.stringify({
    queue: nexusImportState.queue.map(item => ({
      id: item.id,
      key: item.key,
      status: item.status,
      error: item.error,
      recipe: item.recipe || null
    })),
    sessionId: nexusImportState.sessionId || `${Date.now()}`
  }));
}

function renderNexusQueue(panel) {
  const sourceList = panel.querySelector('[data-source-list]');
  const emptyState = panel.querySelector('[data-source-empty]');
  const messageBox = panel.querySelector('[data-nexus-message]');
  if (!sourceList) return;
  Array.from(sourceList.children).forEach(node => {
    const entry = nexusImportState.queue.find(item => item.id === node.dataset.nexusItemId);
    if (!entry) return;
    const statusNode = node.querySelector('.source-status');
    const title = entry.status === 'processing' ? 'Processing' : entry.status === 'ready' ? 'Ready' : entry.status === 'error' ? 'Error' : 'Pending';
    if (!node.querySelector('[data-nexus-remove]')) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'nexus-inline-action secondary';
      remove.dataset.nexusRemove = entry.id;
      remove.textContent = 'Remove';
      node.appendChild(remove);
    }
    if (entry.status === 'ready') {
      node.className = 'source-item is-ready';
      statusNode.className = 'source-status';
      statusNode.innerHTML = '&#10003;';
      statusNode.title = 'Ready';
      node.dataset.nexusStatus = 'ready';
      if (entry.recipe) {
        node.dataset.nexusRecipe = JSON.stringify(entry.recipe);
      }
    } else if (entry.status === 'error') {
      node.className = 'source-item is-error';
      statusNode.className = 'source-status';
      statusNode.innerHTML = '!';
      statusNode.title = 'Error';
      node.dataset.nexusStatus = 'error';
      if (!node.querySelector('[data-nexus-retry]')) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'nexus-inline-action';
        action.dataset.nexusRetry = entry.id;
        action.textContent = 'Retry';
        node.appendChild(action);
      }
    } else if (entry.status === 'processing') {
      node.className = 'source-item is-learning';
      statusNode.className = 'source-status';
      statusNode.innerHTML = '•';
      statusNode.title = 'Processing';
      node.dataset.nexusStatus = 'processing';
    } else {
      node.className = 'source-item is-learning';
      statusNode.className = 'source-status';
      statusNode.innerHTML = '•';
      statusNode.title = 'Pending';
      node.dataset.nexusStatus = 'pending';
    }
  });
  updateNexusSourceCount(panel);
  if (emptyState) {
    emptyState.classList.toggle('hidden', sourceList.children.length > 0);
  }
  if (messageBox) {
    messageBox.textContent = '';
  }
}

function updateNexusProgress(entry, panel, stepName, stageIndex, statusText) {
  const progressName = panel.querySelector('[data-progress-name]');
  const progressStatus = panel.querySelector('[data-progress-status]');
  const progressSteps = panel.querySelector('[data-progress-steps]');
  const progressFile = panel.querySelector('[data-progress-file]');
  if (!progressName || !progressStatus || !progressSteps) return;
  progressName.textContent = entry ? (entry.displayName || entry.file?.name || 'Recipe batch') : 'No files queued';
  progressStatus.textContent = statusText || 'Waiting for recipe images...';
  const items = progressSteps.querySelectorAll('li');
  items.forEach((item, index) => {
    item.className = index < stageIndex ? 'done' : index === stageIndex ? 'active' : '';
    const span = item.querySelector('span');
    if (span) {
      span.innerHTML = index < stageIndex ? '&#10003;' : '';
    }
  });
  if (!entry && progressFile) {
    progressFile.classList.remove('is-active');
  } else if (progressFile) {
    progressFile.classList.add('is-active');
  }
}

function processNexusQueue(panel) {
  if (nexusImportState.processing) return;
  const nextEntry = getNextNexusPendingEntry(nexusImportState.queue, nexusImportState.processing);
  const messageBox = panel.querySelector('[data-nexus-message]');
  if (!nextEntry) {
    updateNexusProgress(null, panel, '', 0, 'Waiting for recipe images...');
    return;
  }

  nexusImportState.processing = true;
  nexusImportState.currentItem = nextEntry.id;
  nextEntry.status = 'processing';
  syncNexusState();
  renderNexusQueue(panel);
  updateNexusProgress(nextEntry, panel, 'processing', 0, 'File received');

  window.setTimeout(async () => {
    try {
      updateNexusProgress(nextEntry, panel, 'processing', 1, 'Reading recipe');
      const parsedRecipe = await extractNexusRecipe(nextEntry.files);
      nextEntry.recipe = parsedRecipe;
      nextEntry.displayName = nextEntry.files.length > 1
        ? `${nextEntry.files[0].name} +${nextEntry.files.length - 1}`
        : nextEntry.files[0]?.name || 'Recipe batch';
      nextEntry.status = 'ready';
      nextEntry.error = '';
      syncNexusState();
      renderNexusQueue(panel);
      updateNexusProgress(nextEntry, panel, 'processing', 2, 'Organizing recipe details');
      window.setTimeout(() => {
        updateNexusProgress(nextEntry, panel, 'processing', 3, 'Ready to review');
      }, 150);
      if (messageBox) {
        messageBox.textContent = 'Recipe ready. Choose a source row to review it.';
      }
    } catch (error) {
      nextEntry.status = 'error';
      nextEntry.error = error.message || 'We could not read this recipe image.';
      syncNexusState();
      renderNexusQueue(panel);
      updateNexusProgress(nextEntry, panel, 'processing', 0, error.message || 'We could not read this recipe image.');
      if (messageBox) {
        messageBox.textContent = error.message || 'We could not read this recipe image.';
      }
    } finally {
      nexusImportState.processing = false;
      nexusImportState.currentItem = null;
      processNexusQueue(panel);
    }
  }, 400);
}

async function extractNexusRecipe(files) {
  const batchFiles = Array.isArray(files) ? files : [files];
  const result = await performOCR(batchFiles, ({ status, progress, imageIndex, imageCount }) => {
    const percent = Math.round(((imageIndex - 1 + progress) / imageCount) * 100);
    const stage = status === 'Recognizing text' || status === 'Extracting text' ? 1 : 0;
    if (stage === 0) {
      return;
    }
  });
  const previewImages = batchFiles.map(file => {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      return URL.createObjectURL(file);
    }
    return file.name;
  });
  const recipe = await createDraftFromOCR(previewImages, result, 'Cheryl');
  recipe.sourceFiles = batchFiles;
  return recipe;
}

function removeNexusSource(itemId, panel) {
  nexusImportState.queue = removeNexusEntry(nexusImportState.queue, itemId);
  const sourceItem = panel.querySelector(`[data-nexus-item-id="${itemId}"]`);
  if (sourceItem) {
    sourceItem.remove();
  }
  syncNexusState();
  renderNexusQueue(panel);
  if (!nexusImportState.queue.some(item => item.status === 'pending' || item.status === 'processing')) {
    updateNexusProgress(null, panel, '', 0, 'Waiting for recipe images...');
  }
}

function retryNexusSource(itemId, panel) {
  const entry = nexusImportState.queue.find(item => item.id === itemId);
  if (!entry) return;
  entry.status = 'pending';
  entry.error = '';
  syncNexusState();
  renderNexusQueue(panel);
  processNexusQueue(panel);
}

function showRecipeReviewFromImport(recipe, panel) {
  if (!recipe || !recipe.notes) {
    const messageBox = panel.querySelector('[data-nexus-message]');
    if (messageBox) {
      messageBox.textContent = 'This recipe could not be reviewed yet. Try again with a clearer image.';
    }
    return;
  }
  const reviewRecipe = {
    ...recipe,
    contributorName: 'Cheryl',
    status: 'draft',
    persisted: false
  };
  recipes.push(reviewRecipe);
  hideAllPanels();
  showReviewComparison(reviewRecipe);
}
