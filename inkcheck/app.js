const API_URL = document.querySelector('meta[name="inkcheck-api"]').content;
const EVENT_URL = new URL("event", API_URL).href;
const form = document.querySelector("#check-form");
const mainFileInput = document.querySelector("#main-file");
const includeFilesInput = document.querySelector("#include-files");
const folderInput = document.querySelector("#folder");
const rootChoice = document.querySelector("#root-choice");
const rootSelect = document.querySelector("#root");
const selectionNote = document.querySelector("#selection-note");
const clearSelection = document.querySelector("#clear-selection");
const submit = document.querySelector("#submit");
const status = document.querySelector("#form-status");
const mazeLoader = document.querySelector("#maze-loader");
const authorized = document.querySelector("#authorized");
const privacy = document.querySelector("#privacy");
const result = document.querySelector("#result");
const resultTitle = document.querySelector("#result-title");
const summary = document.querySelector("#result-summary");
const metrics = document.querySelector("#result-metrics");
const findings = document.querySelector("#result-findings");
const download = document.querySelector("#download");
let lastResponse = null;

document.querySelector("#year").textContent = new Date().getFullYear();

function trackUsage(event) {
  fetch(EVENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
    credentials: "omit",
    cache: "no-store",
    keepalive: true,
    referrerPolicy: "no-referrer",
  }).catch(() => {});
}

trackUsage("page_view");
document.querySelector(".support-button")?.addEventListener("click", () => {
  trackUsage("support_click");
});
document.querySelector('a[href="#local-mode"]')?.addEventListener("click", () => {
  trackUsage("local_command_clicked");
});

function folderEntries() {
  const entries = Array.from(folderInput.files)
    .filter((file) => file.name.toLowerCase().endsWith(".ink"))
    .map((file) => ({ file, name: file.webkitRelativePath || file.name }));
  if (entries.length && entries.every((entry) => entry.name.includes("/"))) {
    const first = entries[0].name.split("/")[0];
    if (entries.every((entry) => entry.name.startsWith(`${first}/`))) {
      for (const entry of entries) entry.name = entry.name.slice(first.length + 1);
    }
  }
  return entries;
}

function individualEntries() {
  const entries = [];
  const main = mainFileInput.files[0];
  if (main?.name.toLowerCase().endsWith(".ink")) entries.push({ file: main, name: main.name });
  for (const file of includeFilesInput.files) {
    if (file.name.toLowerCase().endsWith(".ink")) entries.push({ file, name: file.name });
  }
  return entries;
}

function refreshSelection() {
  const folder = folderEntries();
  rootSelect.replaceChildren();
  if (folder.length) {
    for (const entry of folder) rootSelect.add(new Option(entry.name, entry.name));
    const likelyRoot = folder.find((entry) => /(^|\/)(main|story)\.ink$/i.test(entry.name));
    if (likelyRoot) rootSelect.value = likelyRoot.name;
    rootChoice.hidden = false;
    selectionNote.textContent = `${folder.length} unchanged .ink file${folder.length === 1 ? "" : "s"} selected.`;
    return;
  }

  rootChoice.hidden = true;
  const main = mainFileInput.files[0];
  if (main) {
    rootSelect.add(new Option(main.name, main.name));
    const extraCount = individualEntries().length - 1;
    selectionNote.textContent = `${main.name} selected${extraCount ? ` with ${extraCount} INCLUDE file${extraCount === 1 ? "" : "s"}` : ""}.`;
  } else {
    rootSelect.add(new Option("story.ink", "story.ink"));
    selectionNote.textContent = "Choose one .ink file.";
  }
}

mainFileInput.addEventListener("change", () => {
  if (mainFileInput.files.length) folderInput.value = "";
  refreshSelection();
});
includeFilesInput.addEventListener("change", () => {
  if (includeFilesInput.files.length) folderInput.value = "";
  refreshSelection();
});
folderInput.addEventListener("change", () => {
  if (folderInput.files.length) {
    mainFileInput.value = "";
    includeFilesInput.value = "";
  }
  refreshSelection();
});
clearSelection.addEventListener("click", () => {
  mainFileInput.value = "";
  includeFilesInput.value = "";
  folderInput.value = "";
  document.querySelector("#include-options").open = false;
  result.hidden = true;
  status.textContent = "";
  refreshSelection();
});

function addStoryParts(data) {
  const folder = folderEntries();
  const entries = folder.length ? folder : individualEntries();
  const names = new Set();
  for (const entry of entries) {
    if (names.has(entry.name)) throw new Error(`Two selected files have the same path: ${entry.name}`);
    names.add(entry.name);
    data.append(`ink:${entry.name}`, entry.file, entry.file.name);
  }
  if (!folder.length && !mainFileInput.files.length) throw new Error("Choose an .ink file first.");
  const root = folder.length ? rootSelect.value : mainFileInput.files[0]?.name || "story.ink";
  if (!names.has(root)) throw new Error("Choose the file that starts the story.");
  data.append("root", root);
}

