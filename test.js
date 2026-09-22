#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('\n🧪 Testing Cheryl\'s Recipe Box Application\n');
console.log('=' .repeat(50));

let passCount = 0;
let failCount = 0;
let warnCount = 0;

function pass(msg) {
  console.log('✓ PASS:', msg);
  passCount++;
}

function fail(msg) {
  console.log('✗ FAIL:', msg);
  failCount++;
}

function warn(msg) {
  console.log('⚠ WARN:', msg);
  warnCount++;
}

// Test 1: File Structure
console.log('\n📁 File Structure Check');
console.log('-' .repeat(50));

const requiredFiles = [
  'index.html',
  'styles.css',
  'config.js',
  'db.js',
  'images.js',
  'ui.js',
  'auth.js',
  'ocr.js',
  'nexus.js',
  'app.js',
  'butterfly.svg'
];

requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const size = fs.statSync(filePath).size;
    pass(`${file} (${size} bytes)`);
  } else {
    fail(`${file} not found`);
  }
});

// Test 2: JavaScript Syntax
console.log('\n📝 JavaScript Syntax Check');
console.log('-' .repeat(50));

const jsFiles = ['config.js', 'db.js', 'images.js', 'ui.js', 'auth.js', 'ocr.js', 'nexus.js', 'app.js'];

jsFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Compile the script without executing it.
    new Function(content);
    pass(`${file} syntax OK`);
  } catch (err) {
    fail(`${file} - ${err.message}`);
  }
});

// Test 3: HTML Structure
console.log('\n🏗️  HTML Structure Check');
console.log('-' .repeat(50));

const htmlPath = path.join(__dirname, 'index.html');
try {
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  
  // Check for required elements
  const requiredElements = [
    { pattern: 'id="pinScreen"', name: 'PIN Screen' },
    { pattern: 'id="homeView"', name: 'Home View' },
    { pattern: 'id="formPanel"', name: 'Recipe Form' },
    { pattern: 'id="recipeResults"', name: 'Recipe Results' },
    { pattern: 'id="ocrUploadPanel"', name: 'OCR Upload Panel' },
    { pattern: 'id="reviewQueuePanel"', name: 'Review Queue Panel' },
    { pattern: 'id="reviewComparisonPanel"', name: 'Review Comparison Panel' }
  ];

  requiredElements.forEach(elem => {
    if (htmlContent.includes(elem.pattern)) {
      pass(`HTML element: ${elem.name}`);
    } else {
      fail(`Missing HTML element: ${elem.name}`);
    }
  });

  // Check script includes
  const scriptMatches = htmlContent.match(/<script\s+src="([^"]+)"/g) || [];
  console.log(`\n  Found ${scriptMatches.length} script includes:`);
  scriptMatches.forEach(match => {
    const src = match.match(/src="([^"]+)"/)[1];
    if (/^https?:\/\//.test(src)) {
      pass(`  External library: ${src}`);
    } else if (src.endsWith('.js')) {
      const srcPath = path.join(__dirname, src);
      if (fs.existsSync(srcPath)) {
        pass(`  Local module: ${src}`);
      } else {
        fail(`  Missing module: ${src}`);
      }
    }
  });

  // Check for duplicate script tags
  const mainTagCount = (htmlContent.match(/<main/g) || []).length;
  const mainCloseCount = (htmlContent.match(/<\/main>/g) || []).length;
  
  if (mainTagCount === 1 && mainCloseCount === 1) {
    pass('No duplicate <main> tags');
  } else {
    fail(`Incorrect <main> tags: ${mainTagCount} open, ${mainCloseCount} close`);
  }

  // Check CSS link
  if (htmlContent.includes('href="styles.css"')) {
    pass('CSS file linked correctly');
  } else {
    fail('CSS file not linked or incorrect reference');
  }

} catch (err) {
  fail(`Could not read HTML: ${err.message}`);
}

// Test 4: Configuration
console.log('\n⚙️  Configuration Check');
console.log('-' .repeat(50));

