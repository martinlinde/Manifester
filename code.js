// HUD Design System Sync - Figma Plugin
// Bidirectional sync between code design tokens and Figma
// Creates full HUD panel representation in Figma

// ============================================
// FEATURE FLAGS
// ============================================

const FEATURE_FLAGS = {
  // When true, uses pure dynamic extraction (recursive node traversal, no hardcoded lookups)
  // When false, uses legacy name-based extraction with fallbacks
  useDynamicExport: true
};

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // Panel dimensions - these are FALLBACKS only, actual values come from design-tokens.json
  // These should match design-tokens.json but tokens take precedence during generation
  panel: {
    width: 320,      // matches design-tokens.json panel.width
    padding: 16,     // matches design-tokens.json panel.padding
    cornerRadius: 12, // matches design-tokens.json panel.cornerRadius
    titleHeight: 20  // fallback - actual value exported from title text node height
  },

  // Component dimensions - these are FALLBACKS only
  components: {
    height: { xs: 24, sm: 28, md: 32, lg: 40 },
    gap: 8,
    labelWidth: 70   // matches design-tokens.json controlRow.labelWidth
  },

  // Collapsible dimensions
  collapsible: {
    headerHeight: 28,
    chevronSize: 10,
    indentSize: 12,
    childPadding: 8,
    childGap: 4
  },

  // Swatch display
  swatchSize: 60,
  swatchGap: 12,
  swatchesPerRow: 6,
  sectionGap: 40,
  labelHeight: 24,

  // Fonts
  fontFamily: "Inter",
  fontSize: {
    label: 11,
    value: 10,
    heading: 14,
    title: 12
  }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  };
}

function rgbToHex(r, g, b) {
  const toHex = (n) => {
    const hex = Math.round(n * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

// Darken a hex color by a factor (0-1)
function darkenHex(hex, factor) {
  const rgb = hexToRgb(hex);
  return rgbToHex(
    rgb.r * (1 - factor),
    rgb.g * (1 - factor),
    rgb.b * (1 - factor)
  );
}

// Safe property access helper (replaces optional chaining for Figma compatibility)
function getTokenValue(tokens, path, fallback) {
  const parts = path.split('.');
  let current = tokens;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return fallback;
    }
    current = current[part];
  }
  if (current != null && current.$value != null) {
    return current.$value;
  }
  return fallback;
}

// Track which fonts were successfully loaded
var loadedFonts = {};

async function loadFonts() {
  // Try different font style naming conventions
  var fontStyles = [
    { name: "Regular", variants: ["Regular"] },
    { name: "Medium", variants: ["Medium"] },
    { name: "SemiBold", variants: ["Semi Bold", "SemiBold", "Semibold"] },
    { name: "Bold", variants: ["Bold"] }
  ];

  for (var i = 0; i < fontStyles.length; i++) {
    var styleInfo = fontStyles[i];
    var loaded = false;

    for (var j = 0; j < styleInfo.variants.length; j++) {
      var variant = styleInfo.variants[j];
      try {
        await figma.loadFontAsync({ family: "Inter", style: variant });
        loadedFonts[styleInfo.name] = { family: "Inter", style: variant };
        console.log("Loaded font: Inter " + variant);
        loaded = true;
        break;
      } catch (e) {
        console.log("Could not load Inter " + variant);
      }
    }

    // If no Inter variant worked, try Roboto as fallback
    if (!loaded) {
      try {
        await figma.loadFontAsync({ family: "Roboto", style: "Regular" });
        loadedFonts[styleInfo.name] = { family: "Roboto", style: "Regular" };
        console.log("Using Roboto Regular as fallback for " + styleInfo.name);
      } catch (e) {
        console.log("Could not load fallback font for " + styleInfo.name);
      }
    }
  }
}

// Helper to get loaded font
function getLoadedFont(requestedStyle) {
  if (loadedFonts[requestedStyle]) {
    return loadedFonts[requestedStyle];
  }
  // Fall back to Regular
  if (loadedFonts["Regular"]) {
    return loadedFonts["Regular"];
  }
  // Ultimate fallback
  return { family: "Inter", style: "Regular" };
}

async function createText(text, x, y, fontSize, fontWeight, color, variable) {
  // Set defaults
  fontWeight = fontWeight || "Regular";
  color = color || '#fafafa';

  var textNode = figma.createText();
  textNode.x = x;
  textNode.y = y;

  // Use the font that was successfully loaded
  var font = getLoadedFont(fontWeight);
  textNode.fontName = font;

  textNode.fontSize = fontSize;
  textNode.characters = String(text);

  // Use variable binding if provided, otherwise use direct color
  if (variable) {
    textNode.fills = [createBoundFill(color, variable)];
  } else {
    textNode.fills = [{ type: 'SOLID', color: hexToRgb(color) }];
  }
  return textNode;
}

// ============================================
// FIGMA VARIABLES UTILITIES
// ============================================

// Create or get existing variable collection for HUD Design Tokens
async function getOrCreateTokenCollection() {
  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = null;

  for (var i = 0; i < collections.length; i++) {
    if (collections[i].name === "HUD Design Tokens") {
      collection = collections[i];
      break;
    }
  }

  if (!collection) {
    collection = figma.variables.createVariableCollection("HUD Design Tokens");
  }

  return collection;
}

// Get existing variables from a collection by name
async function getExistingVariables(collection) {
  var existing = {};
  var variableIds = collection.variableIds;

  for (var i = 0; i < variableIds.length; i++) {
    var variable = await figma.variables.getVariableByIdAsync(variableIds[i]);
    if (variable) {
      existing[variable.name] = variable;
    }
  }

  return existing;
}

// Create all color variables from tokens
async function createColorVariables(collection, colors) {
  var variables = {};

  // Get existing variables to avoid duplicates
  var existing = await getExistingVariables(collection);

  var colorTokens = [
    'background', 'backgroundAlt', 'backgroundMuted',
    'foreground', 'foregroundMuted', 'foregroundSubtle',
    'border', 'borderHover', 'borderFocus',
    'primary', 'primaryHover', 'primaryForeground',
    'secondary', 'secondaryHover', 'secondaryForeground',
    'destructive', 'destructiveHover', 'destructiveForeground',
    'accent', 'track', 'trackFilled', 'thumbColor',
    'inputBackground', 'ring'
  ];

  for (var i = 0; i < colorTokens.length; i++) {
    var name = colorTokens[i];
    var colorValue = colors[name];

    if (colorValue) {
      var variable;

      // Check if variable already exists
      if (existing[name]) {
        variable = existing[name];
        // Update the value
        variable.setValueForMode(collection.defaultModeId, hexToRgb(colorValue));
      } else {
        // Create new variable
        variable = figma.variables.createVariable(name, collection, "COLOR");
        variable.setValueForMode(collection.defaultModeId, hexToRgb(colorValue));
      }

      variables[name] = variable;
    }
  }

  return variables;
}

// Create semantic text variables with DIRECT color values (not aliases)
// This ensures consistent export behavior - all color variables export as direct values
async function createSemanticTextVariables(collection, primitiveVars, colors) {
  var variables = {};

  // Get existing variables to avoid duplicates
  var existing = await getExistingVariables(collection);

  // Semantic text token mappings (name -> primitive color key to copy value from)
  // Following the pattern from semantic-styles.json
  var semanticTextMappings = {
    // Panel text
    'text/panelTitle': 'foreground',
    // Section text
    'text/sectionTitle': 'foreground',
    'text/sectionCount': 'foregroundMuted',
    'text/sectionChevron': 'foregroundMuted',
    // Control text
    'text/controlLabel': 'foregroundMuted',
    'text/controlLabelDisabled': 'foregroundSubtle',
    'text/controlValue': 'foreground',
    'text/controlPlaceholder': 'foregroundSubtle',
    // Input text
    'text/input': 'foreground',
    'text/inputPlaceholder': 'foregroundSubtle',
    // Slider text
    'text/sliderValue': 'foreground',
    // Dropdown text
    'text/dropdown': 'foreground',
    'text/dropdownMuted': 'foregroundMuted',
    'text/dropdownOptionSelected': 'primaryForeground',
    // Color picker text
    'text/colorPicker': 'foreground',
    // Button text
    'text/buttonPrimary': 'primaryForeground',
    'text/buttonSecondary': 'secondaryForeground',
    'text/buttonDestructive': 'destructiveForeground'
  };

  for (var semanticName in semanticTextMappings) {
    var primitiveName = semanticTextMappings[semanticName];
    var colorValue = colors[primitiveName];

    if (colorValue) {
      var variable;
      var rgbColor = hexToRgb(colorValue);

      // Check if variable already exists
      if (existing[semanticName]) {
        variable = existing[semanticName];
        // Set direct color value (not alias)
        variable.setValueForMode(collection.defaultModeId, rgbColor);
      } else {
        // Create new variable with direct color value
        variable = figma.variables.createVariable(semanticName, collection, "COLOR");
        variable.setValueForMode(collection.defaultModeId, rgbColor);
      }

      // Store with a simplified key for easy access
      var shortName = semanticName.replace('text/', '');
      variables[shortName] = variable;
    }
  }

  return variables;
}

// Create a paint with bound variable
function createBoundFill(color, variable) {
  if (variable) {
    return figma.variables.setBoundVariableForPaint(
      { type: 'SOLID', color: hexToRgb(color), opacity: 1 },
      'color',
      variable
    );
  }
  // Fallback to direct color if no variable
  return { type: 'SOLID', color: hexToRgb(color) };
}

// Create a stroke with bound variable
function createBoundStroke(color, variable) {
  if (variable) {
    return figma.variables.setBoundVariableForPaint(
      { type: 'SOLID', color: hexToRgb(color), opacity: 1 },
      'color',
      variable
    );
  }
  // Fallback to direct color if no variable
  return { type: 'SOLID', color: hexToRgb(color) };
}

// Create spacing FLOAT variables from tokens
async function createSpacingVariables(collection, spacing) {
  var variables = {};

  // Get existing variables to avoid duplicates
  var existing = await getExistingVariables(collection);

  var spacingTokens = ['xs', 'sm', 'md', 'lg', 'xl'];

  for (var i = 0; i < spacingTokens.length; i++) {
    var name = spacingTokens[i];
    var spacingValue = spacing[name];

    if (spacingValue !== undefined) {
      // Parse pixel value (e.g., "8px" -> 8)
      var numValue = parseFloat(spacingValue);
      if (isNaN(numValue)) numValue = 8; // fallback

      var varName = 'spacing-' + name;
      var variable;

      // Check if variable already exists
      if (existing[varName]) {
        variable = existing[varName];
        // Update the value
        variable.setValueForMode(collection.defaultModeId, numValue);
      } else {
        // Create new FLOAT variable
        variable = figma.variables.createVariable(varName, collection, "FLOAT");
        variable.setValueForMode(collection.defaultModeId, numValue);
      }

      variables[name] = variable;
    }
  }

  return variables;
}

// Create typography fontSize FLOAT variables from tokens
async function createTypographyVariables(collection, typography) {
  var variables = {};

  // Get existing variables to avoid duplicates
  var existing = await getExistingVariables(collection);

  var fontSizeTokens = ['xs', 'sm', 'base', 'lg'];

  // Get fontSize object from typography
  var fontSize = typography.fontSize || {};

  for (var i = 0; i < fontSizeTokens.length; i++) {
    var name = fontSizeTokens[i];
    var sizeValue = fontSize[name];

    if (sizeValue !== undefined) {
      // Parse pixel value (e.g., "12px" -> 12)
      var numValue = parseFloat(sizeValue);
      if (isNaN(numValue)) numValue = 12; // fallback

      var varName = 'fontSize-' + name;
      var variable;

      // Check if variable already exists
      if (existing[varName]) {
        variable = existing[varName];
        // Update the value
        variable.setValueForMode(collection.defaultModeId, numValue);
      } else {
        // Create new FLOAT variable
        variable = figma.variables.createVariable(varName, collection, "FLOAT");
        variable.setValueForMode(collection.defaultModeId, numValue);
      }

      variables[name] = variable;
    }
  }

  return variables;
}

// Create component dimension FLOAT variables
async function createComponentVariables(collection, components) {
  var variables = {};

  // Get existing variables to avoid duplicates
  var existing = await getExistingVariables(collection);

  // Component height tokens
  var heightTokens = ['xs', 'sm', 'md', 'lg', 'xl'];
  var heights = components.height || {};

  for (var i = 0; i < heightTokens.length; i++) {
    var name = heightTokens[i];
    var heightValue = heights[name];

    if (heightValue !== undefined) {
      var numValue = parseFloat(heightValue);
      if (isNaN(numValue)) numValue = 32; // fallback

      var varName = 'height-' + name;
      var variable;

      if (existing[varName]) {
        variable = existing[varName];
        variable.setValueForMode(collection.defaultModeId, numValue);
      } else {
        variable = figma.variables.createVariable(varName, collection, "FLOAT");
        variable.setValueForMode(collection.defaultModeId, numValue);
      }

      variables['height-' + name] = variable;
    }
  }

  return variables;
}

// Create radius FLOAT variables from tokens
async function createRadiusVariables(collection, radius) {
  var variables = {};

  // Get existing variables to avoid duplicates
  var existing = await getExistingVariables(collection);

  var radiusTokens = ['sm', 'md', 'lg', 'xl', 'full'];

  for (var i = 0; i < radiusTokens.length; i++) {
    var name = radiusTokens[i];
    var radiusValue = radius[name];

    if (radiusValue !== undefined) {
      // Parse pixel value (e.g., "8px" -> 8, "9999px" -> 9999)
      var numValue = parseFloat(radiusValue);
      if (isNaN(numValue)) numValue = 8; // fallback

      var varName = 'radius-' + name;
      var variable;

      // Check if variable already exists
      if (existing[varName]) {
        variable = existing[varName];
        // Update the value
        variable.setValueForMode(collection.defaultModeId, numValue);
      } else {
        // Create new FLOAT variable
        variable = figma.variables.createVariable(varName, collection, "FLOAT");
        variable.setValueForMode(collection.defaultModeId, numValue);
      }

      variables[name] = variable;
    }
  }

  return variables;
}

// Bind a FLOAT variable to a node property (gap, padding, etc.)
function bindFloatVariable(node, property, variable) {
  if (variable && node.setBoundVariable) {
    try {
      node.setBoundVariable(property, variable);
      return true;
    } catch (e) {
      console.log("Could not bind variable to " + property + ": " + e);
      return false;
    }
  }
  return false;
}

// ============================================
// HUD PANEL GENERATION
// ============================================

async function generateHUDPanel(jsonData) {
  await loadFonts();

  const tokens = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

  // Extract colors with fallbacks (using helper for Figma ES5 compatibility)
  const colors = {
    background: getTokenValue(tokens, 'colors.background', '#09090b'),
    backgroundAlt: getTokenValue(tokens, 'colors.backgroundAlt', '#18181b'),
    backgroundMuted: getTokenValue(tokens, 'colors.backgroundMuted', '#27272a'),
    foreground: getTokenValue(tokens, 'colors.foreground', '#fafafa'),
    foregroundMuted: getTokenValue(tokens, 'colors.foregroundMuted', '#a1a1aa'),
    foregroundSubtle: getTokenValue(tokens, 'colors.foregroundSubtle', '#71717a'),
    primary: getTokenValue(tokens, 'colors.primary', '#22c55e'),
    destructive: getTokenValue(tokens, 'colors.destructive', '#ef4444'),
    border: getTokenValue(tokens, 'colors.border', '#27272a')
  };

  // Create main panel frame
  const panel = figma.createFrame();
  panel.name = "HUD Panel";
  panel.resize(CONFIG.panel.width, 400); // Will auto-resize
  panel.fills = [{ type: 'SOLID', color: hexToRgb(colors.background) }];
  panel.cornerRadius = CONFIG.panel.cornerRadius;
  panel.strokes = [{ type: 'SOLID', color: hexToRgb(colors.border) }];
  panel.strokeWeight = 1;
  panel.layoutMode = "VERTICAL";
  panel.primaryAxisSizingMode = "AUTO";
  panel.counterAxisSizingMode = "FIXED";
  panel.paddingTop = CONFIG.panel.padding;
  panel.paddingBottom = CONFIG.panel.padding;
  panel.paddingLeft = CONFIG.panel.padding;
  panel.paddingRight = CONFIG.panel.padding;
  panel.itemSpacing = 8;

  // Add shadow
  panel.effects = [{
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.4 },
    offset: { x: 0, y: 4 },
    radius: 20,
    visible: true,
    blendMode: 'NORMAL'
  }];

  // Panel title
  const titleFrame = await createPanelTitle("Object Properties", colors);
  panel.appendChild(titleFrame);

  // Section 1: Transform
  const transformSection = await createCollapsibleSection("Transform", true, colors, [
    { type: 'slider', label: 'Position X', value: 150, suffix: 'px' },
    { type: 'slider', label: 'Position Y', value: 100, suffix: 'px' },
    { type: 'slider', label: 'Rotation', value: 0, min: 0, max: 360, suffix: '°' },
    { type: 'slider', label: 'Scale', value: 100, suffix: '%' }
  ]);
  panel.appendChild(transformSection);

  // Section 2: Appearance
  const appearanceSection = await createCollapsibleSection("Appearance", true, colors, [
    { type: 'slider', label: 'Opacity', value: 100, suffix: '%' },
    { type: 'toggle', label: 'Visible', checked: true },
    { type: 'select', label: 'Blend Mode', value: 'Normal', options: ['Normal', 'Multiply', 'Screen'] }
  ]);
  panel.appendChild(appearanceSection);

  // Section 3: Style
  const styleSection = await createCollapsibleSection("Style", false, colors, [
    { type: 'color', label: 'Fill Color', value: colors.primary },
    { type: 'color', label: 'Stroke Color', value: colors.foreground },
    { type: 'slider', label: 'Stroke Width', value: 2, suffix: 'px' }
  ]);
  panel.appendChild(styleSection);

  // Section 4: Actions
  const actionsSection = await createCollapsibleSection("Actions", true, colors, [
    { type: 'button', label: 'Duplicate', variant: 'default' },
    { type: 'button', label: 'Delete', variant: 'destructive' }
  ]);
  panel.appendChild(actionsSection);

  // Center in viewport
  figma.viewport.scrollAndZoomIntoView([panel]);
  figma.currentPage.selection = [panel];

  return panel;
}

async function createPanelTitle(title, colors) {
  const frame = figma.createFrame();
  frame.name = "panel-title";
  frame.fills = [];
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.itemSpacing = 8;

  // Title text
  const titleText = await createText(title, 0, 0, CONFIG.fontSize.title, "SemiBold", colors.foreground);
  frame.appendChild(titleText);

  // Separator line
  const separator = figma.createRectangle();
  separator.name = "separator";
  separator.resize(CONFIG.panel.width - CONFIG.panel.padding * 2, 1);
  separator.fills = [{ type: 'SOLID', color: hexToRgb(colors.border) }];
  frame.appendChild(separator);

  return frame;
}

async function createCollapsibleSection(title, expanded, colors, children) {
  const section = figma.createFrame();
  section.name = `section/${title.toLowerCase().replace(/\s+/g, '-')}`;
  section.fills = [];
  section.layoutMode = "VERTICAL";
  section.primaryAxisSizingMode = "AUTO";
  section.counterAxisSizingMode = "AUTO";
  section.itemSpacing = CONFIG.collapsible.childGap;

  // Header
  const header = await createSectionHeader(title, expanded, colors);
  section.appendChild(header);

  // Children container
  if (expanded) {
    const childrenContainer = figma.createFrame();
    childrenContainer.name = "children";
    childrenContainer.fills = [];
    childrenContainer.layoutMode = "VERTICAL";
    childrenContainer.primaryAxisSizingMode = "AUTO";
    childrenContainer.counterAxisSizingMode = "AUTO";
    childrenContainer.paddingLeft = CONFIG.collapsible.indentSize;
    childrenContainer.itemSpacing = CONFIG.collapsible.childGap;

    for (const child of children) {
      const component = await createComponent(child, colors);
      if (component) {
        childrenContainer.appendChild(component);
      }
    }

    section.appendChild(childrenContainer);
  }

  return section;
}

async function createSectionHeader(title, expanded, colors) {
  // Section header - MUST be named "Section Header" for extraction
  const headerHeight = 16;
  const chevronSize = 10;
  const itemSpacing = 8;

  const header = figma.createFrame();
  header.name = "Section Header";  // Required name for extraction
  header.resize(CONFIG.panel.width - CONFIG.panel.padding * 2, headerHeight);
  header.fills = [];
  header.layoutMode = "HORIZONTAL";
  header.primaryAxisSizingMode = "FIXED";
  header.counterAxisSizingMode = "FIXED";
  header.counterAxisAlignItems = "CENTER";
  header.itemSpacing = itemSpacing;

  // Chevron - MUST be named "chevron" for extraction (not wrapped in frame)
  const chevron = figma.createVector();
  chevron.name = "chevron";  // Required name for extraction

  if (expanded) {
    // Down chevron (90° rotated right chevron)
    chevron.vectorPaths = [{
      windingRule: "NONZERO",
      data: `M ${chevronSize * 0.2} ${chevronSize * 0.35} L ${chevronSize * 0.5} ${chevronSize * 0.65} L ${chevronSize * 0.8} ${chevronSize * 0.35}`
    }];
  } else {
    // Right chevron
    chevron.vectorPaths = [{
      windingRule: "NONZERO",
      data: `M ${chevronSize * 0.35} ${chevronSize * 0.2} L ${chevronSize * 0.65} ${chevronSize * 0.5} L ${chevronSize * 0.35} ${chevronSize * 0.8}`
    }];
  }

  chevron.resize(chevronSize, chevronSize);
  chevron.strokes = [{ type: 'SOLID', color: hexToRgb(colors.foregroundMuted) }];
  chevron.strokeWeight = 1.5;
  chevron.strokeCap = "ROUND";
  chevron.strokeJoin = "ROUND";
  chevron.fills = [];
  header.appendChild(chevron);

  // Title
  const titleText = await createText(title, 0, 0, CONFIG.fontSize.label, "Medium", colors.foreground);
  header.appendChild(titleText);

  return header;
}

async function createChevron(expanded, color) {
  // Generic chevron creator - used for other components
  // MUST be named "chevron" for extraction
  const size = CONFIG.collapsible.chevronSize;

  const chevron = figma.createVector();
  chevron.name = "chevron";  // Required name for extraction

  if (expanded) {
    // Down chevron
    chevron.vectorPaths = [{
      windingRule: "NONZERO",
      data: `M ${size * 0.2} ${size * 0.35} L ${size * 0.5} ${size * 0.65} L ${size * 0.8} ${size * 0.35}`
    }];
  } else {
    // Right chevron
    chevron.vectorPaths = [{
      windingRule: "NONZERO",
      data: `M ${size * 0.35} ${size * 0.2} L ${size * 0.65} ${size * 0.5} L ${size * 0.35} ${size * 0.8}`
    }];
  }

  chevron.resize(size, size);
  chevron.strokes = [{ type: 'SOLID', color: hexToRgb(color) }];
  chevron.strokeWeight = 1.5;
  chevron.strokeCap = "ROUND";
  chevron.strokeJoin = "ROUND";
  chevron.fills = [];

  return chevron;
}

async function createComponent(config, colors) {
  switch (config.type) {
    case 'toggle':
      return await createToggleComponent(config, colors);
    case 'slider':
      return await createSliderComponent(config, colors);
    case 'button':
      return await createButtonComponent(config, colors);
    case 'select':
      return await createSelectComponent(config, colors);
    case 'input':
      return await createInputComponent(config, colors);
    case 'color':
      return await createColorComponent(config, colors);
    default:
      return null;
  }
}

async function createToggleComponent(config, colors) {
  // Control row - named for extraction: "toggle: {Label}"
  const row = figma.createFrame();
  row.name = `toggle: ${config.label}`;
  row.resize(CONFIG.panel.width - CONFIG.panel.padding * 2 - CONFIG.collapsible.indentSize, CONFIG.components.height.sm);
  row.fills = [];
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "FIXED";
  row.primaryAxisAlignItems = "SPACE_BETWEEN";
  row.counterAxisAlignItems = "CENTER";

  // Label
  const label = await createText(config.label, 0, 0, CONFIG.fontSize.label, "Regular", colors.foregroundMuted);
  row.appendChild(label);

  // Toggle container - MUST be named "toggle" for extraction
  const toggleWidth = 44;
  const toggleHeight = 24;
  const thumbSize = 18;
  const thumbInset = 3;

  const toggle = figma.createFrame();
  toggle.name = "toggle";  // Required name for extraction
  toggle.resize(toggleWidth, toggleHeight);
  toggle.fills = [];  // No fill on container

  // Track - MUST be named "track" for extraction
  const track = figma.createRectangle();
  track.name = "track";
  track.resize(toggleWidth, toggleHeight);
  track.x = 0;
  track.y = 0;
  track.cornerRadius = toggleHeight / 2;
  track.fills = [{ type: 'SOLID', color: hexToRgb(config.checked ? colors.primary : colors.backgroundMuted) }];
  toggle.appendChild(track);

  // Thumb - MUST be named "thumb" for extraction
  const thumb = figma.createEllipse();
  thumb.name = "thumb";
  thumb.resize(thumbSize, thumbSize);
  thumb.x = config.checked ? toggleWidth - thumbSize - thumbInset : thumbInset;
  thumb.y = thumbInset;
  thumb.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  toggle.appendChild(thumb);

  row.appendChild(toggle);

  return row;
}

