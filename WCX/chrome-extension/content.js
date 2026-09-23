console.log("🔥 WCX VERSION 0.3 - DOM INSPECTOR LOADED");

let wcxSelecting = false;
let wcxCurrentElement = null;
let wcxInspectorOpen = false;

/* =========================================
   START SELECTION MODE
========================================= */

function startSelectionMode() {
  if (wcxSelecting) {
    return;
  }

  wcxSelecting = true;

  document.body.classList.add("wcx-selection-active");

  console.log("WCX: Selection mode ON");
}

/* =========================================
   STOP SELECTION MODE
========================================= */

function stopSelectionMode() {
  wcxSelecting = false;

  removeHighlight();

  document.body.classList.remove("wcx-selection-active");

  console.log("WCX: Selection mode OFF");
}

/* =========================================
   MOUSE OVER
========================================= */

function handleMouseOver(event) {
  if (!wcxSelecting) {
    return;
  }

  const element = event.target;

  if (!isValidTarget(element)) {
    return;
  }

  if (element === wcxCurrentElement) {
    return;
  }

  removeHighlight();

  wcxCurrentElement = element;

  element.classList.add("wcx-component-hover");

  createElementLabel(element);
}

/* =========================================
   VALID TARGET
========================================= */

function isValidTarget(element) {
  if (!element) {
    return false;
  }

  if (element === document.body || element === document.documentElement) {
    return false;
  }

  if (
    element.closest("#wcx-inspector") ||
    element.closest("#wcx-element-label") ||
    element.closest("#wcx-result")
  ) {
    return false;
  }

  return element.nodeType === Node.ELEMENT_NODE;
}

/* =========================================
   REMOVE HIGHLIGHT
========================================= */

function removeHighlight() {
  if (wcxCurrentElement) {
    wcxCurrentElement.classList.remove("wcx-component-hover");

    wcxCurrentElement.classList.remove("wcx-hover");

    wcxCurrentElement = null;
  }

  const label = document.getElementById("wcx-element-label");

  if (label) {
    label.remove();
  }
}

/* =========================================
   ELEMENT LABEL
========================================= */

function createElementLabel(element) {
  let label = document.getElementById("wcx-element-label");

  if (!label) {
    label = document.createElement("div");

    label.id = "wcx-element-label";

    document.body.appendChild(label);
  }

  label.textContent = getElementName(element);

  const rect = element.getBoundingClientRect();

  label.style.top = `${window.scrollY + rect.top - 30}px`;

  label.style.left = `${window.scrollX + rect.left}px`;
}

/* =========================================
   ELEMENT NAME
========================================= */

function getElementName(element) {
  if (!element) {
    return "";
  }

  const tag = element.tagName.toLowerCase();

  const id = element.id ? `#${element.id}` : "";

  const classes = Array.from(element.classList)
    .filter((className) => !className.startsWith("wcx-"))
    .slice(0, 4)
    .map((className) => `.${className}`)
    .join("");

  return `${tag}${id}${classes}`;
}

/* =========================================
   CLICK ELEMENT
========================================= */

