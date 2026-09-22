// Supabase Configuration (publishable key only - no secrets exposed)
const SUPABASE_CONFIG = {
  URL: 'https://knpovxbqoohsddquiyjv.supabase.co',
  KEY: 'sb_publishable_dW3jNFrs9G4zmkdeL968NA_yGRv8A6a',
  TABLE_NAME: 'recipes',
  STORAGE_BUCKET: 'recipe-images'
};

// PIN for app access (should be moved to environment or backend in production)
const APP_PIN = '4912';

// Session storage key
const UNLOCK_KEY = 'cheryl-recipe-box-unlocked';

// Main categories for recipes
const MAIN_CATEGORIES = [
  'Chicken', 'Beef', 'Pork', 'Fish', 'Seafood',
  'Salad', 'Soup', 'Breakfast', 'Vegetarian',
  'Dessert', 'Sweets', 'Appetizers', 'Side Dish', 'Other'
];

// Ethnicity/Cuisine options
const ETHNICITIES = [
  'American', 'Mexican', 'Italian', 'Asian', 
  'Mediterranean', 'Other'
];

// Keep Cheryl at the top of any family member list while preserving the normal order of everyone else.
const FAMILY_MEMBERS = ['Cheryl', 'Tiffany'];

function sortFamilyMembers(familyMembers = FAMILY_MEMBERS) {
  if (!Array.isArray(familyMembers)) return [];

  const normalizedMembers = familyMembers
    .filter(member => member !== null && member !== undefined)
    .map(member => String(member).trim())
    .filter(Boolean);

  const cherylEntry = normalizedMembers.find(name => /^cheryl$/i.test(name));
  const remainingMembers = normalizedMembers.filter(name => !/^cheryl$/i.test(name));

  if (!cherylEntry) {
    return remainingMembers;
  }

  return [cherylEntry, ...remainingMembers];
}

function getFamilyMembers() {
  return sortFamilyMembers(FAMILY_MEMBERS);
}

// Default recipes (seed data)
function getDefaultRecipes() {
  return [
    {
      id: generateId(),
      name: 'Loaded Chicken Potato Bake',
      time: '50 min',
      mainCategory: 'Chicken',
      ethnicity: 'American',
      notes: 'Comfort food, done right.'
    },
    {
      id: generateId(),
      name: 'Greek Garden Salad',
      time: '20 min',
      mainCategory: 'Salad',
      ethnicity: 'Mediterranean',
      notes: 'Crisp, fresh, and easy.'
    }
  ];
}

// Utility: Generate unique ID
function generateId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
