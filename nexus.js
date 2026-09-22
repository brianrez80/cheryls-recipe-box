// Trixie Nexus Import Center — Phase 2 UI interactions only.
// Each file-selection or drop batch is processed as one ordered multi-page recipe using the existing OCR pipeline.

let nexusImportState = {
  queue: [],
  processing: false,
  currentItem: null,
  sessionId: null
};

function getNexusDefaultMemberId() {
  if (typeof getCurrentRecipeOwnerId === 'function') return getCurrentRecipeOwnerId();
  if (typeof getDefaultFamilyMemberId === 'function') return getDefaultFamilyMemberId();
  if (typeof getDefaultMemberId === 'function') return getDefaultMemberId();
  return '00000000-0000-4000-8000-000000000001';
}

function getNexusDuplicateKey(file) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function isNexusDuplicate(file, existingItems) {
  const key = getNexusDuplicateKey(file);
  return existingItems.some(item => {
    if (Array.isArray(item.keys)) return item.keys.includes(key);
    if (Array.isArray(item.files)) return item.files.some(candidate => getNexusDuplicateKey(candidate) === key);
    return item.key === key;
  });
}

function createNexusQueueEntry(files) {
  const orderedFiles = Array.from(files || []).filter(Boolean);
  return {
    id: String(Date.now()) + '-' + Math.random().toString(16).slice(2),
    files: orderedFiles,
    keys: orderedFiles.map(getNexusDuplicateKey),
    key: orderedFiles.map(getNexusDuplicateKey).join('|'),
    status: 'pending',
    error: '',
    progress: 0,
    ocrData: null,
    recipe: null,
    warning: '',
    openingReview: false
  };
}

