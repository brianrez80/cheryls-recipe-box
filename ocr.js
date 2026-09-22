// OCR Recipe Upload and Processing Workflow

// Initialize OCR module
let ocrState = {
  contributorName: '',
  uploadedFiles: [],
  processingRecipes: []
};

const OCR_SECTION_HEADINGS = {
  ingredients: /^(?:ingredients?|what you(?:'|’)ll need)\s*:?\s*$/i,
  instructions: /^(?:directions?|instructions?|method|preparation)\s*:?\s*$/i
};

const OCR_METADATA_LABELS = [
  'main category',
  'category',
  'cuisine',
  'ethnicity',
  'prep time',
  'cook time',
  'cooking time',
  'total time',
  'servings',
  'yield'
];

const OCR_SOCIAL_PROMPT_PATTERNS = [
  /\b(?:full|complete)\s+recipe\s+(?:is\s+)?(?:in|on)\s+(?:the\s+)?comments?\b/i,
  /\brecipe\s+(?:is\s+)?(?:in|on)\s+(?:the\s+)?comments?\b/i,
  /\b(?:see|check)\s+(?:the\s+)?comments?\s+for\s+(?:the\s+)?(?:full\s+)?recipe\b/i,
  /\bcomment\s+['"]?(?:recipe|yes)['"]?\s+(?:below\s+)?(?:for|to get)\b/i,
  /\blink\s+in\s+(?:my\s+|the\s+)?bio\b/i,
  /\b(?:follow|like|share|save)\b.{0,40}\b(?:more|recipe|recipes)\b/i
];

function normalizeOCRText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanOCRLine(line) {
  return String(line || '')
    .replace(/^[•·▪◦*-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSocialPromptLine(line) {
  const cleaned = cleanOCRLine(line);
  return OCR_SOCIAL_PROMPT_PATTERNS.some(pattern => pattern.test(cleaned));
}

function countAlphabeticWords(text) {
  return (cleanOCRLine(text).match(/\b[a-z]{2,}\b/gi) || []).length;
}

function scoreOCRLine(line) {
  const cleaned = cleanOCRLine(line);
  if (!cleaned) return 0;

  const compact = cleaned.replace(/\s/g, '');
  const alphaCharacters = (compact.match(/[a-z]/gi) || []).length;
  const digitCharacters = (compact.match(/\d/g) || []).length;
  const symbolCharacters = compact.length - alphaCharacters - digitCharacters;
  const alphaWordCount = countAlphabeticWords(cleaned);
  const hasRecipeKeyword = /\b(?:ingredients?|directions?|instructions?|cups?|teaspoons?|tablespoons?|cook|add|stir|bake|serve|mix|heat|combine|preheat|pour|fold|whisk|boil|chicken|beef|pasta|soup|salad)\b/i.test(cleaned);
  const hasReadableWords = alphaWordCount >= 1;
  const symbolRatio = compact.length ? symbolCharacters / compact.length : 0;

  let score = 0;
  if (hasReadableWords) score += 0.45 + Math.min(alphaWordCount * 0.1, 0.35);
  if (hasRecipeKeyword) score += 0.25;
  if (alphaCharacters >= 6) score += 0.1;
  if (cleaned.length <= 2) score -= 0.4;
  score -= Math.min(0.7, symbolRatio * 1.2);

  return Math.max(0, Math.min(1, score));
}

function scoreOCRText(text) {
  const lines = normalizeOCRText(text).split('\n').map(cleanOCRLine).filter(Boolean);
  if (!lines.length) return 0;

  const lineScores = lines.map(scoreOCRLine);
  const readableLineCount = lineScores.filter(score => score >= 0.35).length;
  const alphaWordCount = lines.reduce((sum, line) => sum + countAlphabeticWords(line), 0);
  const totalWordCount = lines.reduce((sum, line) => sum + cleanOCRLine(line).split(/\s+/).filter(Boolean).length, 0);
  const wordDensity = totalWordCount ? alphaWordCount / totalWordCount : 0;
  const averageSymbolRatio = lines.reduce((sum, line) => {
    const compact = cleanOCRLine(line).replace(/\s/g, '');
    const alphaCharacters = (compact.match(/[a-z]/gi) || []).length;
    const digitCharacters = (compact.match(/\d/g) || []).length;
    const symbolCharacters = compact.length - alphaCharacters - digitCharacters;
    return sum + (compact.length ? symbolCharacters / compact.length : 0);
  }, 0) / lines.length;

  const qualityScore = (Math.min(readableLineCount / 3, 1) * 0.35)
    + (Math.min(wordDensity, 1) * 0.35)
    + (Math.max(0, 1 - averageSymbolRatio) * 0.3);

  return Math.max(0, Math.min(1, qualityScore));
}

function isLikelyOCRNoise(line) {
  const cleaned = cleanOCRLine(line);
  if (!cleaned || isSocialPromptLine(cleaned)) return true;

  const compact = cleaned.replace(/\s/g, '');
  const readableCharacters = compact.match(/[\p{L}\p{N}]/gu) || [];
  const lineScore = scoreOCRLine(cleaned);

  if (lineScore >= 0.35) return false;
  if (readableCharacters.length < 2) return true;
  if (compact.length >= 6 && readableCharacters.length / compact.length < 0.35) return true;

  const letterRuns = cleaned.toLowerCase().match(/[a-z]{7,}/g) || [];
  if (letterRuns.some(run => !/[aeiouy]/.test(run))) return true;

  return true;
}

function looksLikeReadableTitle(value) {
  const title = cleanOCRLine(value || '');
  if (!title) return false;

  const compact = title.replace(/\s/g, '');
  if (!compact || compact.length < 3) return false;
  const readableCharacters = (compact.match(/[a-z0-9]/gi) || []).length;
  if (readableCharacters < 3) return false;

  const symbolRatio = 1 - (readableCharacters / Math.max(1, compact.length));
  const words = title.split(/\s+/).filter(Boolean);
  const alphaWords = words.filter(word => /^[a-z]{2,}$/i.test(word));
  const looksGeneric = /\b(?:symbols?|only|title|recipe|photo|image|untitled)\b/i.test(title) && words.length <= 2;
  const hasKnownSingleWordPattern = /^[a-z]{4,}$/i.test(title) && /^(?:pancakes?|pasta|salad|soup|stew|curry|salsa|tacos?|burritos?|casserole|pilaf|ramen|bread|cookies?|brownies?|muffins?|waffles?|sandwiches?|omelet|omelette|frittata|pizza|lasagna|risotto|tart|pie|cake|scones?)$/i.test(title);

  return !looksGeneric && symbolRatio < 0.5 && (alphaWords.length >= 2 || hasKnownSingleWordPattern);
}

function hasMeaningfulRecipeContent(page) {
  return Boolean(
    String(page?.ingredients || '').trim() ||
    String(page?.instructions || '').trim() ||
    looksLikeReadableTitle(page?.title)
  );
}

function extractLabeledValue(text, labels) {
  const labelPattern = labels
    .map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const match = text.match(
    new RegExp(`(?:^|\\n|\\|)\\s*(?:${labelPattern})\\s*[:\\-]\\s*([^\\n|]+)`, 'i')
  );

  if (!match) return '';

  const nextLabelPattern = OCR_METADATA_LABELS
    .map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  return match[1]
    .split(new RegExp(`\\s+(?=(?:${nextLabelPattern})\\s*[:\\-])`, 'i'))[0]
    .trim();
}

function findSectionIndex(lines, section) {
  return lines.findIndex(line => OCR_SECTION_HEADINGS[section].test(line));
}

function getSectionLines(lines, startIndex, endIndex) {
  if (startIndex < 0) return [];
  const end = endIndex > startIndex ? endIndex : lines.length;
  const sectionLines = [];

  for (const line of lines.slice(startIndex + 1, end)) {
    const cleaned = cleanOCRLine(line);
    if (isSocialPromptLine(cleaned)) break;
    if (!isLikelyOCRNoise(cleaned)) sectionLines.push(cleaned);
  }

  return sectionLines;
}

function formatInstructionLines(lines) {
  const steps = [];
  let numberedStep = '';

  lines.forEach(line => {
    const cleaned = cleanOCRLine(line);
    if (!cleaned) return;

    const numbered = cleaned.match(/^\d{1,2}[.)]\s*(.+)$/);
    if (numbered) {
      if (numberedStep) steps.push(numberedStep);
      numberedStep = numbered[1].trim();
      return;
    }

    if (numberedStep) {
      numberedStep += ` ${cleaned}`;
    } else {
      steps.push(cleaned);
    }
  });

  if (numberedStep) steps.push(numberedStep);

  return steps
    .map((step, index) => `${index + 1}. ${step}`)
    .join('\n');
}

function findRecipeTitle(lines, text) {
  const explicitTitle = extractLabeledValue(text, ['recipe title', 'title']);
  if (explicitTitle && looksLikeReadableTitle(explicitTitle)) return cleanOCRLine(explicitTitle);

  const firstSectionIndex = [findSectionIndex(lines, 'ingredients'), findSectionIndex(lines, 'instructions')]
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0] ?? lines.length;

  const candidates = lines.slice(0, firstSectionIndex).filter(line => {
    const cleaned = cleanOCRLine(line);
    const readableCharacterCount = (cleaned.match(/[a-z0-9]/gi) || []).length;
    if (!cleaned || readableCharacterCount < 2 || OCR_METADATA_LABELS.some(label =>
      new RegExp(`^${label.replace(/\s+/g, '\\s+')}\\s*[:\-]`, 'i').test(cleaned)
    )) {
      return false;
    }

    return !/^(?:test kitchen recipe|recipe card|family recipe|recipe)$/i.test(cleaned);
  });

  const titleCandidate = candidates.find((line, index) => {
    const cleaned = cleanOCRLine(line);
    const hasCandidateAfterIt = index < candidates.length - 1;
    const looksLikeRecipeKicker = (
      /\brecipe\b/i.test(cleaned) &&
      /\b(?:test|verification|kitchen|family|cookbook|collection|card)\b/i.test(cleaned)
    );
    return !(hasCandidateAfterIt && looksLikeRecipeKicker);
  });

  const fallbackTitle = cleanOCRLine(titleCandidate || candidates[0] || '');
  return looksLikeReadableTitle(fallbackTitle) ? fallbackTitle : '';
}

function normalizeMainCategory(explicitValue, text) {
  const direct = MAIN_CATEGORIES.find(
    category => category.toLowerCase() === String(explicitValue || '').toLowerCase()
  );
  if (direct) return direct;

  const haystack = `${explicitValue || ''}\n${text}`.toLowerCase();
  const categoryRules = [
    ['Chicken', /\b(?:chicken|turkey)\b/],
    ['Beef', /\b(?:beef|steak|hamburger|ground beef)\b/],
    ['Pork', /\b(?:pork|ham|bacon|sausage)\b/],
    ['Seafood', /\b(?:shrimp|prawn|crab|lobster|scallop|seafood)\b/],
    ['Fish', /\b(?:fish|salmon|tuna|cod|tilapia|trout)\b/],
    ['Salad', /\bsalad\b/],
    ['Soup', /\b(?:soup|stew|chowder|bisque)\b/],
    ['Breakfast', /\b(?:breakfast|pancake|waffle|omelet|omelette|french toast)\b/],
    ['Vegetarian', /\b(?:vegetarian|vegan|meatless)\b/],
    ['Dessert', /\b(?:dessert|cake|pie|tart|pudding|brownie|cheesecake)\b/],
    ['Sweets', /\b(?:cookie|candy|fudge|sweet)\b/],
    ['Appetizers', /\b(?:appetizer|starter|dip|canape|hors d'oeuvre)\b/],
    ['Side Dish', /\b(?:side dish|side|potatoes|rice|vegetables)\b/]
  ];

  return categoryRules.find(([, pattern]) => pattern.test(haystack))?.[0] || 'Other';
}

function normalizeEthnicity(explicitValue, text) {
  const direct = ETHNICITIES.find(
    ethnicity => ethnicity.toLowerCase() === String(explicitValue || '').toLowerCase()
  );
  if (direct) return direct;

  const haystack = `${explicitValue || ''}\n${text}`.toLowerCase();
  const ethnicityRules = [
    ['Mexican', /\b(?:mexican|taco|enchilada|burrito|salsa)\b/],
    ['Italian', /\b(?:italian|pasta|lasagna|risotto|parmesan)\b/],
    ['Mediterranean', /\b(?:mediterranean|greek|middle eastern|hummus|falafel)\b/],
    ['Asian', /\b(?:asian|chinese|japanese|korean|thai|vietnamese|indian|curry|teriyaki)\b/],
    ['American', /\b(?:american|southern|cajun|creole|barbecue|bbq)\b/]
  ];

  return ethnicityRules.find(([, pattern]) => pattern.test(haystack))?.[0] || 'Other';
}

function parseRecipeText(rawText, confidence = 0) {
  const text = normalizeOCRText(rawText);
  if (!text) {
    throw new Error('No readable text was found in the selected image.');
  }

  const lines = text.split('\n').map(cleanOCRLine).filter(Boolean);
  const ingredientsIndex = findSectionIndex(lines, 'ingredients');
  const instructionsIndex = findSectionIndex(lines, 'instructions');

  let ingredientLines = getSectionLines(lines, ingredientsIndex, instructionsIndex);
  let instructionLines = getSectionLines(lines, instructionsIndex, -1);

  if (ingredientLines.length === 0) {
    const ingredientPattern = /^(?:\d+(?:[ /.]\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s*(?:cups?|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lb|grams?|g|kilograms?|kg|cloves?|cans?|packages?|large|medium|small)\b/i;
    ingredientLines = lines.filter(line => ingredientPattern.test(line) && scoreOCRLine(line) >= 0.35);
  }

  if (instructionLines.length === 0) {
    const instructionPattern = /^(?:\d{1,2}[.)]\s*)?(?:add|bake|beat|blend|boil|combine|cook|fold|heat|mix|place|pour|preheat|serve|stir|whisk)\b/i;
    instructionLines = lines.filter(line => instructionPattern.test(line) && scoreOCRLine(line) >= 0.35);
  }

  ingredientLines = ingredientLines.filter(line => scoreOCRLine(line) >= 0.35);
  instructionLines = instructionLines.filter(line => scoreOCRLine(line) >= 0.35);

  const categoryValue = extractLabeledValue(text, ['main category', 'category']);
  const ethnicityValue = extractLabeledValue(text, ['cuisine', 'ethnicity']);
  const cookTime = extractLabeledValue(text, ['cook time', 'cooking time', 'total time']);
  const qualityScore = scoreOCRText(text);

  return {
    title: findRecipeTitle(lines, text),
    ingredients: ingredientLines.join('\n'),
    instructions: formatInstructionLines(instructionLines),
    cookTime,
    categories: {
      main: normalizeMainCategory(categoryValue, text),
      ethnicity: normalizeEthnicity(ethnicityValue, text)
    },
    confidence: Number.isFinite(confidence) ? Math.round(confidence) : 0,
    qualityScore,
    rawText: text
  };
}

function mergeParsedRecipePages(pages) {
  const candidatePages = (pages || []).filter(page => page && (String(page.ingredients || '').trim() || String(page.instructions || '').trim() || looksLikeReadableTitle(page.title)));
  const contentPages = candidatePages.filter(page => Boolean(String(page.ingredients || '').trim() || String(page.instructions || '').trim()));
  const uniqueIngredients = [];
  const instructionSteps = [];

  contentPages.forEach(page => {
    String(page.ingredients || '').split('\n').filter(Boolean).forEach(ingredient => {
      if (!uniqueIngredients.includes(ingredient)) uniqueIngredients.push(ingredient);
    });

    String(page.instructions || '').split('\n').filter(Boolean).forEach(instruction => {
      const step = instruction.replace(/^\d{1,2}[.)]\s*/, '').trim();
      if (step) instructionSteps.push(step);
    });
  });

  const titleCandidates = candidatePages.filter(page => looksLikeReadableTitle(page.title));
  const bestTitlePage = titleCandidates.reduce((best, page) => {
    if (!best) return page;
    const bestScore = (best.qualityScore || 0);
    const pageScore = (page.qualityScore || 0);
    return pageScore > bestScore ? page : best;
  }, null);
  const bestCategoryPage = candidatePages.find(page => page.categories?.main && page.categories.main !== 'Other') || null;
  const bestEthnicityPage = candidatePages.find(page => page.categories?.ethnicity && page.categories.ethnicity !== 'Other') || null;
  const bestCookTimePage = contentPages.filter(page => page.cookTime).reduce((best, page) => {
    if (!best) return page;
    return (page.qualityScore || 0) > (best.qualityScore || 0) ? page : best;
  }, null);
  const confidenceValues = candidatePages
    .map(page => page.confidence)
    .filter(Number.isFinite);
  const ocrWarnings = candidatePages.filter(page => (page.qualityScore || 0) < 0.35).length > 0
    ? ['One or more OCR pages had low quality and may need manual review.']
    : [];

  return {
    title: bestTitlePage?.title || '',
    ingredients: uniqueIngredients.join('\n'),
    instructions: instructionSteps
      .map((step, index) => `${index + 1}. ${step}`)
      .join('\n'),
    cookTime: bestCookTimePage?.cookTime || '',
    categories: {
      main: bestCategoryPage?.categories?.main || '',
      ethnicity: bestEthnicityPage?.categories?.ethnicity || ''
    },
    confidence: confidenceValues.length
      ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
      : 0,
    qualityScore: contentPages.length
      ? Math.round(contentPages.reduce((sum, page) => sum + (page.qualityScore || 0), 0) / contentPages.length * 100) / 100
      : 0,
    ocrWarnings,
    rawText: candidatePages.map(page => page.rawText).filter(Boolean).join('\n\n')
  };
}

async function performOCR(imageFiles, onProgress) {
  const files = Array.from(
    Array.isArray(imageFiles) ? imageFiles : [imageFiles]
  ).filter(Boolean);

  if (files.length === 0) {
    throw new Error('Please select at least one image.');
  }

  if (!window.Tesseract?.createWorker) {
    throw new Error('The OCR engine did not load. Check your connection and refresh the page.');
  }

  let currentImageIndex = 1;
  const reportProgress = typeof onProgress === 'function' ? onProgress : () => {};
  const oem = window.Tesseract.OEM?.LSTM_ONLY ?? 1;
  const worker = await window.Tesseract.createWorker('eng', oem, {
    logger(message) {
      reportProgress({
        status: message.status || 'Loading OCR engine',
        progress: Number.isFinite(message.progress) ? message.progress : 0,
        imageIndex: currentImageIndex,
        imageCount: files.length
      });
    }
  });

  const recognizedPages = [];

  try {
    for (let index = 0; index < files.length; index += 1) {
      currentImageIndex = index + 1;
      console.log(`Performing OCR on ${files[index].name}`);
      const { data } = await worker.recognize(files[index]);
      const pageText = data?.text?.trim() || '';
      if (!pageText) {
        continue;
      }

      try {
        recognizedPages.push(parseRecipeText(pageText, data.confidence));
      } catch (error) {
        console.warn(`Skipping unreadable OCR page ${files[index].name}:`, error.message);
      }
    }
  } finally {
    await worker.terminate();
  }

  if (recognizedPages.length === 0) {
    throw new Error('No readable text was found in the selected image.');
  }

  return mergeParsedRecipePages(recognizedPages);
}

// Create draft recipe from OCR data
async function createDraftFromOCR(images, ocrData, contributorName) {
  const noteSections = [];
  if (ocrData.ingredients) {
    noteSections.push(`Ingredients\n${ocrData.ingredients}`);
  }
  if (ocrData.instructions) {
    noteSections.push(`Instructions\n${ocrData.instructions}`);
  }

  const recipe = {
    id: generateId(),
    name: ocrData.title || '',
    time: ocrData.cookTime || '',
    mainCategory: ocrData.categories?.main || '',
    ethnicity: ocrData.categories?.ethnicity || '',
    notes: noteSections.join('\n\n'),
    status: 'draft',
    ocrText: JSON.stringify(ocrData),
    contributorName: contributorName || 'Anonymous',
    reviewedBy: null,
    reviewedAt: null,
    images: Array.isArray(images) ? images : [images],
    ocrWarnings: Array.isArray(ocrData.ocrWarnings) ? ocrData.ocrWarnings : [],
    persisted: false
  };

  return recipe;
}

// Submit OCR recipe for review
async function submitOCRRecipe(recipe) {
  try {
    console.log('Recipe submitted for review:', recipe.id);
    return recipe.id;
  } catch (error) {
    console.error('Error submitting OCR recipe:', error);
    throw error;
  }
}

// Approve and publish draft recipe
async function approveDraftRecipe(recipeId, editorName, updates) {
  try {
    const now = new Date().toISOString();
    const updatedRecipe = {
      ...updates,
      status: 'approved',
      reviewedBy: editorName,
      reviewedAt: now
    };

    await updateRecipe(recipeId, updatedRecipe);
    console.log('Recipe approved and published:', recipeId);
    return true;
  } catch (error) {
    console.error('Error approving recipe:', error);
    throw error;
  }
}

// Render OCR upload form
function renderOCRUploadForm() {
  if (!ui.ocrUploadPanel) return;

  const form = ui.ocrUploadPanel.querySelector('[data-ocr-form]');
  if (!form) return;

  form.innerHTML = `
    <form id="ocrUploadForm" class="form">
      <div class="form-section full">
        <label for="contributorName">Your Name (for credit)</label>
        <input type="text" id="contributorName" name="contributorName" 
               placeholder="Optional" maxlength="100">
      </div>

      <div class="form-section full">
        <label for="ocrImages">Upload Recipe Images (JPG, PNG, WebP)</label>
        <input type="file" id="ocrImages" name="ocrImages"
               accept="image/jpeg,image/png,image/webp" multiple required>
        <small>Upload up to 4 clear JPG, PNG, or WebP images. OCR runs privately in your browser.</small>
      </div>

      <div class="form-actions full">
        <button type="button" class="btn secondary" data-cancel-ocr>Cancel</button>
        <button type="submit" class="btn save">Upload & Process with OCR</button>
      </div>
    </form>

    <div id="ocrProgress" class="hidden">
      <div class="progress-bar">
        <div class="progress-fill" style="width: 0%"></div>
      </div>
      <p id="ocrStatus">Processing images...</p>
    </div>
  `;

  const ocrForm = document.getElementById('ocrUploadForm');
  if (ocrForm) {
    ocrForm.addEventListener('submit', handleOCRUpload);
  }

  const cancelBtn = form.querySelector('[data-cancel-ocr]');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      hideAllPanels();
      showPanel(ui.homeView);
    });
  }
}

// Handle OCR upload
async function handleOCRUpload(event) {
  event.preventDefault();

  const contributorNameInput = document.getElementById('contributorName');
  const ocrImagesInput = document.getElementById('ocrImages');
  
  if (!contributorNameInput || !ocrImagesInput) return;

  const contributorName = contributorNameInput.value.trim() || 'Anonymous';
  const files = Array.from(ocrImagesInput.files);
  const submitButton = event.submitter;

  if (files.length === 0) {
    alert('Please select at least one image.');
    return;
  }

  if (files.length > 4) {
    alert('Please upload no more than 4 recipe images at a time.');
    return;
  }

  const supportedImage = file => (
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    /\.(?:jpe?g|png|webp)$/i.test(file.name)
  );
  const unsupportedFile = files.find(file => !supportedImage(file));
  if (unsupportedFile) {
    alert(`${unsupportedFile.name} is not a supported image. Please use JPG, PNG, or WebP.`);
    return;
  }

  const oversizedFile = files.find(file => file.size > 12 * 1024 * 1024);
  if (oversizedFile) {
    alert(`${oversizedFile.name} is larger than 12 MB. Please use a smaller image.`);
    return;
  }

  // Show progress
  const progressDiv = document.getElementById('ocrProgress');
  const statusText = document.getElementById('ocrStatus');
  const progressFill = progressDiv?.querySelector('.progress-fill');
  if (progressDiv) {
    progressDiv.classList.remove('hidden');
  }
  if (progressFill) {
    progressFill.style.width = '0%';
  }
  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    const recipeId = generateId();

    // Extract text locally before uploading, so failed OCR does not leave orphaned images.
    if (statusText) statusText.textContent = 'Loading OCR engine...';
    const ocrResults = await performOCR(files, progress => {
      const overallProgress = (
        (progress.imageIndex - 1 + progress.progress) / progress.imageCount
      );
      const percent = Math.max(0, Math.min(100, Math.round(overallProgress * 100)));
      if (progressFill) progressFill.style.width = `${percent}%`;
      if (statusText) {
        statusText.textContent = `${progress.status} — image ${progress.imageIndex} of ${progress.imageCount} (${percent}%)`;
      }
    });

    // Store the original images after OCR succeeds.
    if (statusText) statusText.textContent = 'Uploading original images...';
    const imageUrls = await uploadSelectedImages(recipeId, files);

    if (!imageUrls) {
      throw new Error('Failed to upload images.');
    }

    // Create draft recipe
    if (statusText) statusText.textContent = 'Creating recipe...';
    const draftRecipe = await createDraftFromOCR(imageUrls, ocrResults, contributorName);

    // Submit for review
    await submitOCRRecipe(draftRecipe);
    if (Array.isArray(recipes)) {
      recipes.push(draftRecipe);
    }

    if (statusText) statusText.textContent = 'Recipe submitted for review!';
    if (progressFill) progressFill.style.width = '100%';
    
    alert('Recipe submitted for review! An editor will review and approve it shortly.');

    // Reset and go back to home
    setTimeout(() => {
      if (progressDiv) progressDiv.classList.add('hidden');
      hideAllPanels();
      showPanel(ui.homeView);
      ocrImagesInput.value = '';
      if (contributorNameInput) contributorNameInput.value = '';
    }, 2000);

  } catch (error) {
    console.error('OCR upload error:', error);
    if (statusText) {
      statusText.textContent = `Error: ${error.message}`;
    }
    alert(`Error processing recipe: ${error.message}`);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}