async function createSliderComponent(config, colors) {
  // Control row - named for extraction: "slider: {Label}"
  const row = figma.createFrame();
  row.name = `slider: ${config.label}`;
  row.resize(CONFIG.panel.width - CONFIG.panel.padding * 2 - CONFIG.collapsible.indentSize, CONFIG.components.height.sm);
  row.fills = [];
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "FIXED";
  row.primaryAxisAlignItems = "SPACE_BETWEEN";
  row.counterAxisAlignItems = "CENTER";
  row.itemSpacing = 8;

  // Label
  const label = await createText(config.label, 0, 0, CONFIG.fontSize.label, "Regular", colors.foregroundMuted);
  label.layoutSizingHorizontal = "FIXED";
  label.resize(CONFIG.components.labelWidth, label.height);
  row.appendChild(label);

  // Slider container - MUST be named "slider" for extraction
  const trackHeight = 8;
  const trackWidth = 140;
  const thumbSize = 8;
  const containerHeight = 16;

  const slider = figma.createFrame();
  slider.name = "slider";  // Required name for extraction
  slider.resize(trackWidth, containerHeight);
  slider.fills = [];
  slider.clipsContent = false;

  // Calculate fill percentage
  const min = config.min || 0;
  const max = config.max || 100;
  const percentage = (config.value - min) / (max - min);
  const fillWidth = Math.max(trackHeight / 2, trackWidth * percentage);

  // Track Y position (centered in container)
  const trackY = (containerHeight - trackHeight) / 2;

  // Track background - MUST be named "track" for extraction
  const track = figma.createRectangle();
  track.name = "track";
  track.resize(trackWidth, trackHeight);
  track.x = 0;
  track.y = trackY;
  track.cornerRadius = trackHeight / 2;
  track.fills = [{ type: 'SOLID', color: hexToRgb(colors.backgroundMuted) }];
  slider.appendChild(track);

  // Filled portion - MUST be named "filled" for extraction
  const filled = figma.createRectangle();
  filled.name = "filled";
  filled.resize(fillWidth, trackHeight);
  filled.x = 0;
  filled.y = trackY;
  filled.cornerRadius = trackHeight / 2;
  filled.fills = [{ type: 'SOLID', color: hexToRgb(colors.primary) }];
  slider.appendChild(filled);

  // Thumb - MUST be named "thumb" for extraction
  // Position: thumb CENTER should be at the end of fillWidth
  // Clamp to keep thumb fully within track bounds
  const thumb = figma.createEllipse();
  thumb.name = "thumb";
  thumb.resize(thumbSize, thumbSize);
  thumb.x = Math.max(0, Math.min(fillWidth - thumbSize / 2, trackWidth - thumbSize));
  thumb.y = trackY + (trackHeight - thumbSize) / 2;
  thumb.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  slider.appendChild(thumb);

  row.appendChild(slider);

  // Value display
  const valueText = `${config.value}${config.suffix || ''}`;
  const value = await createText(valueText, 0, 0, CONFIG.fontSize.label, "Regular", colors.foreground);
  value.textAlignHorizontal = "RIGHT";
  value.resize(40, value.height);
  value.layoutSizingHorizontal = "FIXED";
  row.appendChild(value);

  return row;
}

async function createButtonComponent(config, colors) {
  // Button container - MUST be named "button: {Label}" for extraction
  const buttonHeight = 40;
  const buttonWidth = CONFIG.panel.width - CONFIG.panel.padding * 2;
  const paddingX = 16;
  const chevronSize = 5;
  const chevronOffsetRight = 12;

  const button = figma.createFrame();
  button.name = `button: ${config.label}`;  // Required name pattern for extraction
  button.resize(buttonWidth, buttonHeight);
  button.layoutMode = "HORIZONTAL";
  button.primaryAxisAlignItems = "CENTER";
  button.counterAxisAlignItems = "CENTER";
  button.paddingLeft = paddingX;
  button.paddingRight = paddingX;

  let bgColor, textColor;
  if (config.variant === 'primary') {
    bgColor = colors.primary;
    textColor = '#000000';
  } else if (config.variant === 'destructive') {
    bgColor = colors.destructive;
    textColor = colors.foreground;
  } else {
    bgColor = colors.backgroundMuted;
    textColor = colors.foreground;
  }

  button.fills = [{ type: 'SOLID', color: hexToRgb(bgColor) }];
  button.cornerRadius = buttonHeight / 2;

  const buttonText = await createText(config.label, 0, 0, CONFIG.fontSize.label, "Medium", textColor);
  button.appendChild(buttonText);

  // Optional chevron for dropdown-style buttons - MUST be named "chevron" for extraction
  if (config.showChevron) {
    const chevron = figma.createVector();
    chevron.name = "chevron";
    // Create downward-pointing chevron path
    chevron.vectorPaths = [{
      windingRule: "EVENODD",
      data: `M 0 0 L ${chevronSize / 2} ${chevronSize / 2} L ${chevronSize} 0`
    }];
    chevron.resize(chevronSize, chevronSize / 2);
    chevron.strokes = [{ type: 'SOLID', color: hexToRgb(textColor) }];
    chevron.strokeWeight = 1.5;
    chevron.strokeCap = "ROUND";
    chevron.strokeJoin = "ROUND";
    chevron.fills = [];
    // Position chevron on the right side
    chevron.x = buttonWidth - paddingX - chevronOffsetRight - chevronSize;
    chevron.y = (buttonHeight - chevronSize / 2) / 2;
    button.appendChild(chevron);
  }

  return button;
}

async function createSelectComponent(config, colors) {
  // Control row - named for extraction: "dropdown: {Label}"
  const row = figma.createFrame();
  row.name = `dropdown: ${config.label}`;
  row.resize(CONFIG.panel.width - CONFIG.panel.padding * 2 - CONFIG.collapsible.indentSize, CONFIG.components.height.sm);
  row.fills = [];
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "FIXED";
  row.primaryAxisAlignItems = "SPACE_BETWEEN";
  row.counterAxisAlignItems = "CENTER";

  // Label
  const label = await createText(config.label, 0, 0, CONFIG.fontSize.label, "Regular", colors.foregroundMuted);
  row.appendChild(label);

  // Dropdown pill - MUST be named "dropdown" for extraction
  const dropdownHeight = 28;
  const dropdownWidth = 100;
  const paddingLeft = 12;
  const paddingRight = 12;
  const chevronSize = 5;
  const itemSpacing = 8;

  const dropdown = figma.createFrame();
  dropdown.name = "dropdown";  // Required name for extraction
  dropdown.resize(dropdownWidth, dropdownHeight);
  dropdown.fills = [{ type: 'SOLID', color: hexToRgb(colors.backgroundMuted) }];
  dropdown.cornerRadius = dropdownHeight / 2;
  dropdown.layoutMode = "HORIZONTAL";
  dropdown.primaryAxisAlignItems = "SPACE_BETWEEN";
  dropdown.counterAxisAlignItems = "CENTER";
  dropdown.paddingLeft = paddingLeft;
  dropdown.paddingRight = paddingRight;
  dropdown.itemSpacing = itemSpacing;

  const valueText = await createText(config.value, 0, 0, CONFIG.fontSize.label, "Regular", colors.foreground);
  dropdown.appendChild(valueText);

  // Chevron - MUST be named "chevron" for extraction
  const chevron = figma.createVector();
  chevron.name = "chevron";
  // Create downward-pointing chevron path
  chevron.vectorPaths = [{
    windingRule: "EVENODD",
    data: `M 0 0 L ${chevronSize / 2} ${chevronSize / 2} L ${chevronSize} 0`
  }];
  chevron.resize(chevronSize, chevronSize / 2);
  chevron.strokes = [{ type: 'SOLID', color: hexToRgb(colors.foregroundMuted) }];
  chevron.strokeWeight = 1.5;
  chevron.strokeCap = "ROUND";
  chevron.strokeJoin = "ROUND";
  chevron.fills = [];
  dropdown.appendChild(chevron);

  row.appendChild(dropdown);
  return row;
}

async function createInputComponent(config, colors) {
  // Control row - named for extraction: "input: {Label}"
  const row = figma.createFrame();
  row.name = `input: ${config.label}`;
  row.resize(CONFIG.panel.width - CONFIG.panel.padding * 2 - CONFIG.collapsible.indentSize, CONFIG.components.height.sm);
  row.fills = [];
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "FIXED";
  row.primaryAxisAlignItems = "SPACE_BETWEEN";
  row.counterAxisAlignItems = "CENTER";

  // Label
  const label = await createText(config.label, 0, 0, CONFIG.fontSize.label, "Regular", colors.foregroundMuted);
  row.appendChild(label);

  // Input pill - MUST be named "input" for extraction
  const inputHeight = 28;
  const inputWidth = 120;
  const paddingLeft = 12;
  const paddingRight = 12;

  const input = figma.createFrame();
  input.name = "input";  // Required name for extraction
  input.resize(inputWidth, inputHeight);
  input.fills = [{ type: 'SOLID', color: hexToRgb(colors.backgroundMuted) }];
  input.cornerRadius = inputHeight / 2;
  input.layoutMode = "HORIZONTAL";
  input.counterAxisAlignItems = "CENTER";
  input.paddingLeft = paddingLeft;
  input.paddingRight = paddingRight;

  const placeholder = config.value || config.placeholder || 'Enter...';
  const valueText = await createText(placeholder, 0, 0, CONFIG.fontSize.label, "Regular",
    config.value ? colors.foreground : colors.foregroundSubtle);
  input.appendChild(valueText);

  row.appendChild(input);
  return row;
}

async function createColorComponent(config, colors) {
  // Control row - named for extraction: "colorInput: {Label}"
  const row = figma.createFrame();
  row.name = `colorInput: ${config.label}`;
  row.resize(CONFIG.panel.width - CONFIG.panel.padding * 2 - CONFIG.collapsible.indentSize, CONFIG.components.height.sm);
  row.fills = [];
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "FIXED";
  row.primaryAxisAlignItems = "SPACE_BETWEEN";
  row.counterAxisAlignItems = "CENTER";

  // Label
  const label = await createText(config.label, 0, 0, CONFIG.fontSize.label, "Regular", colors.foregroundMuted);
  row.appendChild(label);

  // Color picker container - MUST be named "color-input" for extraction
  const colorInputHeight = 28;
  const colorInputWidth = 96;
  const paddingLeft = 6;
  const paddingRight = 12;
  const swatchSize = 18;
  const itemSpacing = 8;

  const colorInput = figma.createFrame();
  colorInput.name = "color-input";  // Required name for extraction
  colorInput.resize(colorInputWidth, colorInputHeight);
  colorInput.fills = [{ type: 'SOLID', color: hexToRgb(colors.backgroundMuted) }];
  colorInput.cornerRadius = colorInputHeight / 2;
  colorInput.layoutMode = "HORIZONTAL";
  colorInput.counterAxisAlignItems = "CENTER";
  colorInput.paddingLeft = paddingLeft;
  colorInput.paddingRight = paddingRight;
  colorInput.itemSpacing = itemSpacing;

  // Color swatch - MUST be named "swatch" for extraction
  const swatch = figma.createEllipse();
  swatch.name = "swatch";
  swatch.resize(swatchSize, swatchSize);
  swatch.fills = [{ type: 'SOLID', color: hexToRgb(config.value) }];
  colorInput.appendChild(swatch);

  // Hex value
  const hexText = await createText(config.value, 0, 0, CONFIG.fontSize.value, "Regular", colors.foreground);
  colorInput.appendChild(hexText);

  row.appendChild(colorInput);
  return row;
}

// ============================================
// IMPORT FUNCTIONS (Token Swatches)
// ============================================

async function importDesignTokens(jsonData) {
  await loadFonts();

  const tokens = JSON.parse(jsonData);
  const mainFrame = figma.createFrame();
  mainFrame.name = "HUD Design System";
  mainFrame.fills = [{ type: 'SOLID', color: hexToRgb('#09090b') }];
  mainFrame.layoutMode = "VERTICAL";
  mainFrame.paddingTop = 40;
  mainFrame.paddingBottom = 40;
  mainFrame.paddingLeft = 40;
  mainFrame.paddingRight = 40;
  mainFrame.itemSpacing = CONFIG.sectionGap;
  mainFrame.primaryAxisSizingMode = "AUTO";
  mainFrame.counterAxisSizingMode = "AUTO";

  // Create color swatches section
  if (tokens.colors) {
    const colorSection = await createColorSection(tokens.colors);
    mainFrame.appendChild(colorSection);
  }

  // Create spacing section
  if (tokens.spacing) {
    const spacingSection = await createSpacingSection(tokens.spacing);
    mainFrame.appendChild(spacingSection);
  }

  // Create radius section
  if (tokens.radius) {
    const radiusSection = await createRadiusSection(tokens.radius);
    mainFrame.appendChild(radiusSection);
  }

  // Create typography section
  if (tokens.typography) {
    const typographySection = await createTypographySection(tokens.typography);
    mainFrame.appendChild(typographySection);
  }

  // Create components section
  if (tokens.components) {
    const componentsSection = await createComponentSizesSection(tokens.components);
    mainFrame.appendChild(componentsSection);
  }

  figma.viewport.scrollAndZoomIntoView([mainFrame]);
  figma.currentPage.selection = [mainFrame];

  return mainFrame;
}

async function createColorSection(colors) {
  const section = figma.createFrame();
  section.name = "Colors";
  section.fills = [];
  section.layoutMode = "VERTICAL";
  section.itemSpacing = 16;
  section.primaryAxisSizingMode = "AUTO";
  section.counterAxisSizingMode = "AUTO";

  const heading = await createText("Colors", 0, 0, CONFIG.fontSize.heading, "Bold");
  section.appendChild(heading);

  const swatchContainer = figma.createFrame();
  swatchContainer.name = "Color Swatches";
  swatchContainer.fills = [];
  swatchContainer.layoutMode = "HORIZONTAL";
  // Use try-catch for layoutWrap as it may not be available in all Figma versions
  try {
    swatchContainer.layoutWrap = "WRAP";
    swatchContainer.counterAxisSpacing = CONFIG.swatchGap;
  } catch (e) {
    console.log("layoutWrap not supported, using fixed layout");
  }
  swatchContainer.itemSpacing = CONFIG.swatchGap;
  swatchContainer.primaryAxisSizingMode = "FIXED";
  swatchContainer.resize((CONFIG.swatchSize + CONFIG.swatchGap) * CONFIG.swatchesPerRow, 100);
  swatchContainer.counterAxisSizingMode = "AUTO";

  for (const [name, token] of Object.entries(colors)) {
    if (token.$value && token.$type === 'color') {
      const swatch = await createColorSwatch(name, token.$value);
      swatchContainer.appendChild(swatch);
    }
  }

  section.appendChild(swatchContainer);
  return section;
}

async function createColorSwatch(name, hexValue) {
  const container = figma.createFrame();
  container.name = `color/${name}`;
  container.fills = [];
  container.layoutMode = "VERTICAL";
  container.itemSpacing = 4;
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "FIXED";
  container.resize(CONFIG.swatchSize, CONFIG.swatchSize + 30);

  const rect = figma.createRectangle();
  rect.name = name;
  rect.resize(CONFIG.swatchSize, CONFIG.swatchSize);
  rect.cornerRadius = 8;
  rect.fills = [{ type: 'SOLID', color: hexToRgb(hexValue) }];

  const rgb = hexToRgb(hexValue);
  const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  if (luminance < 0.1) {
    rect.strokes = [{ type: 'SOLID', color: { r: 0.25, g: 0.25, b: 0.27 } }];
    rect.strokeWeight = 1;
  }

  container.appendChild(rect);

  const label = await createText(name, 0, 0, CONFIG.fontSize.label, "Medium");
  label.resize(CONFIG.swatchSize, CONFIG.labelHeight);
  try {
    label.textTruncation = "ENDING";
  } catch (e) {
    // textTruncation may not be available in older Figma versions
  }
  container.appendChild(label);

  const value = await createText(hexValue, 0, 0, CONFIG.fontSize.value, "Regular", '#a1a1aa');
  container.appendChild(value);

  return container;
}

async function createSpacingSection(spacing) {
  const section = figma.createFrame();
  section.name = "Spacing";
  section.fills = [];
  section.layoutMode = "VERTICAL";
  section.itemSpacing = 16;
  section.primaryAxisSizingMode = "AUTO";
  section.counterAxisSizingMode = "AUTO";

  const heading = await createText("Spacing", 0, 0, CONFIG.fontSize.heading, "Bold");
  section.appendChild(heading);

  const spacingContainer = figma.createFrame();
  spacingContainer.name = "Spacing Values";
  spacingContainer.fills = [];
  spacingContainer.layoutMode = "HORIZONTAL";
  spacingContainer.itemSpacing = 24;
  spacingContainer.primaryAxisSizingMode = "AUTO";
  spacingContainer.counterAxisSizingMode = "AUTO";

  const semanticKeys = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];

  for (const key of semanticKeys) {
    if (spacing[key]) {
      const item = await createSpacingItem(key, spacing[key].$value);
      spacingContainer.appendChild(item);
    }
  }

  section.appendChild(spacingContainer);
  return section;
}

async function createSpacingItem(name, value) {
  const container = figma.createFrame();
  container.name = `spacing/${name}`;
  container.fills = [];
  container.layoutMode = "VERTICAL";
  container.itemSpacing = 8;
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "AUTO";
  container.counterAxisAlignItems = "CENTER";

  const numValue = parseInt(value, 10);

  const bar = figma.createRectangle();
  bar.name = name;
  bar.resize(Math.max(numValue, 4), 16);
  bar.cornerRadius = 2;
  bar.fills = [{ type: 'SOLID', color: hexToRgb('#22c55e') }];
  container.appendChild(bar);

  const label = await createText(`${name}: ${value}`, 0, 0, CONFIG.fontSize.label, "Regular");
  container.appendChild(label);

  return container;
}

async function createRadiusSection(radius) {
  const section = figma.createFrame();
  section.name = "Border Radius";
  section.fills = [];
  section.layoutMode = "VERTICAL";
  section.itemSpacing = 16;
  section.primaryAxisSizingMode = "AUTO";
  section.counterAxisSizingMode = "AUTO";

  const heading = await createText("Border Radius", 0, 0, CONFIG.fontSize.heading, "Bold");
  section.appendChild(heading);

  const radiusContainer = figma.createFrame();
  radiusContainer.name = "Radius Values";
  radiusContainer.fills = [];
  radiusContainer.layoutMode = "HORIZONTAL";
  radiusContainer.itemSpacing = 16;
  radiusContainer.primaryAxisSizingMode = "AUTO";
  radiusContainer.counterAxisSizingMode = "AUTO";

  for (const [name, token] of Object.entries(radius)) {
    if (token.$value !== undefined) {
      const item = await createRadiusItem(name, token.$value);
      radiusContainer.appendChild(item);
    }
  }

  section.appendChild(radiusContainer);
  return section;
}

async function createRadiusItem(name, value) {
  const container = figma.createFrame();
  container.name = `radius/${name}`;
  container.fills = [];
  container.layoutMode = "VERTICAL";
  container.itemSpacing = 8;
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "AUTO";
  container.counterAxisAlignItems = "CENTER";

  const numValue = parseInt(value, 10);

  const rect = figma.createRectangle();
  rect.name = name;
  rect.resize(48, 48);
  rect.cornerRadius = Math.min(numValue, 24);
  rect.fills = [{ type: 'SOLID', color: hexToRgb('#27272a') }];
  rect.strokes = [{ type: 'SOLID', color: hexToRgb('#3f3f46') }];
  rect.strokeWeight = 1;
  container.appendChild(rect);

  const label = await createText(`${name}`, 0, 0, CONFIG.fontSize.label, "Medium");
  container.appendChild(label);

  const valueText = await createText(`${value}`, 0, 0, CONFIG.fontSize.value, "Regular", '#a1a1aa');
  container.appendChild(valueText);

  return container;
}

async function createTypographySection(typography) {
  const section = figma.createFrame();
  section.name = "Typography";
  section.fills = [];
  section.layoutMode = "VERTICAL";
  section.itemSpacing = 16;
  section.primaryAxisSizingMode = "AUTO";
  section.counterAxisSizingMode = "AUTO";

  const heading = await createText("Typography - Font Sizes", 0, 0, CONFIG.fontSize.heading, "Bold");
  section.appendChild(heading);

  if (typography.fontSize) {
    const fontSizeContainer = figma.createFrame();
    fontSizeContainer.name = "Font Sizes";
    fontSizeContainer.fills = [];
    fontSizeContainer.layoutMode = "VERTICAL";
    fontSizeContainer.itemSpacing = 12;
    fontSizeContainer.primaryAxisSizingMode = "AUTO";
    fontSizeContainer.counterAxisSizingMode = "AUTO";

    for (const [name, token] of Object.entries(typography.fontSize)) {
      if (token.$value !== undefined) {
        const item = await createFontSizeItem(name, token.$value);
        fontSizeContainer.appendChild(item);
      }
    }

    section.appendChild(fontSizeContainer);
  }

  return section;
}

async function createFontSizeItem(name, value) {
  const container = figma.createFrame();
  container.name = `fontSize/${name}`;
  container.fills = [];
  container.layoutMode = "HORIZONTAL";
  container.itemSpacing = 16;
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "AUTO";
  container.counterAxisAlignItems = "CENTER";

  const numValue = parseInt(value, 10);

  const sample = await createText("Aa", 0, 0, numValue, "Medium");
  sample.name = name;
  sample.resize(60, numValue + 8);
  container.appendChild(sample);

  const label = await createText(`${name}: ${value}`, 0, 0, CONFIG.fontSize.label, "Regular", '#a1a1aa');
  container.appendChild(label);

  return container;
}

async function createComponentSizesSection(components) {
  const section = figma.createFrame();
  section.name = "Component Sizes";
  section.fills = [];
  section.layoutMode = "VERTICAL";
  section.itemSpacing = 16;
  section.primaryAxisSizingMode = "AUTO";
  section.counterAxisSizingMode = "AUTO";

  const heading = await createText("Component Heights", 0, 0, CONFIG.fontSize.heading, "Bold");
  section.appendChild(heading);

  if (components.height) {
    const heightContainer = figma.createFrame();
    heightContainer.name = "Heights";
    heightContainer.fills = [];
    heightContainer.layoutMode = "HORIZONTAL";
    heightContainer.itemSpacing = 16;
    heightContainer.primaryAxisSizingMode = "AUTO";
    heightContainer.counterAxisSizingMode = "AUTO";

    for (const [name, token] of Object.entries(components.height)) {
      if (token.$value !== undefined) {
        const item = await createHeightItem(name, token.$value);
        heightContainer.appendChild(item);
      }
    }

    section.appendChild(heightContainer);
  }

  return section;
}

async function createHeightItem(name, value) {
  const container = figma.createFrame();
  container.name = `height/${name}`;
  container.fills = [];
  container.layoutMode = "VERTICAL";
  container.itemSpacing = 8;
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "AUTO";
  container.counterAxisAlignItems = "CENTER";

  const numValue = parseInt(value, 10);

  const rect = figma.createRectangle();
  rect.name = name;
  rect.resize(80, numValue);
  rect.cornerRadius = numValue / 2;
  rect.fills = [{ type: 'SOLID', color: hexToRgb('#27272a') }];
  container.appendChild(rect);

  const label = await createText(`${name}: ${value}`, 0, 0, CONFIG.fontSize.label, "Regular");
  container.appendChild(label);

  return container;
}

// ============================================
// EXPORT FUNCTIONS
// ============================================

async function exportDesignTokens(originalManifest) {
  // MULTI-SELECT: Export from ANY selected frame(s)
  var selectedFrames = [];
  var selection = figma.currentPage.selection;

  // Collect all selected frames/components
  for (var i = 0; i < selection.length; i++) {
    var node = selection[i];
    if (node.type === 'FRAME' || node.type === 'COMPONENT') {
      selectedFrames.push(node);
    }
  }

  if (selectedFrames.length > 0) {
    console.log("Exporting " + selectedFrames.length + " selected frame(s)");
  }

  // If nothing selected, fall back to searching for known panel names
  if (selectedFrames.length === 0) {
    var panel = figma.currentPage.findOne(function(node) {
      return node.type === 'FRAME' && node.name.startsWith('Component Demo');
    });
    if (panel) {
      selectedFrames.push(panel);
      console.log("Found Component Demo panel: " + panel.name);
    }
  }

  // Legacy fallback
  if (selectedFrames.length === 0) {
    var legacyPanel = figma.currentPage.findOne(function(node) {
      return node.name === "HUD Design System";
    });
    if (legacyPanel) {
      return exportFromHUDDesignSystem(legacyPanel);
    }
  }

  if (selectedFrames.length === 0) {
    figma.notify("Select frame(s) to export, or create a 'Component Demo' panel.");
    return null;
  }

  var frameNames = selectedFrames.map(function(f) { return f.name; }).join(", ");
  console.log("Exporting: " + frameNames + " (name-agnostic recursive extraction)");

  // Branch based on feature flag
  if (FEATURE_FLAGS.useDynamicExport) {
    console.log("Using DYNAMIC export (pure recursive traversal)");
    return exportDynamic(selectedFrames);
  } else {
    console.log("Using LEGACY export (name-based lookups with fallbacks)");
    return exportFromComponentDemo(selectedFrames[0], originalManifest);
  }
}

// =============================================================================
// DUAL EXPORT SYSTEM (Feature Flag: useDynamicExport)
// =============================================================================
// Produces TWO outputs:
// 1. Design Tokens (W3C format) - colors from Figma Variables ONLY
// 2. Node Manifest - complete recursive tree of ANY selected frame (name-agnostic)
//
// The manifest captures ALL node properties with token REFERENCES where colors
// match known tokens (e.g., "$colors.trackFilled" instead of "#6590ff").
// The manifest works on ANY frame - no specific naming required.

