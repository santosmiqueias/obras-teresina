/* Funções compartilhadas entre o painel (index.html) e a página de cada obra (obra.html). */
const SITUACOES = ["Em execução", "Paralisada", "Inacabada", "Cadastrada", "Concluída", "Cancelada"];
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlC = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const int = new Intl.NumberFormat("pt-BR");
const pct = v => v == null ? "–" : `${int.format(Math.round(v))}%`;
const dataBR = s => s ? s.slice(0, 10).split("-").reverse().join("/") : "–";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const $ = id => document.getElementById(id);
const HOJE = new Date();

// ---------- nomes legíveis ----------
const SIGLAS = new Set(["PAC", "BR", "PI", "DNIT", "PRF", "UFPI", "IFPI", "SUS", "CEAD", "UBS", "CRAS", "CREAS", "CMEI", "ETA", "ETE", "UOP", "DEL", "TED", "CR", "CT", "CTO", "II", "III", "IV", "VI", "SESC", "SENAI", "INSS", "UPA", "CAPS"]);
const PROPRIOS = { poti: "Poti", avenida: "Avenida", teresina: "Teresina", piauí: "Piauí", piaui: "Piauí", parnaiba: "Parnaíba", parnaíba: "Parnaíba", poty: "Poty", petronio: "Petrônio", portela: "Portela", brasil: "Brasil", "são": "São", "josé": "José" };
const ORGAOS = {
  "DEPARTAMENTO NACIONAL DE INFRAESTRUTURA DE TRANSPORTES": "DNIT",
  "COMPANHIA DE DESENVOLVIMENTO DOS VALES DO SÃO FRANCISCO E DO PARNAÍBA": "Codevasf",
  "FUNDO NACIONAL DE SAUDE": "Fundo Nacional de Saúde",
  "INST.FED.DE EDUC.,CIENC.E TEC.DO PIAUI": "IFPI",
  "FUNDACAO UNIVERSIDADE FEDERAL DO PIAUI": "UFPI",
};
// acentos que costumam faltar em cadastros digitados em caixa alta
const ACENTOS = { saude: "saúde", publica: "pública", publicas: "públicas", publico: "público", agua: "água", rodoviaria: "rodoviária",
  hidrica: "hídrica", basica: "básica", basicos: "básicos", tecnica: "técnica", area: "área", areas: "áreas", modulo: "módulo", predio: "prédio",
  sanitario: "sanitário", esgotamento: "esgotamento", unidade: "unidade", turistica: "turística", esportiva: "esportiva", aereo: "aéreo" };
function acentua(w) {
  if (ACENTOS[w]) return ACENTOS[w];
  return w.replace(/coes$/, "ções").replace(/cao$/, "ção");
}
const PEQUENAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "para", "no", "na"]);
// corrige acentos também em textos já em caixa mista ("Execucao" -> "Execução")
function corrigeAcentos(s) {
  return s.replace(/[A-Za-z]+/g, w => {
    if (w === w.toUpperCase() && w.length > 1) return w;
    const low = w.toLowerCase(), a = acentua(low);
    if (a === low) return w;
    return w[0] === w[0].toUpperCase() ? a[0].toUpperCase() + a.slice(1) : a;
  });
}
function sentenceCase(s) {
  if (/[a-zà-ú]/.test(s)) return corrigeAcentos(s);
  return s.toLowerCase().split(/(\s+|[-/(),.:])/).map(w => {
    const up = w.toUpperCase();
    if (SIGLAS.has(up) || /\d/.test(w)) return up;
    if (PROPRIOS[w]) return PROPRIOS[w];
    return acentua(w);
  }).join("").replace(/^\s*\S/, c => c.toUpperCase());
}
function titleCase(s) {
  return s.toLowerCase().split(/(\s+|[-/(),.])/).map((w, i) => {
    const up = w.toUpperCase();
    if (SIGLAS.has(up)) return up;
    if (i > 0 && PEQUENAS.has(w)) return w;
    const a = PROPRIOS[w] || acentua(w);
    return a.charAt(0).toUpperCase() + a.slice(1);
  }).join("");
}
function orgaoCurto(o) {
  const s = (o || "").trim();
  if (!s) return "";
  return ORGAOS[s.toUpperCase()] || (/[a-zà-ú]/.test(s) && s !== s.toUpperCase() && !/^[A-ZÀ-Ú][a-zà-ú]+( [a-zà-ú]+)+$/.test(s) ? s : titleCase(s));
}
function nomeObra(o) {
  const n = (o.nome || "").replace(/^\d+(\.\d+)*\.?\s+/, "").trim();
  const letras = (n.match(/[A-Za-zÀ-ú]{3,}/g) || []).length;
  if (letras < 2) return `${o.tipo || o.natureza || "Obra"} · contrato ${o.nome}`;
  return sentenceCase(n);
}
function mesesDesde(s) { if (!s) return null; const d = new Date(s); return Math.max(0, Math.round((HOJE - d) / (1000 * 60 * 60 * 24 * 30.44))); }
function tempo(m) { if (m == null) return ""; if (m < 1) return "há menos de 1 mês"; if (m < 24) return `há ${m} ${m === 1 ? "mês" : "meses"}`; return `há ${Math.floor(m / 12)} anos`; }

// ---------- tema ----------
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
function isDark() { const t = document.documentElement.dataset.theme; return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; }
const saved = store.get("tema"); if (saved) document.documentElement.dataset.theme = saved;
$("theme").addEventListener("click", () => {
  const t = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = t; store.set("tema", t);
  
});

