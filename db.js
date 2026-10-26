// Database layer for Supabase interaction
let supabaseClient = null;

function databaseSessionGuard() {
  const isCurrent = typeof captureRecipeOperation === 'function' ? captureRecipeOperation() : () => true;
  return () => {
    if (!isCurrent()) throw new Error('Your session changed. Sign in again before continuing.');
  };
}

function initializeSupabase() {
  if (window.supabase) {
    supabaseClient = supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) }
    });
    return supabaseClient;
  }
  console.error('Supabase library not loaded');
  return null;
}

function getSupabase() {
  if (!supabaseClient) {
    initializeSupabase();
  }
  return supabaseClient;
}

// Recipe mapping: DB -> UI
function mapDbRecipe(row) {
  return {
    id: row.id,
    name: row.name,
    time: row.cook_time || '',
    mainCategory: row.main_category || '',
    ethnicity: row.ethnicity,
    notes: row.notes,
    status: row.status || 'approved',
    ocrText: row.ocr_text || null,
    contributorName: row.contributor_name || null,
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    image: row.image || null,
    images: Array.isArray(row.images) ? row.images : null,
    imageUrl: row.image_url || null,
    originalImageUrls: row.original_image_urls || [],
    videoUrl: row.video_url || '',
    sourceUrl: row.source_url || '',
    memberId: row.member_id || null
  };
}

// Recipe mapping: UI -> DB
function mapRecipeToDb(recipe) {
  return {
    id: recipe.id,
    name: recipe.name,
    cook_time: recipe.time,
    main_category: recipe.mainCategory,
    ethnicity: recipe.ethnicity,
    notes: recipe.notes,
    status: recipe.status || 'approved',
    ocr_text: recipe.ocrText || null,
    contributor_name: recipe.contributorName || null,
    reviewed_by: recipe.reviewedBy || null,
    reviewed_at: recipe.reviewedAt || null,
    image_url: JSON.stringify(Array.isArray(recipe.images) ? recipe.images : []),
    video_url: recipe.videoUrl || null,
    source_url: recipe.sourceUrl || null,
    member_id: recipe.memberId || getDefaultMemberId()
  };
}

// Map only the fields that are present. Updates must not turn absent draft
// metadata (images, OCR text, contributor credit) into null or empty values.
function mapRecipeUpdatesToDb(updates) {
  const dbUpdates = {};
  const fieldMap = {
    name: 'name',
    time: 'cook_time',
    mainCategory: 'main_category',
    ethnicity: 'ethnicity',
    notes: 'notes',
    status: 'status',
    ocrText: 'ocr_text',
    contributorName: 'contributor_name',
    reviewedBy: 'reviewed_by',
    reviewedAt: 'reviewed_at',
    videoUrl: 'video_url',
    sourceUrl: 'source_url',
    memberId: 'member_id'
  };

  Object.entries(fieldMap).forEach(([uiField, dbField]) => {
    if (Object.prototype.hasOwnProperty.call(updates, uiField)) {
      dbUpdates[dbField] = updates[uiField];
    }
  });

  if (Object.prototype.hasOwnProperty.call(updates, 'images')) {
    dbUpdates.image_url = JSON.stringify(Array.isArray(updates.images) ? updates.images : []);
  }

  return dbUpdates;
}

function mapDbFamilyMember(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    active: row.active !== false
  };
}

// The members table is deliberately separate from recipes so adding another
// family member later is a data change, not an application change.
async function fetchFamilyMembers() {
  const assertCurrent = databaseSessionGuard(); assertCurrent();
  const db = getSupabase();
  if (!db) return [];

  try {
    const { data, error } = await db.from('family_members')
      .select('id, display_name, active')
      .order('display_name');
    assertCurrent();

    if (error) {
      console.error('Error fetching family members:', error);
      return null;
    }

    return Array.isArray(data) ? data.map(mapDbFamilyMember) : [];
  } catch (err) {
    console.error('Unexpected error fetching family members:', err);
    return null;
  }
}

async function createFamilyMember(displayName) {
  const assertCurrent = databaseSessionGuard(); assertCurrent();
  const db = getSupabase();
  if (!db) throw new Error('Supabase not initialized');

  try {
    const { data, error } = await db.from('family_members')
      .insert([{ display_name: displayName, active: true }])
      .select('id, display_name, active')
      .single();
    assertCurrent();

    if (error) throw new Error(error.message || 'Could not add family member');
    return mapDbFamilyMember(data);
  } catch (err) {
    console.error('Error creating family member:', err);
    throw err;
  }
}

// Fetch all recipes
async function fetchAllRecipes() {
  const assertCurrent = databaseSessionGuard(); assertCurrent();
  const db = getSupabase();
  if (!db) return [];

  try {
    const { data, error } = await db.from(SUPABASE_CONFIG.TABLE_NAME)
      .select('*')
      .order('name');
    assertCurrent();
    
    if (error) {
      console.error('Error fetching recipes:', error);
      return null;
    }
    
    return Array.isArray(data) ? data.map(mapDbRecipe) : [];
  } catch (err) {
    console.error('Unexpected error fetching recipes:', err);
    return null;
  }
}

