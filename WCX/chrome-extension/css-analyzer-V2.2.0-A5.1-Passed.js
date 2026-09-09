/**
 * WCX CSS Analyzer
 * V2.1.2 - CSS Declaration Model
 *
 * Purpose:
 * - Discover CSS affecting a selected DOM component
 * - Match CSS rules against component elements
 * - Evaluate author-CSS cascade
 * - Determine winning / overridden declarations
 * - Preserve original declaration provenance
 * - Expand CSS shorthand declarations safely
 * - Preserve declaration-level source order
 * - Prepare CSS data for later standalone reconstruction
 *
 * Public API:
 * window.WCX_CSS
 */

(() => {
  "use strict";

  const VERSION = "2.2.0-A5.1";

  console.log(`[WCX] CSS Analyzer V${VERSION} loaded`);

  /* =========================================================
     BASIC HELPERS
  ========================================================= */

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeString(value) {
    return value == null ? "" : String(value);
  }

  function normalizeWhitespace(value) {
    return safeString(value).replace(/\s+/g, " ").trim();
  }

  function getNodeLabel(element) {
    if (!element || element.nodeType !== 1) {
      return "";
    }

    let label = element.tagName.toLowerCase();

    if (element.id) {
      label += `#${element.id}`;
    }

    if (element.classList && element.classList.length) {
      label += "." + Array.from(element.classList).join(".");
    }

    return label;
  }

  /* =========================================================
     V2.1.2 - STRUCTURED ELEMENT METADATA
  ========================================================= */

  function getElementMetadata(element) {
    if (!element || element.nodeType !== 1) {
      return null;
    }

    return {
      label: getNodeLabel(element),

      tagName: element.tagName
        ? element.tagName.toLowerCase()
        : "",

      id: element.id || "",

      classes:
        element.classList && element.classList.length
          ? Array.from(element.classList)
          : [],
    };
  }

  function getAllComponentElements(root) {
    if (!root || root.nodeType !== 1) {
      return [];
    }

    return [root, ...root.querySelectorAll("*")];
  }

  function getAncestorElements(root) {
    const ancestors = [];

    let current = root ? root.parentElement : null;

    while (current) {
      ancestors.push(current);
      current = current.parentElement;
    }

    return ancestors;
  }

  /* =========================================================
     SELECTOR SPECIFICITY
  ========================================================= */

  function calculateSpecificity(selector) {
    /*
     * Approximation of CSS specificity:
     *
     * a = ID selectors
     * b = class / attribute / pseudo-class
     * c = type / pseudo-element
     *
     * Full CSS selector parsing will be handled in a later
     * selector engine stage.
     */

    let normalized = safeString(selector);

    normalized = normalized.replace(
      /(["'])(?:\\.|(?!\1).)*\1/g,
      "",
    );

    normalized = normalized.replace(
      /:where\(([^()]*)\)/g,
      "$1",
    );

    let a = 0;
    let b = 0;
    let c = 0;

    const idMatches = normalized.match(/#[\w-]+/g);

    if (idMatches) {
      a += idMatches.length;
    }

    const classMatches = normalized.match(/\.[\w-]+/g);

    if (classMatches) {
      b += classMatches.length;
    }

    const attributeMatches = normalized.match(/\[[^\]]+\]/g);

    if (attributeMatches) {
      b += attributeMatches.length;
    }

    const pseudoElementMatches =
      normalized.match(/::[\w-]+/g);

    if (pseudoElementMatches) {
      c += pseudoElementMatches.length;
    }

    const pseudoClassMatches =
      normalized.match(/:(?!:)[\w-]+(?:\([^)]*\))?/g);

    if (pseudoClassMatches) {
      b += pseudoClassMatches.length;
    }

    let typePart = normalized
      .replace(/#[\w-]+/g, " ")
      .replace(/\.[\w-]+/g, " ")
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/::[\w-]+/g, " ")
      .replace(/:(?!:)[\w-]+(?:\([^)]*\))?/g, " ")
      .replace(/[>+~, *]/g, " ");

    const typeMatches =
      typePart.match(/(?:^|\s)([a-zA-Z][\w-]*)/g);

    if (typeMatches) {
      c += typeMatches.length;
    }

    return {
      a,
      b,
      c,
      value: a * 1000000 + b * 1000 + c,
      text: `${a},${b},${c}`,
    };
  }

  function compareSpecificity(a, b) {
    if (a.a !== b.a) {
      return a.a - b.a;
    }

    if (a.b !== b.b) {
      return a.b - b.b;
    }

    return a.c - b.c;
  }

  /* =========================================================
     MEDIA / SUPPORTS
  ========================================================= */

  function mediaMatches(mediaText) {
    if (!mediaText) {
      return true;
    }

    try {
      return window.matchMedia(mediaText).matches;
    } catch (error) {
      return false;
    }
  }

  function supportsMatches(conditionText) {
    if (!conditionText) {
      return true;
    }

    try {
      return CSS.supports(conditionText);
    } catch (error) {
      return false;
    }
  }

  /* =========================================================
     CSS PROPERTY HELPERS
  ========================================================= */

  /*
   * V2.1.2
   *
   * CSS shorthand properties that WCX can safely expand using
   * browser CSSOM.
   *
   * We intentionally do NOT manually parse complex shorthands
   * such as background, font, animation and grid here.
   */

  const SAFE_SHORTHAND_PROPERTIES = new Set([
    "margin",
    "padding",

    "margin-block",
    "margin-block-start",
    "margin-block-end",
    "margin-inline",
    "margin-inline-start",
    "margin-inline-end",

    "padding-block",
    "padding-block-start",
    "padding-block-end",
    "padding-inline",
    "padding-inline-start",
    "padding-inline-end",

    "border",
    "border-top",
    "border-right",
    "border-bottom",
    "border-left",

    "border-width",
    "border-style",
    "border-color",

    "border-block",
    "border-block-start",
    "border-block-end",
    "border-inline",
    "border-inline-start",
    "border-inline-end",

    "border-radius",

    "inset",

    "scroll-margin",
    "scroll-padding",

    "place-content",
    "place-items",
    "place-self",

    "flex",

    "gap",
    "row-gap",
    "column-gap",
  ]);

  function isCustomProperty(property) {
    return safeString(property).startsWith("--");
  }

  function isKnownShorthandProperty(property) {
    return SAFE_SHORTHAND_PROPERTIES.has(
      safeString(property).toLowerCase(),
    );
  }

  /*
   * V2.1.2
   *
   * Uses a temporary CSS declaration to ask the browser which
   * longhand properties are affected by a shorthand.
   *
   * This is safer than manually parsing CSS shorthand syntax.
   */

  function expandShorthandDeclaration(property, value, important) {
    const normalizedProperty = safeString(property)
      .toLowerCase();

    const normalizedValue = safeString(value);

    if (!normalizedProperty || !normalizedValue) {
      return [];
    }

    if (isCustomProperty(normalizedProperty)) {
      return [
        {
          property: normalizedProperty,
          value: normalizedValue,
        },
      ];
    }

    if (!isKnownShorthandProperty(normalizedProperty)) {
      return [
        {
          property: normalizedProperty,
          value: normalizedValue,
        },
      ];
    }

    try {
      const testStyle = document.createElement("div").style;

      testStyle.cssText = "";

      testStyle.setProperty(
        normalizedProperty,
        normalizedValue,
        important ? "important" : "",
      );

      const expanded = [];

      for (let i = 0; i < testStyle.length; i++) {
        const expandedProperty = testStyle[i];

        if (!expandedProperty) {
          continue;
        }

        const expandedValue =
          testStyle.getPropertyValue(expandedProperty);

        if (!expandedValue) {
          continue;
        }

        expanded.push({
          property: expandedProperty,
          value: normalizeWhitespace(expandedValue),
        });
      }

      /*
       * If CSSOM did not expose expansion, preserve the
       * original declaration rather than guessing.
       */

      if (!expanded.length) {
        return [
          {
            property: normalizedProperty,
            value: normalizedValue,
          },
        ];
      }

      return expanded;
    } catch (error) {
      return [
        {
          property: normalizedProperty,
          value: normalizedValue,
        },
      ];
    }
  }

  /*
   * V2.1.2
   *
   * Creates the complete declaration model.
   */

  function createDeclarationModel(
    property,
    value,
    important,
    declarationIndex = 0,
  ) {
    const normalizedProperty = safeString(property)
      .toLowerCase();

    const normalizedValue = normalizeWhitespace(value);

    let declarationType = "longhand";

    if (isCustomProperty(normalizedProperty)) {
      declarationType = "custom-property";
    } else if (isKnownShorthandProperty(normalizedProperty)) {
      declarationType = "shorthand";
    }

    const expandedProperties = expandShorthandDeclaration(
      normalizedProperty,
      normalizedValue,
      important,
    );

    return {
      /*
       * Existing V2.1 fields.
       */
      property: normalizedProperty,

      value: normalizedValue,

      important: !!important,

      /*
       * V2.1.2 source provenance.
       */
      originalProperty: normalizedProperty,

      originalValue: normalizedValue,

      declarationType,

      declarationIndex,

      expandedProperties,

      /*
       * Keep variable references at declaration level.
       */
      variableReferences:
        extractVariableReferences(normalizedValue),
    };
  }

  /*
   * V2.1.2-R1
   *
   * Parse the source declaration block instead of relying on
   * CSSStyleDeclaration[index]. CSSOM enumeration can expose
   * shorthand declarations as longhands, which loses source
   * provenance (for example: padding: 0.5rem 1rem).
   *
   * This tokenizer is intentionally declaration-focused. It
   * understands strings, comments and parentheses so semicolons
   * inside url()/strings/functions do not split declarations.
   */
  function stripCSSComments(value) {
    return safeString(value).replace(/\/\*[\s\S]*?\*\//g, "");
  }

  function extractDeclarationBlock(cssText) {
    const source = safeString(cssText);
    const firstOpen = source.indexOf("{");
    const lastClose = source.lastIndexOf("}");

    if (firstOpen < 0 || lastClose <= firstOpen) {
      return "";
    }

    return source.slice(firstOpen + 1, lastClose);
  }

  function parseSourceDeclarations(cssText) {
    const source = stripCSSComments(cssText);
    const declarations = [];

    let start = 0;
    let quote = null;
    let escaped = false;
    let parenDepth = 0;

    const chunks = [];

    function pushChunk(end) {
      const chunk = source.slice(start, end).trim();

      if (chunk) {
        chunks.push(chunk);
      }

      start = end + 1;
    }

    for (let i = 0; i < source.length; i++) {
      const char = source[i];

      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === quote) {
          quote = null;
        }

        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }

      if (char === "(") {
        parenDepth++;
        continue;
      }

      if (char === ")" && parenDepth > 0) {
        parenDepth--;
        continue;
      }

      if (char === ";" && parenDepth === 0) {
        pushChunk(i);
      }
    }

    const finalChunk = source.slice(start).trim();

    if (finalChunk) {
      chunks.push(finalChunk);
    }

    for (const chunk of chunks) {
      let colonIndex = -1;
      quote = null;
      escaped = false;
      parenDepth = 0;

      for (let i = 0; i < chunk.length; i++) {
        const char = chunk[i];

        if (quote) {
          if (escaped) {
            escaped = false;
          } else if (char === "\\") {
            escaped = true;
          } else if (char === quote) {
            quote = null;
          }
          continue;
        }

        if (char === '"' || char === "'") {
          quote = char;
          continue;
        }

        if (char === "(") {
          parenDepth++;
          continue;
        }

        if (char === ")" && parenDepth > 0) {
          parenDepth--;
          continue;
        }

        if (char === ":" && parenDepth === 0) {
          colonIndex = i;
          break;
        }
      }

      if (colonIndex <= 0) {
        continue;
      }

      const property = chunk
        .slice(0, colonIndex)
        .trim();

      let value = chunk
        .slice(colonIndex + 1)
        .trim();

      if (!property || !value) {
        continue;
      }

      let important = false;

      value = value.replace(
        /\s*!important\s*$/i,
        () => {
          important = true;
          return "";
        },
      ).trim();

      if (!value) {
        continue;
      }

      declarations.push({
        property,
        value,
        important,
      });
    }

    return declarations;
  }

  function extractDeclarationBlock(cssText) {
    const source = safeString(cssText);
    if (!source) return "";

    const firstBrace = source.indexOf("{");
    if (firstBrace === -1) return source;

    let quote = "";
    let escaped = false;
    let comment = false;
    let depth = 0;
    let output = "";

    for (let i = firstBrace + 1; i < source.length; i++) {
      const char = source[i];
      const next = source[i + 1];

      if (comment) {
        if (char === "*" && next === "/") {
          comment = false;
          i++;
        }
        continue;
      }

      if (quote) {
        output += char;
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
        continue;
      }

      if (char === "/" && next === "*") {
        comment = true;
        i++;
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        output += char;
        continue;
      }

      if (char === "(") {
        depth++;
        output += char;
        continue;
      }

      if (char === ")") {
        depth = Math.max(0, depth - 1);
        output += char;
        continue;
      }

      if (char === "}" && depth === 0) break;
      output += char;
    }

    return output;
  }

  function splitCSSDeclarations(cssText) {
    const source = safeString(cssText);
    if (!source) return [];

    const declarations = [];
    let buffer = "";
    let quote = "";
    let escaped = false;
    let comment = false;
    let parentheses = 0;
    let brackets = 0;

    function flush() {
      const declaration = buffer.trim();
      if (declaration) declarations.push(declaration);
      buffer = "";
    }

    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      const next = source[i + 1];

      if (comment) {
        if (char === "*" && next === "/") {
          comment = false;
          i++;
        }
        continue;
      }

      if (quote) {
        buffer += char;
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
        continue;
      }

      if (char === "/" && next === "*") {
        comment = true;
        i++;
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        buffer += char;
        continue;
      }

      if (char === "(") {
        parentheses++;
        buffer += char;
        continue;
      }

      if (char === ")") {
        parentheses = Math.max(0, parentheses - 1);
        buffer += char;
        continue;
      }

      if (char === "[") {
        brackets++;
        buffer += char;
        continue;
      }

      if (char === "]") {
        brackets = Math.max(0, brackets - 1);
        buffer += char;
        continue;
      }

      if (char === ";" && parentheses === 0 && brackets === 0) {
        flush();
        continue;
      }

      buffer += char;
    }

    flush();
    return declarations;
  }

  function parseSourceDeclaration(declarationText) {
    const source = safeString(declarationText).trim();
    if (!source) return null;

    let quote = "";
    let escaped = false;
    let parentheses = 0;
    let brackets = 0;
    let colonIndex = -1;

    for (let i = 0; i < source.length; i++) {
      const char = source[i];

      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }

      if (char === "(") {
        parentheses++;
        continue;
      }

      if (char === ")") {
        parentheses = Math.max(0, parentheses - 1);
        continue;
      }

      if (char === "[") {
        brackets++;
        continue;
      }

      if (char === "]") {
        brackets = Math.max(0, brackets - 1);
        continue;
      }

      if (char === ":" && parentheses === 0 && brackets === 0) {
        colonIndex = i;
        break;
      }
    }

    if (colonIndex === -1) return null;

    const property = source.slice(0, colonIndex).trim().toLowerCase();
    let value = source.slice(colonIndex + 1).trim();

    if (!property || !value) return null;

    let important = false;
    const importantMatch = value.match(/(?:^|\s)!important\s*$/i);

    if (importantMatch) {
      important = true;
      value = value.slice(0, importantMatch.index).trim();
    }

    if (!value) return null;

    return {
      property,
      value: normalizeWhitespace(value),
      important
    };
  }

  function getSourceDeclarations(sourceCssText) {
    const pieces = splitCSSDeclarations(
      extractDeclarationBlock(sourceCssText)
    );

    const declarations = [];

    for (let i = 0; i < pieces.length; i++) {
      const parsed = parseSourceDeclaration(pieces[i]);
      if (!parsed) continue;

      declarations.push({
        ...parsed,
        declarationIndex: i
      });
    }

    return declarations;
  }

  function getStyleDeclarations(style, sourceCssText = "") {
    const declarations = [];
    if (!style) return declarations;

    const sourceDeclarations = sourceCssText
      ? getSourceDeclarations(sourceCssText)
      : [];

    if (sourceDeclarations.length) {
      for (const sourceDeclaration of sourceDeclarations) {
        declarations.push(
          createDeclarationModel(
            sourceDeclaration.property,
            sourceDeclaration.value,
            sourceDeclaration.important,
            sourceDeclaration.declarationIndex
          )
        );
      }

      return declarations;
    }

    // CSSOM fallback for callers without source text.
    for (let i = 0; i < style.length; i++) {
      const property = style[i];
      if (!property) continue;

      const value = style.getPropertyValue(property);
      const priority = style.getPropertyPriority(property);

      declarations.push(
        createDeclarationModel(
          property,
          value,
          priority === "important",
          i
        )
      );
    }

    return declarations;
  }

  function extractVariableReferences(value) {
    const refs = [];

    const regex = /var\(\s*(--[\w-]+)/g;

    let match;

    while ((match = regex.exec(value))) {
      if (!refs.includes(match[1])) {
        refs.push(match[1]);
      }
    }

    return refs;
  }

  function isInheritedProperty(property) {
    const inherited = new Set([
      "color",
      "font",
      "font-family",
      "font-size",
      "font-style",
      "font-weight",
      "line-height",
      "letter-spacing",
      "text-align",
      "text-indent",
      "text-transform",
      "white-space",
      "word-spacing",
      "visibility",
      "cursor",
      "list-style",
      "list-style-type",
      "list-style-position",
      "list-style-image",
    ]);

    return inherited.has(
      safeString(property).toLowerCase(),
    );
  }

  /* =========================================================
     SELECTOR MATCHING
  ========================================================= */

  function selectorMatchesElement(selector, element) {
    if (!selector || !element) {
      return false;
    }

    /*
     * V2.1 deliberately ignores state/pseudo selectors.
     *
     * They will be handled by the later State/Pseudo engine.
     */

    if (
      selector.includes("::") ||
      selector.includes(":hover") ||
      selector.includes(":focus") ||
      selector.includes(":active") ||
      selector.includes(":visited") ||
      selector.includes(":focus-visible") ||
      selector.includes(":has(") ||
      selector.includes(":host")
    ) {
      return false;
    }

    try {
      return element.matches(selector);
    } catch (error) {
      return false;
    }
  }

  function selectorMatchesComponent(
    selector,
    elements,
  ) {
    const matchedElements = [];

    for (const element of safeArray(elements)) {
      if (selectorMatchesElement(selector, element)) {
        matchedElements.push(element);
      }
    }

    return matchedElements;
  }

  /* =========================================================
     CSS RULE WALKER
  ========================================================= */

  function getRuleTypeName(rule) {
    if (!rule) {
      return "unknown";
    }

    switch (rule.type) {
      case CSSRule.STYLE_RULE:
        return "style";

      case CSSRule.MEDIA_RULE:
        return "media";

      case CSSRule.SUPPORTS_RULE:
        return "supports";

      case CSSRule.IMPORT_RULE:
        return "import";

      case CSSRule.FONT_FACE_RULE:
        return "font-face";

      case CSSRule.KEYFRAMES_RULE:
        return "keyframes";

      case CSSRule.DOCUMENT_RULE:
        return "document";

      case CSSRule.LAYER_BLOCK_RULE:
        return "layer";

      default:
        return "unknown";
    }
  }

  function walkCSSRules(
    rules,
    context,
    stylesheetMeta,
    output,
  ) {
    if (!rules) {
      return;
    }

    for (
      let index = 0;
      index < rules.length;
      index++
    ) {
      const rule = rules[index];

      if (!rule) {
        continue;
      }

      const ruleType = getRuleTypeName(rule);

      if (ruleType === "style") {
        const selectorText =
          safeString(rule.selectorText);

        const selectors = selectorText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        for (const selector of selectors) {
          const matchedElements =
            selectorMatchesComponent(
              selector,
              context.elements,
            );

          if (!matchedElements.length) {
            continue;
          }

          const specificity =
            calculateSpecificity(selector);

          const declarations =
            getStyleDeclarations(rule.style, rule.cssText);

          output.push({
            kind: "css-rule",

            selector,

            originalSelector: selectorText,

            cssText: safeString(rule.cssText),

            declarations,

            matchedElements,

            matchedElementLabels:
              matchedElements.map(getNodeLabel),

            /*
             * V2.1.2
             */
            matchedElementDetails:
              matchedElements
                .map(getElementMetadata)
                .filter(Boolean),

            specificity,

            stylesheetIndex:
              stylesheetMeta.index,

            stylesheetHref:
              stylesheetMeta.href,

            stylesheetTitle:
              stylesheetMeta.title,

            stylesheetFramework:
              stylesheetMeta.framework,

            ruleIndex: index,

            sourceOrder: output.length,

            media: context.media || null,

            supports:
              context.supports || null,

            mediaActive:
              mediaMatches(context.media),

            supportsActive:
              supportsMatches(context.supports),

            ruleType,

            variableReferences:
              declarations.flatMap(
                (d) =>
                  d.variableReferences || [],
              ),
          });
        }

        continue;
      }

      /*
       * Nested conditional rules.
       */

      if (
        ruleType === "media" ||
        ruleType === "supports" ||
        ruleType === "document" ||
        ruleType === "layer"
      ) {
        const nestedContext = {
          media: context.media || null,

          supports:
            context.supports || null,

          elements:
            context.elements,
        };

        if (ruleType === "media") {
          nestedContext.media =
            rule.conditionText ||
            rule.media?.mediaText ||
            null;
        }

        if (ruleType === "supports") {
          nestedContext.supports =
            rule.conditionText || null;
        }

        try {
          walkCSSRules(
            rule.cssRules,
            nestedContext,
            stylesheetMeta,
            output,
          );
        } catch (error) {
          /*
           * Ignore inaccessible nested rules.
           */
        }

        continue;
      }

      /*
       * @import
       */

      if (ruleType === "import") {
        try {
          if (rule.styleSheet) {
            walkCSSRules(
              rule.styleSheet.cssRules,
              context,
              {
                ...stylesheetMeta,

                href:
                  rule.href ||
                  stylesheetMeta.href,
              },
              output,
            );
          }
        } catch (error) {
          /*
           * Cross-origin imported stylesheet.
           */
        }
      }
    }
  }

  /* =========================================================
     STYLESHEET DISCOVERY
  ========================================================= */

  function detectFramework(href, cssText) {
    const source = (
      safeString(href) +
      " " +
      safeString(cssText)
    ).toLowerCase();

    if (source.includes("bootstrap")) {
      return "Bootstrap";
    }

    if (source.includes("tailwind")) {
      return "Tailwind";
    }

    if (source.includes("foundation")) {
      return "Foundation";
    }

    if (source.includes("bulma")) {
      return "Bulma";
    }

    if (source.includes("materialize")) {
      return "Materialize";
    }

    if (
      source.includes("mobirise") ||
      source.includes("mbr-")
    ) {
      return "Mobirise";
    }

    return "Unknown";
  }

  function getPageStylesheets() {
    const stylesheets = [];

    for (
      let index = 0;
      index < document.styleSheets.length;
      index++
    ) {
      const sheet =
        document.styleSheets[index];

      let cssRules = null;
      let blocked = false;

      try {
        cssRules = sheet.cssRules;
      } catch (error) {
        blocked = true;
      }

      let href = "";

      try {
        href = sheet.href || "";
      } catch (error) {
        href = "";
      }

      const framework =
        detectFramework(href, "");

      let title = "";

      try {
        title =
          sheet.ownerNode?.title || "";
      } catch (error) {
        title = "";
      }

      stylesheets.push({
        index,

        href,

        title,

        framework,

        accessible:
          !blocked && !!cssRules,

        blocked,

        cssRules,
      });
    }

    return stylesheets;
  }

  /* =========================================================
     V2.2-A1 - CUSTOM PROPERTY DISCOVERY
  ========================================================= */

  function isCustomPropertyName(property) {
    return safeString(property).trim().startsWith("--");
  }

  function getCustomPropertyDeclarationsFromRule(rule) {
    return safeArray(rule?.declarations).filter((declaration) =>
      isCustomPropertyName(declaration?.originalProperty || declaration?.property),
    );
  }

  function getCustomPropertyScopeKind(selector) {
    const normalized = normalizeWhitespace(selector);

    if (normalized === ":root") return "root";
    if (normalized === "html" || normalized === "html:root" || normalized === "body") return "global";
    return "selector";
  }

  function selectorMatchesVariableScope(selector, elements, ancestors) {
    const normalized = safeString(selector).trim();
    if (!normalized) return false;

    if (normalized === ":root" || normalized === "html" || normalized === "html:root" || normalized === "body") {
      return true;
    }

    const scopeElements = [...safeArray(elements), ...safeArray(ancestors)];
    return scopeElements.some((element) => selectorMatchesElement(normalized, element));
  }

  /*
   * V2.2-A1.1
   *
   * Custom-property discovery must NOT depend on walkCSSRules().
   * walkCSSRules() intentionally filters out CSS rules that do not
   * directly match the selected component. Global/custom-property
   * source rules such as :root therefore disappear before variable
   * discovery can inspect them.
   *
   * This walker is deliberately separate from the R1.1 component-rule
   * walker so the existing cascade/rule collection behavior remains
   * unchanged. It traverses every accessible CSS rule source, then
   * filters only at the custom-property scope stage.
   */
  function walkAllCSSRulesForCustomProperties(
    rules,
    context,
    stylesheetMeta,
    output,
  ) {
    if (!rules) return;

    for (let index = 0; index < rules.length; index++) {
      const rule = rules[index];
      if (!rule) continue;

      const ruleType = getRuleTypeName(rule);

      if (ruleType === "style") {
        const selectorText = safeString(rule.selectorText);
        if (!selectorText) continue;

        const declarations = getStyleDeclarations(
          rule.style,
          rule.cssText,
        );

        const customDeclarations = getCustomPropertyDeclarationsFromRule({
          declarations,
        });

        if (!customDeclarations.length) continue;

        const selectors = selectorText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        for (const selector of selectors) {
          if (!selectorMatchesVariableScope(
            selector,
            context.elements,
            context.ancestors,
          )) {
            continue;
          }

          const specificity = calculateSpecificity(selector);

          for (const declaration of customDeclarations) {
            const property = safeString(
              declaration.originalProperty || declaration.property,
            ).trim();

            output.push({
              kind: "custom-property-definition",
              property,
              value: normalizeWhitespace(
                declaration.originalValue || declaration.value,
              ),
              important: !!declaration.important,
              selector,
              originalSelector: selectorText,
              scopeKind: getCustomPropertyScopeKind(selector),
              declarationIndex: declaration.declarationIndex ?? 0,
              specificity,
              stylesheetIndex: stylesheetMeta.index,
              stylesheetHref: safeString(stylesheetMeta.href),
              stylesheetTitle: safeString(stylesheetMeta.title),
              stylesheetFramework: safeString(stylesheetMeta.framework),
              ruleIndex: index,
              sourceOrder: output.length,
              media: context.media || null,
              supports: context.supports || null,
              mediaActive: mediaMatches(context.media),
              supportsActive: supportsMatches(context.supports),
              variableReferences: safeArray(
                declaration.variableReferences,
              ),
            });
          }
        }

        continue;
      }

      if (
        ruleType === "media" ||
        ruleType === "supports" ||
        ruleType === "document" ||
        ruleType === "layer"
      ) {
        const nestedContext = {
          media: context.media || null,
          supports: context.supports || null,
          elements: context.elements,
          ancestors: context.ancestors,
        };

        if (ruleType === "media") {
          nestedContext.media =
            rule.conditionText ||
            rule.media?.mediaText ||
            null;
        }

        if (ruleType === "supports") {
          nestedContext.supports = rule.conditionText || null;
        }

        try {
          walkAllCSSRulesForCustomProperties(
            rule.cssRules,
            nestedContext,
            stylesheetMeta,
            output,
          );
        } catch (error) {
          /* Ignore inaccessible nested rules. */
        }

        continue;
      }

      if (ruleType === "import") {
        try {
          if (rule.styleSheet) {
            walkAllCSSRulesForCustomProperties(
              rule.styleSheet.cssRules,
              context,
              {
                ...stylesheetMeta,
                href: rule.href || stylesheetMeta.href,
              },
              output,
            );
          }
        } catch (error) {
          /* Ignore cross-origin imported stylesheets. */
        }
      }
    }
  }

  function collectCustomPropertyDefinitions(rules, elements, ancestors) {
    const definitions = [];

    for (const rule of safeArray(rules)) {
      if (rule?.kind !== "css-rule" || !rule.mediaActive || !rule.supportsActive) continue;

      const customDeclarations = getCustomPropertyDeclarationsFromRule(rule);
      if (!customDeclarations.length) continue;

      if (!selectorMatchesVariableScope(rule.originalSelector || rule.selector, elements, ancestors)) continue;

      for (const declaration of customDeclarations) {
        const property = safeString(declaration.originalProperty || declaration.property).trim();
        definitions.push({
          property,
          value: normalizeWhitespace(declaration.originalValue || declaration.value),
          important: !!declaration.important,
          selector: safeString(rule.selector),
          originalSelector: safeString(rule.originalSelector),
          scopeKind: getCustomPropertyScopeKind(rule.originalSelector || rule.selector),
          declarationIndex: declaration.declarationIndex ?? 0,
          specificity: rule.specificity,
          stylesheetIndex: rule.stylesheetIndex,
          stylesheetHref: safeString(rule.stylesheetHref),
          stylesheetTitle: safeString(rule.stylesheetTitle),
          stylesheetFramework: safeString(rule.stylesheetFramework),
          ruleIndex: rule.ruleIndex,
          sourceOrder: rule.sourceOrder,
          media: rule.media || null,
          supports: rule.supports || null,
          mediaActive: !!rule.mediaActive,
          supportsActive: !!rule.supportsActive,
          variableReferences: safeArray(declaration.variableReferences),
        });
      }
    }

    return definitions;
  }

  function collectInlineCustomPropertyDefinitions(elements) {
    const definitions = [];

    for (const element of safeArray(elements)) {
      if (!element || !element.hasAttribute("style")) continue;

      const declarations = getStyleDeclarations(element.style, element.getAttribute("style") || "");

      for (const declaration of declarations) {
        const property = safeString(declaration.originalProperty || declaration.property).trim();
        if (!isCustomPropertyName(property)) continue;

        definitions.push({
          property,
          value: normalizeWhitespace(declaration.originalValue || declaration.value),
          important: !!declaration.important,
          selector: "[style]",
          originalSelector: "[style]",
          scopeKind: "inline",
          declarationIndex: declaration.declarationIndex ?? 0,
          specificity: { a: 0, b: 0, c: 0, value: 0, text: "0,0,0" },
          stylesheetIndex: -1,
          stylesheetHref: "",
          stylesheetTitle: "Inline",
          stylesheetFramework: "Inline",
          ruleIndex: -1,
          sourceOrder: Number.MAX_SAFE_INTEGER,
          media: null,
          supports: null,
          mediaActive: true,
          supportsActive: true,
          elementLabel: getNodeLabel(element),
          elementDetails: getElementMetadata(element),
          variableReferences: safeArray(declaration.variableReferences),
        });
      }
    }

    return definitions;
  }

  function deduplicateCustomPropertyDefinitions(definitions) {
    const seen = new Set();
    const output = [];

    for (const definition of safeArray(definitions)) {
      const key = [
        definition.property, definition.value, definition.selector,
        definition.stylesheetIndex, definition.ruleIndex, definition.declarationIndex,
        definition.elementLabel || "", definition.media || "", definition.supports || "",
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(definition);
    }
    return output;
  }


  /* =========================================================
     V2.2-A2 - CUSTOM PROPERTY CASCADE
  ========================================================= */

  function compareSpecificityValues(left, right) {
    const a = left || { a: 0, b: 0, c: 0, value: 0 };
    const b = right || { a: 0, b: 0, c: 0, value: 0 };

    if ((a.a || 0) !== (b.a || 0)) {
      return (a.a || 0) - (b.a || 0);
    }

    if ((a.b || 0) !== (b.b || 0)) {
      return (a.b || 0) - (b.b || 0);
    }

    if ((a.c || 0) !== (b.c || 0)) {
      return (a.c || 0) - (b.c || 0);
    }

    return (a.value || 0) - (b.value || 0);
  }

  function customPropertyCandidateScore(definition) {
    return {
      important: definition?.important ? 1 : 0,
      inline: definition?.stylesheetIndex === -1 ? 1 : 0,
      specificity: definition?.specificity || {
        a: 0,
        b: 0,
        c: 0,
        value: 0,
      },
      sourceOrder:
        Number.isFinite(definition?.sourceOrder)
          ? definition.sourceOrder
          : -1,
      declarationIndex:
        Number.isFinite(definition?.declarationIndex)
          ? definition.declarationIndex
          : 0,
    };
  }

  function compareCustomPropertyCandidates(left, right) {
    const a = customPropertyCandidateScore(left);
    const b = customPropertyCandidateScore(right);

    /*
     * This is the author-CSS cascade model for custom properties.
     * Origin/layer/animation handling remains outside V2.2-A2.
     */

    if (a.important !== b.important) {
      return a.important - b.important;
    }

    /*
     * Inline declarations have author specificity equivalent to
     * an ID-level declaration for cascade purposes. They are kept
     * as an explicit tier here so A2 does not have to manufacture
     * a fake selector specificity.
     */
    if (a.inline !== b.inline) {
      return a.inline - b.inline;
    }

    const specificityComparison =
      compareSpecificityValues(
        a.specificity,
        b.specificity,
      );

    if (specificityComparison !== 0) {
      return specificityComparison;
    }

    if (a.sourceOrder !== b.sourceOrder) {
      return a.sourceOrder - b.sourceOrder;
    }

    return a.declarationIndex - b.declarationIndex;
  }

  function cloneCustomPropertyDefinition(
    definition,
    element,
    status,
    targetIndex = null,
  ) {
    return {
      ...definition,
      status,
      targetIndex,
      targetElement: getNodeLabel(element),
      /* V2.2-A5.1: retain the actual DOM node for recursive
       * custom-property resolution. The display label above is
       * intentionally kept for serialization/debugging, but a
       * nested var() lookup must continue from the real element. */
      targetElementNode: element,
      targetElementDetails: getElementMetadata(element),
    };
  }

  function getCustomPropertyCascadeElements(
    root,
    elements,
    ancestors,
  ) {
    const output = [];
    const seen = new Set();

    /*
     * Include the document root/body because :root/html/body
     * custom-property definitions are actual cascade scopes.
     */
    const candidates = [
      document.documentElement,
      document.body,
      ...safeArray(ancestors).slice().reverse(),
      ...safeArray(elements),
    ];

    for (const element of candidates) {
      if (!element || element.nodeType !== 1) continue;
      if (seen.has(element)) continue;

      seen.add(element);
      output.push(element);
    }

    if (root && !seen.has(root)) {
      output.push(root);
    }

    return output;
  }

  function selectorMatchesCustomPropertyCascadeTarget(
    definition,
    element,
  ) {
    const selector = safeString(
      definition?.selector ||
        definition?.originalSelector,
    ).trim();

    if (!selector || !element) {
      return false;
    }

    const normalized = normalizeWhitespace(selector);

    if (normalized === ":root") {
      return element === document.documentElement;
    }

    if (
      normalized === "html" ||
      normalized === "html:root"
    ) {
      return (
        element === document.documentElement
      );
    }

    if (normalized === "body") {
      return element === document.body;
    }

    return selectorMatchesElement(
      normalized,
      element,
    );
  }

  function buildCustomPropertyCascade(
    definitions,
    root,
    elements,
    ancestors,
  ) {
    const targets =
      getCustomPropertyCascadeElements(
        root,
        elements,
        ancestors,
      );

    const candidates = [];
    const winners = [];
    const overridden = [];

    for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
      const element = targets[targetIndex];
      const elementDefinitions =
        safeArray(definitions).filter(
          (definition) =>
            definition.mediaActive !== false &&
            definition.supportsActive !== false &&
            selectorMatchesCustomPropertyCascadeTarget(
              definition,
              element,
            ),
        );

      const byProperty = new Map();

      for (const definition of elementDefinitions) {
        const property = safeString(
          definition.property,
        ).trim();

        if (!isCustomPropertyName(property)) {
          continue;
        }

        if (!byProperty.has(property)) {
          byProperty.set(property, []);
        }

        byProperty.get(property).push(
          definition,
        );
      }

      for (const [property, propertyCandidates] of byProperty) {
        const sorted =
          propertyCandidates
            .slice()
            .sort(
              (
                left,
                right,
              ) =>
                compareCustomPropertyCandidates(
                  right,
                  left,
                ),
            );

        if (!sorted.length) continue;

        const winner =
          cloneCustomPropertyDefinition(
            sorted[0],
            element,
            "winning",
            targetIndex,
          );

        winners.push(winner);

        candidates.push(
          ...sorted.map((candidate) =>
            cloneCustomPropertyDefinition(
              candidate,
              element,
              candidate === sorted[0]
                ? "winning"
                : "overridden",
              targetIndex,
            ),
          ),
        );

        for (
          let index = 1;
          index < sorted.length;
          index++
        ) {
          overridden.push(
            cloneCustomPropertyDefinition(
              sorted[index],
              element,
              "overridden",
              targetIndex,
            ),
          );
        }
      }
    }

    /*
     * Deduplicate candidate records while preserving the
     * per-element cascade result.
     */
    const seenCandidates = new Set();
    const deduplicatedCandidates = [];

    for (const candidate of candidates) {
      const key = [
        candidate.targetElement,
        candidate.property,
        candidate.selector,
        candidate.value,
        candidate.stylesheetIndex,
        candidate.ruleIndex,
        candidate.declarationIndex,
        candidate.status,
      ].join("|");

      if (seenCandidates.has(key)) continue;

      seenCandidates.add(key);
      deduplicatedCandidates.push(candidate);
    }

    return {
      targets,
      candidates: deduplicatedCandidates,
      winners,
      overridden,
      winningCount: winners.length,
      overriddenCount: overridden.length,
    };
  }

  /* =========================================================
     INLINE STYLES
  ========================================================= */

  /*
   * V2.2.0-A3.2
   *
   * Guarantee that live inline styles are present in the normal
   * declaration pipeline. Some pages/inspection flows can mutate the
   * selected DOM between source collection and cascade analysis. Rather
   * than relying on the earlier rule array containing the inline record,
   * this reconciliation pass reads the LIVE style attribute immediately
   * before declaration-record creation and adds any missing inline rule.
   */
  function inspectLiveInlineStyles(elements, root) {
    const diagnostics = {
      analyzedElements: 0,
      elementsWithStyle: 0,
      liveStyleDeclarations: 0,
      elementsWithVar: 0,
      liveVarReferences: 0,
      rootFoundInElements: false,
      rootStyleText: "",
      entries: [],
    };

    for (const element of safeArray(elements)) {
      if (!element || element.nodeType !== 1) continue;

      diagnostics.analyzedElements++;
      if (element === root) diagnostics.rootFoundInElements = true;

      const style = element.style;
      if (!style) continue;

      const attributeText =
        element.getAttribute("style") || "";
      const cssText = safeString(style.cssText || "");
      const effectiveText = cssText || attributeText;
      const declarationCount = Number(style.length) || 0;

      if (!effectiveText && declarationCount === 0) continue;

      diagnostics.elementsWithStyle++;
      diagnostics.liveStyleDeclarations += declarationCount;

      const properties = [];
      const varReferences = [];

      for (let i = 0; i < style.length; i++) {
        const property = style[i];
        if (!property) continue;

        const value = style.getPropertyValue(property);
        properties.push({
          property,
          value,
          important: style.getPropertyPriority(property) === "important",
        });

        for (const reference of parseVarFunctions(value)) {
          if (!varReferences.includes(reference.property)) {
            varReferences.push(reference.property);
          }
        }
      }

      if (varReferences.length) {
        diagnostics.elementsWithVar++;
        diagnostics.liveVarReferences += varReferences.length;
      }

      const entry = {
        elementLabel: getNodeLabel(element),
        isRoot: element === root,
        hasStyleAttribute: element.hasAttribute("style"),
        attributeText,
        cssText,
        effectiveText,
        declarationCount,
        properties,
        varReferences,
      };

      diagnostics.entries.push(entry);

      if (element === root) {
        diagnostics.rootStyleText = effectiveText;
      }
    }

    return diagnostics;
  }

  function ensureLiveInlineStylesInRules(elements, rules, diagnostics = null) {
    /*
     * V2.2.0-A3.3
     *
     * Live inline styles are a first-class source. Do not depend on
     * hasAttribute("style") alone: a DOM/CSSOM mutation may expose the
     * declaration through CSSStyleDeclaration before the attribute path
     * is consumed by the analyzer. CSSOM is the live source of truth and
     * cssText is retained for provenance/debugging.
     */
    const existing = new Set(
      safeArray(rules)
        .filter((rule) => rule && rule.kind === "inline")
        .flatMap((rule) => safeArray(rule.matchedElements))
    );

    let added = 0;
    let reconciled = 0;
    let inspected = 0;
    let elementsWithStyle = 0;
    let liveStyleDeclarations = 0;
    let inlineDeclarationsCreated = 0;
    let inlineRulesAfter = 0;

    for (const element of safeArray(elements)) {
      if (!element || !element.style) continue;

      const style = element.style;
      inspected++;
      const styleText =
        style.cssText ||
        element.getAttribute("style") ||
        "";

      /*
       * Always read CSSOM. This catches programmatic style mutations even
       * when the source-attribute snapshot is stale/empty.
       */
      const declarations = getStyleDeclarations(
        style,
        styleText,
      );

      if (!declarations.length) continue;

      elementsWithStyle++;
      liveStyleDeclarations += declarations.length;

      const existingRule = safeArray(rules).find(
        (rule) =>
          rule &&
          rule.kind === "inline" &&
          safeArray(rule.matchedElements).includes(element),
      );

      const inlineRule = {
        kind: "inline",
        selector: "[style]",
        originalSelector: "[style]",
        cssText: styleText,
        declarations,
        matchedElements: [element],
        matchedElementLabels: [getNodeLabel(element)],
        matchedElementDetails: [getElementMetadata(element)],
        specificity: {
          a: 1,
          b: 0,
          c: 0,
          value: 1000000,
          text: "1,0,0",
        },
        stylesheetIndex: -1,
        stylesheetHref: "",
        stylesheetTitle: "Inline style",
        stylesheetFramework: "Inline",
        ruleIndex: -1,
        sourceOrder: Number.MAX_SAFE_INTEGER,
        media: null,
        supports: null,
        mediaActive: true,
        supportsActive: true,
        ruleType: "inline",
        variableReferences: declarations.flatMap(
          (d) => d.variableReferences || [],
        ),
      };

      if (existingRule) {
        /* Refresh the live record rather than retaining an old snapshot. */
        Object.assign(existingRule, inlineRule);
        reconciled++;
      } else {
        rules.push(inlineRule);
        existing.add(element);
        added++;
      }

      inlineDeclarationsCreated += declarations.length;
    }

    inlineRulesAfter = safeArray(rules).filter(
      (rule) => rule && rule.kind === "inline",
    ).length;

    if (diagnostics) {
      diagnostics.ensureInspectedElements = inspected;
      diagnostics.ensureElementsWithStyle = elementsWithStyle;
      diagnostics.ensureLiveStyleDeclarations = liveStyleDeclarations;
      diagnostics.inlineRulesAdded = added;
      diagnostics.inlineRulesReconciled = reconciled;
      diagnostics.inlineRulesAfter = inlineRulesAfter;
      diagnostics.inlineDeclarationsCreated = inlineDeclarationsCreated;
    }

    return added + reconciled;
  }

  function collectInlineStyles(
    elements,
    output,
  ) {
    for (const element of safeArray(elements)) {
      if (!element.hasAttribute("style")) {
        continue;
      }

      const style = element.style;

      const declarations =
        getStyleDeclarations(
          style,
          element.getAttribute("style") || "",
        );

      if (!declarations.length) {
        continue;
      }

      output.push({
        kind: "inline",

        selector: "[style]",

        originalSelector: "[style]",

        cssText:
          element.getAttribute("style") ||
          "",

        declarations,

        matchedElements: [element],

        matchedElementLabels: [
          getNodeLabel(element),
        ],

        /*
         * V2.1.2
         */
        matchedElementDetails: [
          getElementMetadata(element),
        ],

        specificity: {
          a: 1,
          b: 0,
          c: 0,

          value: 1000000,

          text: "1,0,0",
        },

        stylesheetIndex: -1,

        stylesheetHref: "",

        stylesheetTitle:
          "Inline style",

        stylesheetFramework:
          "Inline",

        ruleIndex: -1,

        sourceOrder:
          Number.MAX_SAFE_INTEGER,

        media: null,

        supports: null,

        mediaActive: true,

        supportsActive: true,

        ruleType: "inline",

        variableReferences:
          declarations.flatMap(
            (d) =>
              d.variableReferences || [],
          ),
      });
    }
  }

  /* =========================================================
     CASCADE COMPARISON
  ========================================================= */

  function getCascadeRank(declaration) {
    /*
     * Current V2.1 model:
     *
     * 1. Active media/supports
     * 2. !important
     * 3. specificity
     * 4. source order
     *
     * Full origins/layers/animations will be
     * handled in later stages.
     */

    return {
      important:
        declaration.important ? 1 : 0,

      specificityValue:
        declaration.specificity?.value || 0,

      sourceOrder:
        declaration.sourceOrder ?? 0,

      /*
       * V2.1.2
       *
       * Declaration order is retained separately.
       */
      declarationIndex:
        declaration.declarationIndex ?? 0,
    };
  }

  function compareCascadePriority(a, b) {
    const rankA =
      getCascadeRank(a);

    const rankB =
      getCascadeRank(b);

    if (
      rankA.important !==
      rankB.important
    ) {
      return (
        rankA.important -
        rankB.important
      );
    }

    if (
      rankA.specificityValue !==
      rankB.specificityValue
    ) {
      return (
        rankA.specificityValue -
        rankB.specificityValue
      );
    }

    if (
      rankA.sourceOrder !==
      rankB.sourceOrder
    ) {
      return (
        rankA.sourceOrder -
        rankB.sourceOrder
      );
    }

    return (
      rankA.declarationIndex -
      rankB.declarationIndex
    );
  }

  /* =========================================================
     DECLARATION RECORD CREATION
  ========================================================= */

  function createDeclarationRecords(
    rules,
  ) {
    const declarations = [];

    for (const rule of safeArray(rules)) {
      const ruleDeclarations =
        safeArray(rule.declarations);

      for (
        let declarationIndex = 0;
        declarationIndex <
        ruleDeclarations.length;
        declarationIndex++
      ) {
        const declaration =
          ruleDeclarations[
            declarationIndex
          ];

        /*
         * V2.1.2
         *
         * Each source declaration retains its complete
         * declaration model.
         */

        const record = {
          /*
           * Existing V2.1 fields.
           */

          property:
            declaration.property,

          value:
            declaration.value,

          important:
            declaration.important,

          /*
           * V2.1.2 declaration provenance.
           */

          originalProperty:
            declaration.originalProperty,

          originalValue:
            declaration.originalValue,

          declarationType:
            declaration.declarationType,

          declarationIndex:
            declaration.declarationIndex ??
            declarationIndex,

          expandedProperties:
            safeArray(
              declaration.expandedProperties,
            ),

          /*
           * Rule/source information.
           */

          rule,

          selector:
            rule.selector,

          originalSelector:
            rule.originalSelector,

          matchedElements:
            rule.matchedElements,

          matchedElementLabels:
            safeArray(
              rule.matchedElementLabels,
            ),

          matchedElementDetails:
            safeArray(
              rule.matchedElementDetails,
            ),

          specificity:
            rule.specificity,

          stylesheetIndex:
            rule.stylesheetIndex,

          stylesheetHref:
            rule.stylesheetHref,

          stylesheetTitle:
            rule.stylesheetTitle,

          stylesheetFramework:
            rule.stylesheetFramework,

          ruleIndex:
            rule.ruleIndex,

          sourceOrder:
            rule.sourceOrder,

          media:
            rule.media,

          supports:
            rule.supports,

          mediaActive:
            rule.mediaActive,

          supportsActive:
            rule.supportsActive,

          /*
           * Variable references belong to the original
           * source declaration.
           */

          variableReferences:
            safeArray(
              declaration.variableReferences,
            ),

          status: "candidate",

          cascadeRank: null,
        };

        /*
         * V2.1.2
         *
         * A source shorthand such as:
         *
         * padding: 8px 16px
         *
         * creates one source declaration record,
         * while its expanded properties are available
         * to the cascade engine.
         */

        declarations.push(record);
      }
    }

    return declarations;
  }

  /* =========================================================
     V2.1.2 - EXPANDED CASCADE RECORDS
  ========================================================= */

  function createExpandedCascadeRecords(
    declarations,
  ) {
    const expanded = [];

    for (const declaration of safeArray(
      declarations,
    )) {
      const properties =
        safeArray(
          declaration.expandedProperties,
        );

      if (!properties.length) {
        expanded.push(declaration);
        continue;
      }

      for (
        let expandedIndex = 0;
        expandedIndex <
        properties.length;
        expandedIndex++
      ) {
        const expandedProperty =
          properties[expandedIndex];

        if (!expandedProperty) {
          continue;
        }

        expanded.push({
          ...declaration,

          /*
           * Cascade property.
           */

          property:
            expandedProperty.property,

          value:
            expandedProperty.value,

          /*
           * Source declaration remains intact.
           */

          originalProperty:
            declaration.originalProperty,

          originalValue:
            declaration.originalValue,

          declarationType:
            declaration.declarationType,

          expandedIndex,

          expandedFrom:
            declaration.declarationType === "shorthand"
              ? declaration.originalProperty
              : null,

          /*
           * Preserve original declaration reference.
           */

          sourceDeclaration:
            declaration,
        });
      }
    }

    return expanded;
  }

  /* =========================================================
     COMPUTED STYLE MAPPING
  ========================================================= */

  function getComputedPropertyValue(
    element,
    property,
  ) {
    try {
      const computed =
        window.getComputedStyle(
          element,
        );

      return normalizeWhitespace(
        computed.getPropertyValue(
          property,
        ),
      );
    } catch (error) {
      return "";
    }
  }

  function buildCascadeMap(
    elements,
    declarations,
  ) {
    /*
     * Map:
     *
     * element
     *   -> property
     *      -> declarations
     */

    const map = new Map();

    for (const element of safeArray(
      elements,
    )) {
      map.set(element, new Map());
    }

    /*
     * V2.1.2
     *
     * Cascade now receives expanded property
     * records while source provenance remains attached.
     */

    const cascadeDeclarations =
      createExpandedCascadeRecords(
        declarations,
      );

    for (const declaration of cascadeDeclarations) {
      if (
        !declaration.mediaActive ||
        !declaration.supportsActive
      ) {
        declaration.status =
          "inactive";

        continue;
      }

      for (const element of safeArray(
        declaration.matchedElements,
      )) {
        if (!map.has(element)) {
          map.set(element, new Map());
        }

        const propertyMap =
          map.get(element);

        if (
          !propertyMap.has(
            declaration.property,
          )
        ) {
          propertyMap.set(
            declaration.property,
            [],
          );
        }

        propertyMap
          .get(declaration.property)
          .push(declaration);
      }
    }

    return {
      map,

      cascadeDeclarations,
    };
  }

  function determineWinners(
    elements,
    declarations,
  ) {
    const cascadeData =
      buildCascadeMap(
        elements,
        declarations,
      );

    const map =
      cascadeData.map;

    const cascadeDeclarations =
      cascadeData.cascadeDeclarations;

    const winners = [];

    const overridden = [];

    for (const [
      element,
      propertyMap,
    ] of map.entries()) {
      for (const [
        property,
        candidates,
      ] of propertyMap.entries()) {
        if (!candidates.length) {
          continue;
        }

        /*
         * Sort weakest → strongest.
         */

        candidates.sort(
          compareCascadePriority,
        );

        const winner =
          candidates[
            candidates.length - 1
          ];

        winner.status =
          "winning";

        winner.cascadeRank =
          getCascadeRank(winner);

        winners.push({
          element,

          elementLabel:
            getNodeLabel(element),

          matchedElementLabels:
            safeArray(
              winner.matchedElementLabels,
            ),

          matchedElementDetails:
            safeArray(
              winner.matchedElementDetails,
            ),

          property,

          value:
            winner.value,

          important:
            winner.important,

          /*
           * V2.1.2 source provenance.
           */

          originalProperty:
            winner.originalProperty,

          originalValue:
            winner.originalValue,

          declarationType:
            winner.declarationType,

          declarationIndex:
            winner.declarationIndex,

          expandedIndex:
            winner.expandedIndex ?? 0,

          expandedFrom:
            winner.expandedFrom ?? null,

          expandedProperties:
            safeArray(
              winner.expandedProperties,
            ),

          selector:
            winner.selector,

          originalSelector:
            winner.originalSelector,

          cssText:
            winner.rule?.cssText || "",

          stylesheetIndex:
            winner.stylesheetIndex,

          stylesheetHref:
            winner.stylesheetHref,

          stylesheetTitle:
            winner.stylesheetTitle,

          stylesheetFramework:
            winner.stylesheetFramework,

          ruleIndex:
            winner.ruleIndex,

          sourceOrder:
            winner.sourceOrder,

          specificity:
            winner.specificity,

          media:
            winner.media,

          supports:
            winner.supports,

          variableReferences:
            (() => {
              const stored = safeArray(
                winner.variableReferences,
              );
              if (stored.length) return stored;
              return extractVariableReferences(
                winner.originalValue || winner.value || "",
              );
            })(),

          declaration:
            winner,
        });

        /*
         * All weaker candidates are overridden.
         */

        for (
          let i = 0;
          i < candidates.length - 1;
          i++
        ) {
          const overriddenDeclaration =
            candidates[i];

          overriddenDeclaration.status =
            "overridden";

          overriddenDeclaration.cascadeRank =
            getCascadeRank(
              overriddenDeclaration,
            );

          overridden.push(
            overriddenDeclaration,
          );
        }
      }
    }

    return {
      winners,

      overridden,

      map,

      cascadeDeclarations,
    };
  }

  /* =========================================================
     COMPUTED VALUE VALIDATION
  ========================================================= */

  /*
   * V2.1.2-R1
   *
   * Compare a winning source value with the browser's actual
   * computed value semantically. Literal string comparison is
   * incorrect for equivalent values such as:
   *
   *   0.5rem  ->  8px
   *   #fff    ->  rgb(255, 255, 255)
   *
   * We temporarily apply the winning declaration to the actual
   * element, read the browser-normalized computed value, and
   * immediately restore the original inline declaration.
   *
   * This preserves the real element's inheritance/layout context,
   * which is important for relative units. The operation is
   * synchronous and the inline style is restored before return.
   */
  function semanticallyMatchesComputed(
    element,
    property,
    value,
    important,
    actualComputedValue,
  ) {
    if (
      !element ||
      !property ||
      !actualComputedValue
    ) {
      return false;
    }

    const style = element.style;

    try {
      const hadInlineDeclaration =
        style.getPropertyValue(property) !== "";

      const previousValue =
        style.getPropertyValue(property);

      const previousPriority =
        style.getPropertyPriority(property);

      style.setProperty(
        property,
        value,
        important ? "important" : "",
      );

      const normalizedAppliedValue =
        getComputedPropertyValue(
          element,
          property,
        );

      const matches =
        normalizedAppliedValue ===
        actualComputedValue;

      if (hadInlineDeclaration) {
        style.setProperty(
          property,
          previousValue,
          previousPriority,
        );
      } else {
        style.removeProperty(property);
      }

      return matches;
    } catch (error) {
      /*
       * Always restore the inline declaration if possible.
       */
      try {
        if (
          style.getPropertyValue(property) !== ""
        ) {
          style.removeProperty(property);
        }
      } catch (restoreError) {
        // Ignore restoration failure.
      }

      return false;
    }
  }

  function validateWinningDeclarations(
    winners,
  ) {
    for (const winner of safeArray(
      winners,
    )) {
      const element =
        winner.element;

      if (!element) {
        continue;
      }

      const computedValue =
        getComputedPropertyValue(
          element,
          winner.property,
        );

      winner.computedValue =
        computedValue;

      /*
       * First try exact comparison.
       */
      winner.matchesComputed =
        normalizeWhitespace(
          winner.value,
        ) === computedValue;

      /*
       * R1 semantic browser comparison.
       *
       * This resolves unit normalization and other browser
       * serialization differences while keeping the actual
       * element's context.
       */
      if (
        !winner.matchesComputed &&
        computedValue
      ) {
        winner.matchesComputed =
          semanticallyMatchesComputed(
            element,
            winner.property,
            winner.value,
            winner.important,
            computedValue,
          );
      }

      winner.variableReferences =
        safeArray(
          winner.variableReferences,
        );

      winner.variableDependent =
        winner.variableReferences
          .length > 0;

      /*
       * var(...) resolves to the computed value,
       * so source value and computed value are
       * expected to differ.
       */
      if (
        winner.variableDependent &&
        computedValue
      ) {
        winner.matchesComputed = true;
      }
    }
  }


  /* =========================================================
     V2.2-A3 - VAR() RESOLUTION
  ========================================================= */

  function findMatchingParenthesis(value, openIndex) {
    let depth = 0;
    let quote = null;
    let escaped = false;

    for (let i = openIndex; i < value.length; i++) {
      const char = value[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (quote) {
        if (char === "\\") {
          escaped = true;
        } else if (char === quote) {
          quote = null;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }

      if (char === "(") {
        depth++;
      } else if (char === ")") {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }

    return -1;
  }

  function splitTopLevelComma(value) {
    let depth = 0;
    let quote = null;
    let escaped = false;

    for (let i = 0; i < value.length; i++) {
      const char = value[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (quote) {
        if (char === "\\") {
          escaped = true;
        } else if (char === quote) {
          quote = null;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }

      if (char === "(") {
        depth++;
      } else if (char === ")") {
        depth = Math.max(0, depth - 1);
      } else if (char === "," && depth === 0) {
        return [value.slice(0, i), value.slice(i + 1)];
      }
    }

    return [value, null];
  }

  function parseVarFunctions(value) {
    const input = safeString(value);
    const references = [];
    let index = 0;

    while (index < input.length) {
      const match = /var\s*\(/gi.exec(input.slice(index));
      if (!match) break;

      const openIndex = index + match.index + match[0].length - 1;
      const closeIndex = findMatchingParenthesis(input, openIndex);

      if (closeIndex < 0) break;

      const body = input.slice(openIndex + 1, closeIndex);
      const [namePart, fallbackPart] = splitTopLevelComma(body);
      const property = safeString(namePart).trim();

      if (/^--[\w-]+$/.test(property)) {
        references.push({
          property,
          fallback:
            fallbackPart === null
              ? null
              : safeString(fallbackPart).trim(),
          raw: input.slice(index + match.index, closeIndex + 1),
        });
      }

      index = closeIndex + 1;
    }

    return references;
  }

  function buildCustomPropertyWinnerLookup(customPropertyCascade) {
    const lookup = new Map();

    for (const winner of safeArray(customPropertyCascade?.winners)) {
      const targetIndex = Number(winner.targetIndex);
      if (!Number.isInteger(targetIndex)) continue;

      if (!lookup.has(targetIndex)) {
        lookup.set(targetIndex, new Map());
      }

      lookup.get(targetIndex).set(
        winner.property,
        winner,
      );
    }

    return lookup;
  }

  function findTargetIndexForElement(targets, element) {
    const list = safeArray(targets);
    return list.indexOf(element);
  }

  function findInheritedCustomPropertyDefinition(
    property,
    element,
    targets,
    winnerLookup,
  ) {
    let current = element;
    let distance = 0;

    while (current && current.nodeType === 1) {
      const targetIndex = findTargetIndexForElement(
        targets,
        current,
      );

      if (targetIndex >= 0) {
        const propertyMap = winnerLookup.get(targetIndex);
        const winner = propertyMap?.get(property);

        if (winner) {
          return {
            winner,
            targetIndex,
            distance,
            inherited: distance > 0,
          };
        }
      }

      current = current.parentElement;
      distance++;
    }

    return null;
  }

  function resolveVarReferencesForWinner(
    winner,
    customPropertyCascade,
  ) {
    const targets = safeArray(customPropertyCascade?.targets);
    const winnerLookup = buildCustomPropertyWinnerLookup(
      customPropertyCascade,
    );

    const resolution = resolveValueWithVariables(
      winner?.originalValue || winner?.value || "",
      winner?.element || null,
      targets,
      winnerLookup,
      {
        stack: [],
        maxDepth: 32,
      },
    );

    return {
      status: resolution.status,
      references: resolution.references,
      resolvedCount: resolution.resolvedCount,
      unresolvedCount: resolution.unresolvedCount,
      pendingCount: resolution.pendingCount,
      nestedReferenceCount: resolution.nestedReferenceCount,
      nestedResolvedCount: resolution.nestedResolvedCount,
      nestedUnresolvedCount: resolution.nestedUnresolvedCount,
      circularCount: resolution.circularCount,
      resolvedValue: resolution.resolvedValue,
    };
  }

  /*
   * V2.2-A5.1: recursively resolve custom-property values.
   *
   * A4 could resolve:
   *   var(--x)
   *   var(--missing, red)
   *
   * A5 additionally follows:
   *   --a: var(--b)
   *   color: var(--a)
   *
   * and nested fallbacks such as:
   *   color: var(--missing, var(--bs-primary))
   *
   * Resolution is intentionally token/value oriented rather than a
   * full CSS parser. The original source values remain authoritative;
   * this layer only builds the dependency chain and a resolved value.
   * Circular references are detected with a per-resolution stack.
   */
  function resolveValueWithVariables(
    value,
    element,
    targets,
    winnerLookup,
    state,
  ) {
    const input = safeString(value);
    const references = parseVarFunctions(input);

    if (!references.length) {
      return {
        status: "resolved",
        references: [],
        resolvedCount: 0,
        unresolvedCount: 0,
        pendingCount: 0,
        nestedReferenceCount: 0,
        nestedResolvedCount: 0,
        nestedUnresolvedCount: 0,
        circularCount: 0,
        resolvedValue: input,
      };
    }

    let output = "";
    let cursor = 0;
    let resolvedCount = 0;
    let unresolvedCount = 0;
    let pendingCount = 0;
    let nestedReferenceCount = 0;
    let nestedResolvedCount = 0;
    let nestedUnresolvedCount = 0;
    let circularCount = 0;
    const resolvedReferences = [];

    for (const reference of references) {
      const rawIndex = input.indexOf(reference.raw, cursor);
      const startIndex = rawIndex >= 0 ? rawIndex : cursor;
      const endIndex = startIndex + reference.raw.length;

      output += input.slice(cursor, startIndex);

      const resolved = resolveSingleVarReference(
        reference,
        element,
        targets,
        winnerLookup,
        state,
      );

      resolvedReferences.push(resolved.reference);

      if (resolved.reference.status === "resolved") {
        resolvedCount++;
      } else if (resolved.reference.status === "unresolved") {
        unresolvedCount++;
      } else if (resolved.reference.status === "pending") {
        pendingCount++;
      }

      nestedReferenceCount += resolved.nestedReferenceCount;
      nestedResolvedCount += resolved.nestedResolvedCount;
      nestedUnresolvedCount += resolved.nestedUnresolvedCount;
      circularCount += resolved.circularCount;

      /*
       * If the variable resolved to a value, substitute it into the
       * current value. For unresolved/circular references, preserve the
       * original var() token rather than inventing a value.
       */
      if (resolved.reference.status === "resolved") {
        output += safeString(resolved.resolvedValue);
      } else {
        output += reference.raw;
      }

      cursor = endIndex;
    }

    output += input.slice(cursor);

    const status =
      unresolvedCount > 0 || circularCount > 0
        ? resolvedCount > 0
          ? "partially-resolved"
          : "unresolved"
        : pendingCount > 0
          ? "pending"
          : "resolved";

    return {
      status,
      references: resolvedReferences,
      resolvedCount,
      unresolvedCount,
      pendingCount,
      nestedReferenceCount,
      nestedResolvedCount,
      nestedUnresolvedCount,
      circularCount,
      resolvedValue: output,
    };
  }

  function resolveSingleVarReference(
    reference,
    element,
    targets,
    winnerLookup,
    state,
  ) {
    const source = findInheritedCustomPropertyDefinition(
      reference.property,
      element,
      targets,
      winnerLookup,
    );

    if (!source) {
      if (reference.fallback !== null) {
        const fallbackValue = safeString(reference.fallback).trim();
        const fallbackReferences = parseVarFunctions(fallbackValue);

        if (fallbackReferences.length) {
          const nested = resolveValueWithVariables(
            fallbackValue,
            element,
            targets,
            winnerLookup,
            state,
          );

          return {
            reference: {
              ...reference,
              status:
                nested.status === "resolved"
                  ? "resolved"
                  : nested.status === "unresolved"
                    ? "unresolved"
                    : "pending",
              resolutionKind:
                nested.status === "resolved"
                  ? "fallback-nested"
                  : "fallback-nested-pending",
              fallbackUsed: nested.status === "resolved",
              resolvedValue:
                nested.status === "resolved"
                  ? nested.resolvedValue
                  : null,
              sourceTargetIndex: null,
              sourceTargetElement: null,
              inherited: false,
              definition: null,
              fallbackReferences,
              nested: nested.references,
            },
            resolvedValue:
              nested.status === "resolved"
                ? nested.resolvedValue
                : null,
            nestedReferenceCount:
              fallbackReferences.length + nested.nestedReferenceCount,
            nestedResolvedCount:
              nested.resolvedCount + nested.nestedResolvedCount,
            nestedUnresolvedCount:
              nested.unresolvedCount + nested.nestedUnresolvedCount,
            circularCount: nested.circularCount,
          };
        }

        return {
          reference: {
            ...reference,
            status: "resolved",
            resolutionKind: "fallback",
            fallbackUsed: true,
            resolvedValue: fallbackValue,
            sourceTargetIndex: null,
            sourceTargetElement: null,
            inherited: false,
            definition: null,
            fallbackReferences: [],
            nested: [],
          },
          resolvedValue: fallbackValue,
          nestedReferenceCount: 0,
          nestedResolvedCount: 0,
          nestedUnresolvedCount: 0,
          circularCount: 0,
        };
      }

      return {
        reference: {
          ...reference,
          status: "unresolved",
          resolutionKind: "missing",
          fallbackUsed: false,
          resolvedValue: null,
          sourceTargetIndex: null,
          sourceTargetElement: null,
          inherited: false,
          definition: null,
          fallbackReferences: [],
          nested: [],
        },
        resolvedValue: null,
        nestedReferenceCount: 0,
        nestedResolvedCount: 0,
        nestedUnresolvedCount: 0,
        circularCount: 0,
      };
    }

    const property = reference.property;

    if (state.stack.includes(property)) {
      return {
        reference: {
          ...reference,
          status: "unresolved",
          resolutionKind: "circular",
          fallbackUsed: false,
          resolvedValue: null,
          sourceTargetIndex: source.targetIndex,
          sourceTargetElement:
            source.winner.targetElementNode || null,
          inherited: source.inherited,
          inheritanceDistance: source.distance,
          definition: source.winner,
          fallbackReferences: [],
          nested: [],
          cyclePath: [...state.stack, property],
        },
        resolvedValue: null,
        nestedReferenceCount: 1,
        nestedResolvedCount: 0,
        nestedUnresolvedCount: 1,
        circularCount: 1,
      };
    }

    if (state.stack.length >= state.maxDepth) {
      return {
        reference: {
          ...reference,
          status: "unresolved",
          resolutionKind: "max-depth",
          fallbackUsed: false,
          resolvedValue: null,
          sourceTargetIndex: source.targetIndex,
          sourceTargetElement:
            source.winner.targetElementNode || null,
          inherited: source.inherited,
          inheritanceDistance: source.distance,
          definition: source.winner,
          fallbackReferences: [],
          nested: [],
        },
        resolvedValue: null,
        nestedReferenceCount: 1,
        nestedResolvedCount: 0,
        nestedUnresolvedCount: 1,
        circularCount: 0,
      };
    }

    const definitionValue = safeString(
      source.winner.originalValue || source.winner.value || "",
    );

    const nestedReferences = parseVarFunctions(definitionValue);
    let nested = {
      status: "resolved",
      references: [],
      resolvedCount: 0,
      unresolvedCount: 0,
      pendingCount: 0,
      nestedReferenceCount: 0,
      nestedResolvedCount: 0,
      nestedUnresolvedCount: 0,
      circularCount: 0,
      resolvedValue: definitionValue,
    };

    if (nestedReferences.length) {
      state.stack.push(property);
      nested = resolveValueWithVariables(
        definitionValue,
        source.winner.targetElementNode || element,
        targets,
        winnerLookup,
        state,
      );
      state.stack.pop();
    }

    const isResolved = nested.status === "resolved";

    return {
      reference: {
        ...reference,
        status: isResolved ? "resolved" : nested.status,
        resolutionKind:
          nestedReferences.length
            ? "custom-property-nested"
            : "custom-property",
        fallbackUsed: false,
        resolvedValue: isResolved ? nested.resolvedValue : null,
        sourceTargetIndex: source.targetIndex,
        sourceTargetElement: source.winner.targetElement || null,
        inherited: source.inherited,
        inheritanceDistance: source.distance,
        definition: source.winner,
        fallbackReferences: [],
        nested: nested.references,
      },
      resolvedValue: isResolved ? nested.resolvedValue : null,
      nestedReferenceCount:
        nestedReferences.length + nested.nestedReferenceCount,
      nestedResolvedCount:
        nested.resolvedCount + nested.nestedResolvedCount,
      nestedUnresolvedCount:
        nested.unresolvedCount + nested.nestedUnresolvedCount,
      circularCount: nested.circularCount,
    };
  }

  function analyzeVarResolutions(
    renderingDependencies,
    customPropertyCascade,
  ) {
    /* V2.2-A5.1: recursively resolve custom-property values, including
     * nested var() references and nested fallbacks. */
    const declarations = [];
    let resolvedCount = 0;
    let unresolvedCount = 0;
    let pendingCount = 0;
    let referenceCount = 0;
    let nestedReferenceCount = 0;
    let nestedResolvedCount = 0;
    let nestedUnresolvedCount = 0;
    let circularCount = 0;

    for (const dependency of safeArray(renderingDependencies)) {
      const sourceValue =
        dependency.originalValue ||
        dependency.value ||
        "";

      const parsedReferences = parseVarFunctions(sourceValue);

      const references = parsedReferences.length
        ? parsedReferences.map((reference) => reference.property)
        : safeArray(dependency.variableReferences);

      if (!references.length) continue;

      const resolution = resolveVarReferencesForWinner(
        dependency,
        customPropertyCascade,
      );

      referenceCount += resolution.references.length;
      resolvedCount += resolution.resolvedCount;
      unresolvedCount += resolution.unresolvedCount;
      pendingCount += resolution.pendingCount;
      nestedReferenceCount += resolution.nestedReferenceCount;
      nestedResolvedCount += resolution.nestedResolvedCount;
      nestedUnresolvedCount += resolution.nestedUnresolvedCount;
      circularCount += resolution.circularCount;

      declarations.push({
        elementLabel: dependency.elementLabel,
        property: dependency.property,
        value: sourceValue,
        selector: dependency.selector,
        stylesheetHref: dependency.stylesheetHref,
        stylesheetFramework: dependency.stylesheetFramework,
        status: resolution.status,
        resolvedValue: resolution.resolvedValue,
        references: resolution.references,
        nestedReferenceCount: resolution.nestedReferenceCount,
        nestedResolvedCount: resolution.nestedResolvedCount,
        nestedUnresolvedCount: resolution.nestedUnresolvedCount,
        circularCount: resolution.circularCount,
      });
    }

    return {
      declarations,
      referenceCount,
      resolvedCount,
      unresolvedCount,
      pendingCount,
      nestedReferenceCount,
      nestedResolvedCount,
      nestedUnresolvedCount,
      circularCount,
    };
  }

  /* =========================================================
     DEPENDENCY CLASSIFICATION
  ========================================================= */

  function classifyDependency(
    winner,
    root,
  ) {
    const selector =
      safeString(
        winner.selector,
      );

    if (
      winner.stylesheetFramework !==
      "Unknown"
    ) {
      if (
        selector.includes(
          root.tagName.toLowerCase(),
        ) ||
        (
          root.id &&
          selector.includes(
            `#${root.id}`,
          )
        )
      ) {
        return "component-rendering";
      }

      return "framework-rendering";
    }

    if (
      (
        root.id &&
        selector.includes(
          `#${root.id}`,
        )
      ) ||
      selector.includes(
        root.tagName.toLowerCase(),
      )
    ) {
      return "component-rendering";
    }

    if (
      selector === "*" ||
      selector === "html" ||
      selector === "body"
    ) {
      return "global-rendering";
    }

    return "generic-rendering";
  }

  function buildRenderingDependencies(
    winners,
    root,
  ) {
    return safeArray(winners).map(
      (winner) => {
        const matchedElementLabels =
          safeArray(
            winner.matchedElementLabels,
          );

        const dependencyType =
          classifyDependency(
            winner,
            root,
          );

        return {
          ...winner,

          elementLabel:
            safeString(
              winner.elementLabel,
            ),

          matchedElementLabels,

          matchedElementDetails:
            safeArray(
              winner.matchedElementDetails,
            ),

          cssText:
            safeString(
              winner.cssText ||
                winner.declaration?.rule
                  ?.cssText,
            ),

          selector:
            safeString(
              winner.selector,
            ),

          originalSelector:
            safeString(
              winner.originalSelector,
            ),

          stylesheetHref:
            safeString(
              winner.stylesheetHref,
            ),

          stylesheetTitle:
            safeString(
              winner.stylesheetTitle,
            ),

          stylesheetFramework:
            safeString(
              winner.stylesheetFramework,
            ),

          /*
           * V2.1.2 provenance.
           */

          originalProperty:
            safeString(
              winner.originalProperty,
            ),

          originalValue:
            safeString(
              winner.originalValue,
            ),

          declarationType:
            safeString(
              winner.declarationType,
            ),

          expandedProperties:
            safeArray(
              winner.expandedProperties,
            ),

          expandedFrom:
            safeString(
              winner.expandedFrom,
            ),

          declarationIndex:
            winner.declarationIndex ?? 0,

          variableReferences:
            safeArray(
              winner.variableReferences,
            ),

          dependencyType,

          renderRelevant:
            winner.matchesComputed === true ||
            winner.variableDependent ===
              true,
        };
      },
    );
  }

  /* =========================================================
     DEDUPLICATION
  ========================================================= */

  function dependencyDedupKey(
    dep,
  ) {
    /*
     * V2.1.2
     *
     * Include original declaration information so
     * two declarations that happen to expand into the
     * same property are not incorrectly merged.
     */

    return [
      dep.property,

      dep.value,

      dep.originalProperty || "",

      dep.originalValue || "",

      dep.declarationType || "",

      dep.important ? "!" : "",

      dep.selector,

      dep.media || "",

      dep.supports || "",

      dep.stylesheetFramework || "",
    ].join("|");
  }

  function deduplicateDependencies(
    dependencies,
  ) {
    const seen = new Map();

    for (const dependency of safeArray(
      dependencies,
    )) {
      if (
        !dependency ||
        typeof dependency !==
          "object"
      ) {
        continue;
      }

      const labels =
        safeArray(
          dependency.matchedElementLabels,
        );

      const key =
        dependencyDedupKey(
          dependency,
        );

      if (!seen.has(key)) {
        seen.set(key, {
          ...dependency,

          matchedElementLabels: [
            ...labels,
          ],

          matchedElementDetails: [
            ...safeArray(
              dependency.matchedElementDetails,
            ),
          ],

          variableReferences:
            safeArray(
              dependency.variableReferences,
            ),
        });

        continue;
      }

      const existing =
        seen.get(key);

      const existingLabels =
        safeArray(
          existing.matchedElementLabels,
        );

      existing.matchedElementLabels =
        Array.from(
          new Set([
            ...existingLabels,
            ...labels,
          ]),
        );

      /*
       * V2.1.2
       *
       * Merge structured element metadata.
       */

      const existingDetails =
        safeArray(
          existing.matchedElementDetails,
        );

      const incomingDetails =
        safeArray(
          dependency.matchedElementDetails,
        );

      const detailMap =
        new Map();

      for (const detail of [
        ...existingDetails,
        ...incomingDetails,
      ]) {
        if (!detail) {
          continue;
        }

        const key =
          detail.label ||
          `${detail.tagName}|${detail.id}`;

        detailMap.set(
          key,
          detail,
        );
      }

      existing.matchedElementDetails =
        Array.from(
          detailMap.values(),
        );

      /*
       * Preserve variable references.
       */

      const existingVariables =
        safeArray(
          existing.variableReferences,
        );

      const incomingVariables =
        safeArray(
          dependency.variableReferences,
        );

      existing.variableReferences =
        Array.from(
          new Set([
            ...existingVariables,
            ...incomingVariables,
          ]),
        );
    }

    return Array.from(
      seen.values(),
    );
  }

  /* =========================================================
     RULE-LEVEL GROUPING
  ========================================================= */

  function groupDependenciesByRule(
    dependencies,
  ) {
    const groups = new Map();

    for (const dependency of safeArray(
      dependencies,
    )) {
      const key = [
        dependency.selector,

        dependency.stylesheetIndex,

        dependency.ruleIndex,

        dependency.media || "",

        dependency.supports || "",
      ].join("|");

      if (!groups.has(key)) {
        groups.set(key, {
          selector:
            dependency.selector,

          originalSelector:
            dependency.originalSelector,

          cssText:
            dependency.declaration?.rule
              ?.cssText || "",

          source:
            dependency.stylesheetHref ||
            dependency.stylesheetTitle ||
            "Inline",

          framework:
            dependency.stylesheetFramework,

          stylesheetIndex:
            dependency.stylesheetIndex,

          ruleIndex:
            dependency.ruleIndex,

          media:
            dependency.media,

          supports:
            dependency.supports,

          matchedElements: [],

          matchedElementDetails: [],

          declarations: [],
        });
      }

      const group =
        groups.get(key);

      const dependencyLabels =
        safeArray(
          dependency.matchedElementLabels,
        );

      group.matchedElements =
        Array.from(
          new Set([
            ...safeArray(
              group.matchedElements,
            ),
            ...dependencyLabels,
          ]),
        );

      /*
       * V2.1.2 structured metadata.
       */

      const existingDetails =
        safeArray(
          group.matchedElementDetails,
        );

      const incomingDetails =
        safeArray(
          dependency.matchedElementDetails,
        );

      const detailMap =
        new Map();

      for (const detail of [
        ...existingDetails,
        ...incomingDetails,
      ]) {
        if (!detail) {
          continue;
        }

        detailMap.set(
          detail.label ||
            `${detail.tagName}|${detail.id}`,
          detail,
        );
      }

      group.matchedElementDetails =
        Array.from(
          detailMap.values(),
        );

      group.declarations.push({
        /*
         * Cascade property.
         */

        property:
          dependency.property,

        value:
          dependency.value,

        /*
         * V2.1.2 source declaration.
         */

        originalProperty:
          dependency.originalProperty,

        originalValue:
          dependency.originalValue,

        declarationType:
          dependency.declarationType,

        declarationIndex:
          dependency.declarationIndex,

        expandedIndex:
          dependency.expandedIndex ?? 0,

        expandedFrom:
          dependency.expandedFrom,

        expandedProperties:
          safeArray(
            dependency.expandedProperties,
          ),

        important:
          dependency.important,

        status:
          dependency.status,

        specificity:
          dependency.specificity,

        computedValue:
          dependency.computedValue,

        matchesComputed:
          dependency.matchesComputed,

        variableReferences:
          dependency.variableReferences,
      });
    }

    return Array.from(
      groups.values(),
    );
  }

  /* =========================================================
     MAIN ANALYZER
  ========================================================= */

  function analyzeRenderingDependencies(
    root,
  ) {
    if (
      !root ||
      root.nodeType !== 1
    ) {
      throw new Error(
        "WCX CSS Analyzer requires a DOM element.",
      );
    }

    const elements =
      getAllComponentElements(
        root,
      );

    const ancestors =
      getAncestorElements(
        root,
      );

    /*
     * V2.2.0-A3.4: inspect the LIVE DOM/CSSOM inline-style state
     * before source/cascade processing. This is diagnostic only; it
     * does not synthesize declarations or alter cascade priority.
     */
    const inlineDiagnostics =
      inspectLiveInlineStyles(
        elements,
        root,
      );

    const stylesheets =
      getPageStylesheets();

    const rules = [];

    let accessibleStylesheets = 0;

    let blockedStylesheets = 0;

    /*
     * Discover stylesheet rules.
     */

    for (const stylesheet of stylesheets) {
      if (
        !stylesheet.accessible ||
        !stylesheet.cssRules
      ) {
        blockedStylesheets++;

        continue;
      }

      accessibleStylesheets++;

      try {
        walkCSSRules(
          stylesheet.cssRules,

          {
            media: null,

            supports: null,

            elements,
          },

          stylesheet,

          rules,
        );
      } catch (error) {
        console.warn(
          "[WCX] Unable to inspect stylesheet:",
          stylesheet.href,
          error,
        );
      }
    }

    /*
     * Inline styles.
     */

    collectInlineStyles(
      elements,
      rules,
    );

    /*
     * V2.2.0-A3.2: reconcile the LIVE inline style attributes with
     * the normal CSS rule pipeline immediately before cascade records
     * are created. This is intentionally additive and does not alter
     * the existing stylesheet rule collection.
     */
    const liveInlineRuleCount =
      ensureLiveInlineStylesInRules(
        elements,
        rules,
        inlineDiagnostics,
      );

    /*
     * V2.2-A1: discovery only. Variable cascade and var()
     * resolution are intentionally deferred to later stages.
     */
    /*
     * V2.2-A1.1: discover custom-property definitions from the
     * complete accessible stylesheet source, not only from the
     * component-matched rule collection. This preserves R1.1's
     * component cascade while allowing :root/global/ancestor
     * variable definitions to be discovered correctly.
     */
    const customPropertySourceDefinitions = [];

    for (const stylesheet of stylesheets) {
      if (
        !stylesheet.accessible ||
        !stylesheet.cssRules
      ) {
        continue;
      }

      try {
        walkAllCSSRulesForCustomProperties(
          stylesheet.cssRules,
          {
            media: null,
            supports: null,
            elements,
            ancestors,
          },
          stylesheet,
          customPropertySourceDefinitions,
        );
      } catch (error) {
        console.warn(
          "[WCX] Unable to inspect custom-property source:",
          stylesheet.href,
          error,
        );
      }
    }

    const customPropertyDefinitions =
      deduplicateCustomPropertyDefinitions([
        ...customPropertySourceDefinitions,
        ...collectInlineCustomPropertyDefinitions(elements),
      ]);

    /*
     * V2.2-A2: cascade custom-property definitions independently
     * from the normal CSS declaration cascade. This produces
     * per-element specified winners; inheritance and var() resolution
     * remain separate later stages.
     */
    const customPropertyCascade =
      buildCustomPropertyCascade(
        customPropertyDefinitions,
        root,
        elements,
        ancestors,
      );

    /*
     * V2.2-A3/A4/A5: resolve var() references against the
     * winning custom-property definitions. V2.2-A4 additionally
     * resolves literal fallbacks when the referenced custom property
     * is missing. Nested variable resolution is handled by V2.2-A5. Custom properties inherit through
     * the ancestor chain for lookup, but generic CSS property
     * inheritance remains a separate later stage.
     */
    let varResolutions = {
      declarations: [],
      referenceCount: 0,
      resolvedCount: 0,
      unresolvedCount: 0,
      pendingCount: 0,
    };

    /*
     * Convert rules into individual
     * source declaration records.
     */

    const declarations =
      createDeclarationRecords(
        rules,
      );

    /*
     * Determine cascade winners.
     *
     * V2.1.2 cascade internally operates
     * against expanded properties.
     */

    const cascade =
      determineWinners(
        elements,
        declarations,
      );

    /*
     * Validate against actual computed style.
     */

    validateWinningDeclarations(
      cascade.winners,
    );

    /*
     * Convert winners into rendering
     * dependencies.
     */

    let renderingDependencies =
      buildRenderingDependencies(
        cascade.winners,
        root,
      );

    /*
     * Deduplicate equivalent dependencies.
     */

    renderingDependencies =
      deduplicateDependencies(
        renderingDependencies,
      );

    /*
     * V2.2-A3: now that the normal cascade winners have been
     * converted into rendering dependencies, resolve their
     * direct var() references against the A2 custom-property
     * cascade.
     */
    varResolutions = analyzeVarResolutions(
      renderingDependencies,
      customPropertyCascade,
    );

    /*
     * V2.2.0-A3.2: if a live inline declaration contains var() but was
     * filtered out by a consumer-facing dependency classification,
     * resolve it from the actual cascade winners as a reconciliation
     * fallback. This does not manufacture CSS; it only reuses a winner
     * already established by the normal cascade.
     */
    if (varResolutions.referenceCount === 0) {
      const winnerVarDependencies = safeArray(cascade.winners)
        .filter((winner) =>
          parseVarFunctions(
            winner.originalValue || winner.value || "",
          ).length > 0
        )
        .map((winner) => ({
          ...winner,
          elementLabel: getNodeLabel(winner.element),
          variableReferences: parseVarFunctions(
            winner.originalValue || winner.value || "",
          ).map((reference) => reference.property),
        }));

      if (winnerVarDependencies.length) {
        varResolutions = analyzeVarResolutions(
          winnerVarDependencies,
          customPropertyCascade,
        );
      }
    }

    /*
     * Attach per-dependency variable resolution without changing
     * the existing dependency shape for consumers that do not use
     * V2.2 data.
     */
    const varResolutionByDependency = new Map();

    for (const record of safeArray(varResolutions.declarations)) {
      const key = [
        record.elementLabel,
        record.property,
        record.selector,
        record.value,
      ].join("|");
      varResolutionByDependency.set(key, record);
    }

    for (const dependency of renderingDependencies) {
      const key = [
        dependency.elementLabel,
        dependency.property,
        dependency.selector,
        dependency.originalValue || dependency.value || "",
      ].join("|");
      const record = varResolutionByDependency.get(key);
      if (record) {
        dependency.varResolution = record;
      }
    }

    /*
     * Responsive dependencies.
     */

    const responsiveDependencies =
      renderingDependencies.filter(
        (dep) =>
          !!dep.media ||
          !!dep.supports,
      );

    /*
     * Dependency categories.
     */

    const globalDependencies =
      renderingDependencies.filter(
        (dep) =>
          dep.dependencyType ===
          "global-rendering",
      );

    const componentDependencies =
      renderingDependencies.filter(
        (dep) =>
          dep.dependencyType ===
          "component-rendering",
      );

    const descendantDependencies =
      renderingDependencies.filter(
        (dep) =>
          safeArray(
            dep.matchedElementLabels,
          ).some(
            (label) =>
              label !==
              getNodeLabel(root),
          ),
      );

    const variableDependencies =
      renderingDependencies.filter(
        (dep) =>
          safeArray(
            dep.variableReferences,
          ).length,
      );

    /*
     * Candidate rules include all source
     * declaration records.
     */

    const candidateRules =
      declarations;

    /*
     * Group winning dependencies back
     * into source CSS rules.
     */

    const groupedWinningRules =
      groupDependenciesByRule(
        renderingDependencies,
      );

    /*
     * V2.1.2
     *
     * Collect source declaration model
     * statistics.
     */

    const shorthandDeclarations =
      declarations.filter(
        (declaration) =>
          declaration.declarationType ===
          "shorthand",
      );

    const longhandDeclarations =
      declarations.filter(
        (declaration) =>
          declaration.declarationType ===
          "longhand",
      );

    const customPropertyDeclarations =
      declarations.filter(
        (declaration) =>
          declaration.declarationType ===
          "custom-property",
      );

    const expandedDeclarationCount =
      declarations.reduce(
        (total, declaration) =>
          total +
          safeArray(
            declaration.expandedProperties,
          ).length,

        0,
      );

    return {
      version: VERSION,

      root: {
        tagName:
          root.tagName.toLowerCase(),

        id:
          root.id || "",

        className:
          root.className || "",

        label:
          getNodeLabel(root),

        selector:
          buildStableSelector(root),
      },

      summary: {
        domElements:
          elements.length,

        ancestors:
          ancestors.length,

        stylesheets:
          stylesheets.length,

        accessibleStylesheets,

        blockedStylesheets,

        cssCandidates:
          candidateRules.length,

        renderingDependencies:
          renderingDependencies.length,

        responsiveDependencies:
          responsiveDependencies.length,

        globalDependencies:
          globalDependencies.length,

        componentDependencies:
          componentDependencies.length,

        descendantDependencies:
          descendantDependencies.length,

        inlineCSS:
          rules.filter(
            (r) =>
              r.kind === "inline",
          ).length,

        liveInlineRuleCount,

        winningInlineDeclarations:
          cascade.winners.filter(
            (winner) =>
              winner.stylesheetIndex === -1 ||
              winner.rule?.kind === "inline",
          ).length,

        /* V2.2.0-A3.4 live inline diagnostics. */
        inlineAnalyzedElements:
          inlineDiagnostics.analyzedElements,
        inlineElementsWithStyle:
          inlineDiagnostics.elementsWithStyle,
        inlineLiveStyleDeclarations:
          inlineDiagnostics.liveStyleDeclarations,
        inlineElementsWithVar:
          inlineDiagnostics.elementsWithVar,
        inlineLiveVarReferences:
          inlineDiagnostics.liveVarReferences,

        winningDeclarations:
          cascade.winners.length,

        overriddenDeclarations:
          cascade.overridden.length,

        variableDependencies:
          variableDependencies.length,

        /*
         * V2.1.2 declaration statistics.
         */

        shorthandDeclarations:
          shorthandDeclarations.length,

        longhandDeclarations:
          longhandDeclarations.length,

        customPropertyDeclarations:
          customPropertyDeclarations.length,

        expandedDeclarationCount,

        customPropertyDefinitions:
          customPropertyDefinitions.length,

        customPropertyNames:
          Array.from(
            new Set(customPropertyDefinitions.map((definition) => definition.property)),
          ),

        customPropertyCascadeCandidates:
          customPropertyCascade.candidates.length,

        customPropertyWinningDefinitions:
          customPropertyCascade.winningCount,

        customPropertyOverriddenDefinitions:
          customPropertyCascade.overriddenCount,

        varReferences:
          varResolutions.referenceCount,

        varResolvedReferences:
          varResolutions.resolvedCount,

        varUnresolvedReferences:
          varResolutions.unresolvedCount,

        varPendingReferences:
          varResolutions.pendingCount || 0,

        varNestedReferences:
          varResolutions.nestedReferenceCount || 0,

        varNestedResolvedReferences:
          varResolutions.nestedResolvedCount || 0,

        varNestedUnresolvedReferences:
          varResolutions.nestedUnresolvedCount || 0,

        varCircularReferences:
          varResolutions.circularCount || 0,

        varFallbackResolvedReferences:
          safeArray(varResolutions.declarations).reduce(
            (count, declaration) =>
              count +
              safeArray(declaration.references).filter(
                (reference) => reference.resolutionKind === "fallback",
              ).length,
            0,
          ),
      },

      /*
       * Main dependency list.
       */

      dependencies:
        renderingDependencies,

      /*
       * All source declaration candidates.
       */

      candidates:
        candidateRules,

      /*
       * Cascade-specific data.
       */

      cascade: {
        winners:
          cascade.winners,

        overridden:
          cascade.overridden,

        totalCandidates:
          declarations.length,

        expandedCandidates:
          cascade.cascadeDeclarations.length,
      },

      /*
       * Rule-level representation.
       */

      rules:
        groupedWinningRules,

      /*
       * V2.2-A1: discovered custom-property definitions.
       */

      customProperties:
        customPropertyDefinitions,

      /*
       * V2.2-A2 custom-property cascade.
       */
      customPropertyCascade: {
        targets:
          customPropertyCascade.targets.map(
            (element) => getNodeLabel(element),
          ),

        candidates:
          customPropertyCascade.candidates,

        winners:
          customPropertyCascade.winners,

        overridden:
          customPropertyCascade.overridden,
      },

      /*
       * V2.2-A3.4 live inline pipeline diagnostics.
       */
      inlineDiagnostics,

      /*
       * V2.2-A3 var() resolution.
       */
      varResolutions,

      /*
       * Variables.
       */

      variables:
        Array.from(
          new Set(
            renderingDependencies.flatMap(
              (dep) =>
                dep.variableReferences ||
                [],
            ),
          ),
        ),

      /*
       * Responsive dependencies.
       */

      responsive:
        responsiveDependencies,

      /*
       * Global dependencies.
       */

      global:
        globalDependencies,

      /*
       * Component dependencies.
       */

      component:
        componentDependencies,

      /*
       * Descendant dependencies.
       */

      descendants:
        descendantDependencies,

      /*
       * Overridden declarations.
       */

      overridden:
        cascade.overridden,

      /*
       * V2.1.2
       *
       * Explicit declaration model.
       */

      declarationModel: {
        total:
          declarations.length,

        shorthand:
          shorthandDeclarations.length,

        longhand:
          longhandDeclarations.length,

        customProperties:
          customPropertyDeclarations.length,

        expanded:
          expandedDeclarationCount,
      },
    };
  }

  /* =========================================================
     STABLE SELECTOR
  ========================================================= */

  function buildStableSelector(
    element,
  ) {
    if (
      !element ||
      element.nodeType !== 1
    ) {
      return "";
    }

    if (element.id) {
      return `#${CSS.escape(
        element.id,
      )}`;
    }

    const path = [];

    let current = element;

    while (
      current &&
      current.nodeType === 1 &&
      current !== document.body
    ) {
      let part =
        current.tagName.toLowerCase();

      if (current.id) {
        part += `#${CSS.escape(
          current.id,
        )}`;

        path.unshift(part);

        break;
      }

      if (
        current.classList &&
        current.classList.length
      ) {
        part +=
          "." +
          Array.from(
            current.classList,
          )
            .slice(0, 3)
            .map((c) =>
              CSS.escape(c),
            )
            .join(".");
      }

      const parent =
        current.parentElement;

      if (parent) {
        const siblings =
          Array.from(
            parent.children,
          ).filter(
            (child) =>
              child.tagName ===
              current.tagName,
          );

        if (siblings.length > 1) {
          const index =
            siblings.indexOf(
              current,
            ) + 1;

          part += `:nth-of-type(${index})`;
        }
      }

      path.unshift(part);

      current = parent;
    }

    return path.join(" > ");
  }

  /* =========================================================
     BACKWARD-COMPATIBLE ANALYZE
  ========================================================= */

  function analyzeComponentCSS(
    root,
  ) {
    return analyzeRenderingDependencies(
      root,
    );
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  window.WCX_CSS = {
    version: VERSION,

    analyze:
      analyzeComponentCSS,

    analyzeRenderingDependencies,

    getElements:
      getAllComponentElements,

    getStylesheets:
      getPageStylesheets,
  };
})();