async function exportDynamic(selectedFrames) {
  console.log("=== DUAL EXPORT: TOKENS + NODE MANIFEST ===");
  console.log("Exporting " + selectedFrames.length + " frame(s) (name-agnostic recursive extraction)");

  // Token value helpers (W3C Design Tokens format)
  function dim(value) { return { "$value": Math.round(value) + "px", "$type": "dimension" }; }
  function col(hex) { return { "$value": hex, "$type": "color" }; }
  function num(value) { return { "$value": String(value), "$type": "number" }; }
  function fontFam(value) { return { "$value": value, "$type": "fontFamily" }; }
  function fontWt(value) { return { "$value": String(value), "$type": "fontWeight" }; }

  // Initialize token structure
  var tokens = {
    colors: {},
    spacing: {},
    radius: {},
    typography: { fontFamily: {}, fontSize: {}, fontWeight: {} },
    components: {
      height: {},
      panel: {},
      toggle: {},
      slider: {},
      dropdown: {},
      input: {},
      colorInput: {},
      button: {},
      section: {},
      controlRow: {},
      separator: {}
    },
    semanticColors: {}
  };

  // Map to track hex color -> token path for manifest references
  var colorToToken = {};

  // Maps for dimension tokens (value in px -> token reference)
  var spacingToToken = {};
  var radiusToToken = {};
  var fontSizeToToken = {};
  var heightToToken = {};

  // =========================================================================
  // STEP 1: READ ALL TOKENS FROM FIGMA VARIABLES (COLOR + NUMBER)
  // =========================================================================
  console.log("Step 1: Reading ALL tokens from Figma Variables...");

  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var hudCollection = null;
  for (var ci = 0; ci < collections.length; ci++) {
    if (collections[ci].name === "HUD Design Tokens") {
      hudCollection = collections[ci];
      break;
    }
  }

  // If no HUD collection, still proceed with manifest-only export
  if (!hudCollection) {
    console.log("  No 'HUD Design Tokens' collection found - will export manifest only");
  }

  // Helper to resolve variable value (handles aliases)
  async function resolveVariableValue(variable, modeId) {
    var value = variable.valuesByMode[modeId];
    if (value && value.type === 'VARIABLE_ALIAS') {
      var aliasedVar = await figma.variables.getVariableByIdAsync(value.id);
      if (aliasedVar) {
        return resolveVariableValue(aliasedVar, modeId);
      }
    }
    return value;
  }

  // Primitive and semantic color lists
  var primitiveColorNames = [
    'background', 'backgroundAlt', 'backgroundMuted',
    'foreground', 'foregroundMuted', 'foregroundSubtle',
    'border', 'borderHover', 'borderFocus',
    'primary', 'primaryHover', 'primaryForeground',
    'secondary', 'secondaryHover', 'secondaryForeground',
    'destructive', 'destructiveHover', 'destructiveForeground',
    'accent', 'track', 'trackFilled', 'thumbColor',
    'inputBackground', 'ring', 'selection'
  ];

  var semanticColorNames = [
    'panelTitle', 'sectionTitle', 'sectionCount', 'sectionChevron',
    'controlLabel', 'controlLabelDisabled', 'controlValue', 'controlPlaceholder',
    'input', 'inputPlaceholder', 'sliderValue',
    'dropdown', 'dropdownMuted', 'dropdownOptionSelected',
    'colorPicker', 'buttonPrimary', 'buttonSecondary', 'buttonDestructive'
  ];

  // Read all variables from collection (if exists)
  if (hudCollection) {
    var variableIds = hudCollection.variableIds;
    for (var vi = 0; vi < variableIds.length; vi++) {
      var variable = await figma.variables.getVariableByIdAsync(variableIds[vi]);
      if (!variable) continue;

      var varName = variable.name;
      var value = await resolveVariableValue(variable, hudCollection.defaultModeId);

      if (variable.resolvedType === "COLOR" && value && typeof value.r === 'number') {
        var hexColor = rgbToHex(value.r, value.g, value.b);
        console.log("  [COLOR] " + varName + " = " + hexColor);

        if (primitiveColorNames.indexOf(varName) !== -1) {
          tokens.colors[varName] = col(hexColor);
          colorToToken[hexColor.toLowerCase()] = "$colors." + varName;
        } else if (semanticColorNames.indexOf(varName) !== -1) {
          tokens.semanticColors[varName] = col(hexColor);
          colorToToken[hexColor.toLowerCase()] = "$semanticColors." + varName;
        } else {
          // Any other color variable - add to colors
          tokens.colors[varName] = col(hexColor);
          colorToToken[hexColor.toLowerCase()] = "$colors." + varName;
        }
      } else if (variable.resolvedType === "FLOAT" && typeof value === 'number') {
        // Number variables - could be spacing, dimensions, etc.
        console.log("  [NUMBER] " + varName + " = " + value);
        // Parse variable name to determine category (e.g., "spacing/sm" -> spacing.sm)
        if (varName.indexOf('/') !== -1) {
          var parts = varName.split('/');
          var category = parts[0];
          var name = parts[1];
          if (category === 'spacing' && tokens.spacing) {
            tokens.spacing[name] = dim(value);
          } else if (category === 'radius' && tokens.radius) {
            tokens.radius[name] = dim(value);
          }
        }
      }
    }

    console.log("  Loaded: " + Object.keys(tokens.colors).length + " colors, " + Object.keys(tokens.semanticColors).length + " semantic");
  }

  // =========================================================================
  // STEP 2: EXTRACT ROOT FRAME PROPERTIES (from first selected frame)
  // =========================================================================
  console.log("Step 2: Extracting root frame properties...");

  // Use first selected frame for panel token extraction
  var firstFrame = selectedFrames[0];

  // Root frame dimensions (from first selected frame)
  tokens.components.panel.width = dim(firstFrame.width);
  tokens.components.panel.height = dim(firstFrame.height);
  tokens.components.panel.cornerRadius = dim(firstFrame.cornerRadius || 0);
  tokens.components.panel.padding = dim(firstFrame.paddingLeft || firstFrame.paddingTop || 0);
  tokens.components.panel.paddingTop = dim(firstFrame.paddingTop || 0);
  tokens.components.panel.paddingBottom = dim(firstFrame.paddingBottom || 0);
  tokens.components.panel.paddingLeft = dim(firstFrame.paddingLeft || 0);
  tokens.components.panel.paddingRight = dim(firstFrame.paddingRight || 0);
  tokens.components.panel.itemSpacing = dim(firstFrame.itemSpacing || 0);
  tokens.components.panel.minHeight = dim(100);
  tokens.components.panel.maxHeight = dim(firstFrame.height);

  // Panel shadow (if any)
  if (firstFrame.effects && firstFrame.effects.length > 0) {
    for (var ei = 0; ei < firstFrame.effects.length; ei++) {
      var effect = firstFrame.effects[ei];
      if (effect.type === 'DROP_SHADOW' && effect.visible !== false) {
        tokens.components.panel.shadowOffsetX = dim(effect.offset ? effect.offset.x : 0);
        tokens.components.panel.shadowOffsetY = dim(effect.offset ? effect.offset.y : 0);
        tokens.components.panel.shadowBlur = dim(effect.radius || 0);
        tokens.components.panel.shadowSpread = dim(effect.spread || 0);
        tokens.components.panel.shadowOpacity = num(effect.color ? effect.color.a : 0.5);
        break;
      }
    }
  }

  // Standard spacing tokens (defaults if not from variables)
  if (Object.keys(tokens.spacing).length === 0) {
    tokens.spacing.xs = dim(6);
    tokens.spacing.sm = dim(8);
    tokens.spacing.md = dim(12);
    tokens.spacing.lg = dim(16);
    tokens.spacing.xl = dim(24);
  }

  // Standard radius tokens (defaults if not from variables)
  if (Object.keys(tokens.radius).length === 0) {
    tokens.radius.sm = dim(4);
    tokens.radius.md = dim(12);
    tokens.radius.lg = dim(14);
    tokens.radius.xl = dim(18);
    tokens.radius.full = dim(9999);
  }

  // Typography defaults
  tokens.typography.fontFamily.sans = fontFam("Inter, system-ui, sans-serif");
  tokens.typography.fontSize.xs = dim(11);
  tokens.typography.fontSize.sm = dim(13);
  tokens.typography.fontSize.base = dim(14);
  tokens.typography.fontSize.lg = dim(16);
  tokens.typography.fontWeight.normal = fontWt(400);
  tokens.typography.fontWeight.medium = fontWt(500);
  tokens.typography.fontWeight.semibold = fontWt(600);

  // Component heights defaults
  tokens.components.height.xs = dim(16);
  tokens.components.height.sm = dim(24);
  tokens.components.height.md = dim(28);
  tokens.components.height.lg = dim(36);
  tokens.components.height.xl = dim(64);

  // =========================================================================
  // BUILD REVERSE LOOKUP MAPS FOR DIMENSION TOKENS
  // =========================================================================
  // Spacing: value -> "$spacing.xxx"
  for (var spKey in tokens.spacing) {
    var spVal = parseInt(tokens.spacing[spKey].$value, 10);
    spacingToToken[spVal] = "$spacing." + spKey;
  }

  // Radius: value -> "$radius.xxx"
  for (var radKey in tokens.radius) {
    var radVal = parseInt(tokens.radius[radKey].$value, 10);
    radiusToToken[radVal] = "$radius." + radKey;
  }

  // Font size: value -> "$typography.fontSize.xxx"
  for (var fsKey in tokens.typography.fontSize) {
    var fsVal = parseInt(tokens.typography.fontSize[fsKey].$value, 10);
    fontSizeToToken[fsVal] = "$typography.fontSize." + fsKey;
  }

  // Component heights: value -> "$components.height.xxx"
  for (var hKey in tokens.components.height) {
    var hVal = parseInt(tokens.components.height[hKey].$value, 10);
    heightToToken[hVal] = "$components.height." + hKey;
  }

  console.log("  Built dimension token maps: spacing(" + Object.keys(spacingToToken).length +
              "), radius(" + Object.keys(radiusToToken).length +
              "), fontSize(" + Object.keys(fontSizeToToken).length +
              "), height(" + Object.keys(heightToToken).length + ")");

  console.log("  Root frame properties captured (name-agnostic)");

  // =========================================================================
  // STEP 3: BUILD COMPLETE NODE MANIFEST (RECURSIVE, NAME-AGNOSTIC)
  // =========================================================================
  console.log("Step 3: Building complete node manifest (recursive)...");

  // Helper to extract a single gradient stop from a Figma GradientStop
  function extractGradientStop(stop) {
    var color = stop.color;
    var hex = rgbToHex(color.r, color.g, color.b);
    var tokenRef = colorToToken[hex.toLowerCase()];
    var result = {
      color: tokenRef || hex,
      position: stop.position
    };
    // Figma stores per-stop alpha in color.a (0-1)
    if (color.a !== undefined && color.a < 1) {
      result.opacity = color.a;
    }
    return result;
  }

  // Helper to get fill color/gradient and try to map to token
  function getFillRef(node) {
    if (!node.fills || node.fills.length === 0) return null;
    var fill = node.fills[0];
    if (fill.visible === false) return null;

    // Gradient fills (LINEAR or RADIAL)
    if (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL') {
      var gradientData = {
        type: fill.type === 'GRADIENT_LINEAR' ? 'LINEAR' : 'RADIAL',
        stops: []
      };
      // Extract gradient stops
      if (fill.gradientStops) {
        for (var gs = 0; gs < fill.gradientStops.length; gs++) {
          gradientData.stops.push(extractGradientStop(fill.gradientStops[gs]));
        }
      }
      // Figma gradientHandlePositions: array of {x,y} normalized 0-1
      // [0] = start point, [1] = end point, [2] = width control (for radial)
      if (fill.gradientHandlePositions) {
        gradientData.handlePositions = [];
        for (var gh = 0; gh < fill.gradientHandlePositions.length; gh++) {
          gradientData.handlePositions.push({
            x: fill.gradientHandlePositions[gh].x,
            y: fill.gradientHandlePositions[gh].y
          });
        }
      }
      // Fill-level opacity
      if (fill.opacity !== undefined && fill.opacity < 1) {
        gradientData.opacity = fill.opacity;
      }
      return { gradient: gradientData };
    }

    // Solid fills
    if (fill.type !== 'SOLID') return null;
    var hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
    // Try to find token reference
    var tokenRef = colorToToken[hex.toLowerCase()];
    var colorRef = tokenRef || hex; // Return token ref if found, otherwise raw hex

    // Check for fill opacity (separate from layer opacity)
    // In Figma, fill.opacity is 0-1 where 1 is fully opaque
    var fillOpacity = fill.opacity;
    if (fillOpacity !== undefined && fillOpacity < 1) {
      return { color: colorRef, opacity: fillOpacity };
    }
    return colorRef;
  }

  // Helper to get stroke color and try to map to token
  function getStrokeRef(node) {
    if (!node.strokes || node.strokes.length === 0) return null;
    var stroke = node.strokes[0];
    if (stroke.type !== 'SOLID' || stroke.visible === false) return null;
    var hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
    var tokenRef = colorToToken[hex.toLowerCase()];
    return tokenRef || hex;
  }

  // Recursive function to extract ALL node properties with token refs
  async function extractNode(node, depth) {
    var nodeData = {
      name: node.name,
      type: node.type,
      x: Math.round(node.x),
      y: Math.round(node.y),
      width: Math.round(node.width),
      height: Math.round(node.height)
    };

    // Fill - use token reference if available
    // getFillRef returns: string (color ref), { color, opacity }, or { gradient: {...} }
    var fillRef = getFillRef(node);
    if (fillRef) {
      if (typeof fillRef === 'object' && fillRef.gradient) {
        nodeData.gradient = fillRef.gradient;
      } else if (typeof fillRef === 'object') {
        nodeData.fill = fillRef.color;
        nodeData.fillOpacity = fillRef.opacity;
      } else {
        nodeData.fill = fillRef;
      }
    }

    // Stroke - use token reference if available
    var strokeRef = getStrokeRef(node);
    if (strokeRef) {
      nodeData.stroke = strokeRef;
      nodeData.strokeWeight = node.strokeWeight || 1;
    }

    // Corner radius - use token reference if available
    if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
      var radiusVal = Math.round(node.cornerRadius);
      nodeData.cornerRadius = radiusToToken[radiusVal] || radiusVal;
    }

    // Rotation (degrees, from Figma API - 0 means no rotation)
    if (node.rotation !== undefined && node.rotation !== 0) {
      nodeData.rotation = node.rotation;
      // Figma's node.x/y for rotated nodes is the rotation origin (pre-rotation
      // top-left after transform), NOT the visual bounding box position shown in
      // the inspector. Override with absoluteBoundingBox relative to parent to get
      // the true visual position within the parent's coordinate space.
      if (node.absoluteBoundingBox && node.parent && node.parent.absoluteBoundingBox) {
        nodeData.x = Math.round(node.absoluteBoundingBox.x - node.parent.absoluteBoundingBox.x);
        nodeData.y = Math.round(node.absoluteBoundingBox.y - node.parent.absoluteBoundingBox.y);
      }
    }

    // Component variant metadata for INSTANCE nodes
    if (node.type === 'INSTANCE') {
      // Component variant properties (e.g., { "State": { type: "VARIANT", value: "Open" } })
      if (node.componentProperties) {
        var propKeys = Object.keys(node.componentProperties);
        if (propKeys.length > 0) {
          nodeData.componentProperties = {};
          for (var pk = 0; pk < propKeys.length; pk++) {
            var prop = node.componentProperties[propKeys[pk]];
            nodeData.componentProperties[propKeys[pk]] = {
              type: prop.type,
              value: prop.value
            };
          }
        }
      }
      // Main component reference and variant group info (async API required)
      var mainComp = await node.getMainComponentAsync();
      if (mainComp) {
        nodeData.mainComponentName = mainComp.name;
        if (mainComp.parent && mainComp.parent.type === 'COMPONENT_SET') {
          nodeData.componentSetName = mainComp.parent.name;
          // Capture variant options from the component set
          if (mainComp.parent.componentPropertyDefinitions) {
            var defs = mainComp.parent.componentPropertyDefinitions;
            var defKeys = Object.keys(defs);
            var variantOpts = {};
            var hasVariants = false;
            for (var dk = 0; dk < defKeys.length; dk++) {
              if (defs[defKeys[dk]].type === 'VARIANT') {
                variantOpts[defKeys[dk]] = {
                  options: defs[defKeys[dk]].variantOptions
                };
                hasVariants = true;
              }
            }
            if (hasVariants) {
              nodeData.variantOptions = variantOpts;
            }
          }

          // Export all variant children from the component set.
          // Each variant COMPONENT's children are recursively exported so the
          // runtime can switch variants dynamically without duplicate templates.
          var componentSet = mainComp.parent;
          var variantData = {};
          for (var vi = 0; vi < componentSet.children.length; vi++) {
            var variantComp = componentSet.children[vi];
            if (variantComp.type === 'COMPONENT') {
              var variantChildren = [];
              for (var vc = 0; vc < variantComp.children.length; vc++) {
                variantChildren.push(await extractNode(variantComp.children[vc], depth + 1));
              }
              var variantEntry = { children: variantChildren };
              // Export the variant COMPONENT's own layout properties so consumers
              // know the layout context (padding, alignment, spacing) per variant
              if (variantComp.layoutMode && variantComp.layoutMode !== 'NONE') {
                variantEntry.layoutMode = variantComp.layoutMode;
                variantEntry.itemSpacing = variantComp.itemSpacing || 0;
                variantEntry.paddingTop = variantComp.paddingTop || 0;
                variantEntry.paddingBottom = variantComp.paddingBottom || 0;
                variantEntry.paddingLeft = variantComp.paddingLeft || 0;
                variantEntry.paddingRight = variantComp.paddingRight || 0;
                if (variantComp.primaryAxisAlignItems) variantEntry.primaryAxisAlignItems = variantComp.primaryAxisAlignItems;
                if (variantComp.counterAxisAlignItems) variantEntry.counterAxisAlignItems = variantComp.counterAxisAlignItems;
                if (variantComp.primaryAxisSizingMode) variantEntry.primaryAxisSizingMode = variantComp.primaryAxisSizingMode;
                if (variantComp.counterAxisSizingMode) variantEntry.counterAxisSizingMode = variantComp.counterAxisSizingMode;
              }
              variantData[variantComp.name] = variantEntry;
            }
          }
          if (Object.keys(variantData).length > 0) {
            nodeData.variants = variantData;
          }
        }
      }
    }

    // Component/ComponentSet property definitions
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      if (node.componentPropertyDefinitions) {
        var cpKeys = Object.keys(node.componentPropertyDefinitions);
        if (cpKeys.length > 0) {
          nodeData.componentPropertyDefinitions = {};
          for (var ck = 0; ck < cpKeys.length; ck++) {
            var cpDef = node.componentPropertyDefinitions[cpKeys[ck]];
            nodeData.componentPropertyDefinitions[cpKeys[ck]] = {
              type: cpDef.type,
              defaultValue: cpDef.defaultValue
            };
            if (cpDef.variantOptions) {
              nodeData.componentPropertyDefinitions[cpKeys[ck]].variantOptions = cpDef.variantOptions;
            }
          }
        }
      }
    }

    // Opacity
    if (node.opacity !== undefined && node.opacity < 1) {
      nodeData.opacity = node.opacity;
    }

    // Visible (only encode when hidden — visible is the default)
    if (node.visible === false) {
      nodeData.visible = false;
    }

    // Layout properties (for auto-layout frames) - use token refs where available
    // For INSTANCE nodes, layoutMode may not be directly readable even though the
    // main component has auto-layout. Fall back to the main component's layout.
    var layoutSource = node;
    if ((!node.layoutMode || node.layoutMode === 'NONE') && node.type === 'INSTANCE') {
      try {
        var mc = await node.getMainComponentAsync();
        if (mc && mc.layoutMode && mc.layoutMode !== 'NONE') {
          layoutSource = mc;
        }
      } catch (e) { /* ignore */ }
    }
    if (layoutSource.layoutMode && layoutSource.layoutMode !== 'NONE') {
      nodeData.layoutMode = layoutSource.layoutMode;

      // Item spacing - try token reference
      // IMPORTANT: For GRID layouts, we need to handle spacing carefully
      // itemSpacing = column gap (horizontal spacing between items)
      // counterAxisSpacing = row gap (vertical spacing between rows)
      // Note: itemSpacing can be 0, so we must check for undefined explicitly
      var itemSpacingVal = layoutSource.itemSpacing !== undefined ? layoutSource.itemSpacing : 0;
      nodeData.itemSpacing = spacingToToken[itemSpacingVal] || itemSpacingVal;
      // Padding - try token references
      var padTop = layoutSource.paddingTop || 0;
      var padBottom = layoutSource.paddingBottom || 0;
      var padLeft = layoutSource.paddingLeft || 0;
      var padRight = layoutSource.paddingRight || 0;
      nodeData.paddingTop = spacingToToken[padTop] || padTop;
      nodeData.paddingBottom = spacingToToken[padBottom] || padBottom;
      nodeData.paddingLeft = spacingToToken[padLeft] || padLeft;
      nodeData.paddingRight = spacingToToken[padRight] || padRight;
      // Alignment properties for child positioning
      if (layoutSource.primaryAxisAlignItems) {
        nodeData.primaryAxisAlignItems = layoutSource.primaryAxisAlignItems; // MIN, CENTER, MAX, SPACE_BETWEEN
      }
      if (layoutSource.counterAxisAlignItems) {
        nodeData.counterAxisAlignItems = layoutSource.counterAxisAlignItems; // MIN, CENTER, MAX
      }
      // Sizing mode (FIXED or HUG)
      if (layoutSource.primaryAxisSizingMode) {
        nodeData.primaryAxisSizingMode = layoutSource.primaryAxisSizingMode;
      }
      if (layoutSource.counterAxisSizingMode) {
        nodeData.counterAxisSizingMode = layoutSource.counterAxisSizingMode;
      }
      // Grid/Wrap properties (for GRID layoutMode or wrapping auto-layout)
      if (layoutSource.layoutWrap) {
        nodeData.layoutWrap = layoutSource.layoutWrap; // NO_WRAP or WRAP
      }
      // Counter axis spacing (row gap for GRID or wrapped layouts)
      // For GRID layouts, ALWAYS export this value as it controls row gaps
      if (nodeData.layoutMode === 'GRID') {
        // GRID: always capture row gap (default to itemSpacing if not set for visual consistency)
        var counterSpacingVal = layoutSource.counterAxisSpacing;
        if (counterSpacingVal !== undefined) {
          nodeData.counterAxisSpacing = spacingToToken[counterSpacingVal] || counterSpacingVal;
        } else {
          // If counterAxisSpacing is undefined, use itemSpacing as fallback for row gap
          nodeData.counterAxisSpacing = nodeData.itemSpacing;
        }
      } else if (layoutSource.counterAxisSpacing !== undefined && layoutSource.counterAxisSpacing !== 0) {
        // Non-GRID: only capture if non-zero
        var counterSpacingVal = layoutSource.counterAxisSpacing;
        nodeData.counterAxisSpacing = spacingToToken[counterSpacingVal] || counterSpacingVal;
      }
      // Counter axis alignment for wrapped content
      if (layoutSource.counterAxisAlignContent) {
        nodeData.counterAxisAlignContent = layoutSource.counterAxisAlignContent; // AUTO, SPACE_BETWEEN
      }

      // GRID-specific: Also capture horizontalPadding/verticalPadding if they exist (older API)
      // These may be used instead of paddingLeft/Right and paddingTop/Bottom in some cases
      if (nodeData.layoutMode === 'GRID') {
        if (layoutSource.horizontalPadding !== undefined && layoutSource.horizontalPadding !== 0) {
          var hPadVal = layoutSource.horizontalPadding;
          nodeData.horizontalPadding = spacingToToken[hPadVal] || hPadVal;
        }
        if (layoutSource.verticalPadding !== undefined && layoutSource.verticalPadding !== 0) {
          var vPadVal = layoutSource.verticalPadding;
          nodeData.verticalPadding = spacingToToken[vPadVal] || vPadVal;
        }

        // GRID-specific gap properties (newer Figma API)
        // For layoutMode: "GRID", these are the correct properties:
        // - gridColumnGap: column spacing (horizontal gap between items)
        // - gridRowGap: row spacing (vertical gap between rows)
        // Note: itemSpacing/counterAxisSpacing are legacy and may return incorrect values for GRID
        if (layoutSource.gridColumnGap !== undefined) {
          var gridColGapVal = layoutSource.gridColumnGap;
          nodeData.gridColumnGap = spacingToToken[gridColGapVal] || gridColGapVal;
          // Override itemSpacing with the correct GRID value
          nodeData.itemSpacing = nodeData.gridColumnGap;
        }
        if (layoutSource.gridRowGap !== undefined) {
          var gridRowGapVal = layoutSource.gridRowGap;
          nodeData.gridRowGap = spacingToToken[gridRowGapVal] || gridRowGapVal;
          // Override counterAxisSpacing with the correct GRID value
          nodeData.counterAxisSpacing = nodeData.gridRowGap;
        }

        // Also add semantic aliases for grid gaps for clarity
        nodeData.columnGap = nodeData.gridColumnGap !== undefined ? nodeData.gridColumnGap : nodeData.itemSpacing;
        nodeData.rowGap = nodeData.gridRowGap !== undefined ? nodeData.gridRowGap : nodeData.counterAxisSpacing;
      }
    }

    // Child layout properties (how this node positions itself within parent auto-layout)
    if (node.layoutAlign) {
      nodeData.layoutAlign = node.layoutAlign; // INHERIT, STRETCH, MIN, CENTER, MAX
    }
    if (node.layoutGrow !== undefined && node.layoutGrow !== 0) {
      nodeData.layoutGrow = node.layoutGrow; // 0 = fixed, 1 = fill
    }

    // Layout sizing properties (modern Figma API - controls how element sizes itself in parent)
    // These are critical for grid cell sizing and HUG behavior
    if (node.layoutSizingHorizontal) {
      nodeData.layoutSizingHorizontal = node.layoutSizingHorizontal; // FIXED, HUG, or FILL
    }
    if (node.layoutSizingVertical) {
      nodeData.layoutSizingVertical = node.layoutSizingVertical; // FIXED, HUG, or FILL
    }

    // Text properties - capture all properties needed for exact rendering
    if (node.type === 'TEXT') {
      nodeData.characters = node.characters;
      // Font size - try token reference
      var fontSizeVal = node.fontSize;
      nodeData.fontSize = fontSizeToToken[fontSizeVal] || fontSizeVal;
      if (node.fontName) {
        nodeData.fontFamily = node.fontName.family;
        nodeData.fontStyle = node.fontName.style;
      }
      // Text color - use token reference if available
      if (fillRef) nodeData.textColor = fillRef;

      // Line height (for vertical positioning)
      if (node.lineHeight && node.lineHeight.unit !== 'AUTO') {
        if (node.lineHeight.unit === 'PIXELS') {
          nodeData.lineHeight = node.lineHeight.value;
        } else if (node.lineHeight.unit === 'PERCENT') {
          nodeData.lineHeightPercent = node.lineHeight.value;
        }
      }

      // Text alignment
      if (node.textAlignHorizontal) {
        nodeData.textAlignHorizontal = node.textAlignHorizontal; // LEFT, CENTER, RIGHT, JUSTIFIED
      }
      if (node.textAlignVertical) {
        nodeData.textAlignVertical = node.textAlignVertical; // TOP, CENTER, BOTTOM
      }

      // Letter spacing
      if (node.letterSpacing && node.letterSpacing.value !== 0) {
        if (node.letterSpacing.unit === 'PIXELS') {
          nodeData.letterSpacing = node.letterSpacing.value;
        } else if (node.letterSpacing.unit === 'PERCENT') {
          nodeData.letterSpacingPercent = node.letterSpacing.value;
        }
      }
    }

    // VECTOR properties - capture path data for exact recreation
    if (node.type === 'VECTOR') {
      // Export vector paths (SVG-like path data)
      if (node.vectorPaths && node.vectorPaths.length > 0) {
        nodeData.vectorPaths = [];
        for (var vp = 0; vp < node.vectorPaths.length; vp++) {
          var path = node.vectorPaths[vp];
          nodeData.vectorPaths.push({
            windingRule: path.windingRule,
            data: path.data
          });
        }
      }
      // Stroke properties for vectors
      if (node.strokeCap) nodeData.strokeCap = node.strokeCap;
      if (node.strokeJoin) nodeData.strokeJoin = node.strokeJoin;
    }

    // Effects (shadows)
    if (node.effects && node.effects.length > 0) {
      nodeData.effects = [];
      for (var i = 0; i < node.effects.length; i++) {
        var eff = node.effects[i];
        if (eff.visible !== false) {
          var effectData = { type: eff.type };
          if (eff.offset) {
            effectData.offsetX = eff.offset.x;
            effectData.offsetY = eff.offset.y;
          }
          if (eff.radius) effectData.blur = eff.radius;
          if (eff.spread) effectData.spread = eff.spread;
          if (eff.color) {
            var effHex = rgbToHex(eff.color.r, eff.color.g, eff.color.b);
            var effTokenRef = colorToToken[effHex.toLowerCase()];
            effectData.color = effTokenRef || effHex;
            effectData.opacity = eff.color.a;
          }
          nodeData.effects.push(effectData);
        }
      }
      if (nodeData.effects.length === 0) delete nodeData.effects;
    }

    // Recursively process children
    if ('children' in node && node.children.length > 0) {
      nodeData.children = [];
      for (var c = 0; c < node.children.length; c++) {
        nodeData.children.push(await extractNode(node.children[c], depth + 1));
      }

      // Figma API may return auto-layout children in reverse visual order.
      // Detect by checking if y-values are descending, and reverse if so.
      var layout = nodeData.layoutMode;
      if ((layout === 'VERTICAL' || layout === 'HORIZONTAL') && nodeData.children.length > 1) {
        var posKey = (layout === 'VERTICAL') ? 'y' : 'x';
        var first = nodeData.children[0][posKey];
        var last = nodeData.children[nodeData.children.length - 1][posKey];
        if (typeof first === 'number' && typeof last === 'number' && first > last) {
          nodeData.children.reverse();
        }
      }
    }

    return nodeData;
  }

  // Build component array from all selected frames
  var components = [];
  for (var f = 0; f < selectedFrames.length; f++) {
    components.push(await extractNode(selectedFrames[f], 0));
  }

  // Normalize positions relative to bounding box
  if (components.length > 0) {
    var minX = Infinity, minY = Infinity;
    for (var i = 0; i < components.length; i++) {
      minX = Math.min(minX, components[i].x || 0);
      minY = Math.min(minY, components[i].y || 0);
    }
    // Offset each component's position
    for (var j = 0; j < components.length; j++) {
      components[j].x = (components[j].x || 0) - minX;
      components[j].y = (components[j].y || 0) - minY;
    }
  }

  // Wrap in MANIFEST_ROOT structure
  var manifest = {
    name: "ExportedComponents",
    type: "MANIFEST_ROOT",
    exportedAt: new Date().toISOString(),
    componentCount: components.length,
    components: components
  };

  console.log("=== DUAL EXPORT COMPLETE ===");
  console.log("  Tokens: design-tokens.json format (W3C spec)");
  console.log("  Manifest: " + components.length + " component(s) with token references");

  // Return both tokens and manifest
  return {
    tokens: tokens,
    manifest: manifest
  };
}

