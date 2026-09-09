/**
 * WCX CSS Analyzer
 * V2.1 - Cascade-Aware Dependency Analysis
 *
 * Purpose:
 * - Discover CSS affecting a selected DOM component
 * - Match CSS rules against component elements
 * - Evaluate author-CSS cascade
 * - Determine winning / overridden declarations
 * - Preserve source metadata for later standalone reconstruction
 *
 * Public API:
 * window.WCX_CSS
 */

(() => {
  "use strict";

  const VERSION = "2.1";

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
     * This intentionally avoids trying to become a full CSS parser.
     */

    let normalized = safeString(selector);

    // Remove strings to reduce false counting.
    normalized = normalized.replace(/(["'])(?:\\.|(?!\1).)*\1/g, "");

    // Remove :not(...) etc. wrappers while keeping inner selectors.
    normalized = normalized.replace(/:where\(([^()]*)\)/g, "$1");

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

    const pseudoElementMatches = normalized.match(/::[\w-]+/g);

    if (pseudoElementMatches) {
      c += pseudoElementMatches.length;
    }

    const pseudoClassMatches = normalized.match(/:(?!:)[\w-]+(?:\([^)]*\))?/g);

    if (pseudoClassMatches) {
      b += pseudoClassMatches.length;
    }

    /*
     * Remove selectors that should not count as type selectors.
     */
    let typePart = normalized
      .replace(/#[\w-]+/g, " ")
      .replace(/\.[\w-]+/g, " ")
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/::[\w-]+/g, " ")
      .replace(/:(?!:)[\w-]+(?:\([^)]*\))?/g, " ")
      .replace(/[>+~,*]/g, " ");

    const typeMatches = typePart.match(/(?:^|\s)([a-zA-Z][\w-]*)/g);

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

  function getStyleDeclarations(style) {
    const declarations = [];

    if (!style) {
      return declarations;
    }

    for (let i = 0; i < style.length; i++) {
      const property = style[i];

      if (!property) {
        continue;
      }

      const value = style.getPropertyValue(property);
      const priority = style.getPropertyPriority(property);

      declarations.push({
        property,
        value: normalizeWhitespace(value),
        important: priority === "important",
      });
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
    /*
     * CSS has many inherited properties.
     *
     * Rather than maintaining an incomplete list, use the browser's
     * computed style comparison later to determine whether inheritance
     * appears relevant.
     */

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

    return inherited.has(property);
  }

  /* =========================================================
       SELECTOR MATCHING
       ========================================================= */

  function selectorMatchesElement(selector, element) {
    if (!selector || !element) {
      return false;
    }

    /*
     * V2.1 deliberately ignores selectors that represent states
     * which cannot be reliably evaluated in the current static state.
     *
     * These will be handled by the later State/Pseudo engine.
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

  function selectorMatchesComponent(selector, elements) {
    const matchedElements = [];

    for (const element of elements) {
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

  function walkCSSRules(rules, context, stylesheetMeta, output) {
    if (!rules) {
      return;
    }

    for (let index = 0; index < rules.length; index++) {
      const rule = rules[index];

      if (!rule) {
        continue;
      }

      const ruleType = getRuleTypeName(rule);

      if (ruleType === "style") {
        const selectorText = safeString(rule.selectorText);

        const matchedSelectors = [];

        /*
         * CSS selector lists must be evaluated independently.
         */
        const selectors = selectorText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        for (const selector of selectors) {
          const matchedElements = selectorMatchesComponent(
            selector,
            context.elements,
          );

          if (!matchedElements.length) {
            continue;
          }

          const specificity = calculateSpecificity(selector);

          const declarations = getStyleDeclarations(rule.style);

          output.push({
            kind: "css-rule",

            selector,
            originalSelector: selectorText,

            cssText: safeString(rule.cssText),

            declarations,

            matchedElements,

            matchedElementLabels: matchedElements.map(getNodeLabel),

            specificity,

            stylesheetIndex: stylesheetMeta.index,

            stylesheetHref: stylesheetMeta.href,

            stylesheetTitle: stylesheetMeta.title,

            stylesheetFramework: stylesheetMeta.framework,

            ruleIndex: index,

            sourceOrder: output.length,

            media: context.media || null,

            supports: context.supports || null,

            mediaActive: mediaMatches(context.media),

            supportsActive: supportsMatches(context.supports),

            ruleType,

            variableReferences: declarations.flatMap((d) =>
              extractVariableReferences(d.value),
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
        let nestedContext = {
          media: context.media || null,
          supports: context.supports || null,
          elements: context.elements,
        };

        if (ruleType === "media") {
          nestedContext.media =
            rule.conditionText || rule.media?.mediaText || null;
        }

        if (ruleType === "supports") {
          nestedContext.supports = rule.conditionText || null;
        }

        try {
          walkCSSRules(rule.cssRules, nestedContext, stylesheetMeta, output);
        } catch (error) {
          // Ignore inaccessible nested rules.
        }

        continue;
      }

      /*
       * @import can expose another stylesheet through styleSheet.
       */
      if (ruleType === "import") {
        try {
          if (rule.styleSheet) {
            walkCSSRules(
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
          // Cross-origin imported stylesheet.
        }
      }
    }
  }

  /* =========================================================
       STYLESHEET DISCOVERY
       ========================================================= */

  function detectFramework(href, cssText) {
    const source = (safeString(href) + " " + safeString(cssText)).toLowerCase();

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

    if (source.includes("mobirise") || source.includes("mbr-")) {
      return "Mobirise";
    }

    return "Unknown";
  }

  function getPageStylesheets() {
    const stylesheets = [];

    for (let index = 0; index < document.styleSheets.length; index++) {
      const sheet = document.styleSheets[index];

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

      let framework = detectFramework(href, "");

      /*
       * CSSStyleSheet may not expose title consistently.
       */
      let title = "";

      try {
        title = sheet.ownerNode?.title || "";
      } catch (error) {
        title = "";
      }

      stylesheets.push({
        index,
        href,
        title,
        framework,
        accessible: !blocked && !!cssRules,
        blocked,
        cssRules,
      });
    }

    return stylesheets;
  }

  /* =========================================================
       INLINE STYLES
       ========================================================= */

  function collectInlineStyles(elements, output) {
    for (const element of elements) {
      if (!element.hasAttribute("style")) {
        continue;
      }

      const style = element.style;

      const declarations = getStyleDeclarations(style);

      if (!declarations.length) {
        continue;
      }

      output.push({
        kind: "inline",

        selector: "[style]",

        originalSelector: "[style]",

        cssText: element.getAttribute("style") || "",

        declarations,

        matchedElements: [element],

        matchedElementLabels: [getNodeLabel(element)],

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

        variableReferences: declarations.flatMap((d) =>
          extractVariableReferences(d.value),
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
     * This is intentionally an author-CSS model.
     *
     * Full CSS origins/layers/animations will be handled later.
     */

    return {
      important: declaration.important ? 1 : 0,
      specificityValue: declaration.specificity?.value || 0,
      sourceOrder: declaration.sourceOrder ?? 0,
    };
  }

  function compareCascadePriority(a, b) {
    const rankA = getCascadeRank(a);
    const rankB = getCascadeRank(b);

    if (rankA.important !== rankB.important) {
      return rankA.important - rankB.important;
    }

    if (rankA.specificityValue !== rankB.specificityValue) {
      return rankA.specificityValue - rankB.specificityValue;
    }

    return rankA.sourceOrder - rankB.sourceOrder;
  }

  /* =========================================================
       DECLARATION EXPANSION
       ========================================================= */

  function createDeclarationRecords(rules) {
    const declarations = [];

    for (const rule of rules) {
      for (const declaration of rule.declarations) {
        declarations.push({
          property: declaration.property,

          value: declaration.value,

          important: declaration.important,

          rule,

          selector: rule.selector,

          originalSelector: rule.originalSelector,

          matchedElements: rule.matchedElements,

          matchedElementLabels: rule.matchedElementLabels,

          specificity: rule.specificity,

          stylesheetIndex: rule.stylesheetIndex,

          stylesheetHref: rule.stylesheetHref,

          stylesheetTitle: rule.stylesheetTitle,

          stylesheetFramework: rule.stylesheetFramework,

          ruleIndex: rule.ruleIndex,

          sourceOrder: rule.sourceOrder,

          media: rule.media,

          supports: rule.supports,

          mediaActive: rule.mediaActive,

          supportsActive: rule.supportsActive,

          variableReferences: extractVariableReferences(declaration.value),

          status: "candidate",

          cascadeRank: null,
        });
      }
    }

    return declarations;
  }

  /* =========================================================
       COMPUTED STYLE MAPPING
       ========================================================= */

  function getComputedPropertyValue(element, property) {
    try {
      const computed = window.getComputedStyle(element);

      return normalizeWhitespace(computed.getPropertyValue(property));
    } catch (error) {
      return "";
    }
  }

  function buildCascadeMap(elements, declarations) {
    /*
     * Map:
     *
     * element
     *   -> property
     *      -> declarations
     */

    const map = new Map();

    for (const element of elements) {
      map.set(element, new Map());
    }

    for (const declaration of declarations) {
      if (!declaration.mediaActive || !declaration.supportsActive) {
        declaration.status = "inactive";
        continue;
      }

      for (const element of declaration.matchedElements) {
        if (!map.has(element)) {
          map.set(element, new Map());
        }

        const propertyMap = map.get(element);

        if (!propertyMap.has(declaration.property)) {
          propertyMap.set(declaration.property, []);
        }

        propertyMap.get(declaration.property).push(declaration);
      }
    }

    return map;
  }

  function determineWinners(elements, declarations) {
    const map = buildCascadeMap(elements, declarations);

    const winners = [];
    const overridden = [];

    for (const [element, propertyMap] of map.entries()) {
      for (const [property, candidates] of propertyMap.entries()) {
        if (!candidates.length) {
          continue;
        }

        /*
         * Sort weakest → strongest.
         */
        candidates.sort((a, b) => compareCascadePriority(a, b));

        const winner = candidates[candidates.length - 1];

        winner.status = "winning";

        winner.cascadeRank = getCascadeRank(winner);

        winners.push({
          element,

          elementLabel: getNodeLabel(element),

          matchedElementLabels: safeArray(winner.matchedElementLabels),

          property,

          value: winner.value,

          important: winner.important,

          selector: winner.selector,

          originalSelector: winner.originalSelector,

          cssText: winner.rule?.cssText || "",

          stylesheetIndex: winner.stylesheetIndex,

          stylesheetHref: winner.stylesheetHref,

          stylesheetTitle: winner.stylesheetTitle,

          stylesheetFramework: winner.stylesheetFramework,

          ruleIndex: winner.ruleIndex,

          sourceOrder: winner.sourceOrder,

          specificity: winner.specificity,

          media: winner.media,

          supports: winner.supports,

          variableReferences: safeArray(winner.variableReferences),

          declaration: winner,
        });

        for (let i = 0; i < candidates.length - 1; i++) {
          const overriddenDeclaration = candidates[i];

          overriddenDeclaration.status = "overridden";

          overriddenDeclaration.cascadeRank = getCascadeRank(
            overriddenDeclaration,
          );

          overridden.push(overriddenDeclaration);
        }
      }
    }

    return {
      winners,
      overridden,
      map,
    };
  }

  /* =========================================================
       COMPUTED VALUE VALIDATION
       ========================================================= */

  function validateWinningDeclarations(winners) {
    for (const winner of safeArray(winners)) {
      const element = winner.element;

      if (!element) {
        continue;
      }

      const computedValue = getComputedPropertyValue(element, winner.property);

      winner.computedValue = computedValue;

      winner.matchesComputed =
        normalizeWhitespace(winner.value) === computedValue;

      /*
       * Normalize variable references.
       */
      winner.variableReferences = safeArray(winner.variableReferences);

      winner.variableDependent = winner.variableReferences.length > 0;

      /*
       * var(...) values normally won't equal computedStyle
       * because computedStyle contains the resolved value.
       */
      if (winner.variableDependent && computedValue) {
        winner.matchesComputed = true;
      }
    }
  }

  /* =========================================================
       DEPENDENCY CLASSIFICATION
       ========================================================= */

  function classifyDependency(winner, root) {
    const selector = safeString(winner.selector);

    if (winner.stylesheetFramework !== "Unknown") {
      if (
        selector.includes(root.tagName.toLowerCase()) ||
        selector.includes(`#${root.id}`)
      ) {
        return "component-rendering";
      }

      return "framework-rendering";
    }

    if (
      selector.includes(`#${root.id}`) ||
      selector.includes(root.tagName.toLowerCase())
    ) {
      return "component-rendering";
    }

    if (selector === "*" || selector === "html" || selector === "body") {
      return "global-rendering";
    }

    return "generic-rendering";
  }

  function buildRenderingDependencies(winners, root) {
    return safeArray(winners).map((winner) => {
      const matchedElementLabels = safeArray(winner.matchedElementLabels);

      const dependencyType = classifyDependency(winner, root);

      return {
        ...winner,

        elementLabel: safeString(winner.elementLabel),

        matchedElementLabels,

        cssText: safeString(
          winner.cssText || winner.declaration?.rule?.cssText,
        ),

        selector: safeString(winner.selector),

        originalSelector: safeString(winner.originalSelector),

        stylesheetHref: safeString(winner.stylesheetHref),

        stylesheetTitle: safeString(winner.stylesheetTitle),

        stylesheetFramework: safeString(winner.stylesheetFramework),

        variableReferences: safeArray(winner.variableReferences),

        dependencyType,

        renderRelevant:
          winner.matchesComputed === true || winner.variableDependent === true,
      };
    });
  }

  /* =========================================================
       DEDUPLICATION
       ========================================================= */

  function dependencyDedupKey(dep) {
    return [
      dep.property,
      dep.value,
      dep.important ? "!" : "",
      dep.selector,
      dep.media || "",
      dep.supports || "",
      dep.stylesheetFramework || "",
    ].join("|");
  }

  function deduplicateDependencies(dependencies) {
    const seen = new Map();

    for (const dependency of safeArray(dependencies)) {
      if (!dependency || typeof dependency !== "object") {
        continue;
      }

      const labels = safeArray(dependency.matchedElementLabels);

      const key = dependencyDedupKey(dependency);

      if (!seen.has(key)) {
        seen.set(key, {
          ...dependency,

          matchedElementLabels: [...labels],

          variableReferences: safeArray(dependency.variableReferences),
        });

        continue;
      }

      const existing = seen.get(key);

      const existingLabels = safeArray(existing.matchedElementLabels);

      existing.matchedElementLabels = Array.from(
        new Set([...existingLabels, ...labels]),
      );

      /*
       * Preserve variable references as well.
       */
      const existingVariables = safeArray(existing.variableReferences);

      const incomingVariables = safeArray(dependency.variableReferences);

      existing.variableReferences = Array.from(
        new Set([...existingVariables, ...incomingVariables]),
      );
    }

    return Array.from(seen.values());
  }

  /* =========================================================
       RULE-LEVEL GROUPING
       ========================================================= */

  function groupDependenciesByRule(dependencies) {
    const groups = new Map();

    for (const dependency of dependencies) {
      const key = [
        dependency.selector,
        dependency.stylesheetIndex,
        dependency.ruleIndex,
        dependency.media || "",
        dependency.supports || "",
      ].join("|");

      if (!groups.has(key)) {
        groups.set(key, {
          selector: dependency.selector,

          originalSelector: dependency.originalSelector,

          cssText: dependency.declaration.rule?.cssText || "",

          source:
            dependency.stylesheetHref || dependency.stylesheetTitle || "Inline",

          framework: dependency.stylesheetFramework,

          stylesheetIndex: dependency.stylesheetIndex,

          ruleIndex: dependency.ruleIndex,

          media: dependency.media,

          supports: dependency.supports,

          matchedElements: [],

          declarations: [],
        });
      }

      const group = groups.get(key);

      const dependencyLabels = safeArray(dependency.matchedElementLabels);

      group.matchedElements = Array.from(
        new Set([...safeArray(group.matchedElements), ...dependencyLabels]),
      );

      group.declarations.push({
        property: dependency.property,

        value: dependency.value,

        important: dependency.important,

        status: dependency.status,

        specificity: dependency.specificity,

        computedValue: dependency.computedValue,

        matchesComputed: dependency.matchesComputed,

        variableReferences: dependency.variableReferences,
      });
    }

    return Array.from(groups.values());
  }

  /* =========================================================
       MAIN ANALYZER
       ========================================================= */

  function analyzeRenderingDependencies(root) {
    if (!root || root.nodeType !== 1) {
      throw new Error("WCX CSS Analyzer requires a DOM element.");
    }

    const elements = getAllComponentElements(root);

    const ancestors = getAncestorElements(root);

    const stylesheets = getPageStylesheets();

    const rules = [];

    let accessibleStylesheets = 0;
    let blockedStylesheets = 0;

    /*
     * Discover stylesheet rules.
     */
    for (const stylesheet of stylesheets) {
      if (!stylesheet.accessible || !stylesheet.cssRules) {
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
    collectInlineStyles(elements, rules);

    /*
     * Convert rules into individual declarations.
     */
    const declarations = createDeclarationRecords(rules);

    /*
     * Determine cascade winners.
     */
    const cascade = determineWinners(elements, declarations);

    /*
     * Validate against actual computed style.
     */
    validateWinningDeclarations(cascade.winners);

    /*
     * Convert winners into rendering dependencies.
     */
    let renderingDependencies = buildRenderingDependencies(
      cascade.winners,
      root,
    );

    /*
     * Deduplicate equivalent dependencies.
     */
    renderingDependencies = deduplicateDependencies(renderingDependencies);

    /*
     * Responsive dependencies.
     */
    const responsiveDependencies = renderingDependencies.filter(
      (dep) => !!dep.media || !!dep.supports,
    );

    /*
     * Dependency categories.
     */
    const globalDependencies = renderingDependencies.filter(
      (dep) => dep.dependencyType === "global-rendering",
    );

    const componentDependencies = renderingDependencies.filter(
      (dep) => dep.dependencyType === "component-rendering",
    );

    const descendantDependencies = renderingDependencies.filter((dep) =>
      dep.matchedElementLabels.some((label) => label !== getNodeLabel(root)),
    );

    const variableDependencies = renderingDependencies.filter(
      (dep) => dep.variableReferences && dep.variableReferences.length,
    );

    /*
     * Candidate rules include winning + overridden + inactive.
     */
    const candidateRules = declarations;

    /*
     * Group winning dependencies back into CSS rules.
     */
    const groupedWinningRules = groupDependenciesByRule(renderingDependencies);

    return {
      version: VERSION,

      root: {
        tagName: root.tagName.toLowerCase(),

        id: root.id || "",

        className: root.className || "",

        label: getNodeLabel(root),

        selector: buildStableSelector(root),
      },

      summary: {
        domElements: elements.length,

        ancestors: ancestors.length,

        stylesheets: stylesheets.length,

        accessibleStylesheets,

        blockedStylesheets,

        cssCandidates: candidateRules.length,

        renderingDependencies: renderingDependencies.length,

        responsiveDependencies: responsiveDependencies.length,

        globalDependencies: globalDependencies.length,

        componentDependencies: componentDependencies.length,

        descendantDependencies: descendantDependencies.length,

        inlineCSS: rules.filter((r) => r.kind === "inline").length,

        winningDeclarations: cascade.winners.length,

        overriddenDeclarations: cascade.overridden.length,

        variableDependencies: variableDependencies.length,
      },

      /*
       * Main dependency list.
       */
      dependencies: renderingDependencies,

      /*
       * All declaration candidates, including overridden ones.
       */
      candidates: candidateRules,

      /*
       * Cascade-specific data.
       */
      cascade: {
        winners: cascade.winners,

        overridden: cascade.overridden,

        totalCandidates: declarations.length,
      },

      /*
       * Rule-level representation.
       */
      rules: groupedWinningRules,

      /*
       * Useful for next V2.x stages.
       */
      variables: Array.from(
        new Set(
          renderingDependencies.flatMap((dep) => dep.variableReferences || []),
        ),
      ),

      responsive: responsiveDependencies,

      global: globalDependencies,

      component: componentDependencies,

      descendants: descendantDependencies,

      overridden: cascade.overridden,
    };
  }

  /* =========================================================
       STABLE SELECTOR
       ========================================================= */

  function buildStableSelector(element) {
    if (!element || element.nodeType !== 1) {
      return "";
    }

    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    const path = [];

    let current = element;

    while (current && current.nodeType === 1 && current !== document.body) {
      let part = current.tagName.toLowerCase();

      if (current.id) {
        part += `#${CSS.escape(current.id)}`;

        path.unshift(part);
        break;
      }

      if (current.classList && current.classList.length) {
        part +=
          "." +
          Array.from(current.classList)
            .slice(0, 3)
            .map((c) => CSS.escape(c))
            .join(".");
      }

      const parent = current.parentElement;

      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (child) => child.tagName === current.tagName,
        );

        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;

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

  function analyzeComponentCSS(root) {
    return analyzeRenderingDependencies(root);
  }

  /* =========================================================
       PUBLIC API
       ========================================================= */

  window.WCX_CSS = {
    version: VERSION,

    analyze: analyzeComponentCSS,

    analyzeRenderingDependencies,

    getElements: getAllComponentElements,

    getStylesheets: getPageStylesheets,
  };
})();
