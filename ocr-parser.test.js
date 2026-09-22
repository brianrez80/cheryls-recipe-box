#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, 'ocr.js'), 'utf8');
const context = {
  console,
  generateId: () => 'test-recipe-id',
  MAIN_CATEGORIES: [
    'Chicken', 'Beef', 'Pork', 'Fish', 'Seafood', 'Salad', 'Soup',
    'Breakfast', 'Vegetarian', 'Dessert', 'Sweets', 'Appetizers',
    'Side Dish', 'Other'
  ],
  ETHNICITIES: ['American', 'Mexican', 'Italian', 'Asian', 'Mediterranean', 'Other']
};

vm.runInNewContext(
  `${source}\nthis.__ocrTests = { parseRecipeText, mergeParsedRecipePages, createDraftFromOCR };`,
  context
);

const { parseRecipeText, mergeParsedRecipePages, createDraftFromOCR } = context.__ocrTests;

const pancakeText = `
LIVE OCR VERIFICATION RECIPE
°
Sunrise Lemon Pancakes
Category: Breakfast | Cuisine: American
Prep Time: 10 minutes | Cook Time: 15 minutes | Servings: 4

INGREDIENTS
2 cups all-purpose flour
2 tablespoons sugar
1 tablespoon baking powder
1/2 teaspoon salt
2 large eggs
1 3/4 cups whole milk
3 tablespoons melted butter
1 tablespoon lemon zest

DIRECTIONS
1. Whisk flour, sugar, baking powder, and salt.
2. Beat eggs with milk, melted butter, and lemon zest.
3. Stir wet ingredients into dry ingredients until just combined.
4. Cook 1/4-cup portions on a hot griddle for 2 minutes per side.
`;

const pancakes = parseRecipeText(pancakeText, 96.4);
assert.strictEqual(pancakes.title, 'Sunrise Lemon Pancakes');
assert.strictEqual(pancakes.cookTime, '15 minutes');
assert.strictEqual(pancakes.categories.main, 'Breakfast');
assert.strictEqual(pancakes.categories.ethnicity, 'American');
assert.match(pancakes.ingredients, /1 tablespoon lemon zest/);
assert.match(pancakes.instructions, /^1\. Whisk flour/m);
assert.match(pancakes.instructions, /^4\. Cook 1\/4-cup portions/m);
assert.strictEqual(pancakes.confidence, 96);

const stew = parseRecipeText(`
Grandma's Beef Stew
Cook Time: 2 hours
Ingredients
2 pounds beef chuck
3 cups potatoes
Directions
1. Brown the beef.
2. Add potatoes and cook until tender.
`);

assert.strictEqual(stew.title, "Grandma's Beef Stew");
assert.strictEqual(stew.cookTime, '2 hours');
assert.strictEqual(stew.categories.main, 'Beef');
assert.strictEqual(stew.categories.ethnicity, 'Other');

const merged = mergeParsedRecipePages([
  parseRecipeText(`
Two-Page Tomato Soup
Category: Soup
Ingredients
4 cups tomatoes
1 cup vegetable stock
`, 91),
  parseRecipeText(`
Directions
1. Combine the tomatoes and stock.
2. Cook for 20 minutes.
`, 89)
]);

assert.strictEqual(merged.title, 'Two-Page Tomato Soup');
assert.strictEqual(merged.categories.main, 'Soup');
assert.match(merged.ingredients, /4 cups tomatoes/);
assert.match(merged.instructions, /^2\. Cook for 20 minutes\./m);
assert.strictEqual(merged.confidence, 90);
assert.ok(merged.ingredients.indexOf('4 cups tomatoes') < merged.ingredients.indexOf('1 cup vegetable stock'));

const mixedQualityMerge = mergeParsedRecipePages([
  parseRecipeText(`
Ranch Chicken Pasta
Ingredients
2 chicken breasts
1 cup pasta
Directions
1. Cook the chicken.
`, 95),
  { title: '@@@####', ingredients: '', instructions: '', categories: { main: 'Other', ethnicity: 'Other' }, cookTime: '', confidence: 0, rawText: '@@@####' }
]);

assert.strictEqual(mixedQualityMerge.title, 'Ranch Chicken Pasta');
assert.match(mixedQualityMerge.ingredients, /2 chicken breasts/);
assert.match(mixedQualityMerge.instructions, /Cook the chicken\./);

