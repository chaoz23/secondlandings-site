const API_URL = document.querySelector('meta[name="inkcheck-api"]').content;
const form = document.querySelector("#check-form");
const mainFileInput = document.querySelector("#main-file");
const includeFilesInput = document.querySelector("#include-files");
const folderInput = document.querySelector("#folder");
const storyText = document.querySelector("#story-text");
const rootChoice = document.querySelector("#root-choice");
const rootSelect = document.querySelector("#root");
const selectionNote = document.querySelector("#selection-note");
const submit = document.querySelector("#submit");
const status = document.querySelector("#form-status");
const result = document.querySelector("#result");
const summary = document.querySelector("#result-summary");
const metrics = document.querySelector("#result-metrics");
const findings = document.querySelector("#result-findings");
const resultJson = document.querySelector("#result-json");
const download = document.querySelector("#download");
let lastResponse = null;

document.querySelector("#year").textContent = new Date().getFullYear();

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
    rootSelect.add(new Option("main.ink", "main.ink"));
    selectionNote.textContent = storyText.value.trim()
      ? "Pasted contents will be checked as main.ink."
      : "Choose one main file or paste its contents.";
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
storyText.addEventListener("input", refreshSelection);

function addStoryParts(data) {
  const folder = folderEntries();
  const entries = folder.length ? folder : individualEntries();
  const names = new Set();
  for (const entry of entries) {
    if (names.has(entry.name)) throw new Error(`Two selected files have the same path: ${entry.name}`);
    names.add(entry.name);
    data.append(`ink:${entry.name}`, entry.file, entry.file.name);
  }
  if (!folder.length && !mainFileInput.files.length) {
    if (!storyText.value.trim()) throw new Error("Choose the main .ink file or paste its contents first.");
    data.append("ink:main.ink", new Blob([storyText.value], { type: "text/plain" }), "main.ink");
    names.add("main.ink");
  }
  const root = folder.length ? rootSelect.value : mainFileInput.files[0]?.name || "main.ink";
  if (!names.has(root)) throw new Error("Choose the file that starts the story.");
  data.append("root", root);
}

function metric(label, value) {
  const item = document.createElement("div");
  const number = document.createElement("strong");
  const name = document.createElement("span");
  number.textContent = String(value);
  name.textContent = label;
  item.append(number, name);
  return item;
}

function finding(title, items, emptyMessage) {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading);
  if (!items?.length) {
    const empty = document.createElement("p");
    empty.className = "finding-clear";
    empty.textContent = emptyMessage;
    section.append(empty);
    return section;
  }
  const list = document.createElement("ul");
  for (const item of items) {
    const row = document.createElement("li");
    row.textContent = typeof item === "string" ? item : item.message || JSON.stringify(item);
    list.append(row);
  }
  section.append(list);
  return section;
}

function renderReport(body) {
  const report = body.report || {};
  const compile = report.compile || {};
  const explore = report.explore;
  metrics.replaceChildren();
  findings.replaceChildren();

  if (!compile.success) {
    summary.textContent = `The story did not compile. Fix the ${compile.errors || "reported"} error${compile.errors === 1 ? "" : "s"} below, then run it again.`;
    metrics.append(metric("compile errors", compile.errors ?? "—"), metric("warnings", compile.warnings ?? "—"));
    findings.append(finding("Compiler findings", compile.issues, "No compiler details were returned."));
    return;
  }

  if (!explore) {
    summary.textContent = "The story compiled, but no exploration report was returned.";
    return;
  }

  const hasProblems = explore.runtimeErrors.length || explore.unvisitedKnots.length;
  summary.textContent = hasProblems
    ? "Inkcheck found areas worth reviewing. These are mechanical signals, not judgments about the story."
    : "No runtime failures or unreachable knots were found within the limits of this check.";
  metrics.append(
    metric("states explored", explore.statesExplored),
    metric("endings found", explore.endingsFound.length),
    metric("runtime errors", explore.runtimeErrors.length),
    metric("unvisited knots", explore.unvisitedKnots.length)
  );
  findings.append(
    finding("Runtime errors", explore.runtimeErrors, "None found in the paths checked."),
    finding("Unvisited knots", explore.unvisitedKnots, "Every reported knot was reached."),
    finding("Compiler notes", compile.issues, "No compiler warnings or TODOs.")
  );
  const limitations = [];
  if (explore.truncated) limitations.push("The check reached its state or depth limit, so coverage is partial.");
  if (explore.randomnessDetected) limitations.push("The story uses randomness; another run may follow different paths.");
  if (explore.externalFunctionsStubbed?.length) limitations.push(`EXTERNAL functions were stubbed: ${explore.externalFunctionsStubbed.join(", ")}.`);
  if (limitations.length) findings.append(finding("Coverage notes", limitations, ""));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  submit.disabled = true;
  result.hidden = true;
  status.textContent = "Following your story's paths…";
  try {
    const data = new FormData();
    addStoryParts(data);
    data.append("maxDepth", document.querySelector("#max-depth").value);
    data.append("maxStates", document.querySelector("#max-states").value);
    data.append("authorized", String(document.querySelector("#authorized").checked));
    data.append("privacyAcknowledged", String(document.querySelector("#privacy").checked));

    const headers = {};
    const accessCode = document.querySelector("#access-code")?.value;
    if (accessCode) headers["X-Inkcheck-Access-Code"] = accessCode;
    const response = await fetch(API_URL, { method: "POST", headers, body: data });
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error("The checker returned an unreadable response. Please try again shortly.");
    }
    if (!response.ok) throw new Error(body.error || `The checker could not run this request (${response.status}).`);
    lastResponse = body;
    renderReport(body);
    resultJson.textContent = JSON.stringify(body.report, null, 2);
    result.hidden = false;
    result.scrollIntoView({ behavior: "smooth", block: "start" });
    status.textContent = `Check complete in ${(body.meta.durationMs / 1000).toFixed(1)} seconds. Uploaded files were deleted after the response.`;
  } catch (error) {
    status.textContent = error instanceof TypeError
      ? "The checker service could not be reached. Please try again later."
      : error.message;
  } finally {
    submit.disabled = false;
  }
});

download.addEventListener("click", () => {
  if (!lastResponse) return;
  const blob = new Blob([JSON.stringify(lastResponse.report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "inkcheck-report.json";
  link.click();
  URL.revokeObjectURL(url);
});
