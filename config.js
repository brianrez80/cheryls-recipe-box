// Supabase Configuration (publishable key only - no secrets exposed)
const SUPABASE_CONFIG = {
  URL: 'https://knpovxbqoohsddquiyjv.supabase.co',
  KEY: 'sb_publishable_dW3jNFrs9G4zmkdeL968NA_yGRv8A6a',
  TABLE_NAME: 'recipes',
  STORAGE_BUCKET: 'recipe-images'
};

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

// Family members are data, not UI configuration. These IDs are also used by
// the ownership migration so an existing recipe can safely belong to Cheryl.
const DEFAULT_FAMILY_MEMBERS = Object.freeze([
  { id: '00000000-0000-4000-8000-000000000001', displayName: 'Cheryl', active: true },
  { id: '00000000-0000-4000-8000-000000000002', displayName: 'Tiffany', active: true }
]);

function getDefaultFamilyMembers() {
  return DEFAULT_FAMILY_MEMBERS.map(member => ({ ...member }));
}

function getDefaultMemberId() {
  return DEFAULT_FAMILY_MEMBERS[0].id;
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
