/*
 * In a data tree some nodes are arrays of things, some are objects where the keys 
 * in effect form an array too.
 * additionally there can be intermediate objects such 
 * as { 'name': 'description, 'symbols': [...]}
 * The keys then do not have to double as names.
 * The intermediate objects don't contribute to the branching of the tree.
 */


// Examples
`
const kangxiCharacters = {
  "people_body": {
    "name": "People & Body",
    "subcategories": {
      "person": {
        "name": "Human Figures & Person",
        "characters": [
          "人 person",
]}}}}
const emojiData = {
  "smileys": {
    "name": "Smileys & People",
    "emojis": [
      "😀 :grinning",
]}}
const jatexSymbolData = {
  "greek": {
    "name": "Greek Letters",
    "symbols": [
      "Γ \\Gamma",
]}}

const small_trees = {
  "Workout Routines": [{
    "Cardio": ["Running", "Cycling", "Swimming"]
  }, {
    "Strength": ["Upper Body", "Push-ups", "Pull-ups"]
  }, {
    "Lower Body": ["Squats", "Lunges"]
  }, {
    "Flexibility": ["Yoga", "Stretching"]
  }],
  "Teas": [{
    "Black Tea": ["Earl Grey", "English Breakfast", "Darjeeling"]
  }, {
    "Green Tea": ["Sencha", "Matcha", "Dragon Well"]
  }, {
    "Herbal Tea": ["Chamomile", "Peppermint", "Rooibos"]
  }]
}
`

// Tree of data provides the raw navigation.

/* This class is supposed to retrieve from a data structure using a cursor. A cursor is an array of ints. It is supposed to allow levels of a tree to be arrays or dicts. Moreover it is intended to allow both anonymous parents (where the cursor value is shown) and parents that are named.*/

/* The class prioritizes flexibility and tolerance over strict validation. It's a "liberal reader" that works with multiple tree conventions. It is mostly for trees of high arity and uniform depth. */

/* The design may have to deal with the ambiguous case of node in the tree that has two elements and 'looks like' a named element, but is actually a two child subtree with anonymous parent.  To avoid this, only use the anonymous form if you have high arity or uniform depth (or both), otherwise use interposers consistently.*/

/* The class does not validate that the tree conforms to these conventions, by design */

class TreeOfData {
  constructor(data) {
    this.data = data;
  }

  // Helper to get level from cursor
  levelOf(cursor) {
    if(cursor === null || cursor.length === 0) return -1;
    return cursor.length - 1;
  }

  first(level) {
    return [0, 0, 0, 0, 0].slice(0, level + 1);
  }

  // produces a version of the cursor, suitable for the chosen col.
  translateCursor(cursor, col) {
    const level = this.levelOf(this.cols[col].start);
    const pad = [0, 0, 0, 0, 0, 0, 0];
    const result = [...cursor, ...pad].slice(0, level + 1)
    return result;
  }

  isString(value) {
    return typeof value === 'string' || value instanceof String;
  }

  getKeys(tree) {
    if(Array.isArray(tree))
      return [...tree.keys()]
    if(typeof tree === 'object')
      return Object.keys(tree);
    // not an array nor an object; it's a final string.
    return null;
  }

  /*
   * returns item at cursor,
   * first item returned is string at that cursor
   * second item is the number of siblings
   * returns null to indicate cursor does not index a tree node.
   */
  getSubtree(cursor, tree) {
    if(cursor === null)
      return null;
    let keys = this.getKeys(tree)

    // Assume no interposer and hence anonymous parent 
    let id = 'anon' // anonymous level
    // Check for an 'interposer' level, with 2 elements, typically
    // name: xxxx value: []
    // We generally do have interposers and get an id.
    if(keys?.length == 2) {
      const [key0, key1] = keys;
      if(this.isString(tree[key0]) && (typeof tree[key1] === 'object'))
        [id, tree] = [tree[key0], tree[key1]];
      else if(this.isString(tree[key1]) && (typeof tree[key0] === 'object'))
        [id, tree] = [tree[key1], tree[key0]];
      // Interposer tests guarantee that tree will have keys.
      keys = this.getKeys(tree);
    }
    if(cursor.length == 0)
      return (keys == null) ? [tree, 0] : // final string
        [id, (keys.length ?? 1) - 1]; // intermediate level

    let ix = cursor[0];
    if(ix >= (keys?.length ?? 0))
      return null;
    return this.getSubtree(cursor.slice(1), tree[keys[ix]]);
  }