// ---------- tooltip ----------
const tip = $("tip");
function showTip(e, html) {
  tip.innerHTML = html; tip.style.display = "block";
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
  tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
}
const hideTip = () => { tip.style.display = "none"; };

// ---------- barras empilhadas ----------
function roundedPath(x, y, w, h, rightRound) {
  const r = rightRound ? Math.min(4, w) : 0;
  return `M${x},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${w - r} z`;
}
function stackedBars(el, rows, fmt, tipFmt, opts = {}) {
  const colors = opts.colors || ["var(--series-1)", "var(--series-2)"];
  const W = Math.max(280, el.clientWidth), labelW = opts.labelW || 92, valW = 90, rowH = 36, bar = 18;
  const H = rows.length * rowH;
  const max = Math.max(1, ...rows.map(r => r.a + r.b));
  const pw = W - labelW - valW;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Gráfico de barras por situação">`;
  s += `<line class="axis" x1="${labelW}" x2="${labelW}" y1="0" y2="${H}"/>`;
  rows.forEach((r, i) => {
    const y = i * rowH + (rowH - bar) / 2, tot = r.a + r.b;
    let wa = r.a / max * pw, wb = r.b / max * pw;
    if (r.a > 0) wa = Math.max(3, wa);
    if (r.b > 0) wb = Math.max(3, wb);
    const gap = r.a > 0 && r.b > 0 ? 2 : 0;
    const lbl = r.k.length > (opts.maxChars || 99) ? r.k.slice(0, opts.maxChars - 1) + "…" : r.k;
    s += `<text x="${labelW - 8}" y="${y + bar / 2 + 4}" text-anchor="end">${esc(lbl)}</text>`;
    if (r.a > 0) s += `<path fill="${colors[0]}" d="${roundedPath(labelW, y, wa, bar, r.b === 0)}"/>`;
    if (r.b > 0) s += `<path fill="${colors[1]}" d="${roundedPath(labelW + wa + gap, y, wb, bar, true)}"/>`;
    s += `<text class="val" x="${labelW + wa + gap + wb + 6}" y="${y + bar / 2 + 4}">${tot ? fmt(tot) : "–"}</text>`;
    s += `<rect data-i="${i}" x="0" y="${i * rowH}" width="${W}" height="${rowH}" fill="transparent"/>`;
  });
  el.innerHTML = s + "</svg>";
  el.querySelectorAll("rect[data-i]").forEach(h => {
    const r = rows[+h.dataset.i];
    h.addEventListener("mousemove", e => showTip(e, `<b>${esc(r.k)}</b>${tipFmt(r)}`));
    h.addEventListener("mouseleave", hideTip);
  });
}

let base = "mapa", camadas = {}, cluster;
const CAMADAS = {
  mapa: () => [L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, attribution: "Mapa &copy; Esri, HERE, Garmin, OpenStreetMap e colaboradores"
  })],
  satelite: () => [
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, attribution: "Imagens &copy; Esri, Maxar, Earthstar Geographics"
    }),
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 }),
  ],
};
function trocarBase(nome) {
  base = nome;
  Object.values(camadas).flat().forEach(l => map.removeLayer(l));
  camadas[nome] ||= CAMADAS[nome]();
  camadas[nome].forEach(l => l.addTo(map).bringToBack());
  document.querySelectorAll(".map-ctl [data-base]").forEach(b => b.setAttribute("aria-pressed", b.dataset.base === nome));
}
function pinIcon(alerta) {
  const cor = alerta ? "#f47230" : "#1b64be";
  return L.divIcon({
    className: "pin", iconSize: [28, 38], iconAnchor: [14, 37], popupAnchor: [0, -32],
    html: `<svg width="28" height="38" viewBox="0 0 28 38" aria-hidden="true"><path d="M14 1C6.8 1 1 6.7 1 13.8 1 23.4 14 37 14 37s13-13.6 13-23.2C27 6.7 21.2 1 14 1Z" fill="${cor}" stroke="#fff" stroke-width="2"/><circle cx="14" cy="13.5" r="5" fill="#fff"/>${alerta ? '<path d="M14 10.5v3.6M14 16.2v.1" stroke="#f47230" stroke-width="2" stroke-linecap="round"/>' : ""}</svg>`
  });
}

function pill(o) {
  if (o.situacao === "Paralisada" || o.situacao === "Inacabada") return `<span class="pill bad">⛔ ${esc(o.situacao)}</span>`;
  if (o.prazo_vencido) return `<span class="pill warn">⚠ Prazo vencido</span>`;
  return `<span class="pill">${esc(o.situacao)}</span>`;
}

function ministerioCurto(s) {
  return (s || "Não informado").replace(/ - Unidades com vínculo direto$/, "").replace(/^Ministério d[aoe]s? /, "").replace(/^\w/, c => c.toUpperCase());
}
function convPill(c) {
  if (/REJEITADA|^INADIMPLENTE/.test(c.situacao)) return `<span class="pill bad">⛔ ${esc(sentenceCase(c.situacao))}</span>`;
  if (c.sem_repasse) return `<span class="pill warn">⚠ Sem repasse</span>`;
  if (c.vencido_incompleto) return `<span class="pill warn">⚠ Vigência vencida</span>`;
  return `<span class="pill">${esc(c.grupo_situacao)}</span>`;
}

function paginaObra(id) { return `obra.html?id=${encodeURIComponent(id)}`; }
function normaliza(s) { return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim(); }