// OLD exportDynamic kept as reference - delete after testing
async function _old_exportDynamic_tokens(panel) {
  console.log("=== OLD TOKEN-BASED EXPORT (DEPRECATED) ===");

  // Token value helpers
  function dim(value) { return { "$value": Math.round(value) + "px", "$type": "dimension" }; }
  function col(hex) { return { "$value": hex, "$type": "color" }; }
  function num(value) { return { "$value": String(value), "$type": "number" }; }

  // Initialize empty token structure
  var tokens = {
    colors: {},
    spacing: {},
    radius: {},
    typography: { fontFamily: {}, fontSize: {}, fontWeight: {} },
    components: {
      height: {},
      panel: {},
      toggle: {},
      slider: {},
      dropdown: {},
      input: {},
      colorInput: {},
      button: {},
      section: {},
      controlRow: {},
      separator: {}
    },
    semanticColors: {}
  };

  // =========================================================================
  // STEP 1: READ ALL COLORS FROM FIGMA VARIABLES (ONLY SOURCE)
  // =========================================================================
  console.log("Step 1: Reading colors from Figma Variables...");

  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var hudCollection = null;
  for (var ci = 0; ci < collections.length; ci++) {
    if (collections[ci].name === "HUD Design Tokens") {
      hudCollection = collections[ci];
      break;
    }
  }

  if (!hudCollection) {
    console.error("ERROR: No 'HUD Design Tokens' variable collection found!");
    console.error("Create Figma Variables to define colors, or generate the Component Demo first.");
    figma.notify("No HUD Design Tokens collection found. Generate Component Demo first.");
    return null;
  }

  // Helper to resolve variable value (handles aliases)
  async function resolveVariableValue(variable, modeId) {
    var value = variable.valuesByMode[modeId];

    // If it's an alias to another variable, resolve it
    if (value && value.type === 'VARIABLE_ALIAS') {
      var aliasedVar = await figma.variables.getVariableByIdAsync(value.id);
      if (aliasedVar) {
        console.log("    (alias to " + aliasedVar.name + ")");
        return resolveVariableValue(aliasedVar, modeId);
      }
    }

    return value;
  }

  // Read all color variables
  var variableIds = hudCollection.variableIds;
  for (var vi = 0; vi < variableIds.length; vi++) {
    var variable = await figma.variables.getVariableByIdAsync(variableIds[vi]);
    if (!variable) continue;

    var varName = variable.name;
    var value = await resolveVariableValue(variable, hudCollection.defaultModeId);

    if (variable.resolvedType === "COLOR" && value && typeof value.r === 'number') {
      var hexColor = rgbToHex(value.r, value.g, value.b);
      console.log("  " + varName + " = " + hexColor);

      // Primitive colors (direct name match)
      var primitiveColors = [
        'background', 'backgroundAlt', 'backgroundMuted',
        'foreground', 'foregroundMuted', 'foregroundSubtle',
        'border', 'borderHover', 'borderFocus',
        'primary', 'primaryHover', 'primaryForeground',
        'secondary', 'secondaryHover', 'secondaryForeground',
        'destructive', 'destructiveHover', 'destructiveForeground',
        'accent', 'track', 'trackFilled', 'thumbColor',
        'inputBackground', 'ring', 'selection'
      ];

      // Semantic colors
      var semanticColors = [
        'panelTitle', 'sectionTitle', 'sectionCount', 'sectionChevron',
        'controlLabel', 'controlLabelDisabled', 'controlValue', 'controlPlaceholder',
        'inputText', 'inputTextPlaceholder', 'sliderValue',
        'dropdownText', 'dropdownTextMuted', 'dropdownOptionSelectedText',
        'colorPickerText', 'buttonPrimaryText', 'buttonSecondaryText', 'buttonDestructiveText'
      ];

      if (primitiveColors.indexOf(varName) !== -1) {
        tokens.colors[varName] = col(hexColor);
      } else if (semanticColors.indexOf(varName) !== -1) {
        tokens.semanticColors[varName] = col(hexColor);
      } else if (varName.indexOf('text/') === 0) {
        // Handle text/xxx folder naming -> camelCase
        var semanticName = varName.replace('text/', '');
        tokens.semanticColors[semanticName] = col(hexColor);
      }
    }
  }

  console.log("  Colors loaded: " + Object.keys(tokens.colors).length + " primitive, " + Object.keys(tokens.semanticColors).length + " semantic");

  // =========================================================================
  // STEP 2: EXTRACT DIMENSIONS FROM PANEL NODE (RECURSIVE)
  // =========================================================================
  console.log("Step 2: Extracting dimensions from panel nodes...");

  // Panel dimensions
  tokens.components.panel.width = dim(panel.width);
  tokens.components.panel.height = dim(panel.height);
  tokens.components.panel.cornerRadius = dim(panel.cornerRadius || 0);
  tokens.components.panel.padding = dim(panel.paddingLeft || panel.paddingTop || 16);
  tokens.components.panel.paddingTop = dim(panel.paddingTop || 0);
  tokens.components.panel.paddingBottom = dim(panel.paddingBottom || 0);
  tokens.components.panel.paddingLeft = dim(panel.paddingLeft || 0);
  tokens.components.panel.paddingRight = dim(panel.paddingRight || 0);
  tokens.components.panel.itemSpacing = dim(panel.itemSpacing || 0);
  tokens.components.panel.minHeight = dim(100);
  tokens.components.panel.maxHeight = dim(panel.height);

  // Panel shadow
  if (panel.effects && panel.effects.length > 0) {
    for (var ei = 0; ei < panel.effects.length; ei++) {
      var effect = panel.effects[ei];
      if (effect.type === 'DROP_SHADOW' && effect.visible !== false) {
        tokens.components.panel.shadowOffsetX = dim(effect.offset ? effect.offset.x : 0);
        tokens.components.panel.shadowOffsetY = dim(effect.offset ? effect.offset.y : 0);
        tokens.components.panel.shadowBlur = dim(effect.radius || 0);
        tokens.components.panel.shadowSpread = dim(effect.spread || 0);
        tokens.components.panel.shadowOpacity = num(effect.color ? effect.color.a : 0.5);
        break;
      }
    }
  }

  // Find named components by recursive search
  function findByName(parent, name) {
    return parent.findOne(function(n) { return n.name === name; });
  }
  function findAllByName(parent, name) {
    return parent.findAll(function(n) { return n.name === name; });
  }

  // Title
  var titleNode = panel.findOne(function(n) { return n.type === 'TEXT' && n.characters === 'Component Demo'; });
  if (titleNode) {
    tokens.components.panel.titleHeight = dim(titleNode.height);
    tokens.typography.fontSize.lg = dim(titleNode.fontSize);
  }

  // Separator
  var separator = findByName(panel, 'separator');
  if (separator) {
    tokens.components.separator.height = dim(separator.height);
    tokens.components.separator.marginTop = dim(0);
    tokens.components.separator.marginBottom = dim(0);
  }

  // Toggle
  var toggle = findByName(panel, 'toggle');
  if (toggle) {
    tokens.components.toggle.width = dim(toggle.width);
    tokens.components.toggle.height = dim(toggle.height);
    tokens.components.toggle.cornerRadius = dim(toggle.cornerRadius || 0);
    tokens.components.toggle.trackWidth = dim(toggle.width);
    tokens.components.toggle.trackHeight = dim(toggle.height);
    tokens.components.toggle.trackRadius = dim(toggle.cornerRadius || toggle.height / 2);
    tokens.components.toggle.trackX = dim(0);
    tokens.components.toggle.trackY = dim(0);

    var thumb = findByName(toggle, 'thumb');
    if (thumb) {
      tokens.components.toggle.thumbSize = dim(thumb.width);
      tokens.components.toggle.thumbRadius = dim(thumb.width / 2);
      tokens.components.toggle.thumbX = dim(thumb.x);
      tokens.components.toggle.thumbY = dim(thumb.y);
      tokens.components.toggle.thumbInset = dim((toggle.height - thumb.height) / 2);
    }
  }

  // Slider
  var slider = findByName(panel, 'slider');
  if (slider) {
    tokens.components.slider.containerWidth = dim(slider.width);
    tokens.components.slider.containerHeight = dim(slider.height);

    var track = findByName(slider, 'track');
    if (track) {
      tokens.components.slider.trackWidth = dim(track.width);
      tokens.components.slider.trackHeight = dim(track.height);
      tokens.components.slider.trackRadius = dim(track.cornerRadius || 0);
      tokens.components.slider.trackX = dim(track.x);
      tokens.components.slider.trackY = dim(track.y);
    }

    var filled = findByName(slider, 'filled');
    if (filled) {
      tokens.components.slider.filledHeight = dim(filled.height);
      tokens.components.slider.filledRadius = dim(filled.cornerRadius || 0);
    }

    var sliderThumb = findByName(slider, 'thumb');
    if (sliderThumb) {
      tokens.components.slider.thumbSize = dim(sliderThumb.width);
      tokens.components.slider.thumbRadius = dim(sliderThumb.width / 2);
    }
  }

  // Dropdown
  var dropdown = findByName(panel, 'dropdown');
  if (dropdown) {
    tokens.components.dropdown.width = dim(dropdown.width);
    tokens.components.dropdown.height = dim(dropdown.height);
    tokens.components.dropdown.cornerRadius = dim(dropdown.cornerRadius || 0);
    tokens.components.dropdown.paddingX = dim(dropdown.paddingLeft || 12);
    tokens.components.dropdown.paddingLeft = dim(dropdown.paddingLeft || 0);
    tokens.components.dropdown.paddingRight = dim(dropdown.paddingRight || 0);
    tokens.components.dropdown.paddingTop = dim(dropdown.paddingTop || 0);
    tokens.components.dropdown.paddingBottom = dim(dropdown.paddingBottom || 0);
    tokens.components.dropdown.itemSpacing = dim(dropdown.itemSpacing || 0);
    tokens.components.dropdown.gap = dim(4);

    var chevron = dropdown.findOne(function(n) { return n.name === 'chevron' || n.name === 'icon'; });
    if (chevron) {
      tokens.components.dropdown.chevronSize = dim(chevron.width);
      tokens.components.dropdown.chevronX = dim(chevron.x);
      tokens.components.dropdown.chevronY = dim(chevron.y);
      tokens.components.dropdown.chevronOffsetRight = dim(dropdown.width - chevron.x - chevron.width);
    }
  }

  // Input
  var input = findByName(panel, 'input');
  if (input) {
    tokens.components.input.width = dim(input.width);
    tokens.components.input.height = dim(input.height);
    tokens.components.input.cornerRadius = dim(input.cornerRadius || 0);
    tokens.components.input.paddingLeft = dim(input.paddingLeft || 0);
    tokens.components.input.paddingRight = dim(input.paddingRight || 0);
    tokens.components.input.paddingX = dim(input.paddingLeft || 12);
    tokens.components.input.selectionInsetY = dim(4);
    tokens.components.input.cursorInsetY = dim(6);
    tokens.components.input.clipMargin = dim(2);
    tokens.components.input.scrollThreshold = dim(20);
  }

  // Color input
  var colorInput = findByName(panel, 'color-input');
  if (colorInput) {
    tokens.components.colorInput.width = dim(colorInput.width);
    tokens.components.colorInput.height = dim(colorInput.height);
    tokens.components.colorInput.cornerRadius = dim(colorInput.cornerRadius || 0);
    tokens.components.colorInput.paddingLeft = dim(colorInput.paddingLeft || 0);
    tokens.components.colorInput.paddingRight = dim(colorInput.paddingRight || 0);
    tokens.components.colorInput.itemSpacing = dim(colorInput.itemSpacing || 0);
    tokens.components.colorInput.expandedHeight = dim(160);
    tokens.components.colorInput.hueBarHeight = dim(12);
    tokens.components.colorInput.hueBarGap = dim(8);

    var swatch = findByName(colorInput, 'swatch');
    if (swatch) {
      tokens.components.colorInput.swatchSize = dim(swatch.width);
      tokens.components.colorInput.swatchRadius = dim(swatch.cornerRadius || swatch.width / 2);
    }
  }

  // Button - search by name or find by type pattern
  var button = findByName(panel, 'button') || findByName(panel, 'primary-button') || findByName(panel, 'Primary Action');
  if (!button) {
    // Find any tall rounded rectangle that looks like a button
    button = panel.findOne(function(n) {
      return n.type === 'FRAME' && n.height >= 32 && n.height <= 48 && n.width >= 100 && n.cornerRadius >= 10;
    });
  }
  if (button) {
    tokens.components.button.width = dim(button.width);
    tokens.components.button.height = dim(button.height);
    tokens.components.button.cornerRadius = dim(button.cornerRadius || 0);
    tokens.components.button.paddingLeft = dim(button.paddingLeft || 0);
    tokens.components.button.paddingRight = dim(button.paddingRight || 0);
    tokens.components.button.chevronSize = dim(5);
  } else {
    // Required defaults if no button found
    tokens.components.button.width = dim(272);
    tokens.components.button.height = dim(36);
    tokens.components.button.cornerRadius = dim(18);
    tokens.components.button.paddingLeft = dim(0);
    tokens.components.button.paddingRight = dim(0);
    tokens.components.button.chevronSize = dim(5);
  }

  // Section header
  var sectionHeader = findByName(panel, 'section-header');
  if (sectionHeader) {
    tokens.components.section.height = dim(sectionHeader.height);
    tokens.components.section.paddingLeft = dim(sectionHeader.paddingLeft || 0);
    tokens.components.section.itemSpacing = dim(sectionHeader.itemSpacing || 8);

    var sectionChevron = findByName(sectionHeader, 'chevron');
    if (sectionChevron) {
      tokens.components.section.chevronSize = dim(sectionChevron.width);
      tokens.components.section.chevronX = dim(sectionChevron.x);
      tokens.components.section.chevronY = dim(sectionChevron.y);
    }
    tokens.components.section.titleOffset = dim(8);
    tokens.components.section.countSpacing = dim(6);
  } else {
    // Required defaults if no section header found
    tokens.components.section.height = dim(16);
    tokens.components.section.paddingLeft = dim(0);
    tokens.components.section.itemSpacing = dim(8);
    tokens.components.section.chevronSize = dim(5);
    tokens.components.section.chevronX = dim(0);
    tokens.components.section.chevronY = dim(7);
    tokens.components.section.titleOffset = dim(8);
    tokens.components.section.countSpacing = dim(6);
  }

  // Control row (label + control)
  var controlRows = panel.findAll(function(n) { return n.name === 'control-row' && n.type === 'FRAME'; });
  if (controlRows.length > 0) {
    var row = controlRows[0];
    tokens.components.controlRow.height = dim(row.height);
    tokens.components.controlRow.itemSpacing = dim(row.itemSpacing || 0);
    tokens.components.controlRow.paddingLeft = dim(row.paddingLeft || 0);

    var label = row.findOne(function(n) { return n.type === 'TEXT'; });
    if (label) {
      tokens.components.controlRow.labelWidth = dim(label.width);
    } else {
      tokens.components.controlRow.labelWidth = dim(70);
    }
    tokens.components.controlRow.valueWidth = dim(40);
  } else {
    // Required defaults if no control row found
    tokens.components.controlRow.height = dim(36);
    tokens.components.controlRow.itemSpacing = dim(0);
    tokens.components.controlRow.paddingLeft = dim(0);
    tokens.components.controlRow.labelWidth = dim(70);
    tokens.components.controlRow.valueWidth = dim(40);
  }

  // Typography from text nodes
  var allText = panel.findAll(function(n) { return n.type === 'TEXT'; });
  var fontSizes = {};
  for (var ti = 0; ti < allText.length; ti++) {
    var txt = allText[ti];
    var size = txt.fontSize;
    fontSizes[size] = (fontSizes[size] || 0) + 1;
    if (!tokens.typography.fontFamily.sans && txt.fontName) {
      tokens.typography.fontFamily.sans = { "$value": txt.fontName.family + ", system-ui, sans-serif", "$type": "fontFamily" };
    }
  }

  // Assign font sizes
  var sizes = Object.keys(fontSizes).map(Number).sort(function(a, b) { return a - b; });
  if (sizes.length >= 1) tokens.typography.fontSize.xs = dim(sizes[0]);
  if (sizes.length >= 2) tokens.typography.fontSize.sm = dim(sizes[1]);
  if (sizes.length >= 3) tokens.typography.fontSize.base = dim(sizes[2]);
  if (sizes.length >= 4) tokens.typography.fontSize.lg = dim(sizes[3]);

  // Font weights
  tokens.typography.fontWeight.normal = { "$value": "400", "$type": "fontWeight" };
  tokens.typography.fontWeight.medium = { "$value": "500", "$type": "fontWeight" };
  tokens.typography.fontWeight.semibold = { "$value": "600", "$type": "fontWeight" };

  // Spacing (derive from common values)
  tokens.spacing.xs = dim(6);
  tokens.spacing.sm = dim(8);
  tokens.spacing.md = dim(12);
  tokens.spacing.lg = dim(16);
  tokens.spacing.xl = dim(24);

  // Radius
  tokens.radius.sm = dim(4);
  tokens.radius.md = dim(12);
  tokens.radius.lg = dim(14);
  tokens.radius.xl = dim(18);
  tokens.radius.full = dim(9999);

  // Component heights
  tokens.components.height.xs = dim(16);
  tokens.components.height.sm = dim(24);
  tokens.components.height.md = dim(28);
  tokens.components.height.lg = dim(36);
  tokens.components.height.xl = dim(64);

  console.log("=== EXPORT COMPLETE ===");
  return tokens;
}

// exportDynamic function above is the ONLY export function - no deprecated versions


// =============================================================================
// LEGACY COMPLETE ELEMENT TRAVERSAL EXPORT
// =============================================================================
// This function does EXPLICIT traversal of ALL elements in the Component Demo
// panel and extracts EVERY property. No role-based guessing - just raw extraction.

