# Code Architecture & Module Dependencies

Authentication now uses Supabase Auth plus a private two-identity database allowlist. The older module descriptions below document the original app; PIN constants and PIN verification no longer exist. See [current security architecture](docs/security/README.md).

## Module Dependency Graph

```
index.html
├── Supabase Library (CDN)
│
└── config.js ─────── Constants & configuration
    │
    ├─→ db.js ──────── Database operations (uses SUPABASE_CONFIG)
    │   │
    │   └─→ app.js ── Recipe CRUD (uses db functions)
    │
    ├─→ images.js ──── Image handling
    │   │
    │   └─→ app.js ── Upload management
    │
    ├─→ ui.js ──────── UI rendering
    │   │
    │   ├─→ app.js ── Panel management
    │   │
    │   └─→ ocr.js ── Review UI
    │
    ├─→ auth.js ───── Authentication
    │   │
    │   └─→ app.js ── Auth checks
    │
    ├─→ ocr.js ────── OCR workflow
    │   │
    │   ├─→ config.js (for constants)
    │   ├─→ db.js (for saving recipes)
    │   ├─→ images.js (for image uploads)
    │   │
    │   └─→ app.js ── Lifecycle management
    │
    └─→ app.js ────── Main controller
        │
        ├─→ Initializes all modules
        ├─→ Orchestrates feature workflows
        └─→ Handles all events
```

## Initialization Sequence

```
1. Supabase library loads
2. config.js - Sets up constants
3. db.js - Initializes (waits for Supabase)
4. images.js - Utilities available
5. ui.js - Cache DOM elements
6. auth.js - Check session
7. ocr.js - Register handlers
8. app.js - Main initialization
   ├── initializeSupabase()
   ├── initializeAuth() → checkPin() or unlockSite()
   ├── initializeUI() → cache all DOM
   ├── loadRecipes() → fetch from DB
   ├── setupEventListeners()
   ├── setupScrollToTop()
   ├── renderCategoryChips()
   └── renderOCRUploadForm()
```

## Module Responsibilities

### `config.js`
**Purpose:** Single source of truth for configuration  
**Exports:**
- `SUPABASE_CONFIG` - Connection details
- `APP_PIN` - Authentication PIN
- `MAIN_CATEGORIES` - Recipe types
- `ETHNICITIES` - Cuisine options
- `getDefaultRecipes()` - Seed data
- `generateId()` - UUID utility

### `db.js`
**Purpose:** Supabase database abstraction layer  
**Exports:**
- `getSupabase()` - Get client instance
- `fetchAllRecipes()` - Get all published recipes
- `fetchRecipesByStatus(status)` - Get drafts/published
- `saveNewRecipe(recipe)` - Insert new
- `updateRecipe(id, updates)` - Modify existing
- `deleteRecipe(id)` - Remove
- `uploadImage(recipeId, file)` - Storage upload
- `deleteImage(path)` - Storage delete
- `mapDbRecipe(row)` - DB → UI object
- `mapRecipeToDb(recipe)` - UI → DB object

### `images.js`
**Purpose:** Image processing and management  
**Exports:**
- `getRecipeImages(recipe)` - Extract all images
- `parseRecipeImages(...values)` - Parse from various formats
- `compressImageFile(file)` - Canvas-based compression
- `uploadSelectedImages(recipeId, files)` - Batch upload
- `renderImageHtml(images, name)` - Generate HTML

### `ui.js`
**Purpose:** DOM management and rendering  
**Exports:**
- `ui` - DOM element cache object
- `initializeUI()` - Cache all elements
- `hideAllPanels()` - Hide all sections
- `showPanel(element)` - Reveal and scroll to
- `renderCategoryChips()` - Filter buttons
- `renderRecipes(recipes, title)` - Recipe list
- `renderReviewQueue(recipes)` - Draft list
- `showReviewComparison(recipe)` - Edit view
- `setupScrollToTop()` - Top button handler
- `escapeHtml(text)` - XSS prevention

### `auth.js`
**Purpose:** PIN-based authentication  
**Exports:**
- `isUnlocked` - Global state
- `initializeAuth()` - Setup auth flow
- `setupAuthEventListeners()` - Event handlers
- `verifyPin()` - Check PIN
- `unlockSite()` - Grant access
- `isUserAuthenticated()` - Check state

### `ocr.js`
**Purpose:** OCR upload and review workflow  
**Exports:**
- `ocrState` - Workflow state
- `performOCR(files, onProgress)` - Extract text with client-side Tesseract.js
- `parseRecipeText(text, confidence)` - Parse recognized text into recipe fields
- `createDraftFromOCR(images, data, name)` - Create recipe
- `submitOCRRecipe(recipe)` - Save to DB
- `approveDraftRecipe(id, editor, updates)` - Publish
- `renderOCRUploadForm()` - Form UI
- `handleOCRUpload(event)` - Process upload

### `app.js`
**Purpose:** Main application controller  
**Exports:**
- `recipes` - Recipe array
- `editingId` - Current edit target
- `initializeApp()` - Main init
- `loadRecipes()` - Fetch from DB
- `setupEventListeners()` - Event routing
- `startNewRecipe()` - Form for new
- `startEditRecipe(id)` - Form for edit
- `handleDeleteRecipe(id)` - Remove recipe
- `loadAndShowReviewQueue()` - Load drafts
- `handleApproveRecipe(id, form)` - Publish