function handleClick(event) {
  if (!wcxSelecting) {
    return;
  }

  const element = event.target;

  if (!isValidTarget(element)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  wcxCurrentElement = element;

  removeHighlight();

  wcxCurrentElement = element;

  wcxCurrentElement.classList.add("wcx-component-hover");

  wcxSelecting = false;

  document.body.classList.remove("wcx-selection-active");

  showDOMInspector(element);
}

/* =========================================
   BUILD DOM PATH
========================================= */

function buildDOMPath(element) {
  const path = [];

  let current = element;

  while (
    current &&
    current !== document.body &&
    current.nodeType === Node.ELEMENT_NODE
  ) {
    path.push(current);

    current = current.parentElement;
  }

  return path;
}

/* =========================================
   SHOW DOM INSPECTOR
========================================= */

function showDOMInspector(element) {
  removeInspector();

  wcxInspectorOpen = true;

  const panel = document.createElement("div");

  panel.id = "wcx-inspector";

  const path = buildDOMPath(element);

  panel.innerHTML = `

        <div class="wcx-inspector-header">

            <div>

                <strong>
                    WCX DOM Inspector
                </strong>

                <div class="wcx-inspector-subtitle">
                    Choose the exact DOM node to extract
                </div>

            </div>

            <button
                type="button"
                id="wcx-inspector-close"
            >
                ×
            </button>

        </div>


        <div class="wcx-current-node">

            <div class="wcx-section-title">
                CURRENT NODE
            </div>

            <div
                id="wcx-current-node-name"
                class="wcx-current-node-name"
            >
                ${escapeHTML(getElementName(element))}
            </div>

        </div>


        <div class="wcx-section-title">
            DOM HIERARCHY
        </div>


        <div
            id="wcx-dom-path"
            class="wcx-dom-path"
        ></div>


        <div class="wcx-section-title">
            CHILDREN
        </div>


        <div
            id="wcx-children"
            class="wcx-children"
        ></div>


        <div class="wcx-inspector-actions">

            <button
                type="button"
                id="wcx-parent-btn"
            >
                ↑ Parent
            </button>


            <button
                type="button"
                id="wcx-capture-btn"
                class="wcx-primary-btn"
            >
                Capture Selected Node
            </button>

        </div>

    `;

  document.body.appendChild(panel);

  renderDOMPath(element);

  renderChildren(element);

  updateNavigationButtons(element);

  document
    .getElementById("wcx-inspector-close")
    .addEventListener("click", () => {
      removeInspector();

      removeHighlight();
    });

  document.getElementById("wcx-parent-btn").addEventListener("click", () => {
    const current = wcxCurrentElement;

    if (
      current &&
      current.parentElement &&
      current.parentElement !== document.body
    ) {
      selectInspectorNode(current.parentElement);
    }
  });

  document.getElementById("wcx-capture-btn").addEventListener("click", () => {
    captureSelectedNode(wcxCurrentElement);
  });
}

/* =========================================
   RENDER DOM PATH
========================================= */

function renderDOMPath(element) {
  const container = document.getElementById("wcx-dom-path");

  if (!container) {
    return;
  }

  const path = buildDOMPath(element);

  container.innerHTML = "";

  path.reverse().forEach((node, index) => {
    const button = document.createElement("button");

    button.type = "button";

    button.className = "wcx-dom-node";

    if (node === element) {
      button.classList.add("wcx-dom-node-active");
    }

    button.innerHTML = `

                <span class="wcx-node-level">
                    ${index + 1}
                </span>

                <span>
                    ${escapeHTML(getElementName(node))}
                </span>

            `;

    button.addEventListener("click", () => {
      selectInspectorNode(node);
    });

    container.appendChild(button);

    if (index < path.length - 1) {
      const arrow = document.createElement("div");

      arrow.className = "wcx-dom-arrow";

      arrow.textContent = "↓";

      container.appendChild(arrow);
    }
  });
}

/* =========================================
   RENDER CHILDREN
========================================= */

function renderChildren(element) {
  const container = document.getElementById("wcx-children");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  const children = Array.from(element.children);

  if (!children.length) {
    container.innerHTML = `<div class="wcx-no-children">
                No child elements
            </div>`;

    return;
  }

  children.forEach((child, index) => {
    const button = document.createElement("button");

    button.type = "button";

    button.className = "wcx-child-node";

    button.innerHTML = `

                <span>
                    ${index + 1}.
                </span>

                <strong>
                    ${escapeHTML(getElementName(child))}
                </strong>

            `;

    button.addEventListener("click", () => {
      selectInspectorNode(child);
    });

    container.appendChild(button);
  });
}

/* =========================================
   SELECT INSPECTOR NODE
========================================= */

function selectInspectorNode(element) {
  if (!element) {
    return;
  }

  wcxCurrentElement = element;

  highlightInspectorNode(element);

  const currentName = document.getElementById("wcx-current-node-name");

  if (currentName) {
    currentName.textContent = getElementName(element);
  }

  renderDOMPath(element);

  renderChildren(element);

  updateNavigationButtons(element);

  scrollNodeIntoView(element);
}

/* =========================================
   HIGHLIGHT INSPECTOR NODE
========================================= */

function highlightInspectorNode(element) {
  document.querySelectorAll(".wcx-component-hover").forEach((node) => {
    node.classList.remove("wcx-component-hover");
  });

  element.classList.add("wcx-component-hover");
}

/* =========================================
   UPDATE NAVIGATION
========================================= */

function updateNavigationButtons(element) {
  const parentButton = document.getElementById("wcx-parent-btn");

  if (!parentButton) {
    return;
  }

  const parent = element.parentElement;

  parentButton.disabled = !parent || parent === document.body;
}

/* =========================================
   SCROLL TO NODE
========================================= */

function scrollNodeIntoView(element) {
  try {
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  } catch (error) {
    console.log("WCX scroll error:", error);
  }
}

/* =========================================
   CAPTURE SELECTED NODE
========================================= */

function captureSelectedNode(element) {
  if (!element) {
    return;
  }

  /*
   * Clone the node so WCX's own
   * highlight classes aren't exported.
   */

  const clone = element.cloneNode(true);

  removeWCXClasses(clone);

  const data = {
    url: window.location.href,

    title: document.title,

    tagName: element.tagName.toLowerCase(),

    id: element.id || null,

    classes: Array.from(element.classList).filter(
      (className) => !className.startsWith("wcx-"),
    ),

    selector: generateSelector(element),

    html: clone.outerHTML,
  };

  console.log("🔥 WCX SELECTED NODE:", data);

  removeInspector();

  showExtractionResult(data);
}

/* =========================================
   REMOVE WCX CLASSES
========================================= */

function removeWCXClasses(root) {
  if (root.nodeType === Node.ELEMENT_NODE) {
    root.classList.remove("wcx-hover", "wcx-component-hover");
  }

  root
    .querySelectorAll(".wcx-hover, .wcx-component-hover")
    .forEach((element) => {
      element.classList.remove("wcx-hover", "wcx-component-hover");
    });
}

/* =========================================
   GENERATE SELECTOR
========================================= */

function generateSelector(element) {
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  const path = [];

  let current = element;

  while (
    current &&
    current !== document.body &&
    current.nodeType === Node.ELEMENT_NODE
  ) {
    let selector = current.tagName.toLowerCase();

    if (current.classList.length) {
      const classes = Array.from(current.classList)
        .filter((className) => !className.startsWith("wcx-"))
        .slice(0, 4)
        .map((className) => CSS.escape(className));

      if (classes.length) {
        selector += "." + classes.join(".");
      }
    }

    path.unshift(selector);

    current = current.parentElement;
  }

  return path.join(" > ");
}

/* =========================================
   RESULT PANEL
========================================= */

function showExtractionResult(data) {
  const existing = document.getElementById("wcx-result");

  if (existing) {
    existing.remove();
  }

  const panel = document.createElement("div");

  panel.id = "wcx-result";

  panel.innerHTML = `

        <div class="wcx-result-header">

            <strong>
                WCX Component Captured
            </strong>

            <button
                type="button"
                id="wcx-close-result"
            >
                ×
            </button>

        </div>


        <div class="wcx-result-body">

            <div>
                <strong>
                    Element:
                </strong>

                ${escapeHTML(data.tagName)}
            </div>


            <div>
                <strong>
                    Selector:
                </strong>

                <code>
                    ${escapeHTML(data.selector)}
                </code>

            </div>


            <div>
                <strong>
                    Classes:
                </strong>

                ${escapeHTML(data.classes.join(" "))}

            </div>


            <div class="wcx-html-preview">

                <strong>
                    HTML:
                </strong>


                <textarea readonly>${escapeHTML(data.html)}</textarea>

            </div>

              
<div class="wcx-css-analysis-action">

    <button
        type="button"
        id="wcx-analyze-css-btn"
        class="wcx-primary-btn"
    >
        Analyze CSS
    </button>

</div>
            

        </div>

    `;

  document.body.appendChild(panel);

  document.getElementById("wcx-close-result").addEventListener("click", () => {
    panel.remove();
  });

  document
    .getElementById("wcx-analyze-css-btn")
    .addEventListener("click", () => {
      analyzeSelectedCSS(data);
    });
}

/* =========================================
   REMOVE INSPECTOR
========================================= */

function removeInspector() {
  const panel = document.getElementById("wcx-inspector");

  if (panel) {
    panel.remove();
  }

  wcxInspectorOpen = false;
}

/* =========================================
   ESCAPE HTML
========================================= */

function escapeHTML(value) {
  const div = document.createElement("div");

  div.textContent = value;

  return div.innerHTML;
}

/* =========================================
   MESSAGE FROM POPUP
========================================= */

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "START_SELECTION") {
    startSelectionMode();
  }
});