async function exportFromComponentDemo(panel, originalManifest) {
  console.log("Starting COMPLETE element traversal export...");

  // Helper to extract fill color from a node
  function getFillColor(node) {
    if (node && node.fills && node.fills.length > 0 && node.fills[0].type === 'SOLID') {
      return rgbToHex(node.fills[0].color.r, node.fills[0].color.g, node.fills[0].color.b);
    }
    return null;
  }

  // Helper to extract stroke color
  function getStrokeColor(node) {
    if (node && node.strokes && node.strokes.length > 0 && node.strokes[0].type === 'SOLID') {
      return rgbToHex(node.strokes[0].color.r, node.strokes[0].color.g, node.strokes[0].color.b);
    }
    return null;
  }

  // Helper to extract font info from text node
  function getFontInfo(textNode) {
    if (!textNode || textNode.type !== 'TEXT') return null;
    var fontName = textNode.fontName;
    return {
      family: fontName ? fontName.family : 'Inter',
      style: fontName ? fontName.style : 'Regular',
      size: textNode.fontSize,
      weight: fontName && fontName.style ? getFontWeight(fontName.style) : 400
    };
  }

  function getFontWeight(style) {
    var weights = {
      'Thin': 100, 'ExtraLight': 200, 'Light': 300, 'Regular': 400,
      'Medium': 500, 'SemiBold': 600, 'Semi Bold': 600, 'Bold': 700,
      'ExtraBold': 800, 'Black': 900
    };
    return weights[style] || 400;
  }

  // Helper to create token value
  function dim(value) { return { "$value": Math.round(value) + "px", "$type": "dimension" }; }
  function col(value) { return { "$value": value, "$type": "color" }; }
  function num(value) { return { "$value": String(value), "$type": "number" }; }

  // Deep clone helper for preserving manifest structure
  function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClone);
    var clone = {};
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        clone[key] = deepClone(obj[key]);
      }
    }
    return clone;
  }

  // Start with manifest tokens as base (preserves spacing, radius, and unextractable colors)
  var manifestTokens = null;
  if (originalManifest && originalManifest.tokens) {
    manifestTokens = deepClone(originalManifest.tokens);
    console.log("Using original manifest as base - preserving spacing, radius, and complete color palette");
  }

  // =============================================================================
  // DEFAULT TOKENS - These MUST always be present for bidirectional sync
  // =============================================================================
  var DEFAULT_TOKENS = {
    colors: {
      background: col("#111113"),
      backgroundAlt: col("#18181b"),
      backgroundMuted: col("#27272a"),
      foreground: col("#fafafa"),
      foregroundMuted: col("#a1a1aa"),
      foregroundSubtle: col("#71717a"),
      border: col("#27272a"),
      borderHover: col("#3f3f46"),
      borderFocus: col("#52525b"),
      primary: col("#6590ff"),
      primaryHover: col("#4a7aff"),
      primaryForeground: col("#000000"),
      secondary: col("#27272a"),
      secondaryHover: col("#3f3f46"),
      secondaryForeground: col("#fafafa"),
      destructive: col("#ef4444"),
      destructiveHover: col("#dc2626"),
      destructiveForeground: col("#fafafa"),
      accent: col("#6590ff"),
      track: col("#27272a"),
      trackFilled: col("#6590ff"),
      thumbColor: col("#ffffff"),
      inputBackground: col("#27272a"),
      ring: col("#6590ff"),
      selection: { "$value": "rgba(101, 144, 255, 0.2)", "$type": "color" }
    },
    spacing: {
      xs: dim(4),
      sm: dim(8),
      md: dim(12),
      lg: dim(16),
      xl: dim(24)
    },
    radius: {
      sm: dim(4),
      md: dim(6),
      lg: dim(8),
      xl: dim(12),
      full: dim(9999)
    },
    typography: {
      fontFamily: {
        sans: { "$value": "Inter, system-ui, sans-serif", "$type": "fontFamily" }
      },
      fontSize: {
        xs: dim(11),
        sm: dim(13),
        base: dim(14),
        lg: dim(16)
      },
      fontWeight: {
        normal: { "$value": "400", "$type": "fontWeight" },
        medium: { "$value": "500", "$type": "fontWeight" },
        semibold: { "$value": "600", "$type": "fontWeight" }
      }
    },
    components: {
      height: {
        xs: dim(24),
        sm: dim(28),
        md: dim(32),
        lg: dim(40),
        xl: dim(48)
      },
      panel: {},
      toggle: {},
      slider: {},
      dropdown: {
        gap: dim(4)  // Gap between trigger and dropdown menu
      },
      input: {
        selectionInsetY: dim(4),   // Vertical inset for text selection highlight
        cursorInsetY: dim(6),      // Vertical inset for text cursor
        clipMargin: dim(2),        // Extra margin for text clipping
        scrollThreshold: dim(20)   // Threshold for horizontal scroll trigger
      },
      colorInput: {
        expandedHeight: dim(160),  // Height of expanded color picker panel
        hueBarHeight: dim(12),     // Height of hue gradient bar
        hueBarGap: dim(8)          // Gap between color square and hue bar
      },
      button: {
        chevronSize: dim(5)        // Size of button chevron icon
      },
      section: {
        titleOffset: dim(8),   // Gap after chevron before title
        countSpacing: dim(6)   // Gap between title and count
      },
      controlRow: {
        labelWidth: dim(70),   // Width of label column
        valueWidth: dim(40)    // Width of value column (e.g. slider value text)
      },
      separator: {}
    }
  };

  // Build token structure - start from DEFAULTS, then merge manifest, then extract from Figma
  var tokens = deepClone(DEFAULT_TOKENS);

  // Merge manifest tokens on top of defaults (manifest overrides defaults)
  if (manifestTokens) {
    console.log("Merging manifest tokens on top of defaults");
    for (var category in manifestTokens) {
      if (typeof manifestTokens[category] === 'object') {
        tokens[category] = tokens[category] || {};
        for (var key in manifestTokens[category]) {
          tokens[category][key] = manifestTokens[category][key];
        }
      }
    }
  }

  // Ensure component sub-objects exist
  tokens.components = tokens.components || {};
  tokens.components.panel = tokens.components.panel || {};
  tokens.components.toggle = tokens.components.toggle || {};
  tokens.components.slider = tokens.components.slider || {};
  tokens.components.dropdown = tokens.components.dropdown || {};
  tokens.components.input = tokens.components.input || {};
  tokens.components.colorInput = tokens.components.colorInput || {};
  tokens.components.button = tokens.components.button || {};
  tokens.components.section = tokens.components.section || {};
  tokens.components.controlRow = tokens.components.controlRow || {};
  tokens.components.separator = tokens.components.separator || {};

  // =============================================================================
  // 1. PANEL - Extract ALL properties
  // =============================================================================
  console.log("Extracting panel properties...");

  var panelBg = getFillColor(panel);
  if (panelBg) {
    tokens.colors.backgroundAlt = col(panelBg);
    // Derive darker background
    tokens.colors.background = col(darkenHex(panelBg, 0.3));
  }

  tokens.components.panel = {
    width: dim(panel.width),
    height: dim(panel.height),
    minHeight: dim(Math.min(panel.height, 100)), // Use smaller of actual height or 100
    maxHeight: dim(Math.max(panel.height, 600)), // Use larger of actual height or 600
    cornerRadius: dim(panel.cornerRadius || 0),
    padding: dim(panel.paddingTop || panel.paddingLeft || 16), // General padding
    paddingTop: dim(panel.paddingTop || 0),
    paddingBottom: dim(panel.paddingBottom || 0),
    paddingLeft: dim(panel.paddingLeft || 0),
    paddingRight: dim(panel.paddingRight || 0),
    itemSpacing: dim(panel.itemSpacing || 0)
  };

  // Panel shadow
  if (panel.effects && panel.effects.length > 0) {
    for (var e = 0; e < panel.effects.length; e++) {
      var effect = panel.effects[e];
      if (effect.type === 'DROP_SHADOW' && effect.visible !== false) {
        tokens.components.panel.shadowOffsetX = dim(effect.offset ? effect.offset.x : 0);
        tokens.components.panel.shadowOffsetY = dim(effect.offset ? effect.offset.y : 0);
        tokens.components.panel.shadowBlur = dim(effect.radius || 0);
        tokens.components.panel.shadowSpread = dim(effect.spread || 0);
        tokens.components.panel.shadowOpacity = num(effect.color ? effect.color.a : 0.5);
        break;
      }
    }
  }

  // =============================================================================
  // 2. ALL TEXT NODES - Extract typography
  // =============================================================================
  console.log("Extracting text nodes...");

  var allTexts = panel.findAll(function(n) { return n.type === 'TEXT'; });
  var collectedSizes = [];

  for (var ti = 0; ti < allTexts.length; ti++) {
    var txt = allTexts[ti];
    var txtColor = getFillColor(txt);
    var fontInfo = getFontInfo(txt);

    if (fontInfo) {
      collectedSizes.push(fontInfo.size);

      // Set font family (first one found)
      if (!tokens.typography.fontFamily.sans) {
        tokens.typography.fontFamily.sans = { "$value": fontInfo.family + ", system-ui, sans-serif", "$type": "fontFamily" };
      }
    }

    // Extract specific text by content/role
    var parentName = txt.parent ? txt.parent.name : '';

    // Panel title - largest text, foreground color, and extract actual height
    if (txt.characters === 'Component Demo') {
      tokens.colors.foreground = col(txtColor);
      tokens.typography.fontSize.lg = dim(txt.fontSize);
      if (fontInfo) {
        tokens.typography.fontWeight.semibold = { "$value": String(fontInfo.weight), "$type": "fontWeight" };
      }
      // Extract actual title height from the text node
      if (txt.height) {
        tokens.components.panel.titleHeight = dim(txt.height);
      }
    }
    // Section headers
    else if (parentName === 'Section Header') {
      tokens.typography.fontSize.base = dim(txt.fontSize);
      if (fontInfo && fontInfo.weight >= 500) {
        tokens.typography.fontWeight.medium = { "$value": String(fontInfo.weight), "$type": "fontWeight" };
      }
    }
    // Control labels (inside control rows like "toggle: Enable Feature")
    else if (parentName.startsWith('toggle: ') || parentName.startsWith('slider: ') ||
             parentName.startsWith('dropdown: ') || parentName.startsWith('input: ') ||
             parentName.startsWith('colorInput: ')) {
      // First text in control row is the label
      if (txt === txt.parent.children[0]) {
        tokens.typography.fontSize.sm = dim(txt.fontSize);
        if (txtColor) {
          tokens.colors.foregroundMuted = col(txtColor);
        }
        if (fontInfo) {
          tokens.typography.fontWeight.normal = { "$value": String(fontInfo.weight), "$type": "fontWeight" };
        }
      }
    }
  }

  // Derive xs font size from collected sizes (smallest)
  if (collectedSizes.length > 0) {
    var uniqueSizes = [];
    for (var si = 0; si < collectedSizes.length; si++) {
      if (uniqueSizes.indexOf(collectedSizes[si]) === -1) {
        uniqueSizes.push(collectedSizes[si]);
      }
    }
    uniqueSizes.sort(function(a, b) { return a - b; });
    if (uniqueSizes.length > 0 && !tokens.typography.fontSize.xs) {
      tokens.typography.fontSize.xs = dim(uniqueSizes[0]);
    }
  }

  // =============================================================================
  // 3. ALL TOGGLES - Extract EVERY property
  // =============================================================================
  // Expected structure (from createDemoToggle):
  //   toggle (frame, 44x24, no layout) - MUST be named "toggle"
  //     ├── track (rectangle, 44x24, cornerRadius=12) - MUST be named "track"
  //     └── thumb (ellipse, 18x18) - MUST be named "thumb"

  var allToggles = panel.findAll(function(n) { return n.name === 'toggle' && n.type === 'FRAME'; });

  if (allToggles.length > 0) {
    var firstToggle = allToggles[0];
    tokens.components.toggle.width = dim(firstToggle.width);
    tokens.components.toggle.height = dim(firstToggle.height);
    tokens.components.toggle.cornerRadius = dim(firstToggle.cornerRadius || 0);

    var toggleTrack = firstToggle.findOne(function(n) { return n.name === 'track'; });
    var toggleThumb = firstToggle.findOne(function(n) { return n.name === 'thumb'; });

    if (toggleTrack) {
      tokens.components.toggle.trackWidth = dim(toggleTrack.width);
      tokens.components.toggle.trackHeight = dim(toggleTrack.height);
      tokens.components.toggle.trackRadius = dim(toggleTrack.cornerRadius || 0);
      tokens.components.toggle.trackX = dim(toggleTrack.x);
      tokens.components.toggle.trackY = dim(toggleTrack.y);
    }

    if (toggleThumb) {
      tokens.components.toggle.thumbSize = dim(toggleThumb.width);
      tokens.components.toggle.thumbRadius = dim(toggleThumb.cornerRadius || toggleThumb.width / 2);
      tokens.components.toggle.thumbX = dim(toggleThumb.x);
      tokens.components.toggle.thumbY = dim(toggleThumb.y);
      // thumbInset is the horizontal padding from track edge to thumb edge
      // Calculate as: thumb.x - track.x (left inset when thumb is at left position)
      // or use thumb.y if track starts at y=0 (vertical centering inset)
      var trackX = toggleTrack ? toggleTrack.x : 0;
      var thumbInset = toggleThumb.x - trackX;
      // If thumb is on right side (ON state), calculate from the other side
      if (thumbInset > firstToggle.width / 2) {
        thumbInset = firstToggle.width - toggleThumb.x - toggleThumb.width;
      }
      tokens.components.toggle.thumbInset = dim(Math.max(0, thumbInset));
    }

    // Extract colors from ON and OFF states
    for (var ti = 0; ti < allToggles.length; ti++) {
      var tog = allToggles[ti];
      var track = tog.findOne(function(n) { return n.name === 'track'; });
      var thumb = tog.findOne(function(n) { return n.name === 'thumb'; });

      if (track && thumb) {
        var trackColor = getFillColor(track);
        var isOn = thumb.x > tog.width / 2;

        if (isOn && trackColor) {
          // ON state toggle color maps to trackFilled token
          tokens.colors.trackFilled = col(trackColor);
        } else if (!isOn && trackColor) {
          // OFF state toggle color maps to track token
          tokens.colors.track = col(trackColor);
        }

        // Extract thumb color
        var thumbColor = getFillColor(thumb);
        if (thumbColor) {
          tokens.colors.thumbColor = col(thumbColor);
        }
      }
    }
  }

  // =============================================================================
  // 4. ALL SLIDERS - Extract EVERY property
  // =============================================================================
  // Expected structure (from createDemoSlider):
  //   slider-group (frame, horizontal layout)
  //     └── slider (frame, 140x16, no layout) - MUST be named "slider"
  //           ├── track (rectangle, 140x8) - MUST be named "track"
  //           ├── filled (rectangle, variable width x 8) - MUST be named "filled"
  //           └── thumb (ellipse, 16x16) - MUST be named "thumb"
  //     └── value label (text)

  var allSliders = panel.findAll(function(n) { return n.name === 'slider' && n.type === 'FRAME'; });

  if (allSliders.length > 0) {
    var firstSlider = allSliders[0];
    tokens.components.slider.containerWidth = dim(firstSlider.width);
    tokens.components.slider.containerHeight = dim(firstSlider.height);

    // Find child nodes by name
    var sliderTrack = firstSlider.findOne(function(n) { return n.name === 'track'; });
    var sliderThumb = firstSlider.findOne(function(n) { return n.name === 'thumb'; });
    var sliderFilled = firstSlider.findOne(function(n) { return n.name === 'filled'; });

    if (sliderTrack) {
      tokens.components.slider.trackWidth = dim(sliderTrack.width);
      tokens.components.slider.trackHeight = dim(sliderTrack.height);
      tokens.components.slider.trackRadius = dim(sliderTrack.cornerRadius || 0);
      tokens.components.slider.trackX = dim(sliderTrack.x);
      tokens.components.slider.trackY = dim(sliderTrack.y);

      var trackBg = getFillColor(sliderTrack);
      if (trackBg) {
        tokens.colors.track = col(trackBg);
      }
    }

    if (sliderThumb) {
      tokens.components.slider.thumbSize = dim(sliderThumb.width);
      // Ellipses don't have cornerRadius, use width/2 for circular thumbs
      var thumbRadius = sliderThumb.type === 'ELLIPSE' ? sliderThumb.width / 2 : (sliderThumb.cornerRadius || sliderThumb.width / 2);
      tokens.components.slider.thumbRadius = dim(thumbRadius);

      var thumbColor = getFillColor(sliderThumb);
      if (thumbColor) {
        tokens.colors.thumbColor = col(thumbColor);
      }
    }

    if (sliderFilled) {
      tokens.components.slider.filledHeight = dim(sliderFilled.height);
      tokens.components.slider.filledRadius = dim(sliderFilled.cornerRadius || 0);

      var filledColor = getFillColor(sliderFilled);
      if (filledColor) {
        // Slider filled portion uses trackFilled token (same as ON toggle)
        tokens.colors.trackFilled = col(filledColor);
      }
    }

    // Extract track background color
    if (sliderTrack) {
      var sliderTrackColor = getFillColor(sliderTrack);
      if (sliderTrackColor) {
        tokens.colors.track = col(sliderTrackColor);
      }
    }
  }

  // =============================================================================
  // 5. DROPDOWN - Extract ALL properties
  // =============================================================================
  // Expected structure (from createDemoDropdown):
  //   dropdown (frame, pill-shaped, horizontal layout) - MUST be named "dropdown"
  //     ├── text (selected option label)
  //     └── chevron (vector, 5x2.5) - MUST be named "chevron"

  var dropdown = panel.findOne(function(n) { return n.name === 'dropdown' && n.type === 'FRAME'; });
  if (dropdown) {
    tokens.components.dropdown.width = dim(dropdown.width);
    tokens.components.dropdown.height = dim(dropdown.height);
    tokens.components.dropdown.cornerRadius = dim(dropdown.cornerRadius || 0);
    tokens.components.dropdown.paddingX = dim(dropdown.paddingLeft || 12); // For DesignTokens compatibility
    tokens.components.dropdown.paddingLeft = dim(dropdown.paddingLeft || 0);
    tokens.components.dropdown.paddingRight = dim(dropdown.paddingRight || 0);
    tokens.components.dropdown.paddingTop = dim(dropdown.paddingTop || 0);
    tokens.components.dropdown.paddingBottom = dim(dropdown.paddingBottom || 0);
    tokens.components.dropdown.itemSpacing = dim(dropdown.itemSpacing || 0);

    var dropdownBg = getFillColor(dropdown);
    if (dropdownBg) {
      tokens.colors.inputBackground = col(dropdownBg);
    }

    // Get chevron - extract size AND position
    var chevron = dropdown.findOne(function(n) { return n.name === 'chevron' || n.name === 'icon'; });
    if (chevron) {
      tokens.components.dropdown.chevronSize = dim(chevron.width);
      tokens.components.dropdown.chevronX = dim(chevron.x);
      tokens.components.dropdown.chevronY = dim(chevron.y);
      // Calculate chevron offset from right edge (useful for positioning)
      tokens.components.dropdown.chevronOffsetRight = dim(dropdown.width - chevron.x - chevron.width);
    }
  }

  // =============================================================================
  // 6. INPUT - Extract ALL properties
  // =============================================================================
  // Expected structure (from createDemoInput):
  //   input (frame, pill-shaped, horizontal layout) - MUST be named "input"
  //     └── text (input value)

  var input = panel.findOne(function(n) { return n.name === 'input' && n.type === 'FRAME'; });
  if (input) {
    tokens.components.input.width = dim(input.width);
    tokens.components.input.height = dim(input.height);
    tokens.components.input.cornerRadius = dim(input.cornerRadius || 0);
    tokens.components.input.paddingLeft = dim(input.paddingLeft || 0);
    tokens.components.input.paddingRight = dim(input.paddingRight || 0);
    tokens.components.input.paddingX = dim(input.paddingLeft || 0);

    var inputBg = getFillColor(input);
    if (inputBg) {
      tokens.colors.inputBackground = col(inputBg);
    }
  }

  // =============================================================================
  // 7. COLOR INPUT - Extract ALL properties
  // =============================================================================
  // Expected structure (from createDemoColorInput):
  //   color-input (frame, pill-shaped) - MUST be named "color-input"
  //     ├── swatch (ellipse, 18x18) - MUST be named "swatch"
  //     └── text (hex value)

  var allColorInputs = panel.findAll(function(n) { return n.name === 'color-input' && n.type === 'FRAME'; });

  if (allColorInputs.length > 0) {
    var colorInput = allColorInputs[0];
    tokens.components.colorInput.width = dim(colorInput.width);
    tokens.components.colorInput.height = dim(colorInput.height);
    tokens.components.colorInput.cornerRadius = dim(colorInput.cornerRadius || 0);
    tokens.components.colorInput.paddingLeft = dim(colorInput.paddingLeft || 0);
    tokens.components.colorInput.paddingRight = dim(colorInput.paddingRight || 0);
    tokens.components.colorInput.itemSpacing = dim(colorInput.itemSpacing || 0);

    var swatch = colorInput.findOne(function(n) { return n.name === 'swatch'; });
    if (swatch) {
      tokens.components.colorInput.swatchSize = dim(swatch.width);
      // Ellipses don't have cornerRadius, use width/2 for circular swatches
      var swatchRadius = swatch.type === 'ELLIPSE' ? swatch.width / 2 : (swatch.cornerRadius || 0);
      tokens.components.colorInput.swatchRadius = dim(swatchRadius);

      // Extract the swatch fill color as the accent color
      var swatchColor = getFillColor(swatch);
      if (swatchColor) {
        tokens.colors.accent = col(swatchColor);
        console.log("Extracted accent color from swatch: " + swatchColor);
      }
    }
  }

  // Also extract accent colors from ALL colorInput swatches (in case there are multiple)
  for (var ci = 0; ci < allColorInputs.length; ci++) {
    var ciFrame = allColorInputs[ci];
    var ciSwatch = ciFrame.findOne(function(n) { return n.name === 'swatch'; });
    if (ciSwatch) {
      var ciSwatchColor = getFillColor(ciSwatch);
      // Get the parent control row to determine the label
      var parentRow = ciFrame.parent;
      if (parentRow && parentRow.name && parentRow.name.startsWith('colorInput: ')) {
        var colorLabel = parentRow.name.replace('colorInput: ', '').toLowerCase();
        console.log("ColorInput '" + colorLabel + "' has swatch color: " + ciSwatchColor);
        // Map common color labels to token names
        if (colorLabel === 'accent' && ciSwatchColor) {
          tokens.colors.accent = col(ciSwatchColor);
        }
      }
    }
  }

  // =============================================================================
  // 8. ALL BUTTONS - Extract ALL properties
  // =============================================================================
  // Expected structure (from createDemoButton):
  //   button: {Label} (frame, pill-shaped) - MUST start with "button: "
  //     └── text (button label)

  // Button names are "button: Label" (with space after colon)
  var allButtons = panel.findAll(function(n) { return n.name && n.name.startsWith('button: ') && n.type === 'FRAME'; });

  if (allButtons.length > 0) {
    var firstBtn = allButtons[0];
    tokens.components.button.width = dim(firstBtn.width);
    tokens.components.button.height = dim(firstBtn.height);
    tokens.components.button.cornerRadius = dim(firstBtn.cornerRadius || 0);
    tokens.components.button.paddingLeft = dim(firstBtn.paddingLeft || 0);
    tokens.components.button.paddingRight = dim(firstBtn.paddingRight || 0);

    // Extract chevron/icon if present in button
    var btnChevron = firstBtn.findOne(function(n) { return n.name === 'chevron' || n.name === 'icon' || n.name === 'caret'; });
    if (btnChevron) {
      tokens.components.button.chevronSize = dim(btnChevron.width);
      tokens.components.button.chevronX = dim(btnChevron.x);
      tokens.components.button.chevronY = dim(btnChevron.y);
      tokens.components.button.chevronOffsetRight = dim(firstBtn.width - btnChevron.x - btnChevron.width);
    }
  }

  // Extract button colors by type
  for (var bi = 0; bi < allButtons.length; bi++) {
    var btn = allButtons[bi];
    var btnColor = getFillColor(btn);

    if (btnColor) {
      if (btn.name.includes('Primary')) {
        tokens.colors.primary = col(btnColor);
      } else if (btn.name.includes('Delete') || btn.name.includes('destructive')) {
        tokens.colors.destructive = col(btnColor);
      } else if (btn.name.includes('Secondary')) {
        tokens.colors.secondary = col(btnColor);
      }
    }
  }

  // =============================================================================
  // 9. SECTION HEADERS / COLLAPSIBLES
  // =============================================================================
  // Expected structure (from createCollapsibleSection):
  //   Section Header (frame) - MUST be named "Section Header"
  //     ├── chevron (vector, chevron icon)
  //     └── text (section title)

  var sections = panel.findAll(function(n) { return n.name === 'Section Header' && n.type === 'FRAME'; });
  if (sections.length > 0) {
    var firstSection = sections[0];
    tokens.components.section.height = dim(firstSection.height);
    tokens.components.section.paddingLeft = dim(firstSection.paddingLeft || 0);
    tokens.components.section.itemSpacing = dim(firstSection.itemSpacing || 0);

    // Extract chevron for collapsible sections
    var sectionChevron = firstSection.findOne(function(n) { return n.name === 'chevron' || n.name === 'icon' || n.name === 'caret'; });
    if (sectionChevron) {
      tokens.components.section.chevronSize = dim(sectionChevron.width);
      tokens.components.section.chevronX = dim(sectionChevron.x);
      tokens.components.section.chevronY = dim(sectionChevron.y);
    }
  }

  // =============================================================================
  // 10. CONTROL ROWS
  // =============================================================================
  // Expected structure (from createDemoControl):
  //   {type}: {Label} (frame, horizontal layout) - MUST match "{type}: " pattern
  //     ├── label text
  //     └── control widget (toggle/slider/dropdown/input/colorInput)

  // Control row names are "type: label" (with space after colon)
  var controlRows = panel.findAll(function(n) {
    return n.type === 'FRAME' && n.name && (
      n.name.startsWith('toggle: ') ||
      n.name.startsWith('slider: ') ||
      n.name.startsWith('dropdown: ') ||
      n.name.startsWith('input: ') ||
      n.name.startsWith('colorInput: ')
    );
  });

  if (controlRows.length > 0) {
    var firstRow = controlRows[0];
    tokens.components.controlRow.height = dim(firstRow.height);
    tokens.components.controlRow.itemSpacing = dim(firstRow.itemSpacing || 0);
    tokens.components.controlRow.paddingLeft = dim(firstRow.paddingLeft || 0);
  }

  // =============================================================================
  // 11. SEPARATOR
  // =============================================================================
  var separator = panel.findOne(function(n) { return n.name === 'separator'; });
  if (separator) {
    var sepColor = getFillColor(separator);
    if (sepColor) {
      tokens.colors.border = col(sepColor);
    }
    // Create dedicated separator component tokens
    tokens.components.separator = {
      height: dim(separator.height),
      marginTop: dim(0),
      marginBottom: dim(0)
    };
  }

  // =============================================================================
  // READ FIGMA VARIABLES - Override colors from the HUD Design Tokens collection
  // =============================================================================
  // If the user edited variable values in Figma, use those instead of extracted fills
  try {
    var collections = await figma.variables.getLocalVariableCollectionsAsync();
    var hudCollection = null;

    for (var i = 0; i < collections.length; i++) {
      if (collections[i].name === "HUD Design Tokens") {
        hudCollection = collections[i];
        break;
      }
    }

    if (hudCollection) {
      console.log("=== EXPORT v2: Found HUD Design Tokens collection ===");
      figma.notify("Export v2: Reading variables...");
      var variableIds = hudCollection.variableIds;
      var colorCount = 0;
      var floatCount = 0;

      for (var j = 0; j < variableIds.length; j++) {
        var variable = await figma.variables.getVariableByIdAsync(variableIds[j]);
        if (!variable) continue;

        var value = variable.valuesByMode[hudCollection.defaultModeId];
        var varName = variable.name;

        // Handle COLOR variables - ALL are direct values (no aliases)
        if (variable.resolvedType === "COLOR" && value && typeof value.r === 'number') {
          var hexColor = rgbToHex(value.r, value.g, value.b);
          console.log("Processing COLOR variable: " + varName + " = " + hexColor);

          // Semantic text variable names (used for text colors in components)
          // These map to semantic-styles.json keys
          var semanticTextVars = {
            'input': 'inputText',
            'inputPlaceholder': 'inputTextPlaceholder',
            'sliderValue': 'sliderValue',
            'dropdown': 'dropdownText',
            'dropdownMuted': 'dropdownTextMuted',
            'dropdownOptionSelected': 'dropdownOptionSelectedText',
            'colorPicker': 'colorPickerText',
            'panelTitle': 'panelTitle',
            'sectionTitle': 'sectionTitle',
            'sectionCount': 'sectionCount',
            'sectionChevron': 'sectionChevron',
            'controlLabel': 'controlLabel',
            'controlLabelDisabled': 'controlLabelDisabled',
            'controlValue': 'controlValue',
            'controlPlaceholder': 'controlPlaceholder',
            'buttonPrimary': 'buttonPrimaryText',
            'buttonSecondary': 'buttonSecondaryText',
            'buttonDestructive': 'buttonDestructiveText'
          };

          // Check if this is a semantic text variable (with or without text/ prefix)
          var nameWithoutPrefix = varName.replace('text/', '');
          console.log("  nameWithoutPrefix: " + nameWithoutPrefix + ", matches semanticTextVars: " + (semanticTextVars[nameWithoutPrefix] ? "YES -> " + semanticTextVars[nameWithoutPrefix] : "NO"));
          if (semanticTextVars[nameWithoutPrefix]) {
            tokens.semanticColors = tokens.semanticColors || {};
            var semanticKey = semanticTextVars[nameWithoutPrefix];
            tokens.semanticColors[semanticKey] = col(hexColor);
            console.log("  Added to semanticColors: " + semanticKey + " = " + hexColor);
            colorCount++;
          } else if (varName.indexOf('text/') === 0) {
            // Fallback for any text/ prefixed vars not in mapping
            tokens.semanticColors = tokens.semanticColors || {};
            tokens.semanticColors[nameWithoutPrefix] = col(hexColor);
            colorCount++;
          } else {
            // Primitive color variable - goes to colors section
            tokens.colors[varName] = col(hexColor);
            colorCount++;
          }
        }

        // Handle FLOAT variables (spacing, typography, radius, component heights)
        if (variable.resolvedType === "FLOAT" && typeof value === 'number') {
          console.log("Variable " + varName + " = " + value);

          // Spacing variables (spacing-xs, spacing-sm, etc.)
          if (varName.indexOf('spacing-') === 0) {
            var spacingKey = varName.replace('spacing-', '');
            tokens.spacing[spacingKey] = dim(value);
            floatCount++;
          }

          // Typography fontSize variables (fontSize-xs, fontSize-sm, etc.)
          else if (varName.indexOf('fontSize-') === 0) {
            var fontKey = varName.replace('fontSize-', '');
            tokens.typography = tokens.typography || { fontSize: {} };
            tokens.typography.fontSize = tokens.typography.fontSize || {};
            tokens.typography.fontSize[fontKey] = dim(value);
            floatCount++;
          }

          // Radius variables (radius-sm, radius-md, etc.)
          else if (varName.indexOf('radius-') === 0) {
            var radiusKey = varName.replace('radius-', '');
            tokens.radius[radiusKey] = dim(value);
            floatCount++;
          }

          // Component height variables (height-xs, height-sm, etc.)
          else if (varName.indexOf('height-') === 0) {
            var heightKey = varName.replace('height-', '');
            tokens.components = tokens.components || { height: {} };
            tokens.components.height = tokens.components.height || {};
            tokens.components.height[heightKey] = dim(value);
            floatCount++;
          }
        }
      }
      console.log("Updated " + colorCount + " colors and " + floatCount + " FLOAT values from Figma Variables");
      if (tokens.semanticColors) {
        console.log("semanticColors exported: " + Object.keys(tokens.semanticColors).join(", "));
      } else {
        console.log("WARNING: No semanticColors in export!");
      }
    } else {
      console.log("No HUD Design Tokens collection found - using extracted fill colors");
    }
  } catch (varError) {
    console.log("Could not read Figma Variables (may not be supported): " + varError);
  }

  // =============================================================================
  // FINAL: Return flat token structure for DesignTokens.js compatibility
  // =============================================================================
  // DesignTokens.js expects tokens at root level (colors, spacing, etc.)
  // NOT wrapped in { tokens: {...} } structure

  console.log("Export complete. Extracted " + Object.keys(tokens.colors).length + " colors, " +
              Object.keys(tokens.components).length + " component types.");
  if (tokens.semanticColors) {
    console.log("Final semanticColors: " + JSON.stringify(tokens.semanticColors));
  }

  // Return flat structure - this is what design-tokens.json should contain
  return tokens;
}