function getNexusEntryLabel(entry) {
  const files = Array.isArray(entry?.files) ? entry.files : [];
  if (files.length <= 1) return files[0]?.name || 'Recipe image';
  return files[0].name + ' (' + files.length + ' images)';
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
  const urlRow = panel.querySelector('[data-nexus-url-row]');
  const urlOpenButton = panel.querySelector('[data-nexus-url-open]');
  const urlForm = panel.querySelector('[data-nexus-url-form]');
  const urlCancelButton = panel.querySelector('[data-nexus-url-cancel]');

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
    returnToRecipeSpaceHome();
  });
  urlOpenButton?.addEventListener('click', () => openNexusRecipeLinkForm(urlForm));
  urlRow?.addEventListener('click', event => {
    if (!event.target.closest('[data-nexus-url-form]')) openNexusRecipeLinkForm(urlForm);
  });
  urlCancelButton?.addEventListener('click', () => closeNexusRecipeLinkForm(urlForm));
  urlForm?.addEventListener('submit', handleNexusRecipeLinkImport);

  window.sessionStorage.removeItem('nexusImportState');
  nexusImportState.queue = [];
  nexusImportState.processing = false;
  nexusImportState.currentItem = null;
  renderNexusQueue(panel);

  panel.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-nexus-remove]');
    if (removeButton) { event.preventDefault(); removeNexusSource(removeButton.dataset.nexusRemove, panel); return; }
    const retryButton = event.target.closest('[data-nexus-retry]');
    if (retryButton) { event.preventDefault(); retryNexusSource(retryButton.dataset.nexusRetry, panel); return; }
    const sourceItem = event.target.closest('.source-item');
    if (sourceItem && !event.target.closest('button') && sourceItem.dataset.nexusStatus === 'ready') {
      showRecipeReviewFromImport(sourceItem.dataset.nexusItemId, panel);
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

function openNexusRecipeLinkForm(form) {
  if (!form) return;
  form.classList.remove('hidden');
  form.querySelector('input')?.focus();
}

function closeNexusRecipeLinkForm(form) {
  if (!form) return;
  form.reset();
  const status = form.querySelector('[data-nexus-url-status]');
  if (status) status.textContent = '';
  form.classList.add('hidden');
}

async function handleNexusRecipeLinkImport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector('[data-nexus-url-status]');
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  if (status) status.textContent = 'Creating your draft…';
  try {
    const formData = new FormData(form);
    const selectedMemberId = document.getElementById('nexusMemberId')?.value;
    const memberId = typeof getRecipeOwnerForCurrentSpace === 'function'
      ? getRecipeOwnerForCurrentSpace(selectedMemberId)
      : selectedMemberId || getNexusDefaultMemberId();
    const draftRecipe = await createRecipeLinkDraft(formData.get('recipeLinkUrl'), '', memberId);
    closeNexusRecipeLinkForm(form);
    hideAllPanels();
    showReviewComparison(draftRecipe);
  } catch (error) {
    if (status) status.textContent = `Could not create the draft: ${error.message}`;
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function createRecipeLinkDraft(value, title = '', memberId = getNexusDefaultMemberId()) {
  const submitted = classifyRecipeLink(value);
  if (submitted.error) throw new Error(submitted.error);
  const draftRecipe = {
    id: generateId(), name: String(title || '').trim() || 'Untitled Recipe', time: '', mainCategory: '', ethnicity: '', notes: '',
    status: 'draft', contributorName: 'Cheryl', memberId, images: [],
    videoUrl: submitted.kind === 'video' ? submitted.url : '',
    sourceUrl: submitted.kind === 'source' ? submitted.url : ''
  };
  await saveNewRecipe(draftRecipe);
  if (!recipes.some(recipe => recipe.id === draftRecipe.id)) recipes.push(draftRecipe);
  return draftRecipe;
}

function createNexusSource(files, options = {}) {
  const sourceFiles = Array.from(files || []).filter(Boolean);
  const firstFile = sourceFiles[0];
  if (!firstFile) return null;

  const extension = (firstFile.name.split('.').pop() || 'FILE').toUpperCase();
  const iconType = /PNG|JPG|JPEG|WEBP|GIF/.test(extension)
    ? 'img'
    : /DOC|DOCX/.test(extension) ? 'doc' : /TXT/.test(extension) ? 'txt' : extension.toLowerCase();
  const totalSize = sourceFiles.reduce((sum, file) => sum + (file.size || 0), 0);
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
  name.textContent = sourceFiles.length > 1
    ? `${firstFile.name} + ${sourceFiles.length - 1} more`
    : firstFile.name;
  const meta = document.createElement('small');
  meta.textContent = sourceFiles.length > 1
    ? `${sourceFiles.length} images · ${size}`
    : `${extension} · ${size}`;
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

function updateNexusSourceCount(panel) {
  const count = panel.querySelector('[data-source-count]');
  if (count) count.textContent = String(nexusImportState.queue.length);
}

function updateNexusReadiness(panel) {
  const readiness = panel.querySelector('[data-nexus-readiness]');
  const detail = panel.querySelector('[data-nexus-readiness-detail]');
  const bar = panel.querySelector('[data-nexus-readiness-bar]');
  const total = nexusImportState.queue.length;
  const ready = nexusImportState.queue.filter(item => item.status === 'ready').length;
  const progress = total ? Math.round((ready / total) * 100) : 0;
  if (readiness) readiness.textContent = total + ' recipe source' + (total === 1 ? '' : 's') + ' added';
  if (detail) detail.textContent = total ? ready + ' ready to review' : 'Waiting for your first recipe image';
  if (bar) bar.style.width = progress + '%';
}

function addNexusSources(fileList, panel) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const messageBox = panel.querySelector('[data-nexus-message]');
  const existingItems = nexusImportState.queue;
  const acceptedFiles = [];
  let validationMessage = '';

  files.forEach(file => {
    if (!file || !/\.(jpe?g|png)$/i.test(file.name)) {
      validationMessage = 'Please choose a JPG, JPEG, or PNG recipe image.';
      return;
    }
    if (!file.size || file.size > 12 * 1024 * 1024) {
      validationMessage = file.name + ' is larger than 12 MB. Please use a smaller image.';
      return;
    }
    if (isNexusDuplicate(file, existingItems) || acceptedFiles.some(candidate => getNexusDuplicateKey(candidate) === getNexusDuplicateKey(file))) {
      validationMessage = 'This recipe image is already in the import list.';
      return;
    }
    acceptedFiles.push(file);
  });

  if (!acceptedFiles.length) {
    if (messageBox && validationMessage) messageBox.textContent = validationMessage;
    return;
  }

  nexusImportState.queue.push(createNexusQueueEntry(acceptedFiles));
  if (messageBox) messageBox.textContent = '';
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
  if (!sourceList) return;

  sourceList.replaceChildren();
  nexusImportState.queue.forEach(entry => {
    const node = createNexusSource(entry.files, { id: entry.id, status: entry.status });
    if (!node) return;
    const statusNode = node.querySelector('.source-status');
    const actions = node.querySelector('.source-item-actions');
    node.dataset.nexusFileKey = entry.key;
    node.dataset.nexusStatus = entry.status;

    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'nexus-inline-action secondary';
    remove.dataset.nexusRemove = entry.id; remove.textContent = 'Remove';
    actions.appendChild(remove);

    if (entry.status === 'ready') {
      node.className = entry.warning ? 'source-item is-warning' : 'source-item is-ready';
      statusNode.innerHTML = entry.warning ? '!' : '&#10003;';
      statusNode.title = entry.warning ? 'Ready — OCR needs review' : 'Ready to review';
    } else if (entry.status === 'error') {
      node.className = 'source-item is-error';
      statusNode.textContent = '!'; statusNode.title = entry.error || 'Import failed';
      const retry = document.createElement('button');
      retry.type = 'button'; retry.className = 'nexus-inline-action';
      retry.dataset.nexusRetry = entry.id; retry.textContent = 'Retry';
      actions.appendChild(retry);
    } else {
      node.className = 'source-item is-learning';
      statusNode.innerHTML = '<i></i>';
      statusNode.title = entry.status === 'processing' ? 'Processing' : 'Pending';
    }
    sourceList.appendChild(node);
  });
  updateNexusSourceCount(panel);
  updateNexusReadiness(panel);
  if (emptyState) emptyState.classList.toggle('hidden', nexusImportState.queue.length > 0);
}

function updateNexusProgress(entry, panel, stepName, stageIndex, statusText) {
  const progressName = panel.querySelector('[data-progress-name]');
  const progressStatus = panel.querySelector('[data-progress-status]');
  const progressSteps = panel.querySelector('[data-progress-steps]');
  const progressFile = panel.querySelector('[data-progress-file]');
  const percentNode = panel.querySelector('[data-progress-percent]');
  const progressBar = panel.querySelector('[data-nexus-progress]');
  if (!progressName || !progressStatus || !progressSteps) return;

  const percent = entry ? Math.max(0, Math.min(100, Math.round(entry.progress || 0))) : 0;
  progressName.textContent = entry ? getNexusEntryLabel(entry) : 'No files queued';
  progressStatus.textContent = statusText || 'Waiting for recipe images...';
  if (percentNode) percentNode.textContent = percent + '%';
  if (progressBar) progressBar.style.width = percent + '%';
  progressSteps.querySelectorAll('li').forEach((item, index) => {
    item.className = stageIndex < 0 ? '' : index < stageIndex ? 'done' : index === stageIndex ? 'active' : '';
    const span = item.querySelector('span');
    if (span) span.innerHTML = stageIndex >= 0 && index < stageIndex ? '&#10003;' : '';
  });
  if (progressFile) progressFile.classList.toggle('is-active', Boolean(entry));
}

function processNexusQueue(panel) {
  if (nexusImportState.processing) return;
  const nextEntry = getNextNexusPendingEntry(nexusImportState.queue, false);
  const messageBox = panel.querySelector('[data-nexus-message]');
  if (!nextEntry) {
    const latestReady = nexusImportState.queue.findLast(item => item.status === 'ready');
    updateNexusProgress(latestReady || null, panel, '', latestReady ? 3 : -1, latestReady ? 'Ready to review' : 'Waiting for recipe images...');
    return;
  }

  nexusImportState.processing = true;
  nexusImportState.currentItem = nextEntry.id;
  nextEntry.status = 'processing';
  nextEntry.progress = 0;
  syncNexusState(); renderNexusQueue(panel);
  updateNexusProgress(nextEntry, panel, 'processing', 0, 'Preparing the recipe image...');

  void (async () => {
    try {
      const parsedRecipe = await extractNexusRecipe(nextEntry.files, progress => {
        if (!nexusImportState.queue.includes(nextEntry)) return;
        nextEntry.progress = progress.percent;
        updateNexusProgress(nextEntry, panel, 'processing', progress.stage, progress.status);
      });
      if (!nexusImportState.queue.includes(nextEntry)) return;
      nextEntry.ocrData = parsedRecipe;
      nextEntry.warning = parsedRecipe.qualityWarning || '';
      nextEntry.progress = 100; nextEntry.status = 'ready'; nextEntry.error = '';
      syncNexusState(); renderNexusQueue(panel);
      const readyStatus = nextEntry.warning ? 'Ready with an OCR warning — review every field carefully' : 'Ready to review';
      updateNexusProgress(nextEntry, panel, 'processing', 3, readyStatus);
      if (messageBox) messageBox.textContent = nextEntry.warning || 'Recipe ready. Choose the source row to review it.';
    } catch (error) {
      if (!nexusImportState.queue.includes(nextEntry)) return;
      markNexusEntryFailed(nextEntry, error?.message);
      nextEntry.progress = 0;
      syncNexusState(); renderNexusQueue(panel);
      updateNexusProgress(nextEntry, panel, 'processing', -1, nextEntry.error);
      if (messageBox) messageBox.textContent = nextEntry.error;
      console.error('Recipe Import Center OCR error:', error);
    } finally {
      nexusImportState.processing = false; nexusImportState.currentItem = null;
      processNexusQueue(panel);
    }
  })();
}

async function extractNexusRecipe(files, onProgress) {
  const orderedFiles = Array.from(files || []).filter(Boolean);
  const result = await performOCR(orderedFiles, ({ status, progress, imageIndex, imageCount }) => {
    const percent = Math.round(((imageIndex - 1 + progress) / imageCount) * 100);
    const normalizedStatus = String(status || '').toLowerCase();
    const stage = normalizedStatus.includes('recogniz') || normalizedStatus.includes('extract') ? 1 : 0;
    const pageLabel = imageCount > 1 ? ` — image ${imageIndex} of ${imageCount}` : '';
    if (typeof onProgress === 'function') {
      onProgress({ percent, stage, status: (status || 'Reading recipe...') + pageLabel });
    }
  });
  return result;
}

function removeNexusSource(itemId, panel) {
  nexusImportState.queue = removeNexusEntry(nexusImportState.queue, itemId);
  syncNexusState(); renderNexusQueue(panel);
  if (!nexusImportState.processing && !nexusImportState.queue.some(item => item.status === 'pending')) {
    const latestReady = nexusImportState.queue.findLast(item => item.status === 'ready');
    updateNexusProgress(latestReady || null, panel, '', latestReady ? 3 : -1, latestReady ? 'Ready to review' : 'Waiting for recipe images...');
  }
}

function retryNexusSource(itemId, panel) {
  const entry = nexusImportState.queue.find(item => item.id === itemId);
  if (!entry) return;
  entry.status = 'pending'; entry.error = ''; entry.warning = ''; entry.progress = 0; entry.ocrData = null;
  syncNexusState(); renderNexusQueue(panel); processNexusQueue(panel);
}

async function showRecipeReviewFromImport(itemId, panel) {
  const entry = nexusImportState.queue.find(item => item.id === itemId);
  const messageBox = panel.querySelector('[data-nexus-message]');
  if (!entry || !entry.ocrData || entry.status !== 'ready' || entry.openingReview) return;

  entry.openingReview = true;
  const entryFiles = Array.isArray(entry.files) ? entry.files : [entry.file].filter(Boolean);
  if (!entryFiles.length) return;
  if (messageBox) {
    messageBox.textContent = entryFiles.length > 1
      ? 'Saving the original images and preparing your review...'
      : 'Saving the original image and preparing your review...';
  }
  try {
    const selectedMemberId = panel.querySelector('[data-nexus-member-select]')?.value;
    const memberId = typeof getRecipeOwnerForCurrentSpace === 'function'
      ? getRecipeOwnerForCurrentSpace(selectedMemberId)
      : selectedMemberId || getNexusDefaultMemberId();
    const reviewRecipe = await createDraftFromOCR([], entry.ocrData, 'Cheryl', memberId);
    const imageUrls = await uploadSelectedImages(reviewRecipe.id, entryFiles);
    if (!imageUrls) throw new Error('The original recipe image could not be saved. Please try again.');

    reviewRecipe.images = imageUrls;
    await submitOCRRecipe(reviewRecipe);
    entry.recipe = reviewRecipe; entry.submitted = true;
    if (Array.isArray(recipes) && !recipes.some(recipe => recipe.id === reviewRecipe.id)) recipes.push(reviewRecipe);
    hideAllPanels(); showReviewComparison(reviewRecipe);
  } catch (error) {
    console.error('Recipe Import Center review preparation error:', error);
    if (messageBox) messageBox.textContent = 'Could not open this recipe for review: ' + (error?.message || 'Please try again.');
  } finally {
    entry.openingReview = false;
  }
}
