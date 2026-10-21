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
async function preparePrivateImages(references) {
  const generation = privateImageGeneration;
  // Bound simultaneous downloads for mobile connections and large collections.
  const unique = [...new Set(references || [])];
  for (let offset = 0; offset < unique.length; offset += 4) {
    await Promise.all(unique.slice(offset, offset + 4).map(async reference => {
      const storagePath = getStoragePathFromUrl(reference);
      if (!storagePath || privateImageCache.has(reference)) return;
      const { data, error } = await getSupabase().storage.from(SUPABASE_CONFIG.STORAGE_BUCKET).download(storagePath);
      if (generation !== privateImageGeneration) return;
      if (error || !data || !/^image\/(png|jpeg|webp|gif|avif|heic|heif|bmp|tiff)$/i.test(data.type)) {
        // Keep the reference/metadata intact; never fall back to a public URL.
        privateImageCache.set(reference, ''); return;
      }
      privateImageCache.set(reference, URL.createObjectURL(data));
    }));
    if (generation !== privateImageGeneration) return;
  }
}
function clearPrivateImages() {
  privateImageGeneration += 1;
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
    if (!displayUrl) return '';
    const safeUrl = escapeImageAttribute(displayUrl);
    const safeName = escapeImageAttribute(recipeName);
    const image = `<img
      src="${safeUrl}"
      alt="${safeName}${images.length > 1 ? ` image ${index + 1}` : ''}"
      loading="lazy"
    >`;

    if (!galleryClass) return image;

    return `<a class="recipe-image-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer" aria-label="View full-size ${safeName}${images.length > 1 ? ` image ${index + 1}` : ''}">${image}</a>`;
  }).join('');

  if (!galleryClass) return imageHtml;

  return `<div class="${galleryClass} ${galleryClass}--${images.length}">${imageHtml}</div>`;
}