// Legacy export from HUD Design System frame (backwards compatibility)
function exportFromHUDDesignSystem(mainFrame) {
  // Helper functions
  function dim(value) { return { "$value": Math.round(value) + "px", "$type": "dimension" }; }
  function col(value) { return { "$value": value, "$type": "color" }; }

  // Start with complete defaults for bidirectional sync
  var tokens = {
    colors: {
      background: col("#111113"),
      backgroundAlt: col("#18181b"),
      backgroundMuted: col("#27272a"),
      foreground: col("#fafafa"),
      foregroundMuted: col("#a1a1aa"),
      foregroundSubtle: col("#71717a"),
      border: col("#27272a"),
      borderHover: col("#3f3f46"),
      borderFocus: col("#52525b"),
      primary: col("#6590ff"),
      primaryHover: col("#4a7aff"),
      primaryForeground: col("#000000"),
      secondary: col("#27272a"),
      secondaryHover: col("#3f3f46"),
      secondaryForeground: col("#fafafa"),
      destructive: col("#ef4444"),
      destructiveHover: col("#dc2626"),
      destructiveForeground: col("#fafafa"),
      accent: col("#6590ff"),
      track: col("#27272a"),
      trackFilled: col("#6590ff"),
      thumbColor: col("#ffffff"),
      inputBackground: col("#27272a"),
      ring: col("#6590ff"),
      selection: { "$value": "rgba(101, 144, 255, 0.2)", "$type": "color" }
    },
    spacing: {
      xs: dim(4),
      sm: dim(8),
      md: dim(12),
      lg: dim(16),
      xl: dim(24)
    },
    radius: {
      sm: dim(4),
      md: dim(6),
      lg: dim(8),
      xl: dim(12),
      full: dim(9999)
    },
    typography: {
      fontFamily: {
        sans: { "$value": "Inter, system-ui, sans-serif", "$type": "fontFamily" }
      },
      fontSize: {
        xs: dim(11),
        sm: dim(13),
        base: dim(14),
        lg: dim(16)
      },
      fontWeight: {
        normal: { "$value": "400", "$type": "fontWeight" },
        medium: { "$value": "500", "$type": "fontWeight" },
        semibold: { "$value": "600", "$type": "fontWeight" }
      },
      lineHeight: {}
    },
    components: {
      height: {
        xs: dim(24),
        sm: dim(28),
        md: dim(32),
        lg: dim(40),
        xl: dim(48)
      },
      panel: {}
    }
  };

  // Extract colors
  var colorSwatches = mainFrame.findAll(function(node) { return node.name.startsWith('color/'); });
  for (var i = 0; i < colorSwatches.length; i++) {
    var swatch = colorSwatches[i];
    var colorName = swatch.name.replace('color/', '');
    var rect = swatch.findOne(function(node) { return node.type === 'RECTANGLE'; });
    if (rect && rect.fills && rect.fills.length > 0) {
      var fill = rect.fills[0];
      if (fill.type === 'SOLID') {
        tokens.colors[colorName] = {
          "$value": rgbToHex(fill.color.r, fill.color.g, fill.color.b),
          "$type": "color"
        };
      }
    }
  }

  // Extract spacing
  var spacingItems = mainFrame.findAll(function(node) { return node.name.startsWith('spacing/'); });
  for (var i = 0; i < spacingItems.length; i++) {
    var item = spacingItems[i];
    var spacingName = item.name.replace('spacing/', '');
    var bar = item.findOne(function(node) { return node.type === 'RECTANGLE'; });
    if (bar) {
      tokens.spacing[spacingName] = {
        "$value": Math.round(bar.width) + "px",
        "$type": "dimension"
      };
    }
  }

  // Extract radius
  var radiusItems = mainFrame.findAll(function(node) { return node.name.startsWith('radius/'); });
  for (var i = 0; i < radiusItems.length; i++) {
    var item = radiusItems[i];
    var radiusName = item.name.replace('radius/', '');
    var rect = item.findOne(function(node) { return node.type === 'RECTANGLE'; });
    if (rect) {
      var radiusValue = typeof rect.cornerRadius === 'number' ? rect.cornerRadius : 0;
      tokens.radius[radiusName] = {
        "$value": Math.round(radiusValue) + "px",
        "$type": "dimension"
      };
    }
  }

  // Extract font sizes
  var fontSizeItems = mainFrame.findAll(function(node) { return node.name.startsWith('fontSize/'); });
  for (var i = 0; i < fontSizeItems.length; i++) {
    var item = fontSizeItems[i];
    var sizeName = item.name.replace('fontSize/', '');
    var textNode = item.findOne(function(node) { return node.type === 'TEXT'; });
    if (textNode) {
      tokens.typography.fontSize[sizeName] = {
        "$value": Math.round(textNode.fontSize) + "px",
        "$type": "dimension"
      };
    }
  }

  // Extract component heights
  var heightItems = mainFrame.findAll(function(node) { return node.name.startsWith('height/'); });
  for (var i = 0; i < heightItems.length; i++) {
    var item = heightItems[i];
    var heightName = item.name.replace('height/', '');
    var rect = item.findOne(function(node) { return node.type === 'RECTANGLE'; });
    if (rect) {
      tokens.components.height[heightName] = {
        "$value": Math.round(rect.height) + "px",
        "$type": "dimension"
      };
    }
  }

  return tokens;
}

// ============================================
// GENERATE COMPONENT DEMO PANEL
// ============================================

async function generateComponentDemo(manifestData) {
  await loadFonts();

  var manifest = typeof manifestData === 'string' ? JSON.parse(manifestData) : manifestData;
  var tokens = manifest.tokens;
  var sections = manifest.sections.componentDemo || [];

  // Extract colors from tokens
  var colors = {};
  for (var key in tokens.colors) {
    if (tokens.colors[key] && tokens.colors[key].$value) {
      colors[key] = tokens.colors[key].$value;
    }
  }

  // Defaults - ensure all colors used by components are defined
  colors.background = colors.background || '#09090b';
  colors.backgroundAlt = colors.backgroundAlt || '#18181b';
  colors.backgroundMuted = colors.backgroundMuted || '#27272a';
  colors.foreground = colors.foreground || '#fafafa';
  colors.foregroundMuted = colors.foregroundMuted || '#a1a1aa';
  colors.foregroundSubtle = colors.foregroundSubtle || '#71717a';
  colors.primary = colors.primary || '#6590ff';
  colors.primaryHover = colors.primaryHover || '#4a7aff';
  colors.primaryForeground = colors.primaryForeground || '#000000';
  colors.secondary = colors.secondary || '#27272a';
  colors.secondaryHover = colors.secondaryHover || '#3f3f46';
  colors.secondaryForeground = colors.secondaryForeground || '#fafafa';
  colors.destructive = colors.destructive || '#ef4444';
  colors.destructiveHover = colors.destructiveHover || '#dc2626';
  colors.destructiveForeground = colors.destructiveForeground || '#fafafa';
  colors.border = colors.border || '#27272a';
  colors.borderHover = colors.borderHover || '#3f3f46';
  colors.borderFocus = colors.borderFocus || '#52525b';
  colors.accent = colors.accent || colors.primary || '#6590ff';
  colors.track = colors.track || '#27272a';
  colors.trackFilled = colors.trackFilled || '#6590ff';
  colors.thumbColor = colors.thumbColor || '#ffffff';
  colors.inputBackground = colors.inputBackground || '#27272a';
  colors.ring = colors.ring || '#6590ff';

  // Extract component dimensions from manifest.controls (primary source)
  var componentTokens = {};

  // Read from manifest.controls first (the manifest structure uses plain numbers)
  if (manifest.controls) {
    for (var compKey in manifest.controls) {
      if (typeof manifest.controls[compKey] === 'object') {
        componentTokens[compKey] = {};
        for (var propKey in manifest.controls[compKey]) {
          componentTokens[compKey][propKey] = manifest.controls[compKey][propKey];
        }
      }
    }
  }

  // Override with tokens.components if present (W3C format from design-tokens.json)
  if (tokens.components) {
    for (var compKey in tokens.components) {
      componentTokens[compKey] = componentTokens[compKey] || {};
      var comp = tokens.components[compKey];
      for (var propKey in comp) {
        var val = comp[propKey];
        if (val && val.$value !== undefined) {
          var numVal = val.$value;
          if (typeof numVal === 'string' && numVal.endsWith('px')) {
            numVal = parseInt(numVal, 10);
          }
          componentTokens[compKey][propKey] = numVal;
        } else if (typeof val === 'number') {
          componentTokens[compKey][propKey] = val;
        }
      }
    }
  }

  // Set defaults only if not already set
  componentTokens.slider = componentTokens.slider || {};
  componentTokens.slider.containerWidth = componentTokens.slider.containerWidth || 140;
  componentTokens.slider.containerHeight = componentTokens.slider.containerHeight || 16;
  componentTokens.slider.trackHeight = componentTokens.slider.trackHeight || 8;
  componentTokens.slider.trackRadius = componentTokens.slider.trackRadius || 4;
  componentTokens.slider.thumbSize = componentTokens.slider.thumbSize || 16;

  componentTokens.toggle = componentTokens.toggle || {};
  componentTokens.toggle.width = componentTokens.toggle.width || 44;
  componentTokens.toggle.height = componentTokens.toggle.height || 24;
  componentTokens.toggle.trackRadius = componentTokens.toggle.trackRadius || 12;
  componentTokens.toggle.thumbSize = componentTokens.toggle.thumbSize || 18;
  componentTokens.toggle.thumbInset = componentTokens.toggle.thumbInset || 3;

  componentTokens.colorInput = componentTokens.colorInput || {};
  componentTokens.colorInput.swatchSize = componentTokens.colorInput.swatchSize || 18;

  var panelWidth = manifest.panel.width || 320;
  var padding = manifest.panel.padding || 16;
  var contentWidth = panelWidth - (padding * 2);

  // Create Figma Variables collection and all variables
  var collection = await getOrCreateTokenCollection();
  var variables = await createColorVariables(collection, colors);

  // Create semantic text variables with DIRECT color values (not aliases)
  // This ensures consistent export - all variables export as direct values
  var textVars = await createSemanticTextVariables(collection, variables, colors);
  variables.text = textVars;

  // Extract spacing tokens from manifest
  var spacing = {};
  if (tokens.spacing) {
    for (var spKey in tokens.spacing) {
      var spVal = tokens.spacing[spKey];
      if (spVal && spVal.$value !== undefined) {
        spacing[spKey] = spVal.$value;
      }
    }
  }
  var spacingVars = await createSpacingVariables(collection, spacing);
  variables.spacing = spacingVars;

  // Extract typography tokens from manifest
  var typography = { fontSize: {} };
  if (tokens.typography && tokens.typography.fontSize) {
    for (var tyKey in tokens.typography.fontSize) {
      var tyVal = tokens.typography.fontSize[tyKey];
      if (tyVal && tyVal.$value !== undefined) {
        typography.fontSize[tyKey] = tyVal.$value;
      }
    }
  }
  var typographyVars = await createTypographyVariables(collection, typography);
  variables.typography = typographyVars;

  // Add typography to componentTokens so it's available in control creation functions
  componentTokens.typography = { fontSize: {} };
  if (typography.fontSize) {
    for (var fKey in typography.fontSize) {
      var fVal = typography.fontSize[fKey];
      // Convert "13px" to 13
      if (typeof fVal === 'string' && fVal.endsWith('px')) {
        componentTokens.typography.fontSize[fKey] = parseInt(fVal, 10);
      } else if (typeof fVal === 'number') {
        componentTokens.typography.fontSize[fKey] = fVal;
      }
    }
  }
  // Set defaults for fontSize
  componentTokens.typography.fontSize.sm = componentTokens.typography.fontSize.sm || 13;
  componentTokens.typography.fontSize.xs = componentTokens.typography.fontSize.xs || 11;
  componentTokens.typography.fontSize.base = componentTokens.typography.fontSize.base || 12;
  componentTokens.typography.fontSize.lg = componentTokens.typography.fontSize.lg || 16;

  // Extract radius tokens from manifest
  var radius = {};
  if (tokens.radius) {
    for (var radKey in tokens.radius) {
      var radVal = tokens.radius[radKey];
      if (radVal && radVal.$value !== undefined) {
        radius[radKey] = radVal.$value;
      }
    }
  }
  var radiusVars = await createRadiusVariables(collection, radius);
  variables.radius = radiusVars;

  // Extract component height tokens
  var componentHeights = { height: {} };
  if (tokens.components && tokens.components.height) {
    for (var hKey in tokens.components.height) {
      var hVal = tokens.components.height[hKey];
      if (hVal && hVal.$value !== undefined) {
        componentHeights.height[hKey] = hVal.$value;
      }
    }
  }
  var componentVars = await createComponentVariables(collection, componentHeights);
  variables.components = componentVars;

  // Create main panel
  var panel = figma.createFrame();
  panel.name = "Component Demo";
  panel.resize(panelWidth, 600);
  // Use backgroundAlt for panel so it stands out from canvas background - bind to variable
  panel.fills = [createBoundFill(colors.backgroundAlt, variables.backgroundAlt)];
  panel.cornerRadius = manifest.panel.cornerRadius || 12;
  panel.layoutMode = "VERTICAL";
  panel.primaryAxisSizingMode = "AUTO";
  panel.counterAxisSizingMode = "FIXED";
  panel.paddingTop = padding;
  panel.paddingBottom = padding;
  panel.paddingLeft = padding;
  panel.paddingRight = padding;
  panel.itemSpacing = 16;

  // Bind spacing variables to panel padding (lg = 16px)
  if (variables.spacing && variables.spacing.lg) {
    bindFloatVariable(panel, 'paddingTop', variables.spacing.lg);
    bindFloatVariable(panel, 'paddingBottom', variables.spacing.lg);
    bindFloatVariable(panel, 'paddingLeft', variables.spacing.lg);
    bindFloatVariable(panel, 'paddingRight', variables.spacing.lg);
    bindFloatVariable(panel, 'itemSpacing', variables.spacing.lg);
  }

  // Bind radius variable to panel cornerRadius (xl = 12px)
  if (variables.radius && variables.radius.xl) {
    bindFloatVariable(panel, 'topLeftRadius', variables.radius.xl);
    bindFloatVariable(panel, 'topRightRadius', variables.radius.xl);
    bindFloatVariable(panel, 'bottomLeftRadius', variables.radius.xl);
    bindFloatVariable(panel, 'bottomRightRadius', variables.radius.xl);
  }

  // Get panel shadow tokens - ensure all values are numbers
  var panelTokens = componentTokens && componentTokens.panel ? componentTokens.panel : {};
  var shadowOffsetX = Number(panelTokens.shadowOffsetX) || 0;
  var shadowOffsetY = Number(panelTokens.shadowOffsetY) || 8;
  var shadowBlur = Number(panelTokens.shadowBlur) || 24;
  var shadowSpread = Number(panelTokens.shadowSpread) || 0;
  var shadowOpacity = Number(panelTokens.shadowOpacity) || 0.5;

  // Add shadow using panel tokens
  panel.effects = [{
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: shadowOpacity },
    offset: { x: shadowOffsetX, y: shadowOffsetY },
    radius: shadowBlur,
    spread: shadowSpread,
    visible: true,
    blendMode: 'NORMAL'
  }];

  // Panel title - bind to semantic text/panelTitle variable
  var title = await createText("Component Demo", 0, 0, 16, "SemiBold", colors.foreground, variables.text.panelTitle || variables.foreground);
  panel.appendChild(title);

  // Separator - use separator tokens and bind to border variable
  var separatorTokens = componentTokens && componentTokens.separator ? componentTokens.separator : {};
  var separatorHeight = separatorTokens.height !== undefined ? separatorTokens.height : 1;
  var sep = figma.createRectangle();
  sep.name = "separator";
  sep.resize(contentWidth, separatorHeight);
  sep.fills = [createBoundFill(colors.border, variables.border)];
  panel.appendChild(sep);

  // Create each section - pass componentTokens and variables along
  for (var i = 0; i < sections.length; i++) {
    var sectionDef = sections[i];
    var sectionFrame = await createDemoSection(sectionDef, colors, contentWidth, componentTokens, variables);
    panel.appendChild(sectionFrame);
  }

  figma.viewport.scrollAndZoomIntoView([panel]);
  figma.currentPage.selection = [panel];

  return panel;
}

async function createDemoSection(sectionDef, colors, contentWidth, componentTokens, variables) {
  // Get section dimensions from tokens
  var sectionTokens = componentTokens && componentTokens.section ? componentTokens.section : {};
  var sectionItemSpacing = sectionTokens.itemSpacing !== undefined ? sectionTokens.itemSpacing : 8;
  var sectionPaddingLeft = sectionTokens.paddingLeft !== undefined ? sectionTokens.paddingLeft : 0;

  var sectionFrame = figma.createFrame();
  sectionFrame.name = "Section: " + sectionDef.name;
  sectionFrame.fills = [];
  sectionFrame.layoutMode = "VERTICAL";
  sectionFrame.primaryAxisSizingMode = "AUTO";
  sectionFrame.counterAxisSizingMode = "AUTO";
  sectionFrame.itemSpacing = 12; // Spacing between header and controls

  // Bind spacing variable to section itemSpacing (md = 12px)
  if (variables.spacing && variables.spacing.md) {
    bindFloatVariable(sectionFrame, 'itemSpacing', variables.spacing.md);
  }

  // Section header
  var headerFrame = figma.createFrame();
  headerFrame.name = "Section Header";
  headerFrame.fills = [];
  headerFrame.layoutMode = "HORIZONTAL";
  headerFrame.primaryAxisSizingMode = "AUTO";
  headerFrame.counterAxisSizingMode = "AUTO";
  headerFrame.counterAxisAlignItems = "CENTER";
  headerFrame.itemSpacing = sectionItemSpacing;
  headerFrame.paddingLeft = sectionPaddingLeft;

  // Bind spacing variable to header itemSpacing (sm = 8px)
  if (variables.spacing && variables.spacing.sm) {
    bindFloatVariable(headerFrame, 'itemSpacing', variables.spacing.sm);
  }

  // Section chevron - from Collapsible.js: this.chevronSize = 10
  // CanvasRenderer.chevron() with size=10: quarter=2.5
  // The ACTUAL drawn path is much smaller than 10x10:
  // 'down': width=5px (quarter*2), height=2.5px (quarter)
  // 'right': width=2.5px (quarter), height=5px (quarter*2)
  // Path starts at (0,0) for simplicity
  var chevronVector = figma.createVector();
  chevronVector.name = "chevron";
  if (sectionDef.collapsed) {
    // Points right: 2.5px wide × 5px tall
    chevronVector.vectorPaths = [{
      windingRule: "NONZERO",
      data: "M 0 0 L 2.5 2.5 L 0 5"
    }];
  } else {
    // Points down (expanded): 5px wide × 2.5px tall
    chevronVector.vectorPaths = [{
      windingRule: "NONZERO",
      data: "M 0 0 L 2.5 2.5 L 5 0"
    }];
  }
  // Bind chevron stroke to semantic text/sectionChevron variable
  chevronVector.strokes = [createBoundStroke(colors.foregroundMuted, variables.text.sectionChevron || variables.foregroundMuted)];
  chevronVector.strokeWeight = 1.5;
  chevronVector.strokeCap = "ROUND";
  chevronVector.strokeJoin = "ROUND";
  chevronVector.fills = [];
  headerFrame.appendChild(chevronVector);

  // Section title - use fontSize.sm from tokens (default 13px), bind to semantic text/sectionTitle variable
  var fontSizeSm = componentTokens && componentTokens.typography && componentTokens.typography.fontSize && componentTokens.typography.fontSize.sm !== undefined ? componentTokens.typography.fontSize.sm : 13;
  var sectionTitle = await createText(sectionDef.name, 0, 0, fontSizeSm, "Medium", colors.foreground, variables.text.sectionTitle || variables.foreground);
  headerFrame.appendChild(sectionTitle);

  // Control count - use fontSize.xs from tokens (default 11px, but tokens have 12), bind to semantic text/sectionCount variable
  var fontSizeXs = componentTokens && componentTokens.typography && componentTokens.typography.fontSize && componentTokens.typography.fontSize.xs !== undefined ? componentTokens.typography.fontSize.xs : 11;
  var countText = await createText("(" + sectionDef.controls.length + ")", 0, 0, fontSizeXs, "Regular", colors.foregroundMuted, variables.text.sectionCount || variables.foregroundMuted);
  headerFrame.appendChild(countText);

  sectionFrame.appendChild(headerFrame);

  // Controls container - show if not explicitly collapsed
  // Use explicit check since collapsed might be undefined
  var isCollapsed = sectionDef.collapsed === true;
  console.log("Section:", sectionDef.name, "isCollapsed:", isCollapsed, "will show controls:", !isCollapsed);
  if (!isCollapsed) {
    console.log("Creating controls frame for", sectionDef.name);
    var controlsFrame = figma.createFrame();
    controlsFrame.name = "Controls";
    controlsFrame.fills = [];
    controlsFrame.layoutMode = "VERTICAL";
    controlsFrame.primaryAxisSizingMode = "AUTO";
    controlsFrame.counterAxisSizingMode = "AUTO";
    controlsFrame.itemSpacing = 12;
    controlsFrame.paddingLeft = 16;

    // Bind spacing variables to controls frame (md = 12px for gap, lg = 16px for padding)
    if (variables.spacing && variables.spacing.md) {
      bindFloatVariable(controlsFrame, 'itemSpacing', variables.spacing.md);
    }
    if (variables.spacing && variables.spacing.lg) {
      bindFloatVariable(controlsFrame, 'paddingLeft', variables.spacing.lg);
    }

    for (var i = 0; i < sectionDef.controls.length; i++) {
      var controlDef = sectionDef.controls[i];
      var controlFrame = await createDemoControl(controlDef, colors, contentWidth - 16, componentTokens, variables);
      controlsFrame.appendChild(controlFrame);
    }

    sectionFrame.appendChild(controlsFrame);
  }

  return sectionFrame;
}

