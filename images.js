// Image handling utilities

// Parse recipe images from various sources
function parseRecipeImages(...values) {
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      const images = value.filter(item => typeof item === 'string' && item);
      if (images.length) return images;
      continue;
    }
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const images = parsed.filter(item => typeof item === 'string' && item);
        if (images.length) return images;
        continue;
      }
    } catch (error) {}
    if (typeof value === 'string') return [value];
  }
  return [];
}

// Get all images for a recipe
function getRecipeImages(recipe) {
  return parseRecipeImages(recipe.imageUrl, recipe.images, recipe.image, recipe.originalImageUrls);
}

const privateImageCache = new Map();
let privateImageGeneration = 0;
const privateImagePending = new Map();
const privateImageQueue = [];
const privateImageControllers = new Set();
const privateImageObservers = new Map();
let privateImageActive = 0;
function drainPrivateImageQueue() {
  while (privateImageActive < 4 && privateImageQueue.length) {
    const job = privateImageQueue.shift();
    if (job.generation !== privateImageGeneration) { job.resolve(null); continue; }
    privateImageActive += 1;
    const controller = new AbortController(); privateImageControllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 30000);
    (async () => {
      const { data, error } = await getSupabase().storage.from(SUPABASE_CONFIG.STORAGE_BUCKET)
        .download(job.path, {}, { signal: controller.signal });
      if (job.generation !== privateImageGeneration) return null;
      if (error || !data || !/^image\/(png|jpeg|webp|gif|avif|heic|heif|bmp|tiff)$/i.test(data.type)) throw new Error('Private photo unavailable');
      const url = URL.createObjectURL(data); privateImageCache.set(job.reference, url); return url;
    })().then(job.resolve, job.reject).finally(() => {
      privateImageActive -= 1; privateImageControllers.delete(controller);
      clearTimeout(timeout);
      if (privateImagePending.get(job.reference) === job.promise) privateImagePending.delete(job.reference);
      drainPrivateImageQueue();
    });
  }
}
function requestPrivateImage(reference) {
  if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) return Promise.resolve(null);
  if (privateImageCache.has(reference)) return Promise.resolve(privateImageCache.get(reference));
  if (privateImagePending.has(reference)) return privateImagePending.get(reference);
  const path = getStoragePathFromUrl(reference);
  if (!path) return Promise.resolve(null);
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  privateImagePending.set(reference, promise);
  privateImageQueue.push({ reference, path, promise, resolve, reject, generation: privateImageGeneration });
  drainPrivateImageQueue(); return promise;
}
async function preparePrivateImages(references) {
  await Promise.all([...new Set(references || [])].map(reference => requestPrivateImage(reference).catch(() => null)));
}
function hydratePrivateImages(root) {
  if (!root?.querySelectorAll) return;
  privateImageObservers.get(root)?.disconnect(); privateImageObservers.delete(root);
  const generation = privateImageGeneration;
  async function load(image) {
    if (image.dataset.privateImageLoading || !image.isConnected) return;
    image.dataset.privateImageLoading = 'true'; image.setAttribute('aria-busy', 'true');
    const retry = image.closest('.private-image-item')?.querySelector('[data-retry-private-image]');
    if (retry) retry.hidden = true;
    try {
      const url = await requestPrivateImage(image.dataset.privateImageRef);
      if (!url || generation !== privateImageGeneration || !image.isConnected) return;
      image.src = url; image.removeAttribute('data-private-image-ref');
      const link = image.closest('.recipe-image-link');
      if (link) { link.href = url; link.removeAttribute('aria-disabled'); link.removeAttribute('tabindex'); }
    } catch {
      if (generation === privateImageGeneration && image.isConnected && retry) retry.hidden = false;
    } finally { delete image.dataset.privateImageLoading; image.removeAttribute('aria-busy'); }
  }
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); void load(entry.target); }
  }, { rootMargin: '200px' }) : null;
  if (observer) privateImageObservers.set(root, observer);
  for (const image of root.querySelectorAll('img[data-private-image-ref]')) {
    const retry = image.closest('.private-image-item')?.querySelector('[data-retry-private-image]');
    if (retry) retry.onclick = () => { void load(image); };
    if (observer) observer.observe(image); else void load(image);
  }
}
function clearPrivateImages() {
  privateImageGeneration += 1;
  for (const observer of privateImageObservers.values()) observer.disconnect();
  privateImageObservers.clear();
  for (const controller of privateImageControllers) controller.abort();
  for (const job of privateImageQueue.splice(0)) job.resolve(null);
  privateImagePending.clear();
  for (const url of privateImageCache.values()) if (url) URL.revokeObjectURL(url);
  privateImageCache.clear();
}
function getDisplayImageUrl(reference) {
  if (typeof getStoragePathFromUrl === 'function' && getStoragePathFromUrl(reference)) {
    return privateImageCache.get(reference) || '';
  }
  // Legacy embedded images and external recipe images remain readable, with
  // active-content schemes excluded. Never persist rendered blob URLs to DB.
  return /^(https?:\/\/|data:image\/(png|jpeg|webp|gif|avif);base64,)/i.test(reference) ? reference : '';
}
function escapeImageAttribute(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

// Compress image file for storage
async function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = function(event) {
      const img = new Image();

      img.onload = function() {
        const canvas = document.createElement('canvas');
        const maxWidth = 900;
        const scale = Math.min(1, maxWidth / img.width);

        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };

      img.onerror = reject;
      img.src = event.target.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Upload multiple images and return URLs
async function uploadSelectedImages(recipeId, files) {
  const imageUrls = [];
  
  for (const file of files) {
    try {
      const uploaded = await uploadImage(recipeId, file);
      if (!uploaded || !uploaded.publicUrl) {
        console.error('Image upload failed for:', file.name);
        return null;
      }
      imageUrls.push(uploaded.publicUrl);
    } catch (err) {
      console.error('Error uploading image:', err);
      return null;
    }
  }
  
  return imageUrls;
}

// Render image HTML
function renderImageHtml(images, recipeName, galleryClass = '') {
  if (!images || images.length === 0) return '';
  const imageHtml = images.map((imageUrl, index) => {
    const displayUrl = getDisplayImageUrl(imageUrl);
    const isPrivate = typeof getStoragePathFromUrl === 'function' && Boolean(getStoragePathFromUrl(imageUrl));
    if (!displayUrl && !isPrivate) return '';
    const safeUrl = escapeImageAttribute(displayUrl);
    const safeName = escapeImageAttribute(recipeName);
    const image = `<img
      ${displayUrl ? `src="${safeUrl}"` : `data-private-image-ref="${escapeImageAttribute(imageUrl)}"`}
      alt="${safeName}${images.length > 1 ? ` image ${index + 1}` : ''}"
      loading="lazy"
    >`;

    const rendered = !galleryClass ? image : `<a class="recipe-image-link" ${displayUrl ? `href="${safeUrl}"` : 'aria-disabled="true" tabindex="-1"'} target="_blank" rel="noopener noreferrer" aria-label="View full-size ${safeName}${images.length > 1 ? ` image ${index + 1}` : ''}">${image}</a>`;
    if (!displayUrl && isPrivate) return `<div class="private-image-item">${rendered}<button type="button" class="btn secondary private-image-retry" data-retry-private-image hidden>Photo unavailable. Retry</button></div>`;

    return rendered;
  }).join('');

  if (!galleryClass) return imageHtml;

  return `<div class="${galleryClass} ${galleryClass}--${images.length}">${imageHtml}</div>`;
}