/* =========================================
   MOUSEOVER
========================================= */

document.addEventListener("mouseover", handleMouseOver, true);

/* =========================================
   CLICK
========================================= */

document.addEventListener("click", handleClick, true);

/* =========================================
   ESC
========================================= */

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    removeInspector();

    stopSelectionMode();
  }
});

/* =========================================
   ANALYZE SELECTED COMPONENT CSS - V2
========================================= */

function analyzeSelectedCSS(data) {
  if (
    !window.WCX_CSS ||
    typeof window.WCX_CSS.analyzeRenderingDependencies !== "function"
  ) {
    alert("WCX CSS Analyzer V2 is not available.");

    console.error("WCX: CSS Analyzer V2 is not available.");

    return;
  }

  const selector = data.selector;

  let element;

  try {
    element = document.querySelector(selector);
  } catch (error) {
    console.error("WCX selector error:", error);

    alert("Unable to locate selected component.");

    return;
  }

  if (!element) {
    alert("Selected component was not found.");

    return;
  }

  console.log("🔥 WCX: Starting CSS V2 rendering dependency analysis...");

  let result;

  try {
    result = window.WCX_CSS.analyzeRenderingDependencies(element);
  } catch (error) {
    console.error("🔥 WCX CSS V2 ANALYSIS ERROR:", error);

    alert("WCX CSS rendering analysis failed. Check the console.");

    return;
  }

  console.log("🔥 WCX CSS V2 ANALYSIS:", result);

  

  console.log(
    "🔥 WCX UNRESOLVED INHERITANCE:",
    result.inheritance.detections.filter((d) =>
      JSON.stringify(d).toLowerCase().includes("unresolved"),
    ),
  );

  console.log(
    "🔥 WCX CURSOR INHERITANCE:",
    result.inheritance.detections.find(
      (d) => d.element === "strong" && d.property === "cursor",
    ),
  );

  console.log("🔥 WCX CSS V2 SUMMARY:", result.summary);

  showCSSAnalysisResult(result);
}