  getString(cursor) {
    return this.getSubtree(cursor, this.data)?.[0] ?? null;
  }

  getSubtreeCount(cursor) {
    return this.getSubtree(cursor, this.data)?.[1] ?? null;
  }

  getSiblingCount(cursor) {
    return this.getSubtree(cursor.slice(0, -1), this.data)?.[1] ?? null;
  }

  getNode(cursor) {
    return this.getSubtree(cursor, this.data);
  }

  // These functions take cursors and return cursors...
  next(cursor, sameParentOnly = true) {
    const level = this.levelOf(cursor);
    if(level < 0) {
      return [0];
    }
    let sibs = this.getSiblingCount(cursor) ?? -1;
    let last = cursor[level];
    // increment last element...
    if(last < sibs) {
      return [...cursor.slice(0, -1), last + 1]
    }
    if(level < 1)
      return null;
    if(sameParentOnly)
      return null;
    let parentNext = this.next(cursor.slice(0, -1), false);
    if(parentNext === null)
      return null;
    return [...parentNext, 0]
  }

  prev(cursor, sameParentOnly = true) {
    const level = this.levelOf(cursor);
    if(level < 0) {
      return null;
    }
    let last = cursor[level];
    // decrement last element...
    if(last > 0) {
      return [...cursor.slice(0, -1), last - 1]
    }
    if(level < 1)
      return null;
    if(sameParentOnly)
      return null;
    let parentPrev = this.prev(cursor.slice(0, -1), false);
    if(parentPrev === null)
      return null;
    let result = [...parentPrev, 0]
    let sibs = this.getSiblingCount(result);
    if(sibs === null)
      return null;
    result[level] = sibs;
    return result;
  }

  descend(cursor) {
    const level = this.levelOf(cursor);
    if(level < 0)
      return this.first(0);
    cursor = [...cursor, 0]
    if(this.getString(cursor) === null)
      return null;
    return cursor;
  }

  ascend(cursor) {
    const level = this.levelOf(cursor);
    if(level <= 0)
      return null;
    return cursor.slice(0, -1);
  }

  isADescendantOf(childCursor, parentCursor) {
    if(childCursor.length <= parentCursor.length) return false;

    // Parent coordinates must match
    for(let i = 0; i < parentCursor.length; i++) {
      if(childCursor[i] !== parentCursor[i]) return false;
    }

    return true;
  }

}

class TreeOfSymbols extends TreeOfData {
  constructor(tree) {
    super(tree);
  }

  elementOf(htmlString) {
    const template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
  }

  async parseEmojiString(emojiString) {
    const firstSpaceIndex = emojiString.indexOf(' ');
    let emoji = emojiString.substring(0, firstSpaceIndex);
    const names = emojiString.substring(firstSpaceIndex + 2).replace(/_/g,
      '-');
    if(emoji.startsWith("!"))
      emoji = await getPatternHTML(parseInt(emoji.slice(1)));
    return {
      emoji,
      names
    };
  }

  normalizeEmojiString(emojiString) {
    const firstSpaceIndex = emojiString.indexOf(' ');
    const names = emojiString.substring(firstSpaceIndex + 2).replace(/_/g,
      '-').toLowerCase();
    return names;
  }

  // Pass in a normlaized searchTerm and see if it matches.
  isThisEmojiWanted(emojiCursor, searchTerm) {
    const emojiString = this.getDataFromCursor(emojiCursor).emoji;
    const normalizedEmojiString = this.normalizeEmojiString(emojiString);
    return (searchTerm == "") || normalizedEmojiString.includes(searchTerm)
  }

  // Legacy code for emoji picker and multiscroller
  getDataFromCursor(cursor) {
    const level = this.levelOf(cursor);

    if(level < 0)
      return null;

    let name = this.getString([cursor[0]])

    let result = {
      categoryKey: "Key" + cursor[0],
      categoryName: name
    }

    if(level < 1)
      return result;

    let value = this.getString([cursor[0], cursor[1]])
    result.emojiIndex = cursor[1];
    result.emoji = value;
    return result;
  }
}