async function createDemoControl(controlDef, colors, width, componentTokens, variables) {
  var controlType = controlDef.type;

  // Full-width buttons get special treatment
  if (controlType === 'button' && controlDef.fullWidth) {
    return await createDemoButton(controlDef, colors, width, componentTokens, variables);
  }

  // Get control row dimensions from tokens
  var controlRowTokens = componentTokens && componentTokens.controlRow ? componentTokens.controlRow : {};
  var controlRowHeight = controlRowTokens.height !== undefined ? controlRowTokens.height : 36;
  var controlRowItemSpacing = controlRowTokens.itemSpacing !== undefined ? controlRowTokens.itemSpacing : 0;
  var controlRowPaddingLeft = controlRowTokens.paddingLeft !== undefined ? controlRowTokens.paddingLeft : 0;

  // Standard row layout for other controls
  var row = figma.createFrame();
  row.name = controlType + ": " + controlDef.label;
  row.fills = [];
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "AUTO";
  row.resize(width, controlRowHeight);
  row.counterAxisAlignItems = "CENTER";
  row.primaryAxisAlignItems = "SPACE_BETWEEN";
  row.itemSpacing = controlRowItemSpacing;
  row.paddingLeft = controlRowPaddingLeft;

  // Label - use fontSize.sm from tokens (default 13px), bind to semantic text/controlLabel variable
  var fontSizeSm = componentTokens && componentTokens.typography && componentTokens.typography.fontSize && componentTokens.typography.fontSize.sm !== undefined ? componentTokens.typography.fontSize.sm : 13;
  var label = await createText(controlDef.label, 0, 0, fontSizeSm, "Regular", colors.foregroundMuted, variables.text.controlLabel || variables.foregroundMuted);
  row.appendChild(label);

  // Component widths come from their specific tokens, NOT calculated from row width
  // Browser components use fixed widths right-aligned within the row
  var dropdownWidth = componentTokens && componentTokens.dropdown && componentTokens.dropdown.width !== undefined ? componentTokens.dropdown.width : 202;
  var inputWidth = componentTokens && componentTokens.input && componentTokens.input.width !== undefined ? componentTokens.input.width : 89;
  var colorInputWidth = componentTokens && componentTokens.colorInput && componentTokens.colorInput.width !== undefined ? componentTokens.colorInput.width : 96;

  // Control widget - pass componentTokens and variables to each control type
  if (controlType === 'toggle') {
    var toggle = await createDemoToggle(controlDef, colors, componentTokens, variables);
    row.appendChild(toggle);
  }
  else if (controlType === 'slider') {
    var sliderGroup = await createDemoSlider(controlDef, colors, componentTokens, variables);
    row.appendChild(sliderGroup);
  }
  else if (controlType === 'dropdown') {
    var dropdown = await createDemoDropdown(controlDef, colors, dropdownWidth, componentTokens, variables);
    row.appendChild(dropdown);
  }
  else if (controlType === 'input') {
    var input = await createDemoInput(controlDef, colors, inputWidth, componentTokens, variables);
    row.appendChild(input);
  }
  else if (controlType === 'colorInput') {
    var colorInput = await createDemoColorInput(controlDef, colors, colorInputWidth, componentTokens, variables);
    row.appendChild(colorInput);
  }

  return row;
}

async function createDemoToggle(controlDef, colors, componentTokens, variables) {
  var isOn = controlDef.default === true;

  // Get dimensions from component tokens (with fallbacks)
  var toggleTokens = componentTokens && componentTokens.toggle ? componentTokens.toggle : {};
  var TOGGLE_WIDTH = toggleTokens.width !== undefined ? toggleTokens.width : 44;
  var TOGGLE_HEIGHT = toggleTokens.height !== undefined ? toggleTokens.height : 24;
  var TRACK_WIDTH = toggleTokens.trackWidth !== undefined ? toggleTokens.trackWidth : TOGGLE_WIDTH;
  var TRACK_HEIGHT = toggleTokens.trackHeight !== undefined ? toggleTokens.trackHeight : TOGGLE_HEIGHT;
  var TRACK_RADIUS = toggleTokens.trackRadius !== undefined ? toggleTokens.trackRadius : 12;
  var TRACK_X = toggleTokens.trackX !== undefined ? toggleTokens.trackX : 0;
  var TRACK_Y = toggleTokens.trackY !== undefined ? toggleTokens.trackY : 0;
  var THUMB_SIZE = toggleTokens.thumbSize !== undefined ? toggleTokens.thumbSize : 18;
  var THUMB_INSET = toggleTokens.thumbInset !== undefined ? toggleTokens.thumbInset : 3;
  var THUMB_Y = toggleTokens.thumbY !== undefined ? toggleTokens.thumbY : THUMB_INSET;

  // Toggle container - must be named "toggle" for export to find it
  var toggle = figma.createFrame();
  toggle.name = "toggle";
  toggle.resize(TOGGLE_WIDTH, TOGGLE_HEIGHT);
  toggle.fills = [];
  toggle.layoutMode = "NONE";
  toggle.clipsContent = false;

  // Track - must be named "track" for export
  // Bind to trackFilled (ON state) or track (OFF state) variable
  var track = figma.createRectangle();
  track.name = "track";
  track.resize(TRACK_WIDTH, TRACK_HEIGHT);
  track.x = TRACK_X;
  track.y = TRACK_Y;
  track.cornerRadius = TRACK_RADIUS;
  if (isOn) {
    // ON state - bind to trackFilled variable (accent/primary color)
    track.fills = [createBoundFill(colors.trackFilled || colors.primary, variables.trackFilled || variables.primary)];
  } else {
    // OFF state - bind to track variable (muted background)
    track.fills = [createBoundFill(colors.track || colors.backgroundMuted, variables.track || variables.backgroundMuted)];
  }
  toggle.appendChild(track);

  // Thumb - must be named "thumb" for export (ELLIPSE type)
  // Bind to thumbColor variable
  var thumb = figma.createEllipse();
  thumb.name = "thumb";
  thumb.resize(THUMB_SIZE, THUMB_SIZE);
  // Use thumbX from tokens if ON state, otherwise calculate from inset
  thumb.x = isOn ? (TOGGLE_WIDTH - THUMB_SIZE - THUMB_INSET) : THUMB_INSET;
  thumb.y = THUMB_Y;
  thumb.fills = [createBoundFill(colors.thumbColor || '#ffffff', variables.thumbColor)];
  toggle.appendChild(thumb);

  return toggle;
}

async function createDemoSlider(controlDef, colors, componentTokens, variables) {
  var progress = controlDef.default !== undefined ? controlDef.default : 50;
  var min = controlDef.min !== undefined ? controlDef.min : 0;
  var max = controlDef.max !== undefined ? controlDef.max : 100;
  var percent = (progress - min) / (max - min);

  // Get dimensions from component tokens (with fallbacks)
  var sliderTokens = componentTokens && componentTokens.slider ? componentTokens.slider : {};
  var SLIDER_WIDTH = sliderTokens.containerWidth !== undefined ? sliderTokens.containerWidth : 140;
  var SLIDER_HEIGHT = sliderTokens.containerHeight !== undefined ? sliderTokens.containerHeight : 16;
  var TRACK_HEIGHT = sliderTokens.trackHeight !== undefined ? sliderTokens.trackHeight : 8;
  var TRACK_RADIUS = sliderTokens.trackRadius !== undefined ? sliderTokens.trackRadius : 4;
  var THUMB_SIZE = sliderTokens.thumbSize !== undefined ? sliderTokens.thumbSize : 8;
  var TRACK_X = sliderTokens.trackX !== undefined ? sliderTokens.trackX : 0;
  var TRACK_Y = sliderTokens.trackY !== undefined ? sliderTokens.trackY : (SLIDER_HEIGHT - TRACK_HEIGHT) / 2;

  // Slider group (horizontal layout with slider + value)
  var group = figma.createFrame();
  group.name = "slider-group";
  group.fills = [];
  group.layoutMode = "HORIZONTAL";
  group.primaryAxisSizingMode = "AUTO";
  group.counterAxisSizingMode = "AUTO";
  group.counterAxisAlignItems = "CENTER";
  group.itemSpacing = 12;

  // Slider container - must be named "slider" for export to find it
  var sliderFrame = figma.createFrame();
  sliderFrame.name = "slider";
  sliderFrame.fills = [];
  sliderFrame.resize(SLIDER_WIDTH, SLIDER_HEIGHT);
  sliderFrame.layoutMode = "NONE";
  sliderFrame.clipsContent = false; // Ensure children are visible

  // Track background - must be named "track" for export
  // Bind to track variable (muted background)
  var track = figma.createRectangle();
  track.name = "track";
  track.resize(SLIDER_WIDTH, TRACK_HEIGHT);
  track.x = TRACK_X;
  track.y = TRACK_Y;
  track.cornerRadius = TRACK_RADIUS;
  track.fills = [createBoundFill(colors.track || colors.backgroundMuted, variables.track || variables.backgroundMuted)];
  sliderFrame.appendChild(track);

  // Filled portion - must be named "filled" for export
  // Bind to trackFilled variable (accent/primary color)
  var fillWidth = Math.max(THUMB_SIZE / 2, percent * SLIDER_WIDTH);
  var filled = figma.createRectangle();
  filled.name = "filled";
  filled.resize(fillWidth, TRACK_HEIGHT);
  filled.x = TRACK_X;
  filled.y = TRACK_Y;
  filled.cornerRadius = TRACK_RADIUS;
  filled.fills = [createBoundFill(colors.trackFilled || colors.primary, variables.trackFilled || variables.primary)];
  sliderFrame.appendChild(filled);

  // Thumb - must be named "thumb" for export (ELLIPSE type)
  // Bind to thumbColor variable
  // Position: thumb CENTER should be at the end of fillWidth
  // In Figma, x/y is the top-left corner, so we subtract half thumb size
  var thumb = figma.createEllipse();
  thumb.name = "thumb";
  thumb.resize(THUMB_SIZE, THUMB_SIZE);
  // Horizontal: thumb center at fillWidth, so left edge at fillWidth - THUMB_SIZE/2
  // Clamp to keep thumb fully within track bounds
  thumb.x = Math.max(0, Math.min(fillWidth - THUMB_SIZE / 2, SLIDER_WIDTH - THUMB_SIZE));
  // Vertical: center thumb on track (track is centered in container)
  thumb.y = TRACK_Y + (TRACK_HEIGHT - THUMB_SIZE) / 2;
  thumb.fills = [createBoundFill(colors.thumbColor || '#ffffff', variables.thumbColor)];
  sliderFrame.appendChild(thumb);

  group.appendChild(sliderFrame);

  // Value label - use fontSize.sm from tokens, bind to semantic text/sliderValue variable
  var fontSizeSm = componentTokens && componentTokens.typography && componentTokens.typography.fontSize && componentTokens.typography.fontSize.sm !== undefined ? componentTokens.typography.fontSize.sm : 13;
  var valueStr = String(progress) + (controlDef.suffix || '');
  var valueLabel = await createText(valueStr, 0, 0, fontSizeSm, "Regular", colors.foreground, variables.text.sliderValue || variables.foreground);
  group.appendChild(valueLabel);

  return group;
}

async function createDemoDropdown(controlDef, colors, pillWidth, componentTokens, variables) {
  // EXPORT EXPECTS: frame named "dropdown" with child "chevron" (vector)
  // Get dimensions from component tokens
  var dropdownTokens = componentTokens && componentTokens.dropdown ? componentTokens.dropdown : {};
  var dropdownHeight = dropdownTokens.height || 28;
  var dropdownCornerRadius = dropdownTokens.cornerRadius !== undefined ? dropdownTokens.cornerRadius : dropdownHeight / 2;
  var dropdownPaddingLeft = dropdownTokens.paddingLeft !== undefined ? dropdownTokens.paddingLeft : 12;
  var dropdownPaddingRight = dropdownTokens.paddingRight !== undefined ? dropdownTokens.paddingRight : 12;
  var dropdownItemSpacing = dropdownTokens.itemSpacing !== undefined ? dropdownTokens.itemSpacing : 8;

  var dropdown = figma.createFrame();
  dropdown.name = "dropdown"; // REQUIRED for export
  // Bind to inputBackground or backgroundMuted variable
  dropdown.fills = [createBoundFill(colors.inputBackground || colors.backgroundMuted, variables.inputBackground || variables.backgroundMuted)];
  dropdown.resize(pillWidth, dropdownHeight);
  dropdown.cornerRadius = dropdownCornerRadius;
  dropdown.layoutMode = "HORIZONTAL";
  dropdown.primaryAxisSizingMode = "FIXED";
  dropdown.counterAxisAlignItems = "CENTER";
  dropdown.itemSpacing = dropdownItemSpacing;
  dropdown.paddingLeft = dropdownPaddingLeft;
  dropdown.paddingRight = dropdownPaddingRight;

  // Find selected option
  var selectedLabel = "Select...";
  if (controlDef.options) {
    for (var i = 0; i < controlDef.options.length; i++) {
      if (controlDef.options[i].value === controlDef.default) {
        selectedLabel = controlDef.options[i].label;
        break;
      }
    }
  }

  // From Select.js: font = DesignTokens.font('sm', 'normal') - use fontSize.sm from tokens, bind to semantic text/dropdown variable
  var fontSizeSm = componentTokens && componentTokens.typography && componentTokens.typography.fontSize && componentTokens.typography.fontSize.sm !== undefined ? componentTokens.typography.fontSize.sm : 13;
  var text = await createText(selectedLabel, 0, 0, fontSizeSm, "Regular", colors.foreground, variables.text.dropdown || variables.foreground);
  text.layoutGrow = 1; // Text fills available space, pushing chevron to the right
  dropdown.appendChild(text);

  // Dropdown chevron - size 10 from Select.js line 129
  // Actual path: 5px wide × 2.5px tall pointing down
  // Bind stroke to semantic text/dropdownMuted variable
  var chevronVector = figma.createVector();
  chevronVector.name = "chevron";
  chevronVector.vectorPaths = [{
    windingRule: "NONZERO",
    data: "M 0 0 L 2.5 2.5 L 5 0"
  }];
  chevronVector.strokes = [createBoundStroke(colors.foregroundMuted, variables.text.dropdownMuted || variables.foregroundMuted)];
  chevronVector.strokeWeight = 1.5;
  chevronVector.strokeCap = "ROUND";
  chevronVector.strokeJoin = "ROUND";
  chevronVector.fills = [];

  dropdown.appendChild(chevronVector);

  return dropdown;
}

async function createDemoInput(controlDef, colors, pillWidth, componentTokens, variables) {
  // EXPORT EXPECTS: frame named "input"
  // Get dimensions from component tokens
  var inputTokens = componentTokens && componentTokens.input ? componentTokens.input : {};
  var inputHeight = inputTokens.height !== undefined ? inputTokens.height : 36;
  var inputCornerRadius = inputTokens.cornerRadius !== undefined ? inputTokens.cornerRadius : inputHeight / 2;
  var inputPaddingLeft = inputTokens.paddingLeft !== undefined ? inputTokens.paddingLeft : 12;
  var inputPaddingRight = inputTokens.paddingRight !== undefined ? inputTokens.paddingRight : 12;

  var input = figma.createFrame();
  input.name = "input"; // REQUIRED for export
  // Bind to inputBackground or backgroundMuted variable
  input.fills = [createBoundFill(colors.inputBackground || colors.backgroundMuted, variables.inputBackground || variables.backgroundMuted)];
  input.resize(pillWidth, inputHeight);
  input.cornerRadius = inputCornerRadius;
  input.layoutMode = "HORIZONTAL";
  input.counterAxisAlignItems = "CENTER";
  input.paddingLeft = inputPaddingLeft;
  input.paddingRight = inputPaddingRight;

  // From Input.js: font = DesignTokens.font('sm', 'normal') - use fontSize.sm from tokens, bind to semantic text/input variable
  var fontSizeSm = componentTokens && componentTokens.typography && componentTokens.typography.fontSize && componentTokens.typography.fontSize.sm !== undefined ? componentTokens.typography.fontSize.sm : 13;
  var text = await createText(controlDef.default || "", 0, 0, fontSizeSm, "Regular", colors.foreground, variables.text.input || variables.foreground);
  input.appendChild(text);

  return input;
}

async function createDemoColorInput(controlDef, colors, pillWidth, componentTokens, variables) {
  // EXPORT EXPECTS: frame named "color-input" with child "swatch" (ellipse)
  // Get dimensions from component tokens
  var colorInputTokens = componentTokens && componentTokens.colorInput ? componentTokens.colorInput : {};
  var containerHeight = colorInputTokens.height !== undefined ? colorInputTokens.height : 28;
  var containerCornerRadius = colorInputTokens.cornerRadius !== undefined ? colorInputTokens.cornerRadius : containerHeight / 2;
  var swatchSize = colorInputTokens.swatchSize !== undefined ? colorInputTokens.swatchSize : 18;
  var colorInputPaddingLeft = colorInputTokens.paddingLeft !== undefined ? colorInputTokens.paddingLeft : 6;
  var colorInputPaddingRight = colorInputTokens.paddingRight !== undefined ? colorInputTokens.paddingRight : 12;
  var colorInputItemSpacing = colorInputTokens.itemSpacing !== undefined ? colorInputTokens.itemSpacing : 8;

  var container = figma.createFrame();
  container.name = "color-input"; // REQUIRED for export
  // Bind to inputBackground or backgroundMuted variable
  container.fills = [createBoundFill(colors.inputBackground || colors.backgroundMuted, variables.inputBackground || variables.backgroundMuted)];
  container.resize(pillWidth, containerHeight);
  container.cornerRadius = containerCornerRadius;
  container.layoutMode = "HORIZONTAL";
  container.counterAxisAlignItems = "CENTER";
  container.itemSpacing = colorInputItemSpacing;
  container.paddingLeft = colorInputPaddingLeft;
  container.paddingRight = colorInputPaddingRight;

  // Color swatch - use size from tokens
  // Priority: controlDef.default → colors.accent → colors.primary
  // Bind to accent variable if using default accent color
  var swatchColor = controlDef.default || colors.accent || colors.primary;
  var swatch = figma.createEllipse();
  swatch.name = "swatch";
  swatch.resize(swatchSize, swatchSize);
  // Only bind to accent variable if we're using the accent color (not a specific default)
  if (!controlDef.default && (colors.accent || colors.primary)) {
    swatch.fills = [createBoundFill(swatchColor, variables.accent || variables.primary)];
  } else {
    swatch.fills = [{ type: 'SOLID', color: hexToRgb(swatchColor) }];
  }
  container.appendChild(swatch);

  // Hex value - use fontSize.sm from tokens to match other controls, bind to semantic text/colorPicker variable
  var fontSizeSm = componentTokens && componentTokens.typography && componentTokens.typography.fontSize && componentTokens.typography.fontSize.sm !== undefined ? componentTokens.typography.fontSize.sm : 13;
  var hexText = await createText(swatchColor.toUpperCase(), 0, 0, fontSizeSm, "Regular", colors.foreground, variables.text.colorPicker || variables.foreground);
  container.appendChild(hexText);

  return container;
}

async function createDemoButton(controlDef, colors, width, componentTokens, variables) {
  // EXPORT EXPECTS: frame named "button: {Label}" (with space after colon)
  // Export searches for nodes starting with "button: " (line 1500)
  // Extracts: width, height, cornerRadius, paddingLeft, paddingRight
  // Also extracts fill color based on label (Primary→primary, Delete→destructive, Secondary→secondary)
  var buttonTokens = componentTokens && componentTokens.button ? componentTokens.button : {};
  var bgColor = colors.backgroundMuted;
  var textColor = colors.foreground;
  var bgVariable = variables.secondary || variables.backgroundMuted;
  // Use semantic text variables for button text
  var textVariable = variables.text.buttonSecondary || variables.secondaryForeground || variables.foreground;
  var buttonHeight = buttonTokens.height !== undefined ? buttonTokens.height : 40;
  var cornerRadius = buttonTokens.cornerRadius !== undefined ? buttonTokens.cornerRadius : buttonHeight / 2;
  var buttonPaddingLeft = buttonTokens.paddingLeft !== undefined ? buttonTokens.paddingLeft : 0;
  var buttonPaddingRight = buttonTokens.paddingRight !== undefined ? buttonTokens.paddingRight : 0;

  if (controlDef.style === 'primary') {
    bgColor = colors.primary;
    textColor = colors.primaryForeground || '#000000';
    bgVariable = variables.primary;
    textVariable = variables.text.buttonPrimary || variables.primaryForeground;
  } else if (controlDef.style === 'destructive') {
    bgColor = colors.destructive;
    textColor = colors.destructiveForeground || '#ffffff';
    bgVariable = variables.destructive;
    textVariable = variables.text.buttonDestructive || variables.destructiveForeground;
  } else if (controlDef.style === 'secondary') {
    bgColor = colors.secondary || colors.backgroundMuted;
    textColor = colors.secondaryForeground || colors.foreground;
    bgVariable = variables.secondary || variables.backgroundMuted;
    textVariable = variables.text.buttonSecondary || variables.secondaryForeground || variables.foreground;
  }

  var btn = figma.createFrame();
  btn.name = "button: " + controlDef.label;
  // Bind to the appropriate button style variable
  btn.fills = [createBoundFill(bgColor, bgVariable)];
  btn.resize(width, buttonHeight);
  btn.cornerRadius = cornerRadius;
  btn.layoutMode = "HORIZONTAL";
  btn.primaryAxisSizingMode = "FIXED";
  btn.counterAxisSizingMode = "FIXED";
  btn.counterAxisAlignItems = "CENTER";
  btn.primaryAxisAlignItems = "CENTER";
  btn.paddingLeft = buttonPaddingLeft;
  btn.paddingRight = buttonPaddingRight;

  // Button text - bind to appropriate foreground variable for the style
  var text = await createText(controlDef.label, 0, 0, 14, "Medium", textColor, textVariable);
  btn.appendChild(text);

  return btn;
}

// ============================================
// REGENERATE FROM NODE-MANIFEST (TRUE ROUND-TRIP)
// ============================================

/**
 * Regenerate Figma nodes from node-manifest.json
 * This creates an exact replica of the exported structure, including:
 * - All frame dimensions, positions, layout modes
 * - Token-bound colors resolved to Figma Variables
 * - Recursive children structure
 *
 * @param {object} nodeManifest - The node-manifest.json object (MANIFEST_ROOT or single component)
 * @param {object} designTokens - The design-tokens.json object for resolving token values
 */