const configPath = path.join(__dirname, 'config.js');
try {
  const configContent = fs.readFileSync(configPath, 'utf8');

  if (configContent.includes('sortFamilyMembers') && configContent.includes('Cheryl')) {
    pass('Config: family ordering helper available');
  } else {
    fail('Missing family ordering helper for Cheryl-first sorting');
  }
  
  const configChecks = [
    { pattern: 'SUPABASE_CONFIG', name: 'Supabase config object' },
    { pattern: 'APP_PIN', name: 'APP_PIN constant' },
    { pattern: 'MAIN_CATEGORIES', name: 'Main categories' },
    { pattern: 'ETHNICITIES', name: 'Ethnicity options' },
    { pattern: 'generateId', name: 'ID generation function' }
  ];

  configChecks.forEach(check => {
    if (configContent.includes(check.pattern)) {
      pass(`Config: ${check.name}`);
    } else {
      fail(`Missing config: ${check.name}`);
    }
  });

  // Check for exposed secrets (actual secret keys)
  if (configContent.includes('service_role') || (configContent.includes('secret') && !configContent.includes('no secrets'))) {
    fail('⚠️  SECURITY: Possible secret key exposed in config.js');
  } else {
    pass('No actual secret keys exposed (publishable key is OK)');
  }

} catch (err) {
  fail(`Could not read config: ${err.message}`);
}

// Test 5: Feature Implementation
console.log('\n✨ Feature Implementation Check');
console.log('-' .repeat(50));

const ocrPath = path.join(__dirname, 'ocr.js');
try {
  const ocrContent = fs.readFileSync(ocrPath, 'utf8');
  
  const features = [
    { pattern: 'performOCR', name: 'OCR processing' },
    { pattern: 'createDraftFromOCR', name: 'Draft creation from OCR' },
    { pattern: 'submitOCRRecipe', name: 'OCR recipe submission' },
    { pattern: 'approveDraftRecipe', name: 'Draft approval workflow' }
  ];

  features.forEach(feature => {
    if (ocrContent.includes(feature.pattern)) {
      pass(`Feature: ${feature.name}`);
    } else {
      fail(`Missing feature: ${feature.name}`);
    }
  });

  if (ocrContent.includes('Tesseract.createWorker')) {
    pass('Feature: Real Tesseract OCR integration');
  } else {
    fail('OCR module does not initialize a real OCR engine');
  }

  if (
    ocrContent.includes("ingredients: 'Ingredients detected from image...'") ||
    ocrContent.includes("instructions: 'Instructions extracted from image...'")
  ) {
    fail('OCR module still contains mock extraction results');
  } else {
    pass('Mock OCR extraction results removed');
  }
} catch (err) {
  fail(`Could not read OCR module: ${err.message}`);
}

const appPath = path.join(__dirname, 'app.js');
try {
  const appContent = fs.readFileSync(appPath, 'utf8');
  
  const features = [
    { pattern: 'initializeApp', name: 'App initialization' },
    { pattern: 'setupEventListeners', name: 'Event handling' },
    { pattern: 'loadRecipes', name: 'Recipe loading' },
    { pattern: 'handleFormSubmit', name: 'Recipe form submission' }
  ];

  features.forEach(feature => {
    if (appContent.includes(feature.pattern)) {
      pass(`Feature: ${feature.name}`);
    } else {
      fail(`Missing feature: ${feature.name}`);
    }
  });
} catch (err) {
  fail(`Could not read app module: ${err.message}`);
}

// Test 6: Database Functions
console.log('\n🗄️  Database Functions Check');
console.log('-' .repeat(50));

const dbPath = path.join(__dirname, 'db.js');
try {
  const dbContent = fs.readFileSync(dbPath, 'utf8');
  
  const dbFunctions = [
    'initializeSupabase',
    'fetchAllRecipes',
    'fetchRecipesByStatus',
    'saveNewRecipe',
    'updateRecipe',
    'deleteRecipe',
    'uploadImage',
    'deleteImage'
  ];

  dbFunctions.forEach(func => {
    if (dbContent.includes(`function ${func}`) || dbContent.includes(`${func} =`)) {
      pass(`DB Function: ${func}`);
    } else {
      fail(`Missing DB function: ${func}`);
    }
  });
} catch (err) {
  fail(`Could not read database module: ${err.message}`);
}

// Summary
console.log('\n' + '=' .repeat(50));
console.log('📊 Test Summary');
console.log('=' .repeat(50));
console.log(`✓ Passed: ${passCount}`);
console.log(`✗ Failed: ${failCount}`);
console.log(`⚠ Warnings: ${warnCount}`);

const totalTests = passCount + failCount + warnCount;
const passPercentage = ((passCount / totalTests) * 100).toFixed(1);

console.log(`\n📈 Success Rate: ${passPercentage}%`);

if (failCount === 0) {
  console.log('\n✅ All tests passed! The application is ready for testing.\n');
  process.exit(0);
} else {
  console.log(`\n❌ ${failCount} test(s) failed. Please review the errors above.\n`);
  process.exit(1);
}