// Provides rendering for use in a multiscroller
class TreeForMultiscroller extends TreeOfSymbols {
  constructor(tree) {
    super(tree);
    this.cols = [{
      start: [0],
      name: 'category-symbol',
      render: this.renderCategorySymbol.bind(this),
      style: "flex: 0 0 80px"
    }, {
      start: [0],
      name: 'category-name',
      render: this.renderCategoryName.bind(this),
      style: "flex: 0 0 150px"
    }, {
      start: [0, 0],
      name: 'symbol',
      render: this.renderSymbolOnly.bind(this),
      class: 'emoji-grid'
    }, {
      start: [0, 0],
      name: 'symbol',
      render: this.renderSymbol.bind(this),
      style: "flex: 0 0 150px"
    }, ];
  }

  async renderCategorySymbol(cursor) {
    let child = this.descend(cursor)
    const data = this.getDataFromCursor(child);
    // Extract first emoji as symbol for the category
    //const category = this.data[data.categoryKey];
    const {
      emoji
    } = await this.parseEmojiString(data.emoji);
    return this.elementOf(`<div class="category-item bright">${emoji}</div>`);
  }

  async renderCategoryName(cursor) {
    const data = this.getDataFromCursor(cursor);
    return this.elementOf(
      `<div class="emoji-category-title">${data.categoryName}</div>`);
  }

  async renderSymbolOnly(cursor) {
    const data = this.getDataFromCursor(cursor);
    //const category = this.data[data.categoryKey];
    const {
      emoji
    } = await this.parseEmojiString(data.emoji);
    return this.elementOf(`<div class="emoji-item">${emoji}</div>`);
  }

  async renderSymbol(cursor) {
    const data = this.getDataFromCursor(cursor);
    return this.elementOf(`<div class="id-range">${data.emoji}</div>`);
  }
}

class TextTreeForMultiscroller extends TreeOfSymbols {
  constructor(tree) {
    super(tree);
    this.cols = [{
      start: [],
      name: 'Level 0',
      render: this.renderText.bind(this),
      style: "flex: 0 0 150px"
    }, {
      start: [0],
      name: 'Level 1',
      render: this.renderText.bind(this),
      style: "flex: 0 0 150px"
    }];
  }

  async renderText(cursor) {
    let child = this.descend(cursor)
    const data = this.getDataFromCursor(child);
    return this.elementOf(`<div class="id-range">${data}</div>`);
  }

  getDataFromCursor(cursor) {
    const level = this.levelOf(cursor);

    if(level < 0)
      return null;

    let result = this.getString(cursor);
    return result;
  }
}

// Provides rendering for use in a multiscroller
class KanjiTreeForMultiscroller extends TreeOfSymbols {
  constructor(tree) {
    super(tree);
    this.cols = [{
      start: [0],
      name: 'category-name',
      render: this.renderCategoryName.bind(this),
      style: "flex: 0 0 150px"
    }, {
      start: [0, 0],
      name: 'category-name',
      render: this.renderSubCategoryName.bind(this),
      style: "flex: 0 0 150px"
    }, {
      start: [0, 0, 0],
      name: 'symbol',
      render: this.renderSymbolOnly.bind(this),
      class: 'emoji-grid'
    }, {
      start: [0, 0, 0],
      name: 'symbol',
      render: this.renderSymbol.bind(this),
      style: "flex: 0 0 150px"
    }, ];
  }

  getDataFromCursor(cursor) {
    const level = this.levelOf(cursor);

    if(level < 0)
      return null;

    let name = this.getString([cursor[0]])

    let result = {
      categoryKey: "Key" + cursor[0],
      categoryName: name
    }

    if(level < 1)
      return result;

    let value = this.getString([cursor[0], cursor[1]])
    result.categorySubKey = cursor[1];
    result.categorySubName = value;

    if(level < 2)
      return result;

    value = this.getString([cursor[0], cursor[1], cursor[2]])
    result.emojiIndex = cursor[2];
    result.emoji = value;
    return result;
  }

  async renderCategoryName(cursor) {
    const data = this.getDataFromCursor(cursor);
    return this.elementOf(
      `<div class="emoji-category-title">${data.categoryName}</div>`);
  }

  async renderSubCategoryName(cursor) {
    const data = this.getDataFromCursor(cursor);
    return this.elementOf(
      `<div class="emoji-category-title">${data.categorySubName}</div>`);
  }

  async renderSymbolOnly(cursor) {
    const data = this.getDataFromCursor(cursor);
    const category = this.data[data.categoryKey];
    const {
      emoji
    } = await this.parseEmojiString(data.emoji);
    return this.elementOf(`<div class="emoji-item">${emoji}</div>`);
  }