function readinessMessage() {
  if (folderInput.files.length && !folderEntries().length) {
    return "The selected folder did not include any .ink files. Choose your project folder or choose an .ink file.";
  }
  if (mainFileInput.files.length && !mainFileInput.files[0].name.toLowerCase().endsWith(".ink")) {
    return "Choose a file ending in .ink.";
  }
  if (!folderEntries().length && !mainFileInput.files.length) {
    return "Choose an .ink file first.";
  }
  if (!authorized.checked && !privacy.checked) {
    return "Check the two confirmation boxes, then run Inkcheck.";
  }
  if (!authorized.checked) {
    return "Check the authorization box, then run Inkcheck.";
  }
  if (!privacy.checked) {
    return "Check the temporary-upload box, then run Inkcheck.";
  }
  return "";
}

function metric(label, value) {
  const item = document.createElement("div");
  const number = document.createElement("strong");
  const name = document.createElement("span");
  number.textContent = typeof value === "number" ? value.toLocaleString() : String(value);
  name.textContent = label;
  item.append(number, name);
  return item;
}

function countPhrase(count, singular, plural = `${singular}s`) {
  const value = Number(count) || 0;
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}

const SEVERITY_LABELS = {
  error: "Errors to fix first",
  warning: "Warnings to review",
  note: "Coverage notes",
};

function locationText(item) {
  if (!item.file) return "";
  return `${item.file}${item.line ? ` line ${item.line}` : ""}${item.approximateLocation ? " (approx.)" : ""}`;
}

function fallbackHumanFindings(report) {
  const out = [];
  const compile = report.compile || {};
  for (const issue of compile.issues || []) {
    const severity = issue.severity === "ERROR" || issue.severity === "RUNTIME ERROR"
      ? "error"
      : issue.severity === "WARNING"
        ? "warning"
        : "note";
    out.push({
      severity,
      category: issue.severity === "ERROR" ? "Compiler error" : issue.severity === "WARNING" ? "Compiler warning" : "Compiler note",
      title: issue.message || issue.raw || "Compiler finding",
      message: issue.message || issue.raw || "Compiler returned a finding without details.",
      file: issue.file,
      line: issue.line,
      action: severity === "error"
        ? "Fix this source line first; Inkcheck cannot explore the story until it compiles."
        : "Review this compiler note and decide whether the story should change.",
    });
  }
  const explore = report.explore || {};
  for (const error of explore.runtimeErrors || []) {
    out.push({
      severity: "error",
      category: "Runtime error",
      title: (error.message || "Runtime error").replace(/\s*\(at [^)]+\)\s*$/, ""),
      message: error.message || "Ink hit a runtime error on this path.",
      file: error.sourceLocation?.file,
      line: error.sourceLocation?.line,
      approximateLocation: error.sourceLocation?.approximate,
      path: error.path,
      action: "Follow the choice path, then inspect the source near this location for a bad divert, variable, expression, or runtime-only edge case.",
    });
  }
  for (const knot of explore.unvisitedKnots || []) {
    out.push({
      severity: "warning",
      category: "Unvisited content",
      title: `No explored path reached ${knot.name}`,
      message: `The knot ${knot.name} was not visited by any explored path.`,
      file: knot.file,
      line: knot.line,
      action: "If this scene should be reachable, add or repair a divert/choice that leads here. If it is intentionally unused, mark it for yourself or remove it.",
    });
  }
  return out.sort((a, b) => ["error", "warning", "note"].indexOf(a.severity) - ["error", "warning", "note"].indexOf(b.severity));
}

function findingGroup(title, group) {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading);
  const list = document.createElement("ol");
  list.className = "finding-list";
  for (const item of group) {
    const row = document.createElement("li");
    const itemTitle = document.createElement("strong");
    itemTitle.textContent = item.title || item.message || "Finding";
    const meta = document.createElement("p");
    meta.className = "finding-meta";
    const bits = [item.category];
    if (item.file) bits.push(locationText(item));
    meta.textContent = bits.join(" · ");
    const message = document.createElement("p");
    message.textContent = item.message || "";
    row.append(itemTitle, meta, message);
    if (item.path?.length) {
      const path = document.createElement("p");
      path.className = "finding-path";
      path.textContent = `Choice path: ${item.path.join(" → ")}`;
      row.append(path);
    }
    if (item.action) {
      const action = document.createElement("p");
      action.className = "finding-action";
      action.textContent = `Next step: ${item.action}`;
      row.append(action);
    }
    list.append(row);
  }
  section.append(list);
  return section;
}