/* =========================================
   CSS ANALYSIS RESULT - V2.1.1
========================================= */

function showCSSAnalysisResult(result) {
  /*
   * ============================================================
   * WCX CSS V2.1.1
   * Dependency Inspector UI
   *
   * Analyzer data is declaration-level.
   * UI groups declarations back into CSS rules.
   * ============================================================
   */

  if (!result) {
    console.error("WCX: CSS analysis result is empty.");
    return;
  }

  const summary = result.summary || {};

  const dependencies = Array.isArray(result.dependencies)
    ? result.dependencies
    : [];

  const overridden = Array.isArray(result.overridden)
    ? result.overridden
    : Array.isArray(result.cascade?.overridden)
      ? result.cascade.overridden
      : [];

  /*
   * ------------------------------------------------------------
   * Remove previous panel if one exists
   * ------------------------------------------------------------
   */

  const existingPanel = document.getElementById("wcx-css-analysis-panel");

  if (existingPanel) {
    existingPanel.remove();
  }

  /*
   * ------------------------------------------------------------
   * Helpers
   * ------------------------------------------------------------
   */

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeString(value) {
    return value == null ? "" : String(value);
  }

  function formatValue(value) {
    return safeString(value) || "—";
  }

  function formatSpecificity(specificity) {
    if (!specificity) {
      return "—";
    }

    if (specificity.text) {
      return specificity.text;
    }

    if (
      typeof specificity.a === "number" &&
      typeof specificity.b === "number" &&
      typeof specificity.c === "number"
    ) {
      return `${specificity.a},${specificity.b},${specificity.c}`;
    }

    return "—";
  }

  function getStatusClass(status) {
    if (status === "winning") {
      return "wcx-status-winning";
    }

    if (status === "overridden") {
      return "wcx-status-overridden";
    }

    if (status === "inactive") {
      return "wcx-status-inactive";
    }

    return "wcx-status-candidate";
  }

  function getStatusLabel(status) {
    switch (status) {
      case "winning":
        return "WINNING";

      case "overridden":
        return "OVERRIDDEN";

      case "inactive":
        return "INACTIVE";

      default:
        return "CANDIDATE";
    }
  }

  function getRuleKey(dependency) {
    return [
      safeString(dependency.selector),
      safeString(dependency.stylesheetIndex),
      safeString(dependency.ruleIndex),
      safeString(dependency.media),
      safeString(dependency.supports),
    ].join("|||");
  }

  /*
   * ------------------------------------------------------------
   * Group winning + overridden declarations by CSS rule
   * ------------------------------------------------------------
   */

  const groups = new Map();

  function ensureGroup(dependency) {
    const key = getRuleKey(dependency);

    if (!groups.has(key)) {
      groups.set(key, {
        key,

        selector: safeString(dependency.selector),

        originalSelector: safeString(dependency.originalSelector),

        cssText: safeString(
          dependency.cssText || dependency.declaration?.rule?.cssText,
        ),

        source: safeString(
          dependency.stylesheetHref || dependency.stylesheetTitle || "Inline",
        ),

        framework: safeString(dependency.stylesheetFramework) || "Unknown",

        stylesheetIndex: dependency.stylesheetIndex,

        ruleIndex: dependency.ruleIndex,

        media: dependency.media,

        supports: dependency.supports,

        dependencyType: safeString(dependency.dependencyType),

        matchedElements: new Set(),

        declarations: [],
      });
    }

    return groups.get(key);
  }

  function addDeclaration(declaration, statusOverride) {
    if (!declaration) {
      return;
    }

    const group = ensureGroup(declaration);

    const labels = safeArray(declaration.matchedElementLabels);

    labels.forEach((label) => {
      group.matchedElements.add(label);
    });

    group.declarations.push({
      property: safeString(declaration.property),

      value: safeString(declaration.value),

      important: declaration.important === true,

      status: statusOverride || safeString(declaration.status) || "candidate",

      specificity: declaration.specificity,

      computedValue: safeString(declaration.computedValue),

      matchesComputed: declaration.matchesComputed === true,

      variableReferences: safeArray(declaration.variableReferences),

      sourceOrder: declaration.sourceOrder,

      stylesheetIndex: declaration.stylesheetIndex,

      ruleIndex: declaration.ruleIndex,

      media: declaration.media,

      supports: declaration.supports,
    });
  }

  /*
   * First add current winning dependencies.
   */
  dependencies.forEach((dependency) => {
    addDeclaration(dependency, "winning");
  });

  /*
   * Then add overridden declarations.
   */
  overridden.forEach((declaration) => {
    addDeclaration(declaration, "overridden");
  });

  /*
   * ------------------------------------------------------------
   * Sort declarations:
   *
   * winning first
   * overridden afterwards
   * ------------------------------------------------------------
   */

  for (const group of groups.values()) {
    group.declarations.sort((a, b) => {
      if (a.status === "winning" && b.status !== "winning") {
        return -1;
      }

      if (a.status !== "winning" && b.status === "winning") {
        return 1;
      }

      return (a.sourceOrder ?? 0) - (b.sourceOrder ?? 0);
    });
  }

  /*
   * ------------------------------------------------------------
   * Create panel
   * ------------------------------------------------------------
   */

  const panel = document.createElement("div");

  panel.id = "wcx-css-analysis-panel";

  panel.className = "wcx-css-analysis-panel";

  /*
   * ------------------------------------------------------------
   * Header
   * ------------------------------------------------------------
   */

  const header = document.createElement("div");

  header.className = "wcx-css-analysis-header";

  header.innerHTML = `
        <div class="wcx-css-analysis-title">
            WCX CSS Rendering Analysis
        </div>

        <button
            type="button"
            class="wcx-css-analysis-close"
            aria-label="Close"
        >
            ×
        </button>
    `;

  panel.appendChild(header);

  /*
   * ------------------------------------------------------------
   * Summary
   * ------------------------------------------------------------
   */

  const summaryGrid = document.createElement("div");

  summaryGrid.className = "wcx-css-analysis-summary";

  const summaryItems = [
    ["DOM Elements", summary.domElements ?? 0],

    ["Stylesheets", summary.stylesheets ?? 0],

    ["CSS Candidates", summary.cssCandidates ?? 0],

    ["Rendering Dependencies", summary.renderingDependencies ?? 0],

    ["Responsive Dependencies", summary.responsiveDependencies ?? 0],

    ["Global Dependencies", summary.globalDependencies ?? 0],

    ["Component Dependencies", summary.componentDependencies ?? 0],

    ["Descendant Dependencies", summary.descendantDependencies ?? 0],

    ["Inline CSS", summary.inlineCSS ?? 0],

    ["Winning Declarations", summary.winningDeclarations ?? 0],

    ["Overridden Declarations", summary.overriddenDeclarations ?? 0],

    ["Variable Dependencies", summary.variableDependencies ?? 0],
  ];

  summaryItems.forEach(([label, value]) => {
    const item = document.createElement("div");

    item.className = "wcx-css-summary-item";

    item.innerHTML = `
            <div class="wcx-css-summary-label">
                ${escapeHTML(label)}
            </div>

            <div class="wcx-css-summary-value">
                ${escapeHTML(value)}
            </div>
        `;

    summaryGrid.appendChild(item);
  });

  panel.appendChild(summaryGrid);

  /*
   * ------------------------------------------------------------
   * Dependency section
   * ------------------------------------------------------------
   */

  const sectionHeader = document.createElement("div");

  sectionHeader.className = "wcx-css-analysis-section-title";

  sectionHeader.textContent = "Rendering CSS Dependencies";

  panel.appendChild(sectionHeader);

  /*
   * ------------------------------------------------------------
   * Scrollable dependency container
   * ------------------------------------------------------------
   */

  const list = document.createElement("div");

  list.className = "wcx-css-analysis-list";

  if (!groups.size) {
    list.innerHTML = `
            <div class="wcx-css-empty">
                No rendering CSS dependencies were detected.
            </div>
        `;

    panel.appendChild(list);
  } else {
    let counter = 0;

    for (const group of groups.values()) {
      counter++;

      const card = document.createElement("div");

      card.className = "wcx-css-rule-card";

      /*
       * ----------------------------------------------------
       * Rule header
       * ----------------------------------------------------
       */

      const ruleHeader = document.createElement("div");

      ruleHeader.className = "wcx-css-rule-header";

      const selector = escapeHTML(
        group.selector || group.originalSelector || "Unknown selector",
      );

      ruleHeader.innerHTML = `
                <div class="wcx-css-rule-number">
                    ${counter}
                </div>

                <div class="wcx-css-rule-selector">
                    ${selector}
                </div>
            `;

      card.appendChild(ruleHeader);

      /*
       * ----------------------------------------------------
       * Original CSS rule
       * ----------------------------------------------------
       */

      if (group.cssText) {
        const cssBlock = document.createElement("pre");

        cssBlock.className = "wcx-css-rule-source";

        cssBlock.textContent = group.cssText;

        card.appendChild(cssBlock);
      }

      /*
       * ----------------------------------------------------
       * Metadata
       * ----------------------------------------------------
       */

      const metadata = document.createElement("div");

      metadata.className = "wcx-css-rule-metadata";

      metadata.innerHTML = `
                <span class="wcx-css-badge">
                    Type:
                    ${escapeHTML(group.dependencyType || "rendering")}
                </span>

                <span class="wcx-css-badge">
                    Framework:
                    ${escapeHTML(group.framework || "Unknown")}
                </span>

                ${
                  group.media
                    ? `
                            <span class="wcx-css-badge">
                                @media
                                ${escapeHTML(group.media)}
                            </span>
                        `
                    : ""
                }

                ${
                  group.supports
                    ? `
                            <span class="wcx-css-badge">
                                @supports
                                ${escapeHTML(group.supports)}
                            </span>
                        `
                    : ""
                }
            `;

      card.appendChild(metadata);

      /*
       * ----------------------------------------------------
       * Declarations
       * ----------------------------------------------------
       */

      const declarationList = document.createElement("div");

      declarationList.className = "wcx-css-declaration-list";

      group.declarations.forEach((declaration) => {
        const row = document.createElement("div");

        row.className =
          "wcx-css-declaration " + getStatusClass(declaration.status);

        const important = declaration.important ? " !important" : "";

        row.innerHTML = `
                        <div class="wcx-css-declaration-top">

                            <span class="wcx-css-property">
                                ${escapeHTML(declaration.property)}
                            </span>

                            <span class="wcx-css-status ${getStatusClass(
                              declaration.status,
                            )}">
                                ${getStatusLabel(declaration.status)}
                            </span>

                        </div>

                        <div class="wcx-css-value">
                            ${escapeHTML(declaration.value)}${escapeHTML(
                              important,
                            )}
                        </div>

                        <div class="wcx-css-declaration-meta">

                            <span>
                                Specificity:
                                ${escapeHTML(
                                  formatSpecificity(declaration.specificity),
                                )}
                            </span>

                            ${
                              declaration.computedValue
                                ? `
                                        <span>
                                            Computed:
                                            ${escapeHTML(
                                              declaration.computedValue,
                                            )}
                                        </span>
                                    `
                                : ""
                            }

                            ${
                              declaration.variableReferences.length
                                ? `
                                        <span>
                                            Variables:
                                            ${escapeHTML(
                                              declaration.variableReferences.join(
                                                ", ",
                                              ),
                                            )}
                                        </span>
                                    `
                                : ""
                            }

                        </div>
                    `;

        declarationList.appendChild(row);
      });

      card.appendChild(declarationList);

      /*
       * ----------------------------------------------------
       * Matched elements
       * ----------------------------------------------------
       */

      const matched = Array.from(group.matchedElements);

      if (matched.length) {
        const matchedBlock = document.createElement("div");

        matchedBlock.className = "wcx-css-matched-elements";

        matchedBlock.innerHTML = `
                    <span class="wcx-css-matched-label">
                        Matched:
                    </span>

                    ${matched
                      .slice(0, 20)
                      .map(
                        (label) =>
                          `<span class="wcx-css-element-badge">${escapeHTML(
                            label,
                          )}</span>`,
                      )
                      .join("")}

                    ${
                      matched.length > 20
                        ? `
                                <span class="wcx-css-element-more">
                                    +${matched.length - 20} more
                                </span>
                            `
                        : ""
                    }
                `;

        card.appendChild(matchedBlock);
      }

      list.appendChild(card);
    }

    panel.appendChild(list);
  }

  /*
   * ------------------------------------------------------------
   * Close button
   * ------------------------------------------------------------
   */

  const closeButton = header.querySelector(".wcx-css-analysis-close");

  if (closeButton) {
    closeButton.addEventListener("click", () => {
      panel.remove();
    });
  }

  /*
   * ------------------------------------------------------------
   * Add to page
   * ------------------------------------------------------------
   */

  document.body.appendChild(panel);

  console.log("🔥 WCX CSS V2.1.1 UI rendered:", {
    rules: groups.size,
    winningDeclarations: summary.winningDeclarations ?? dependencies.length,
    overriddenDeclarations: summary.overriddenDeclarations ?? overridden.length,
  });
}
