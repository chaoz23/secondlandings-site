// Second Landings — renders the "Things I'm selling" cards from items.json.
// You normally never need to touch this file; edit items.json instead.

const itemsEl = document.getElementById("items");
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
  const list =
    activeFilter === "all"
      ? allItems
      : allItems.filter((i) => (i.status || "available") === activeFilter);

  if (!list.length) {
    itemsEl.innerHTML = `<p class="empty">Nothing here yet.</p>`;
    return;
  }

  itemsEl.innerHTML = list.map(card).join("");
}

function card(item) {
  const status = item.status === "sold" ? "sold" : "available";
  const media = item.image
    ? `<div class="card-media" style="background-image:url('${escapeAttr(item.image)}')"></div>`
    : `<div class="card-media">Photography forthcoming</div>`;
  const priceCls = status === "sold" ? "price is-sold" : "price";
  const cta =
    item.link && status !== "sold"
      ? `<a class="card-link" href="${escapeAttr(item.link)}" target="_blank" rel="noopener">Enquire</a>`
      : "";

  return `
    <article class="card">
      ${media}
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(item.title || "Untitled")}</h3>
        <p class="card-desc">${escapeHtml(item.description || "")}</p>
        <div class="card-foot">
          <span class="${priceCls}">${escapeHtml(item.price || "")}</span>
          <span class="badge ${status}">${status === "sold" ? "Acquired" : "Available"}</span>
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
