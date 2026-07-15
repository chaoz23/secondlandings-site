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
const runProgress = document.querySelector("#run-progress");
const progressPhase = document.querySelector("#progress-phase");
const progressBudget = document.querySelector("#progress-budget");
const progressDetails = document.querySelector("#progress-details");
const progressTrust = document.querySelector("#progress-trust");
const cancelCheck = document.querySelector("#cancel-check");
const consent = document.querySelector("#consent");
const result = document.querySelector("#result");
const resultTitle = document.querySelector("#result-title");
const summary = document.querySelector("#result-summary");
const metrics = document.querySelector("#result-metrics");
const findings = document.querySelector("#result-findings");
const download = document.querySelector("#download");
let lastResponse = null;
let activeJob = null;
let progressStream = null;
let progressPoll = null;
let cancelRequested = false;

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
  if (!consent.checked) {
    return "Check the confirmation box, then run Inkcheck.";
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

function coverageState(explore) {
  if (explore.exhaustive) return "exhaustive";
  if (explore.truncated) return "partial";
  return "within limits";
}

function truncationAdvice(explore) {
  const causes = explore.truncatedBy || {};
  // A memory stop means the story outgrew the shared server; the hosted
  // checker cannot give it more heap, so point to the local command-line tool.
  if (causes.memory) {
    return "This story is large enough that the check stopped to stay within the server's memory. The results here are still real as far as they go — for a broader pass, run the local command-line tool below, where you control memory.";
  }
  // Any other stop just means the story is bigger than one hosted run covers.
  // The metrics show how far it got, so we don't restate that as a limit name
  // (and never surface internal terms like "beam width" to a reader here).
  return "";
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
    const orphan = knot.staticOrphanCandidate === true;
    const inbound = Number.isFinite(knot.inboundDiverts) ? knot.inboundDiverts : null;
    out.push({
      severity: "warning",
      category: "Unvisited content",
      title: `No explored path reached ${knot.name}`,
      message: orphan
        ? `The knot ${knot.name} was not visited, and source scanning found no direct authored divert to it.`
        : `The knot ${knot.name} was not visited by this run${inbound === null ? "" : `, though ${inbound} direct inbound divert${inbound === 1 ? "" : "s"} exist`}.`,
      file: knot.file,
      line: knot.line,
      action: orphan
        ? "If this scene should be reachable, add or repair a divert/choice that leads here. If it is intentionally unused, mark it for yourself or remove it."
        : "Try a broader run before treating this as dead content; it may be behind depth, state, condition, or host-game limits.",
    });
  }
  if (explore.truncated) {
    out.push({
      severity: "note",
      category: "Coverage limit",
      title: "This was a partial check",
      message: truncationAdvice(explore) || "This run did not reach every part of the story. The metrics above show how far it got.",
      action: "Run the local command-line tool for a deeper offline check if this story needs more coverage.",
    });
  }
  if (explore.exhaustive) {
    out.push({
      severity: "note",
      category: "Coverage limit",
      title: "Choice traversal completed within the configured limits",
      message: "A systematic pass visited every reachable state it could see without hitting a configured limit.",
      action: "Still review host-game behavior and external systems separately if the story depends on them.",
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
  const coverage = coverageState(explore);
  // Title by what was found, not by whether the run was "partial" — there is
  // no "complete" mode for a non-trivial story, so a partial/complete title
  // would imply a choice that does not exist. Coverage is shown by the badge
  // and the coverage note instead.
  resultTitle.textContent = explore.runtimeErrors.length
    ? "Runtime paths need review"
    : explore.unvisitedKnots.length
      ? "Reachability review needed"
      : explore.truncated
        ? "No issues found in the paths checked"
        : "No mechanical issues found";
  if (explore.truncated) {
    const advice = truncationAdvice(explore);
    summary.textContent = `Inkcheck checked what this run could reach and found ${countPhrase(explore.endingsFound.length, "ending")}, ${countPhrase(explore.runtimeErrors.length, "runtime error")}, and ${countPhrase(explore.unvisitedKnots.length, "unvisited knot")}.${advice ? " " + advice : ""}`;
  } else {
    summary.textContent = hasProblems
      ? "Inkcheck found areas worth reviewing. These are mechanical signals, not judgments about the story."
      : explore.exhaustive
        ? "No runtime failures or unreachable knots were found, and choice traversal completed within the configured limits."
        : "No runtime failures or unreachable knots were found in this check.";
  }
  // Show how deep exploration actually went, not just the configured cap: the
  // depth limit alone says nothing about the story, and a limit far above the
  // deepest reached path (e.g. 100 vs 65) reads as misleadingly large. Max over
  // the per-pass telemetry; fall back to the limit if telemetry is absent.
  const deepestReached = Array.isArray(explore.passes) && explore.passes.length
    ? Math.max(0, ...explore.passes.map((pass) => pass.maxDepthReached ?? 0))
    : undefined;
  metrics.append(
    metric("words", report.stats?.words ?? "—"),
    metric("choices", report.stats?.choices ?? "—"),
    metric("states explored", explore.statesExplored),
    metric("deepest path", deepestReached ?? explore.limits?.maxDepth ?? "—"),
    metric("state budget", explore.limits?.maxStates ?? "—"),
    ...(explore.limits?.seed === undefined ? [] : [metric("random seed", explore.limits.seed)]),
    metric("coverage", coverage),
    metric("endings found", explore.endingsFound.length),
    metric("runtime errors", explore.runtimeErrors.length),
    metric("unvisited knots", explore.unvisitedKnots.length)
  );
  renderHumanFindings(humanFindings);
  if (body.resultWindow) {
    const resultKind = body.resultWindow.uncertainty === "exhaustive"
      ? "This result window is exhaustive for the configured run."
      : "This is a bounded partial result; more search may still find different paths.";
    summary.textContent = `${summary.textContent} ${resultKind}`;
  }
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

function jobUrl(relative) {
  return new URL(relative, API_URL).href;
}

function elapsed(ms) {
  const seconds = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function phaseLabel(phase) {
  return ({ compile: "Compiling story", source_scan: "Scanning structure", explore: "Exploring choices", min_repro: "Shortening repro paths", report: "Building report" })[phase] || "Preparing check";
}

function renderProgress(event, jobStatus) {
  runProgress.hidden = false;
  runProgress.dataset.state = jobStatus || "";
  cancelCheck.hidden = ["complete", "cancelled", "failed"].includes(jobStatus);
  cancelCheck.disabled = cancelRequested;
  cancelCheck.textContent = cancelRequested ? "Cancelling..." : "Cancel check";
  progressTrust.textContent = "Uploaded files are deleted after the check finishes, fails, or is cancelled.";
  if (jobStatus === "cancelled") {
    progressPhase.textContent = "Check cancelled";
    progressBudget.textContent = "The checker stopped this run.";
    progressDetails.textContent = "Uploaded files were deleted after cancellation.";
    progressTrust.textContent = "The final progress window remains visible, but no story report was kept for this cancelled hosted check.";
    return;
  }
  if (cancelRequested || jobStatus === "cancelling") {
    progressPhase.textContent = "Cancelling check";
    progressBudget.textContent = "Asking the checker to stop this run.";
    progressDetails.textContent = "This may take a moment while the server closes the active job.";
    return;
  }
  if (jobStatus === "queued") {
    progressPhase.textContent = "Waiting for an available checker";
    progressBudget.textContent = "Your upload is queued; the check has not started yet.";
    progressDetails.textContent = "The page will keep reconnecting while this job remains available.";
    return;
  }
  // Only phase_start/phase_end events carry a `phase`; the frequent `progress`
  // events do not. Setting the heading from `phase` unconditionally would reset
  // it to the default ("Preparing check") on every progress tick — and on a
  // reconnect/poll the only snapshot is a phase-less progress event — so an
  // active exploration would look stuck. `progress` events are emitted only
  // during exploration, so treat one as the explore phase; otherwise keep the
  // heading as the last real phase.
  if (event?.phase) {
    progressPhase.textContent = phaseLabel(event.phase);
  } else if (event?.type === "progress") {
    progressPhase.textContent = phaseLabel("explore");
  }
  const states = Number(event?.statesExplored) || 0;
  const budget = Number(event?.stateBudget) || 0;
  if (event?.phase === "explore" || event?.phase === "min_repro" || event?.type === "progress") {
    const percent = budget ? Math.floor((states / budget) * 100) : 0;
    progressBudget.textContent = `${states.toLocaleString()} / ${budget.toLocaleString()} work states (${percent}% of state budget)`;
    const details = [`${Number(event?.endingsFound || 0).toLocaleString()} endings`, `${Number(event?.runtimeErrorsFound || 0).toLocaleString()} runtime errors`];
    if (event?.unvisitedKnots !== undefined) details.push(`${Number(event.unvisitedKnots).toLocaleString()} knots unvisited`);
    if (event?.meaningfulYield !== undefined) details.push(`${Number(event.meaningfulYield).toLocaleString()} discoveries so far`);
    details.push(`${elapsed(event?.elapsedMs)} elapsed`);
    progressDetails.textContent = details.join(" · ");
    if (event?.forecast) {
      const pace = event.forecast.status === "active"
        ? "New discoveries are still arriving."
        : event.forecast.status === "quiet"
          ? "Discoveries have slowed in this window."
          : "Inkcheck is still learning this story's discovery pace.";
      progressTrust.textContent = `${pace} Forecast uncertainty is ${event.forecast.uncertainty}; this is not a coverage estimate. Uploaded files are still deleted when the run ends.`;
    }
  } else {
    progressBudget.textContent = "Working through the current phase.";
    progressDetails.textContent = `${elapsed(event?.elapsedMs)} elapsed`;
  }
}

function stopJobUpdates() {
  progressStream?.close();
  progressStream = null;
  if (progressPoll) window.clearInterval(progressPoll);
  progressPoll = null;
}

function clearJob() {
  stopJobUpdates();
  activeJob = null;
  cancelRequested = false;
  sessionStorage.removeItem("inkcheck-active-job");
  runProgress.hidden = true;
}

function stopActiveJobUpdates() {
  stopJobUpdates();
  activeJob = null;
  cancelRequested = false;
  sessionStorage.removeItem("inkcheck-active-job");
}

async function fetchJob() {
  if (!activeJob) return null;
  const response = await fetch(jobUrl(activeJob.statusUrl), { credentials: "omit", cache: "no-store" });
  if (!response.ok) throw new Error("This check is no longer available. Start another check when you are ready.");
  return response.json();
}

async function finishJob(snapshot) {
  const job = snapshot.job;
  if (job.status === "complete") {
    lastResponse = job.result;
    renderReport(job.result);
    result.hidden = false;
    result.scrollIntoView({ behavior: "smooth", block: "start" });
    result.focus({ preventScroll: true });
    setStatus(`Check complete in ${(job.result.meta.durationMs / 1000).toFixed(1)} seconds. Uploaded files were deleted after the response.`);
  } else if (job.status === "cancelled") {
    renderProgress(job.progress, "cancelled");
    if (job.resultWindow) {
      progressBudget.textContent = `${job.resultWindow.work.statesExplored.toLocaleString()} work states completed before cancellation.`;
      progressDetails.textContent = `${job.resultWindow.yield.endings.toLocaleString()} endings · ${job.resultWindow.yield.runtimeErrors.toLocaleString()} runtime errors observed before stopping`;
    }
    setStatus("Check cancelled. The final progress window is shown and uploaded files were deleted.");
    stopActiveJobUpdates();
  } else {
    setStatus(job.error || "The checker could not finish this request. Uploaded files were deleted.");
  }
  if (job.status !== "cancelled") clearJob();
  submit.disabled = false;
  form.removeAttribute("aria-busy");
  setLoading(false);
}

async function refreshJob() {
  const snapshot = await fetchJob();
  if (!snapshot) return;
  const job = snapshot.job;
  if (activeJob) activeJob.status = job.status;
  renderProgress(job.progress, job.status);
  if (["complete", "cancelled", "failed"].includes(job.status)) await finishJob(snapshot);
}

function startJob(job) {
  activeJob = job;
  cancelRequested = false;
  sessionStorage.setItem("inkcheck-active-job", JSON.stringify(job));
  renderProgress(null, job.status);
  setStatus(job.status === "queued" ? "Check queued." : "Starting check…");
  progressStream = new EventSource(jobUrl(job.eventUrl));
  progressStream.addEventListener("progress", async (message) => {
    try {
      const event = JSON.parse(message.data);
      renderProgress(event, event.status);
      if (["complete", "cancelled", "failed"].includes(event.status)) await refreshJob();
    } catch {
      // The status poll below is the recovery path for a malformed or dropped event.
    }
  });
  progressStream.onerror = () => {
    setStatus("Connection interrupted. Reconnecting to your check…");
    refreshJob().catch(() => {});
  };
  progressPoll = window.setInterval(() => refreshJob().catch(() => {}), 5000);
  refreshJob().catch((error) => finishJob({ job: { status: "failed", error: error.message } }));
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
    data.append("runIntent", form.elements["run-intent"].value);
    // One checkbox affirms both facts; the API still expects both fields.
    data.append("authorized", String(consent.checked));
    data.append("privacyAcknowledged", String(consent.checked));

    const headers = { "X-Inkcheck-Async": "1" };
    const accessCode = document.querySelector("#access-code")?.value;
    if (accessCode) headers["X-Inkcheck-Access-Code"] = accessCode;
    setStatus("Uploading files and creating your check…");
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
    if (body.job && response.status === 202) {
      startJob(body.job);
      return;
    }
    if (body.report) {
      lastResponse = body;
      renderReport(body);
      result.hidden = false;
      result.scrollIntoView({ behavior: "smooth", block: "start" });
      result.focus({ preventScroll: true });
      setStatus(`Check complete in ${(body.meta.durationMs / 1000).toFixed(1)} seconds. Uploaded files were deleted after the response.`);
      return;
    }
    throw new Error("The checker did not create a trackable job. Please try again shortly.");
  } catch (error) {
    if (error instanceof TypeError) {
      setStatus("The checker service could not be reached. Please try again later.");
    } else {
      setStatus(error.message, error.issueUrl);
    }
  } finally {
    if (!activeJob) {
      submit.disabled = false;
      form.removeAttribute("aria-busy");
      setLoading(false);
    }
  }
});

cancelCheck.addEventListener("click", async () => {
  if (!activeJob) return;
  cancelRequested = true;
  cancelCheck.disabled = true;
  renderProgress(null, "cancelling");
  setStatus("Cancelling check. Uploaded files will still be deleted after the run stops.");
  try {
    const response = await fetch(jobUrl(activeJob.cancelUrl), { method: "POST", credentials: "omit", cache: "no-store" });
    if (!response.ok) throw new Error("Cancel request failed.");
    await refreshJob();
  } catch {
    cancelRequested = false;
    renderProgress(null, activeJob?.status);
    setStatus("Could not cancel this check. It may still be running; the page will keep reconnecting.");
  }
});

try {
  const saved = sessionStorage.getItem("inkcheck-active-job");
  if (saved) {
    const job = JSON.parse(saved);
    submit.disabled = true;
    form.setAttribute("aria-busy", "true");
    setLoading(true);
    startJob(job);
  }
} catch {
  sessionStorage.removeItem("inkcheck-active-job");
}

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