const lowQualityTitle = parseRecipeText(`
@@@####
Symbols only
`, 5);
assert.strictEqual(lowQualityTitle.title, '');

const gibberishTitle = parseRecipeText(`
406 MX @ ° 0 ® 5G. G.
`, 5);
assert.strictEqual(gibberishTitle.title, '');

const noisyContent = parseRecipeText(`
ou ® Fair
v5 2 ed eB a 5 9 @@ ® [1 O <
`, 5);
assert.strictEqual(noisyContent.ingredients, '');
assert.strictEqual(noisyContent.instructions, '');

const mixedPages = mergeParsedRecipePages([
  parseRecipeText(`
Chicken Pasta Bake
Ingredients
2 chicken breasts
1 cup pasta
Directions
1. Cook the chicken.
2. Bake for 20 minutes.
`, 92),
  parseRecipeText(`
406 MX @ ° 0 ® 5G. G.
`, 5)
]);
assert.strictEqual(mixedPages.title, 'Chicken Pasta Bake');
assert.match(mixedPages.ingredients, /2 chicken breasts/);
assert.match(mixedPages.instructions, /Bake for 20 minutes\./);

const blankTitleRecipe = createDraftFromOCR(['image.jpg'], { title: '', ingredients: '2 chicken breasts', instructions: 'Cook the chicken.', categories: { main: '', ethnicity: '' }, cookTime: '', rawText: '', ocrWarnings: ['One or more OCR pages had low quality.'] }, 'Test Cook');
blankTitleRecipe.then(recipe => {
  assert.strictEqual(recipe.name, '');
  assert.strictEqual(recipe.ocrWarnings.length, 1);
});

const reviewFormPayload = createDraftFromOCR(['image.jpg'], {
  title: 'Chicken Pasta Bake',
  ingredients: '2 chicken breasts\n1 cup pasta',
  instructions: '1. Cook the chicken.\n2. Bake for 20 minutes.',
  cookTime: '20 minutes',
  categories: { main: 'Chicken', ethnicity: 'American' },
  rawText: '',
  ocrWarnings: ['One or more OCR pages had low quality and may need manual review.']
}, 'Test Cook');
reviewFormPayload.then(recipe => {
  assert.strictEqual(recipe.name, 'Chicken Pasta Bake');
  assert.strictEqual(recipe.time, '20 minutes');
  assert.match(recipe.notes, /Ingredients\n2 chicken breasts/);
  assert.match(recipe.notes, /Instructions\n1\. Cook the chicken\./);
  assert.strictEqual(recipe.ocrWarnings.length, 1);
});

const noisySocialPost = parseRecipeText(`
Garlic Butter Salmon and Shrimp
Ingredients
4 salmon fillets
1 pound large shrimp
2 tablespoons olive oil
%%%
3 cloves garlic, minced
1 cup heavy cream
Full recipe in the comments
@weeknightrecipes
XZQPVTR SKRRTT

Directions
1. Heat the olive oil in a skillet.
2. Add the salmon and shrimp.
<<< /// ===
3. Stir in the garlic and cream.
Full recipe in the comments
BLKQRTZZ
`);

assert.match(noisySocialPost.ingredients, /4 salmon fillets/);
assert.match(noisySocialPost.ingredients, /1 cup heavy cream/);
assert.doesNotMatch(noisySocialPost.ingredients, /full recipe|weeknightrecipes|XZQPVTR/i);
assert.match(noisySocialPost.instructions, /^3\. Stir in the garlic and cream\./m);
assert.doesNotMatch(noisySocialPost.instructions, /full recipe|BLKQRTZZ|<<<|===/i);

assert.throws(
  () => parseRecipeText(''),
  /No readable text/
);

createDraftFromOCR(['image.jpg'], pancakes, 'Test Cook').then(draft => {
  assert.strictEqual(draft.name, 'Sunrise Lemon Pancakes');
  assert.strictEqual(draft.mainCategory, 'Breakfast');
  assert.strictEqual(draft.status, 'draft');
  assert.match(draft.notes, /^Ingredients\n/);
  assert.match(draft.notes, /\n\nInstructions\n/);
  assert.match(draft.ocrText, /Sunrise Lemon Pancakes/);
  console.log('OCR parser tests passed.');
}).catch(error => {
  console.error(error);
  process.exit(1);
});