## Data Flow Patterns

### Adding a Recipe Manually
```
User clicks "Add New Recipe"
  ↓
app.js: startNewRecipe() clears form
  ↓
User fills form + uploads images
  ↓
form submits → app.js: handleFormSubmit()
  ↓
images.js: uploadSelectedImages()
  ↓ (for each file)
db.js: uploadImage() → Supabase storage
  ↓ (returns URLs)
db.js: saveNewRecipe() → Insert to DB
  ↓
recipes array updated
  ↓
ui.js: renderRecipes() → Display updated list
```

### OCR Upload & Review Workflow
```
User clicks "Upload Recipe Photo"
  ↓
ocr.js: renderOCRUploadForm()
  ↓
User selects images + name
  ↓
form submits → ocr.js: handleOCRUpload()
  ↓
images.js: uploadSelectedImages()
  ↓ (for each file)
db.js: uploadImage() → Supabase storage
  ↓ (returns URLs)
ocr.js: performOCR(file[0]) → Extract text
  ↓
ocr.js: createDraftFromOCR() → Create object
  ↓
ocr.js: submitOCRRecipe() 
  ↓
db.js: saveNewRecipe(draft)
  ↓ (status: 'draft')
User notified "Recipe submitted"
```

### Reviewing a Draft
```
Editor clicks "Review Queue"
  ↓
app.js: loadAndShowReviewQueue()
  ↓
db.js: fetchRecipesByStatus('draft')
  ↓
ui.js: renderReviewQueue(drafts)
  ↓ (shows all drafts)
Editor clicks "Review & Edit"
  ↓
ui.js: showReviewComparison(recipe)
  ↓ (shows images + editable fields)
Editor makes changes + clicks "Approve & Publish"
  ↓
app.js: handleApproveRecipe()
  ↓
ocr.js: approveDraftRecipe()
  ↓
db.js: updateRecipe(id, {..., status: 'published', reviewedBy, reviewedAt})
  ↓
recipes array updated
  ↓
Recipe now in published collection
```

## Error Handling Strategy

### Database Errors
```
try {
  await db.operation()
} catch (error) {
  console.error('Context:', error)
  alert(`User-friendly message: ${error.message}`)
  throw error (to calling function)
}
```

### Image Upload Errors
```
if (!uploaded || !uploaded.publicUrl) {
  alert('Image upload failed')
  return null (caller checks for null)
}
```

### OCR Errors
```
try {
  OCR operation
  Show progress feedback
  Check for success
  Handle errors gracefully
} catch (error) {
  Clear progress UI
  Show error message
  Allow retry
}
```

## State Management

### Global State
```javascript
recipes[]          // From DB, always up-to-date
editingId          // Current form target (null = new)
isUnlocked         // Auth state
ocrState = {       // OCR workflow state
  contributorName
  uploadedFiles
  processingRecipes
}
```

### Local State (ui object)
```javascript
ui = {
  homeView,
  mainBrowser,
  ethnicityBrowser,
  recipeResults,
  formPanel,
  ocrUploadPanel,
  reviewQueuePanel,
  reviewComparisonPanel,
  // ... all cached DOM elements
}
```

### Session Storage
```javascript
sessionStorage.setItem(UNLOCK_KEY, 'true')
// Survives page refresh
// Clears on browser close
```

## Event Delegation Strategy

```javascript
// Home buttons (6 actions)
homeView.addEventListener('click', (e) => {
  const action = e.target.dataset.action
  // route to: new, main, ethnicity, all, ocr-upload, review-queue
})

// Filter chips (category/ethnicity)
document.body.addEventListener('click', (e) => {
  if (e.target.classList.contains('chip')) {
    // Filter recipes by category
  }
})

// Recipe actions (edit/delete)
document.body.addEventListener('click', (e) => {
  if (e.target.dataset.editId) { startEditRecipe(...) }
  if (e.target.dataset.deleteId) { handleDeleteRecipe(...) }
})

// Review actions
document.body.addEventListener('click', (e) => {
  if (e.target.dataset.reviewEdit) { showReviewComparison(...) }
  if (e.target.dataset.reviewDelete) { handleDeleteRecipe(...) }
})

// Review form submission
document.addEventListener('submit', (e) => {
  if (e.target.matches('.comparison-form')) {
    // Handle approve/reject
  }
})
```

## Best Practices Implemented

✅ **Modularity** - Single responsibility per file  
✅ **DRY** - No repeated code, reusable utilities  
✅ **Error Handling** - Try-catch, validation, user feedback  
✅ **Security** - XSS escaping, no secrets exposed  
✅ **Performance** - Image compression, lazy loading  
✅ **Accessibility** - Semantic HTML, form labels  
✅ **Documentation** - Comments in key areas  
✅ **Testing** - Syntax checks, structure validation  

## Future Enhancements

### Short Term
- Improve handwritten-recipe recognition and image preprocessing
- Add recipe search functionality
- Implement user authentication
- Add recipe categories/tags

### Medium Term
- Batch OCR processing
- Recipe collections/favorites
- Share recipes with family
- Print-friendly format
- Recipe scaling calculator

### Long Term
- Mobile app (React Native)
- Recipe sync across devices
- Nutritional information
- Meal planning features
- Grocery list generation
