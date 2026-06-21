// Second Landings — renders the "Things I'm selling" cards from items.json.
// You normally never need to touch this file; edit items.json instead.

const itemsEl = document.getElementById("items");
const propertyEl = document.getElementById("property"); // optional: for-sale property
const projectsEl = document.getElementById("projects"); // optional: remodel projects (not for sale)
let allItems = [];
let activeFilter = "all";

document.getElementById("year").textContent = new Date().getFullYear();

async function load() {
  try {
    const res = await fetch("items.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allItems = await res.json();
    render();
  } catch (err) {
    itemsEl.innerHTML =
      `<p class="empty">Couldn't load items.json (${err.message}).<br>` +
      `If you opened this file directly, run a local server instead — see README.md.</p>`;
  }
}

function render() {
  const matchesFilter = (i) =>
    activeFilter === "all" || (i.status || "available") === activeFilter;

  // Objects (no category tag) go in #items.
  const objects = allItems.filter(
    (i) => !["property", "project"].includes(i.category) && matchesFilter(i)
  );
  renderInto(itemsEl, objects);

  // For-sale property (category: "property") goes in #property.
  if (propertyEl) {
    renderInto(
      propertyEl,
      allItems.filter((i) => i.category === "property" && matchesFilter(i))
    );
  }

  // Remodel projects (category: "project") go in #projects — these aren't for
  // sale, so they ignore the available/acquired filter and always show.
  if (projectsEl) {
    renderInto(
      projectsEl,
      allItems.filter((i) => i.category === "project")
    );
  }
}

function renderInto(el, list) {
  if (!el) return;
  el.innerHTML = list.length
    ? list.map(card).join("")
    : `<p class="empty">Nothing here yet.</p>`;
}

function card(item) {
  const status = ["sold", "project"].includes(item.status) ? item.status : "available";
  const badgeLabel =
    status === "sold" ? "Acquired" : status === "project" ? "In Progress" : "Available";
  const media = item.image
    ? `<div class="card-media" style="background-image:url('${escapeAttr(item.image)}')"></div>`
    : `<div class="card-media">Photography forthcoming</div>`;
  const priceCls = status === "sold" ? "price is-sold" : "price";
  const cta =
    item.link && status === "available"
      ? `<a class="card-link" href="${escapeAttr(item.link)}" target="_blank" rel="noopener">Enquire</a>`
      : "";

  const wide = item.layout === "wide" ? " wide" : "";

  return `
    <article class="card${wide}">
      ${media}
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(item.title || "Untitled")}</h3>
        <p class="card-desc">${escapeHtml(item.description || "")}</p>
        <div class="card-foot">
          <span class="${priceCls}">${escapeHtml(item.price || "")}</span>
          <span class="badge ${status}">${badgeLabel}</span>
        </div>
        ${cta}
      </div>
    </article>`;
}

// Filter buttons
document.querySelectorAll(".filter").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    activeFilter = btn.dataset.filter;
    render();
  });
});

function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function escapeAttr(str = "") {
  return escapeHtml(str);
}

load();