async function regenerateFromNodeManifest(nodeManifest, designTokens) {
  await loadFonts();

  // Extract color values from design tokens for resolution
  var tokenValues = {
    colors: {},
    spacing: {},
    radius: {},
    typography: { fontSize: {} }
  };

  // Build color value map
  if (designTokens.colors) {
    for (var colorKey in designTokens.colors) {
      var colorToken = designTokens.colors[colorKey];
      if (colorToken && colorToken.$value) {
        tokenValues.colors[colorKey] = colorToken.$value;
      }
    }
  }

  // Build spacing value map
  if (designTokens.spacing) {
    for (var spKey in designTokens.spacing) {
      var spToken = designTokens.spacing[spKey];
      if (spToken && spToken.$value) {
        var spVal = spToken.$value;
        if (typeof spVal === 'string' && spVal.endsWith('px')) {
          spVal = parseFloat(spVal);
        }
        tokenValues.spacing[spKey] = spVal;
      }
    }
  }

  // Build radius value map
  if (designTokens.radius) {
    for (var radKey in designTokens.radius) {
      var radToken = designTokens.radius[radKey];
      if (radToken && radToken.$value) {
        var radVal = radToken.$value;
        if (typeof radVal === 'string' && radVal.endsWith('px')) {
          radVal = parseFloat(radVal);
        }
        tokenValues.radius[radKey] = radVal;
      }
    }
  }

  // Build typography fontSize map
  if (designTokens.typography && designTokens.typography.fontSize) {
    for (var fsKey in designTokens.typography.fontSize) {
      var fsToken = designTokens.typography.fontSize[fsKey];
      if (fsToken && fsToken.$value) {
        var fsVal = fsToken.$value;
        if (typeof fsVal === 'string' && fsVal.endsWith('px')) {
          fsVal = parseFloat(fsVal);
        }
        tokenValues.typography.fontSize[fsKey] = fsVal;
      }
    }
  }

  // Get or create Figma Variables collection
  var collection = await getOrCreateTokenCollection();
  var existingVars = await getExistingVariables(collection);

  /**
   * Resolve a token reference to its actual value
   * Token refs look like: "$colors.background", "$spacing.lg", "$radius.md", "$typography.fontSize.sm"
   */
  function resolveTokenValue(tokenRef, fallback) {
    if (typeof tokenRef !== 'string') return tokenRef || fallback;
    if (!tokenRef.startsWith('$')) return tokenRef;

    // Parse token path: $colors.background -> ['colors', 'background']
    var path = tokenRef.substring(1).split('.');

    if (path[0] === 'colors') {
      var colorName = path.slice(1).join('/'); // Handle text/buttonPrimary -> text/buttonPrimary
      return tokenValues.colors[colorName] || fallback;
    } else if (path[0] === 'spacing') {
      return tokenValues.spacing[path[1]] || fallback;
    } else if (path[0] === 'radius') {
      return tokenValues.radius[path[1]] || fallback;
    } else if (path[0] === 'typography' && path[1] === 'fontSize') {
      return tokenValues.typography.fontSize[path[2]] || fallback;
    } else if (path[0] === 'semanticColors') {
      // Semantic colors like $semanticColors.text/buttonPrimary
      var semanticName = path.slice(1).join('/');
      return tokenValues.colors[semanticName] || fallback;
    }

    return fallback;
  }

  /**
   * Get Figma Variable by token name for binding
   */
  function getVariableByToken(tokenRef) {
    if (typeof tokenRef !== 'string' || !tokenRef.startsWith('$')) return null;

    var path = tokenRef.substring(1).split('.');

    if (path[0] === 'colors') {
      var varName = path.slice(1).join('/');
      return existingVars[varName] || null;
    } else if (path[0] === 'semanticColors') {
      var semanticName = path.slice(1).join('/');
      return existingVars[semanticName] || null;
    }

    return null;
  }

  /**
   * Recursively create a Figma node from manifest node data
   */
  async function createNodeFromManifest(nodeData, parent) {
    var node;

    switch (nodeData.type) {
      case 'FRAME':
        node = figma.createFrame();
        break;
      case 'RECTANGLE':
        node = figma.createRectangle();
        break;
      case 'ELLIPSE':
        node = figma.createEllipse();
        break;
      case 'TEXT':
        node = figma.createText();
        break;
      case 'VECTOR':
        // Create actual vector with path data if available
        node = figma.createVector();
        break;
      case 'LINE':
        node = figma.createLine();
        break;
      case 'INSTANCE':
        // Cannot create instances from manifest (no component key) — create frame as container
        node = figma.createFrame();
        break;
      case 'COMPONENT':
        node = figma.createComponent();
        break;
      case 'COMPONENT_SET':
        // Component sets require special creation — use frame as container for now
        node = figma.createFrame();
        break;
      default:
        // Unknown type - create frame as container
        node = figma.createFrame();
        console.log('Unknown node type:', nodeData.type, '- creating frame');
    }

    // Set name
    node.name = nodeData.name || 'Unnamed';

    // Set dimensions
    if (nodeData.width !== undefined && nodeData.height !== undefined) {
      try {
        node.resize(nodeData.width, nodeData.height);
      } catch (e) {
        console.log('Could not resize node:', node.name, e.message);
      }
    }

    // Set position (only if not in auto-layout parent)
    if (parent && parent.layoutMode && parent.layoutMode !== 'NONE') {
      // In auto-layout, position is automatic
    } else if (nodeData.x !== undefined && nodeData.y !== undefined) {
      node.x = nodeData.x;
      node.y = nodeData.y;
    }

    // Set rotation (degrees)
    if (nodeData.rotation !== undefined && nodeData.rotation !== 0) {
      node.rotation = nodeData.rotation;
    }

    // Set fill with variable binding
    if (nodeData.fill) {
      var fillColor = resolveTokenValue(nodeData.fill, '#27272a');
      var fillVariable = getVariableByToken(nodeData.fill);
      if (fillVariable) {
        node.fills = [createBoundFill(fillColor, fillVariable)];
      } else {
        node.fills = [{ type: 'SOLID', color: hexToRgb(fillColor) }];
      }
    } else if (nodeData.type === 'FRAME') {
      // Frames default to no fill
      node.fills = [];
    }

    // Set stroke with variable binding
    if (nodeData.stroke) {
      var strokeColor = resolveTokenValue(nodeData.stroke, '#71717a');
      var strokeVariable = getVariableByToken(nodeData.stroke);
      if (strokeVariable) {
        node.strokes = [createBoundStroke(strokeColor, strokeVariable)];
      } else {
        node.strokes = [{ type: 'SOLID', color: hexToRgb(strokeColor) }];
      }
      node.strokeWeight = nodeData.strokeWeight || 1;

      // Vector-specific stroke properties
      if (nodeData.strokeCap) {
        try { node.strokeCap = nodeData.strokeCap; } catch (e) {}
      }
      if (nodeData.strokeJoin) {
        try { node.strokeJoin = nodeData.strokeJoin; } catch (e) {}
      }
    }

    // VECTOR: Set vector paths if available
    if (nodeData.type === 'VECTOR' && nodeData.vectorPaths && nodeData.vectorPaths.length > 0) {
      try {
        node.vectorPaths = nodeData.vectorPaths;
        // Vectors typically have no fill, only stroke
        node.fills = [];
      } catch (e) {
        console.log('Could not set vectorPaths on node:', node.name, e.message);
      }
    }

    // Set corner radius
    if (nodeData.cornerRadius !== undefined) {
      var radiusVal = resolveTokenValue(nodeData.cornerRadius, 0);
      if (typeof radiusVal === 'number' && radiusVal > 0) {
        try {
          node.cornerRadius = radiusVal;
        } catch (e) {
          // Some nodes don't support cornerRadius
        }
      }
    }

    // Set opacity
    if (nodeData.opacity !== undefined && nodeData.opacity < 1) {
      node.opacity = nodeData.opacity;
    }

    // Set layout mode (auto-layout) for frames
    if (nodeData.type === 'FRAME' && nodeData.layoutMode && nodeData.layoutMode !== 'NONE') {
      node.layoutMode = nodeData.layoutMode; // 'HORIZONTAL', 'VERTICAL', 'GRID'

      // Item spacing
      if (nodeData.itemSpacing !== undefined) {
        node.itemSpacing = resolveTokenValue(nodeData.itemSpacing, 0);
      }

      // Padding
      if (nodeData.paddingTop !== undefined) {
        node.paddingTop = resolveTokenValue(nodeData.paddingTop, 0);
      }
      if (nodeData.paddingBottom !== undefined) {
        node.paddingBottom = resolveTokenValue(nodeData.paddingBottom, 0);
      }
      if (nodeData.paddingLeft !== undefined) {
        node.paddingLeft = resolveTokenValue(nodeData.paddingLeft, 0);
      }
      if (nodeData.paddingRight !== undefined) {
        node.paddingRight = resolveTokenValue(nodeData.paddingRight, 0);
      }

      // Alignment
      if (nodeData.primaryAxisAlignItems) {
        node.primaryAxisAlignItems = nodeData.primaryAxisAlignItems;
      }
      if (nodeData.counterAxisAlignItems) {
        node.counterAxisAlignItems = nodeData.counterAxisAlignItems;
      }

      // Sizing mode
      if (nodeData.primaryAxisSizingMode) {
        node.primaryAxisSizingMode = nodeData.primaryAxisSizingMode;
      }
      if (nodeData.counterAxisSizingMode) {
        node.counterAxisSizingMode = nodeData.counterAxisSizingMode;
      }

      // Grid/Wrap properties
      if (nodeData.layoutWrap) {
        try {
          node.layoutWrap = nodeData.layoutWrap;
        } catch (e) {
          console.log('layoutWrap not supported:', e.message);
        }
      }
      if (nodeData.counterAxisSpacing !== undefined) {
        try {
          node.counterAxisSpacing = resolveTokenValue(nodeData.counterAxisSpacing, 0);
        } catch (e) {
          console.log('counterAxisSpacing not supported:', e.message);
        }
      }
      if (nodeData.counterAxisAlignContent) {
        try {
          node.counterAxisAlignContent = nodeData.counterAxisAlignContent;
        } catch (e) {
          console.log('counterAxisAlignContent not supported:', e.message);
        }
      }

      // GRID-specific: Apply horizontalPadding/verticalPadding if present (older API)
      if (nodeData.horizontalPadding !== undefined) {
        try {
          node.horizontalPadding = resolveTokenValue(nodeData.horizontalPadding, 0);
        } catch (e) {
          console.log('horizontalPadding not supported:', e.message);
        }
      }
      if (nodeData.verticalPadding !== undefined) {
        try {
          node.verticalPadding = resolveTokenValue(nodeData.verticalPadding, 0);
        } catch (e) {
          console.log('verticalPadding not supported:', e.message);
        }
      }

      // GRID-specific gap properties (newer Figma API)
      // For layoutMode: "GRID", these are the correct properties for gaps
      if (nodeData.layoutMode === 'GRID') {
        if (nodeData.gridColumnGap !== undefined) {
          try {
            node.gridColumnGap = resolveTokenValue(nodeData.gridColumnGap, 0);
          } catch (e) {
            console.log('gridColumnGap not supported:', e.message);
          }
        }
        if (nodeData.gridRowGap !== undefined) {
          try {
            node.gridRowGap = resolveTokenValue(nodeData.gridRowGap, 0);
          } catch (e) {
            console.log('gridRowGap not supported:', e.message);
          }
        }

        // CSS Grid explicit column/row count properties (Figma Plugin API)
        // These map to Figma's Grid panel (Columns/Rows with Fill/1fr settings)
        // Uses gridColumnCount, gridRowCount, gridColumnSizes, gridRowSizes

        // Set column count
        if (nodeData.gridColumnCount !== undefined) {
          try {
            node.gridColumnCount = nodeData.gridColumnCount;
            console.log('[GRID] Set gridColumnCount: ' + nodeData.gridColumnCount);
          } catch (e) {
            console.log('gridColumnCount not supported:', e.message);
          }
        }

        // Set row count
        if (nodeData.gridRowCount !== undefined) {
          try {
            node.gridRowCount = nodeData.gridRowCount;
            console.log('[GRID] Set gridRowCount: ' + nodeData.gridRowCount);
          } catch (e) {
            console.log('gridRowCount not supported:', e.message);
          }
        }

        // Set column sizes (array of GridTrackSize: {type: 'FIXED'|'FLEX'|'HUG', value?: number})
        if (nodeData.gridColumnSizes !== undefined) {
          try {
            node.gridColumnSizes = nodeData.gridColumnSizes;
            console.log('[GRID] Set gridColumnSizes: ' + JSON.stringify(nodeData.gridColumnSizes));
          } catch (e) {
            console.log('gridColumnSizes not supported:', e.message);
          }
        }

        // Set row sizes (array of GridTrackSize)
        if (nodeData.gridRowSizes !== undefined) {
          try {
            node.gridRowSizes = nodeData.gridRowSizes;
            console.log('[GRID] Set gridRowSizes: ' + JSON.stringify(nodeData.gridRowSizes));
          } catch (e) {
            console.log('gridRowSizes not supported:', e.message);
          }
        }
      }

    }

    // Layout Guides - applied to ALL frames (independent of auto-layout mode)
    // This creates visual column/row guides in Figma based on SubGrid settings
    if (nodeData.type === 'FRAME') {
      // Direct layoutGrids support - apply layout guides from manifest
      if (nodeData.layoutGrids && nodeData.layoutGrids.length > 0) {
        try {
          node.layoutGrids = nodeData.layoutGrids;
          console.log('[LayoutGrids] Applied ' + nodeData.layoutGrids.length + ' layout guide(s) from manifest');
        } catch (e) {
          console.log('[LayoutGrids] Could not apply layout guides:', e.message);
        }
      }
      // SubGrid support - create Figma layout grids from subGrid metadata
      // Only if layoutGrids wasn't already set directly
      else if (nodeData.subGrid && nodeData.subGrid.columns) {
        try {
          var subGrid = nodeData.subGrid;
          var layoutGrids = [];

          // Create column grid (visual guide)
          layoutGrids.push({
            pattern: 'COLUMNS',
            alignment: 'STRETCH',
            gutterSize: subGrid.gutterWidth || 8,
            count: subGrid.columns,
            offset: subGrid.paddingHorizontal || 0,
            visible: true,
            color: { r: 1, g: 0.36, b: 0.98, a: subGrid.opacity || 0.1 }  // Pink/magenta like SubGrid
          });

          // Create row grid if rows are specified (not auto)
          if (subGrid.actualRows && subGrid.actualRows > 0) {
            layoutGrids.push({
              pattern: 'ROWS',
              alignment: 'STRETCH',
              gutterSize: subGrid.rowSpacing || 8,
              count: subGrid.actualRows,
              offset: subGrid.paddingVertical || 0,
              visible: true,
              color: { r: 1, g: 0.36, b: 0.98, a: subGrid.opacity || 0.1 }
            });
          }

          node.layoutGrids = layoutGrids;
          console.log('[SubGrid] Created layout grids: ' + subGrid.columns + ' columns x ' + (subGrid.actualRows || 'auto') + ' rows');

        } catch (e) {
          console.log('layoutGrids not supported:', e.message);
        }
      }
    }

    // Child layout properties
    if (nodeData.layoutAlign) {
      try {
        node.layoutAlign = nodeData.layoutAlign;
      } catch (e) {
        // May fail if parent doesn't have layout
      }
    }
    if (nodeData.layoutGrow !== undefined) {
      try {
        node.layoutGrow = nodeData.layoutGrow;
      } catch (e) {
        // May fail if parent doesn't have layout
      }
    }

    // Layout sizing properties (modern Figma API - controls how element sizes in parent)
    // Critical for grid cell height and HUG behavior
    if (nodeData.layoutSizingHorizontal) {
      try {
        node.layoutSizingHorizontal = nodeData.layoutSizingHorizontal;
      } catch (e) {
        // May fail if parent doesn't have layout
      }
    }
    if (nodeData.layoutSizingVertical) {
      try {
        node.layoutSizingVertical = nodeData.layoutSizingVertical;
      } catch (e) {
        // May fail if parent doesn't have layout
      }
    }

    // TEXT specific properties
    if (nodeData.type === 'TEXT') {
      // IMPORTANT: Font must be loaded BEFORE setting characters
      // Font family and style
      if (nodeData.fontFamily && nodeData.fontStyle) {
        try {
          // Try exact font first
          await figma.loadFontAsync({ family: nodeData.fontFamily, style: nodeData.fontStyle });
          node.fontName = { family: nodeData.fontFamily, style: nodeData.fontStyle };
        } catch (e) {
          // Fall back to loaded font
          var loadedFont = getLoadedFont(nodeData.fontStyle === 'Semi Bold' ? 'SemiBold' : nodeData.fontStyle);
          node.fontName = loadedFont;
        }
      } else {
        // Load default font if not specified
        try {
          await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
          node.fontName = { family: 'Inter', style: 'Regular' };
        } catch (e) {
          var defaultFont = getLoadedFont('Regular');
          node.fontName = defaultFont;
        }
      }

      // NOW set characters (after font is loaded)
      if (nodeData.characters) {
        node.characters = nodeData.characters;
      }

      // Font size
      if (nodeData.fontSize) {
        var fontSize = resolveTokenValue(nodeData.fontSize, 14);
        node.fontSize = fontSize;
      }

      // Text color (use textColor if present, otherwise fill)
      var textColorRef = nodeData.textColor || nodeData.fill;
      if (textColorRef) {
        var textColor = resolveTokenValue(textColorRef, '#ffffff');
        var textVariable = getVariableByToken(textColorRef);
        if (textVariable) {
          node.fills = [createBoundFill(textColor, textVariable)];
        } else {
          node.fills = [{ type: 'SOLID', color: hexToRgb(textColor) }];
        }
      }

      // Line height
      if (nodeData.lineHeight) {
        node.lineHeight = { unit: 'PIXELS', value: nodeData.lineHeight };
      } else if (nodeData.lineHeightPercent) {
        node.lineHeight = { unit: 'PERCENT', value: nodeData.lineHeightPercent };
      }

      // Text alignment
      if (nodeData.textAlignHorizontal) {
        node.textAlignHorizontal = nodeData.textAlignHorizontal;
      }
      if (nodeData.textAlignVertical) {
        node.textAlignVertical = nodeData.textAlignVertical;
      }

      // Letter spacing
      if (nodeData.letterSpacing) {
        node.letterSpacing = { unit: 'PIXELS', value: nodeData.letterSpacing };
      } else if (nodeData.letterSpacingPercent) {
        node.letterSpacing = { unit: 'PERCENT', value: nodeData.letterSpacingPercent };
      }
    }

    // Effects (shadows)
    if (nodeData.effects && nodeData.effects.length > 0) {
      var effects = [];
      for (var i = 0; i < nodeData.effects.length; i++) {
        var eff = nodeData.effects[i];
        var effectColor = resolveTokenValue(eff.color, '#000000');
        var effectRgb = hexToRgb(effectColor);

        var effect = {
          type: eff.type,
          visible: true,
          blendMode: 'NORMAL',
          color: {
            r: effectRgb.r,
            g: effectRgb.g,
            b: effectRgb.b,
            a: eff.opacity !== undefined ? eff.opacity : 1
          },
          offset: {
            x: eff.offsetX || 0,
            y: eff.offsetY || 0
          },
          radius: eff.blur || 0,
          spread: eff.spread || 0
        };
        effects.push(effect);
      }
      try {
        node.effects = effects;
      } catch (e) {
        console.log('Could not set effects on node:', node.name, e.message);
      }
    }

    // Add to parent
    if (parent) {
      parent.appendChild(node);
    }

    // Recursively create children
    if (nodeData.children && nodeData.children.length > 0) {
      for (var c = 0; c < nodeData.children.length; c++) {
        await createNodeFromManifest(nodeData.children[c], node);
      }
    }

    return node;
  }

  // Handle MANIFEST_ROOT with multiple components
  var components = [];
  if (nodeManifest.type === 'MANIFEST_ROOT' && nodeManifest.components) {
    components = nodeManifest.components;
  } else {
    // Single component (legacy format)
    components = [nodeManifest];
  }

  console.log('Regenerating', components.length, 'component(s) from manifest');

  var resultNode;

  if (components.length === 1) {
    // Single component - create directly without wrapper
    var componentData = components[0];
    console.log('Creating component:', componentData.name);
    resultNode = await createNodeFromManifest(componentData, null);

    // Position in viewport
    resultNode.x = Math.round(figma.viewport.center.x - resultNode.width / 2);
    resultNode.y = Math.round(figma.viewport.center.y - resultNode.height / 2);
  } else {
    // Multiple components - create container to hold them
    var container = figma.createFrame();
    container.name = nodeManifest.name || "Manifest Components";
    container.fills = [];
    container.layoutMode = "HORIZONTAL";
    container.itemSpacing = 32;
    container.primaryAxisSizingMode = "AUTO";
    container.counterAxisSizingMode = "AUTO";

    // Create each component inside container
    for (var i = 0; i < components.length; i++) {
      var componentData = components[i];
      console.log('Creating component:', componentData.name);
      await createNodeFromManifest(componentData, container);
    }

    // Position in viewport
    container.x = Math.round(figma.viewport.center.x - container.width / 2);
    container.y = Math.round(figma.viewport.center.y - container.height / 2);

    resultNode = container;
  }

  // Select and zoom to the created node(s)
  figma.currentPage.selection = [resultNode];
  figma.viewport.scrollAndZoomIntoView([resultNode]);

  console.log('Regeneration complete:', components.length, 'component(s)');
  return resultNode;
}

// ============================================
// MESSAGE HANDLERS
// ============================================

figma.showUI(__html__, { width: 400, height: 700 });

figma.ui.onmessage = async (msg) => {
  console.log("Received message:", msg.type);

  if (msg.type === 'import') {
    try {
      console.log("Starting import...");
      await importDesignTokens(msg.data);
      figma.notify("Design tokens imported successfully!");
    } catch (error) {
      console.error("Import error:", error);
      var errorMsg = error && error.message ? error.message : String(error);
      figma.notify("Error importing tokens: " + errorMsg);
    }
  }

  if (msg.type === 'export') {
    (async function() {
      try {
        // msg.manifest contains the original manifest to update
        const result = await exportDesignTokens(msg.manifest);
        if (result) {
          // Check if dual export (tokens + manifest) or legacy (tokens only)
          if (result.tokens && result.manifest) {
            // DUAL EXPORT: Send both files
            figma.ui.postMessage({
              type: 'export-dual-result',
              tokens: JSON.stringify(result.tokens, null, 2),
              manifest: JSON.stringify(result.manifest, null, 2)
            });
            figma.notify("Exported: design-tokens.json + node-manifest.json");
          } else {
            // Legacy: single tokens object
            figma.ui.postMessage({ type: 'export-result', data: JSON.stringify(result, null, 2) });
            figma.notify("Design tokens exported!");
          }
        }
      } catch (error) {
        console.error("Export error:", error);
        var errorMsg = error && error.message ? error.message : String(error);
        figma.notify("Error exporting tokens: " + errorMsg);
      }
    })();
  }

  if (msg.type === 'generate-hud') {
    try {
      console.log("Starting HUD generation...");
      await generateHUDPanel(msg.data);
      figma.notify("HUD Panel generated!");
    } catch (error) {
      console.error("HUD generation error:", error);
      var errorMsg = error && error.message ? error.message : String(error);
      figma.notify("Error generating HUD: " + errorMsg);
    }
  }

  if (msg.type === 'generate-hud-manifest') {
    try {
      console.log("Starting HUD generation from manifest...");
      console.log("Panel type:", msg.panelType);
      await generateHUDFromManifest(msg.data, msg.panelType);
      figma.notify("HUD Panel generated from manifest!");
    } catch (error) {
      console.error("HUD manifest generation error:", error);
      var errorMsg = error && error.message ? error.message : String(error);
      figma.notify("Error generating HUD: " + errorMsg);
    }
  }

  if (msg.type === 'generate-component-demo') {
    try {
      console.log("Starting Component Demo generation...");
      await generateComponentDemo(msg.data);
      figma.notify("Component Demo panel generated!");
    } catch (error) {
      console.error("Component Demo generation error:", error);
      var errorMsg = error && error.message ? error.message : String(error);
      figma.notify("Error generating Component Demo: " + errorMsg);
    }
  }

  // TRUE ROUND-TRIP: Regenerate exact structure from node-manifest
  if (msg.type === 'regenerate-from-manifest') {
    try {
      console.log("Starting regeneration from node-manifest...");
      var nodeManifest = typeof msg.manifest === 'string' ? JSON.parse(msg.manifest) : msg.manifest;
      var designTokens = typeof msg.tokens === 'string' ? JSON.parse(msg.tokens) : msg.tokens;

      var componentCount = 1;
      if (nodeManifest.type === 'MANIFEST_ROOT' && nodeManifest.components) {
        componentCount = nodeManifest.components.length;
      }

      await regenerateFromNodeManifest(nodeManifest, designTokens);
      figma.notify("Regenerated " + componentCount + " component(s) from manifest!");
    } catch (error) {
      console.error("Regeneration error:", error);
      var errorMsg = error && error.message ? error.message : String(error);
      figma.notify("Error regenerating from manifest: " + errorMsg);
    }
  }

  if (msg.type === 'close') {
    figma.closePlugin();
  }
};

// Handle menu commands
if (figma.command === 'import') {
  figma.showUI(__html__, { width: 400, height: 700 });
} else if (figma.command === 'export') {
  (async function() {
    const result = await exportDesignTokens();
    if (result) {
      figma.showUI(__html__, { width: 400, height: 700 });
      setTimeout(() => {
        // Check if dual export (tokens + manifest) or legacy (tokens only)
        if (result.tokens && result.manifest) {
          figma.ui.postMessage({
            type: 'export-dual-result',
            tokens: JSON.stringify(result.tokens, null, 2),
            manifest: JSON.stringify(result.manifest, null, 2)
          });
        } else {
          figma.ui.postMessage({ type: 'export-result', data: JSON.stringify(result, null, 2) });
        }
      }, 100);
    }
  })();
} else if (figma.command === 'generate-components') {
  figma.showUI(__html__, { width: 400, height: 700 });
}
