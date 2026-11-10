// Small DOM helpers. All text goes in as text (never HTML) unless a template is built from known strings,
// so alert text and anything else from outside is shown as plain data.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = String(v);  // through the CSSOM: a style="" attribute would be blocked by the strict CSP
    else if (k === "html") el.innerHTML = v;              // only for trusted templates built here
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const money = (v, d = 0) => (v === null || v === undefined || Number.isNaN(+v)) ? "—" : (v < 0 ? "−£" : "£") + Math.abs(+v).toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d });
export const num = (v, d = 1) => (v === null || v === undefined || Number.isNaN(+v)) ? "—" : (+v).toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const pct = (v, d = 1) => (v === null || v === undefined || Number.isNaN(+v)) ? "—" : (+v).toFixed(d) + "%";
export const signed = (v, d = 2) => (v === null || v === undefined || Number.isNaN(+v)) ? "—" : (v > 0 ? "+" : "") + (+v).toFixed(d);

export function stat(k, v, s = "", cls = "") {
  return h("div", { class: "stat" }, h("div", { class: "k" }, k), h("div", { class: `v ${cls}` }, v), s ? h("div", { class: "s" }, s) : null);
}

export function table(columns, rows, { numeric = [] } = {}) {
  const wrap = h("div", { class: "table-wrap" });
  const t = h("table");
  t.append(h("thead", {}, h("tr", {}, ...columns.map((c) => h("th", { class: numeric.includes(c) ? "num" : "" }, c)))));
  const body = h("tbody");
  for (const r of rows) body.append(h("tr", {}, ...columns.map((c) => h("td", { class: numeric.includes(c) ? "num" : "" }, r[c] ?? "—"))));
  t.append(body);
  wrap.append(t);
  return wrap;
}

export function badge(text, kind = "") {
  return h("span", { class: `badge ${kind}` }, text);
}

export function card(title, ...children) {
  return h("div", { class: "card" }, title ? h("h2", {}, title) : null, ...children);
}

export function field(label, input, hint = "") {
  return h("label", { class: "field" }, h("span", {}, h("span", {}, label), hint ? h("span", { class: "dim" }, hint) : null), input);
}

export function select(options, value, attrs = {}) {
  const s = h("select", attrs);
  for (const o of options) {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    const opt = h("option", { value: v }, l);
    if (String(v) === String(value)) opt.selected = true;
    s.append(opt);
  }
  return s;
}

export function input(type, value, attrs = {}) {
  const i = h("input", { type, ...attrs });
  if (value !== undefined && value !== null) i.value = value;
  return i;
}

export function chips(options, selected, { multi = true, onChange } = {}) {
  const wrap = h("div", { class: "checks" });
  const state = new Set(selected);
  for (const o of options) {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    const c = h("label", { class: `chip ${state.has(v) ? "on" : ""}` }, h("input", { type: multi ? "checkbox" : "radio", name: multi ? undefined : "chipgroup" + Math.random(), checked: state.has(v) || null }), l);
    c.querySelector("input").addEventListener("change", (e) => {
      if (!multi) { state.clear(); wrap.querySelectorAll(".chip").forEach((x) => x.classList.remove("on")); }
      if (e.target.checked) state.add(v); else state.delete(v);
      c.classList.toggle("on", e.target.checked);
      if (onChange) onChange([...state]);
    });
    wrap.append(c);
  }
  wrap.value = () => [...state];
  return wrap;
}

let modalEl, modalBody;
export function openModal(content) {
  modalEl = modalEl || document.getElementById("modal");
  modalBody = modalBody || document.getElementById("modal-body");
  modalBody.replaceChildren(content);
  modalEl.hidden = false;
}
export function closeModal() {
  if (modalEl) modalEl.hidden = true;
}

export function notice(text, kind = "") {
  const el = document.getElementById("global-notice");
  if (!text) { el.hidden = true; return; }
  el.textContent = text;
  el.className = `notice ${kind}`;
  el.hidden = false;
}

export function download(name, text, type = "text/csv") {
  const blob = text instanceof Blob ? text : new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}

export function mdLite(text) {
  // minimal, safe markdown: paragraphs, headings, bullets, bold. Text is escaped first.
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = esc(text || "").split("\n");
  let html = "", inList = false;
  for (const ln of lines) {
    const bold = ln.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
    if (/^#{1,3} /.test(ln)) { if (inList) { html += "</ul>"; inList = false; } html += `<h4>${bold.replace(/^#+ /, "")}</h4>`; }
    else if (/^[-*] /.test(ln)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${bold.replace(/^[-*] /, "")}</li>`; }
    else if (ln.trim() === "") { if (inList) { html += "</ul>"; inList = false; } }
    else html += `<p>${bold}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}