  async renderSymbol(cursor) {
    const data = this.getDataFromCursor(cursor);
    return this.elementOf(`<div class="id-range">${data.emoji}</div>`);
  }
}

// Provides rendering for use in an emoji picker
// In this mode columns 1 and 2 are merged.
class TreeForPicker extends TreeOfSymbols {
  constructor(tree) {
    super(tree);
    this.cols = [{
      start: [0],
      name: 'category-symbol',
      render: this.renderCategorySymbol.bind(this),
    }, {
      start: [0, 0],
      name: 'category-name',
      render: this.renderCategoryPanel.bind(this),
    }, {
      start: [0, 0],
      name: 'symbol',
      render: this.renderEmojiElement.bind(this),
    }];
    this.callbacks = {};
    this.currentCategory = "";
  }

  addCallback(name, callback) {
    this.callbacks[name] = callback;
  }

  setCategory(category) {
    this.currentCategory = category;
  }

  // Emoji picker specific maker methods that operate on cursors

  // Level 0 - Representative emoji for category.
  async renderCategorySymbol(cursor) {
    let child = this.descend(cursor)
    const data = this.getDataFromCursor(child);
    //const category = this.data[data.categoryKey];
    const {
      emoji
    } = await this.parseEmojiString(data.emoji);
    const isSelected = data.categoryKey === this.currentCategory;

    const categoryElement = document.createElement('div');
    categoryElement.className = 'category-item';
    categoryElement.innerHTML = emoji; //UNSAFE
    categoryElement.title = data.categoryName; // appears as tooltip
    categoryElement.dataset.category = data.categoryKey;
    if(isSelected) {
      categoryElement.classList.add('active');
    }
    if(this.callbacks.selectCategory)
      categoryElement.addEventListener('mousedown', (e) => this.callbacks
        .selectCategory(e, data.categoryKey));
    return categoryElement;
  }

  // Level 1 - A grid with a title.
  renderCategoryPanel(cursor) {
    const data = this.getDataFromCursor(cursor);
    //const category = this.data[data.categoryKey];

    const categoryPanel = document.createElement('div');
    categoryPanel.className = 'emoji-category';
    categoryPanel.id = `category-${data.categoryKey}`;
    const titleElement = document.createElement('div');
    titleElement.className = 'emoji-category-title';
    titleElement.textContent = data
      .categoryName; //Appears in category heading
    categoryPanel.appendChild(titleElement);
    return categoryPanel;
  }

  // Level 2 - Individual emojis in the grid
  async renderEmojiElement(cursor) {
    const data = this.getDataFromCursor(cursor);
    const {
      emoji,
      names
    } = await this.parseEmojiString(data.emoji);

    const emojiElement = document.createElement('div');
    emojiElement.className = 'emoji-item';
    emojiElement.innerHTML = emoji; // UNSAFE
    emojiElement.title = names;
    if(this.callbacks.selectEmoji)
      emojiElement.addEventListener('click', () => this.callbacks.selectEmoji(
        emoji));
    if(this.callbacks.updateHoverInfo)
      emojiElement.addEventListener('mouseenter', () => this.callbacks
        .updateHoverInfo(emoji, names));
    return emojiElement;
  }
}

window.TreeOfData = TreeOfData;

// Auto-generated exports
if (typeof window !== 'undefined') window.KanjiTreeForMultiscroller = KanjiTreeForMultiscroller;
export { KanjiTreeForMultiscroller };
if (typeof window !== 'undefined') window.TextTreeForMultiscroller = TextTreeForMultiscroller;
export { TextTreeForMultiscroller };
if (typeof window !== 'undefined') window.TreeForMultiscroller = TreeForMultiscroller;
export { TreeForMultiscroller };
if (typeof window !== 'undefined') window.TreeForPicker = TreeForPicker;
export { TreeForPicker };
export { TreeOfData };
if (typeof window !== 'undefined') window.TreeOfSymbols = TreeOfSymbols;
export { TreeOfSymbols };
//if (typeof window !== 'undefined') window.emojiData = emojiData;
//export { emojiData };
//if (typeof window !== 'undefined') window.jatexSymbolData = jatexSymbolData;
//export { jatexSymbolData };
//if (typeof window !== 'undefined') window.kangxiCharacters = kangxiCharacters;
//export { kangxiCharacters };
//if (typeof window !== 'undefined') window.small_trees = small_trees;
//export { small_trees };