function renderHumanFindings(items) {
  findings.replaceChildren();
  if (!items.length) {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    const empty = document.createElement("p");
    heading.textContent = "Actionable findings";
    empty.className = "finding-clear";
    empty.textContent = "No compiler errors, runtime errors, or unreachable knots were found in this check.";
    section.append(heading, empty);
    findings.append(section);
    return;
  }
  for (const severity of ["error", "warning", "note"]) {
    const group = items.filter((item) => item.severity === severity);
    if (group.length) findings.append(findingGroup(SEVERITY_LABELS[severity], group));
  }
}

function renderReport(body) {
  const report = body.report || {};
  const compile = report.compile || {};
  const explore = report.explore;
  const humanFindings = Array.isArray(body.humanFindings)
    ? body.humanFindings
    : fallbackHumanFindings(report);
  metrics.replaceChildren();

  if (!compile.success) {
    resultTitle.textContent = "Fix compile errors first";
    summary.textContent = `The story did not compile. Fix the ${compile.errors || "reported"} error${compile.errors === 1 ? "" : "s"} below, then run it again.`;
    metrics.append(metric("compile errors", compile.errors ?? "—"), metric("warnings", compile.warnings ?? "—"));
    renderHumanFindings(humanFindings);
    return;
  }

  if (!explore) {
    resultTitle.textContent = "Compiled, but report is incomplete";
    summary.textContent = "The story compiled, but no exploration report was returned.";
    return;
  }

  const hasProblems = explore.runtimeErrors.length || explore.unvisitedKnots.length;
  if (explore.truncated) {
    resultTitle.textContent = hasProblems ? "Partial check found review leads" : "Partial check complete";
    summary.textContent = `Inkcheck ran and found ${countPhrase(explore.endingsFound.length, "ending")}, ${countPhrase(explore.runtimeErrors.length, "runtime error")}, and ${countPhrase(explore.unvisitedKnots.length, "unvisited knot")}.`;
  } else {
    resultTitle.textContent = explore.runtimeErrors.length
      ? "Runtime paths need review"
      : explore.unvisitedKnots.length
        ? "Reachability review needed"
        : "No mechanical issues found";
    summary.textContent = hasProblems
    ? "Inkcheck found areas worth reviewing. These are mechanical signals, not judgments about the story."
    : "No runtime failures or unreachable knots were found in this check.";
  }
  metrics.append(
    metric("words", report.stats?.words ?? "—"),
    metric("choices", report.stats?.choices ?? "—"),
    metric("states explored", explore.statesExplored),
    metric("endings found", explore.endingsFound.length),
    metric("runtime errors", explore.runtimeErrors.length),
    metric("unvisited knots", explore.unvisitedKnots.length)
  );
  renderHumanFindings(humanFindings);
}

function setStatus(message, issueUrl) {
  status.replaceChildren(document.createTextNode(message));
  if (issueUrl) {
    status.append(" ");
    const link = document.createElement("a");
    link.href = issueUrl;
    link.textContent = "File an issue";
    status.append(link, ".");
  }
}

function setLoading(isLoading) {
  mazeLoader.hidden = !isLoading;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = readinessMessage();
  if (message) {
    setStatus(message);
    form.reportValidity();
    return;
  }
  if (!form.reportValidity()) {
    setStatus("Review the highlighted fields, then run Inkcheck again.");
    return;
  }
  submit.disabled = true;
  form.setAttribute("aria-busy", "true");
  setLoading(true);
  result.hidden = true;
  setStatus("Uploading files and starting the check…");
  try {
    const data = new FormData();
    addStoryParts(data);
    data.append("authorized", String(authorized.checked));
    data.append("privacyAcknowledged", String(privacy.checked));

    const headers = {};
    const accessCode = document.querySelector("#access-code")?.value;
    if (accessCode) headers["X-Inkcheck-Access-Code"] = accessCode;
    setStatus("Compiling the story and exploring branches…");
    const response = await fetch(API_URL, { method: "POST", headers, body: data });
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error("The checker returned an unreadable response. Please try again shortly.");
    }
    if (!response.ok) {
      const error = new Error(body.error || `The checker could not run this request (${response.status}).`);
      error.issueUrl = body.issueUrl;
      throw error;
    }
    lastResponse = body;
    renderReport(body);
    result.hidden = false;
    result.scrollIntoView({ behavior: "smooth", block: "start" });
    result.focus({ preventScroll: true });
    setStatus(`Check complete in ${(body.meta.durationMs / 1000).toFixed(1)} seconds. Uploaded files were deleted after the response.`);
  } catch (error) {
    if (error instanceof TypeError) {
      setStatus("The checker service could not be reached. Please try again later.");
    } else {
      setStatus(error.message, error.issueUrl);
    }
  } finally {
    submit.disabled = false;
    form.removeAttribute("aria-busy");
    setLoading(false);
  }
});

download.addEventListener("click", () => {
  if (!lastResponse) return;
  trackUsage("report_downloaded");
  const blob = new Blob([JSON.stringify(lastResponse.report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "inkcheck-report.json";
  link.click();
  URL.revokeObjectURL(url);
});