// Fetch recipes by status (for review queue)
async function fetchRecipesByStatus(status) {
  const assertCurrent = databaseSessionGuard(); assertCurrent();
  const db = getSupabase();
  if (!db) return [];

  try {
    const { data, error } = await db.from(SUPABASE_CONFIG.TABLE_NAME)
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false });
    assertCurrent();
    
    if (error) {
      console.error('Error fetching recipes by status:', error);
      return null;
    }
    
    return Array.isArray(data) ? data.map(mapDbRecipe) : [];
  } catch (err) {
    console.error('Unexpected error fetching recipes by status:', err);
    return null;
  }
}

// Save new recipe
async function saveNewRecipe(recipe) {
  const assertCurrent = databaseSessionGuard(); assertCurrent();
  const db = getSupabase();
  if (!db) throw new Error('Supabase not initialized');

  const dbRecipe = mapRecipeToDb(recipe);
  
  try {
    const { error } = await db.from(SUPABASE_CONFIG.TABLE_NAME).insert([dbRecipe]);
    assertCurrent();
    if (error) throw new Error(error.message || 'Recipe insert failed');
  } catch (err) {
    console.error('Error saving recipe:', err);
    throw err;
  }
}

// Update recipe
async function updateRecipe(recipeId, updates) {
  const assertCurrent = databaseSessionGuard(); assertCurrent();
  const db = getSupabase();
  if (!db) throw new Error('Supabase not initialized');

  const dbUpdates = mapRecipeUpdatesToDb(updates);
  if (Object.keys(dbUpdates).length === 0) {
    throw new Error('No recipe changes were provided');
  }
  
  try {
    const { error, count } = await db.from(SUPABASE_CONFIG.TABLE_NAME)
      .update(dbUpdates, { count: 'exact' })
      .eq('id', recipeId);
    assertCurrent();
    if (error) {
      const details = [error.message, error.details, error.hint, error.code]
        .filter(Boolean)
        .join(' — ');
      throw new Error(details || 'Recipe update failed');
    }
    if (count === 0) throw new Error('Recipe was not updated. Refresh your session and try again.');
  } catch (err) {
    console.error('Error updating recipe:', err);
    throw err;
  }
}

// Delete recipe
async function deleteRecipe(recipeId) {
  const assertCurrent = databaseSessionGuard(); assertCurrent();
  const db = getSupabase();
  if (!db) throw new Error('Supabase not initialized');

  try {
    const { error, count } = await db.from(SUPABASE_CONFIG.TABLE_NAME)
      .delete({ count: 'exact' })
      .eq('id', recipeId);
    assertCurrent();
    if (error) throw new Error(error.message || 'Recipe delete failed');
    if (count === 0) throw new Error('Recipe was not deleted. Refresh your session and try again.');
  } catch (err) {
    console.error('Error deleting recipe:', err);
    throw err;
  }
}

// Upload image to storage
async function uploadImage(recipeId, file) {
  const assertCurrent = databaseSessionGuard(); assertCurrent();
  const db = getSupabase();
  if (!db) return null;

  try {
    if (!/^image\/(png|jpeg|webp|gif|avif|heic|heif|bmp|tiff)$/i.test(file.type || '')) {
      throw new Error('Choose a supported photo format.');
    }
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, '-');
    const filePath = `recipes/${recipeId}/${Date.now()}-${generateId()}-${safeName}`;
    
    const { error } = await db.storage
      .from(SUPABASE_CONFIG.STORAGE_BUCKET)
      .upload(filePath, file, { cacheControl: '0' });
    assertCurrent();
    
    if (error) {
      throw new Error(error.message || 'Image upload failed');
    }
    
    const reference = `storage://${SUPABASE_CONFIG.STORAGE_BUCKET}/${filePath}`;
    await preparePrivateImages([reference]);
    assertCurrent();
    return {
      path: filePath,
      publicUrl: reference // Compatibility name: private reference, never a URL.
    };
  } catch (err) {
    console.error('Error uploading image:', err);
    return null;
  }
}

// Delete image from storage
async function deleteImage(pathOrUrl) {
  const assertCurrent = databaseSessionGuard(); assertCurrent();
  if (!pathOrUrl) return;

  const db = getSupabase();
  if (!db) return;

  try {
    const filePath = getStoragePathFromUrl(pathOrUrl);
    
    if (!filePath) return;
    
    const { error } = await db.storage
      .from(SUPABASE_CONFIG.STORAGE_BUCKET)
      .remove([filePath]);
    
    if (error) {
      console.warn('Error deleting image:', error);
    }
  } catch (err) {
    console.error('Unexpected error deleting image:', err);
  }
}

// Helper: Extract storage path from public URL
function getStoragePathFromUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  const referencePrefix = `storage://${SUPABASE_CONFIG.STORAGE_BUCKET}/`;
  if (url.startsWith(referencePrefix)) return url.slice(referencePrefix.length);
  for (const access of ['public','authenticated','sign']) {
    const prefix = `${SUPABASE_CONFIG.URL}/storage/v1/object/${access}/${SUPABASE_CONFIG.STORAGE_BUCKET}/`;
    if (url.startsWith(prefix)) {
      try { return decodeURIComponent(url.slice(prefix.length).split('?')[0]); } catch { return null; }
    }
  }
  return url.startsWith('recipes/') && !url.split('/').includes('..') ? url : null;
}
