(function attachProgressPresentation(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InkcheckProgressPresentation = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
  function isMeasuredEvent(event) {
    const hasWorkWindow = Number.isFinite(Number(event?.statesExplored)) && Number(event?.stateBudget) > 0;
    return Boolean(event) && hasWorkWindow && (event.type === "progress" || (
      event.type !== "phase_start" &&
      (event.phase === "explore" || event.phase === "min_repro")
    ));
  }

  function createProgressPresentation() {
    let latestMeasurement = null;

    return {
      observe(event) {
        if (isMeasuredEvent(event)) latestMeasurement = event;
        return latestMeasurement;
      },
      reset() {
        latestMeasurement = null;
      }
    };
  }

  return { createProgressPresentation };
}));
