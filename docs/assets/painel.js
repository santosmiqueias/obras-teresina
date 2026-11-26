/* Lógica do painel principal (index.html). Depende de assets/comum.js. */
let DATA = [], view = [], tab = "alerta", sortK = "previsto", sortDir = -1, shown = 40, map, layer, tiles;

// ---------- filtros ----------
function applyFilters() {
  const q = $("f-busca").value.trim().toLowerCase();
  const sit = $("f-situacao").value, rep = $("f-repassador").value, todas = $("f-todas").checked;
  view = DATA.filter(o =>
    (todas || o.em_teresina) &&
    (!sit || o.situacao === sit) &&
    (!rep || (o.repassador || "").split("; ").some(r => normaliza(r) === rep)) &&
    (!q || [o.nome, o._nome, o.id_projeto, o.repassador, o.orgao_responsavel, o.executor].join(" ").toLowerCase().includes(q)));
  $("limpar").hidden = !(q || sit || rep || todas);
  $("count").textContent = `${int.format(view.length)} ${view.length === 1 ? "projeto" : "projetos"}`;
  shown = 40;
  render();
}

// ---------- resumo ----------
function renderTiles() {
  const prev = view.filter(o => o.previsto != null);
  const fin = view.filter(o => o.pago != null);
  const sum = (a, k) => a.reduce((s, o) => s + (o[k] || 0), 0);
  const pago = sum(fin, "pago"), emp = sum(fin, "empenhado");
  document.querySelectorAll(".skeleton").forEach(e => e.classList.remove("skeleton"));
  $("t-qtd").textContent = int.format(view.length);
  $("t-qtd-n").textContent = `${int.format(view.filter(o => o.situacao === "Em execução").length)} em execução · ${int.format(view.filter(o => o.situacao === "Concluída").length)} concluídos`;
  $("t-prev").textContent = brlC.format(sum(prev, "previsto"));
  $("t-prev-n").textContent = `soma de ${int.format(prev.length)} projetos com valor informado`;
  $("t-pago").textContent = brlC.format(pago);
  $("t-pago-m").style.width = emp ? `${Math.min(100, pago / emp * 100)}%` : "0";
  $("t-pago-n").textContent = fin.length
    ? `${pct(emp ? pago / emp * 100 : 0)} de ${brlC.format(emp)} empenhados · dado disponível para ${int.format(fin.length)} projetos`
    : "nenhum projeto com dados de pagamento";
  $("t-alerta").textContent = int.format(view.filter(o => o.alerta).length);
}

// ---------- destaques ----------
function renderFeatures() {
  const top = view.filter(o => o.alerta && o.previsto != null).sort((a, b) => b.previsto - a.previsto).slice(0, 3);
  $("destaques").hidden = !top.length;
  $("features").innerHTML = top.map(o => {
    const parada = o.situacao === "Paralisada" || o.situacao === "Inacabada";
    const m = parada ? mesesDesde(o.data_paralisacao_cancelamento || o.dt_final_prevista) : mesesDesde(o.dt_final_prevista);
    return `<article class="card feature" tabindex="0" data-id="${esc(o.id_projeto)}">
      <div>${pill(o)}</div>
      <p class="title">${esc(o._nome)}</p>
      <div class="org">${esc(orgaoCurto(o.repassador || o.orgao_responsavel))}</div>
      <div class="big tabular">${brlC.format(o.previsto)}</div>
      <div>
        <div class="row2"><span>Executado</span><span class="tabular">${pct(o.pct_fisico)}</span></div>
        <div class="meter"><i style="width:${Math.min(100, o.pct_fisico || 0)}%"></i></div>
        <div class="row2"><span>Pago</span><span class="tabular">${o.pago != null ? brlC.format(o.pago) : "sem dado"}</span></div>
      </div>
      <div class="foot">${parada ? `${esc(o.situacao)}` : `Prazo venceu em ${dataBR(o.dt_final_prevista)}`} <b>${tempo(m)}</b></div>
    </article>`;
  }).join("");
  $("features").querySelectorAll(".feature").forEach(el => {
    const go = () => { location.href = paginaObra(el.dataset.id); };
    el.addEventListener("click", go);
    el.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  });
}
function focusRow(id) {
  const o = DATA.find(x => x.id_projeto === id);
  tab = o && o.alerta ? "alerta" : "todas"; setTabs(); sortK = "previsto"; sortDir = -1; shown = 2000; renderTable();
  const tr = document.querySelector(`tr.row[data-id="${CSS.escape(id)}"]`);
  if (tr) { tr.click(); tr.scrollIntoView({ block: "center" }); tr.focus({ preventScroll: true }); }
}

function renderBars() {
  const by = SITUACOES.map(k => {
    const a = view.filter(o => o.situacao === k);
    const v = a.filter(o => o.previsto != null);
    return {
      k, n: a.length, nAl: a.filter(o => o.alerta).length,
      v: v.reduce((s, o) => s + o.previsto, 0), vAl: v.filter(o => o.alerta).reduce((s, o) => s + o.previsto, 0), nv: v.length
    };
  });
  stackedBars($("c-qtd"), by.map(r => ({ ...r, a: r.n - r.nAl, b: r.nAl })), v => int.format(v),
    r => `<span class="muted">${int.format(r.n)} projetos${r.nAl ? `<br>${int.format(r.nAl)} com alerta` : ""}</span>`);
  stackedBars($("c-valor"), by.map(r => ({ ...r, a: r.v - r.vAl, b: r.vAl })), v => brlC.format(v),
    r => `<span class="muted">${brl.format(r.v)}${r.vAl ? `<br>${brl.format(r.vAl)} com alerta` : ""}<br>${int.format(r.nv)} de ${int.format(r.n)} projetos com valor informado</span>`);
}

// ---------- pago x construído ----------
const GRUPOS_CMP = [
  { k: "pagou_mais", t: "Pagou mais do que construiu", d: "pagamento à frente da obra (mais de 10 pontos)" },
  { k: "equilibrado", t: "Pagamento acompanha a obra", d: "diferença de até 10 pontos" },
  { k: "construiu_mais", t: "Construiu mais do que pagou", d: "obra à frente do pagamento registrado" },
];
let cmpGrupo = null, cmpAll = false;
function grupoCmp(o) {
  const d = o.pct_pago - o.pct_fisico;
  return d > 10 ? "pagou_mais" : d < -10 ? "construiu_mais" : "equilibrado";
}
function renderComparison() {
  const base = view.filter(o => o.pct_pago != null && o.pct_fisico != null);
  const ok = base.filter(o => o.pct_pago <= 150), estranhos = base.length - ok.length;
  const cont = Object.fromEntries(GRUPOS_CMP.map(g => [g.k, ok.filter(o => grupoCmp(o) === g.k).length]));
  $("cmp-groups").innerHTML = GRUPOS_CMP.map(g => `<button type="button" class="group" data-g="${g.k}" aria-pressed="${cmpGrupo === g.k}">
      <span class="g-n tabular">${int.format(cont[g.k])}</span><span class="g-t">${g.t}</span><span class="g-d">${g.d}</span></button>`).join("");
  $("cmp-groups").querySelectorAll(".group").forEach(b => b.addEventListener("click", () => {
    cmpGrupo = cmpGrupo === b.dataset.g ? null : b.dataset.g; cmpAll = false; renderComparison();
  }));
  $("cmp-sub").textContent = ok.length
    ? `Das ${int.format(ok.length)} obras com dados de pagamento e execução, ${int.format(cont.pagou_mais)} pagaram proporcionalmente mais do que construíram. Cada obra mostra duas barras na mesma escala: quanto foi construído e quanto do valor previsto já foi pago.`
    : "Nenhuma obra com dados de pagamento e execução nesse filtro.";
  const rows = ok.filter(o => !cmpGrupo || grupoCmp(o) === cmpGrupo)
    .sort(cmpGrupo
      ? (a, b) => Math.abs(b.pct_pago - b.pct_fisico) - Math.abs(a.pct_pago - a.pct_fisico) || (b.previsto || 0) - (a.previsto || 0)
      : (a, b) => (b.previsto || 0) - (a.previsto || 0));
  const lim = cmpAll ? rows.length : 8;
  const bar = (lbl, v, cor) => `<div class="cmp-line"><span>${lbl}</span><div class="cmp-track"><i class="${v > 100 ? "over" : ""}" style="width:${Math.max(v > 0 ? 1.5 : 0, Math.min(100, v))}%;background:var(${cor})"></i></div><span class="cmp-val">${pct(v)}</span></div>`;
  $("cmp-list").innerHTML = rows.slice(0, lim).map(o => {
    const d = Math.round(o.pct_pago - o.pct_fisico);
    const frase = !o.pago ? "nenhum pagamento registrado nesta base"
      : Math.abs(d) <= 10 ? "pagamento e obra caminham juntos"
      : d > 0 ? `pago <b>${int.format(d)} pontos à frente</b> do construído` : `construído <b>${int.format(-d)} pontos à frente</b> do pago`;
    return `<div class="cmp-row" tabindex="0" data-id="${esc(o.id_projeto)}">
      <div class="cmp-head"><span class="cmp-name">${esc(o._nome)}</span>${o.alerta ? pill(o) : ""}</div>
      ${bar("Construído", o.pct_fisico, "--series-1")}
      ${bar("Pago", o.pct_pago, "--series-3")}
      <div class="cmp-foot">${brlC.format(o.pago)} pagos de ${brlC.format(o.previsto)} previstos · ${frase}</div>
    </div>`;
  }).join("") || '<p class="empty" style="grid-column:1/-1">Nenhuma obra neste grupo.</p>';
  $("cmp-list").querySelectorAll(".cmp-row").forEach(el => {
    const go = () => { location.href = paginaObra(el.dataset.id); };
    el.addEventListener("click", go);
    el.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  });
  $("cmp-foot").hidden = rows.length <= lim;
  $("cmp-more").textContent = `Mostrar todas (${int.format(rows.length)})`;
  $("cmp-note").textContent = (cmpGrupo ? "Ordenadas pela maior diferença entre pago e construído." : "Ordenadas pelo valor previsto. Clique em um dos grupos acima para filtrar.") + " \"Construiu mais do que pagou\" muitas vezes significa só que parte dos pagamentos não está registrada nesta base (por exemplo, repasses por convênio)." +
    (estranhos ? ` ${int.format(estranhos)} ${estranhos === 1 ? "obra ficou" : "obras ficaram"} de fora por terem pagamento acima de 150% do valor previsto, o que indica valor previsto desatualizado.` : "");
}

// ---------- mapa ----------
function popupObra(o) {
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lon}`;
  return `<div class="pop">
    ${pill(o)}
    <div class="t">${esc(o._nome)}</div>
    <div class="org">${esc(orgaoCurto(o.repassador || o.orgao_responsavel) || "")}</div>
    <div class="kv">
      <span>Valor previsto</span><span>${o.previsto != null ? brlC.format(o.previsto) : "não informado"}</span>
      <span>Construído</span><span>${pct(o.pct_fisico)}</span>
    </div>
    ${o.pct_fisico != null ? `<div class="meter"><i style="width:${Math.min(100, o.pct_fisico)}%"></i></div>` : ""}
    <div class="kv">
      <span>Pago</span><span>${o.pago != null ? brlC.format(o.pago) : "sem dado"}</span>
      <span>Prazo final</span><span>${dataBR(o.dt_final_prevista)}</span>
    </div>
    <div class="links"><a href="${gmaps}" target="_blank" rel="noopener">Abrir no Google Maps ↗</a><a href="${paginaObra(o.id_projeto)}">Ver página da obra</a></div>
  </div>`;
}
function renderMap() {
  if (!window.L) { $("map").innerHTML = '<p class="empty">Não foi possível carregar o mapa.</p>'; return; }
  if (!map) {
    map = L.map("map", { scrollWheelZoom: false, zoomControl: true }).setView([-5.09, -42.80], 12);
    map.on("click focus", () => map.scrollWheelZoom.enable());
    map.on("mouseout", () => map.scrollWheelZoom.disable());
    const Ctl = L.Control.extend({ onAdd() {
      const d = L.DomUtil.create("div", "map-ctl");
      d.innerHTML = '<button type="button" data-base="mapa" aria-pressed="true">Mapa</button><button type="button" data-base="satelite" aria-pressed="false">Satélite</button>';
      L.DomEvent.disableClickPropagation(d);
      d.querySelectorAll("[data-base]").forEach(b => b.addEventListener("click", () => trocarBase(b.dataset.base)));
      return d;
    } });
    new Ctl({ position: "topright" }).addTo(map);
    const Full = L.Control.extend({ onAdd() {
      const d = L.DomUtil.create("div", "map-ctl");
      d.innerHTML = '<button type="button" aria-pressed="false" title="Tela cheia">⛶ <span>Tela cheia</span></button>';
      L.DomEvent.disableClickPropagation(d);
      const b = d.querySelector("button");
      b.addEventListener("click", () => {
        const on = $("map").classList.toggle("full");
        b.setAttribute("aria-pressed", on); b.querySelector("span").textContent = on ? "Sair" : "Tela cheia";
        setTimeout(() => map.invalidateSize(), 50);
      });
      addEventListener("keydown", e => { if (e.key === "Escape" && $("map").classList.contains("full")) b.click(); });
      return d;
    } });
    new Full({ position: "topleft" }).addTo(map);
    trocarBase("mapa");
    cluster = L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 44, spiderfyOnMaxZoom: true,
      iconCreateFunction: c => {
        const ms = c.getAllChildMarkers(), n = ms.length, al = ms.filter(m => m.options.alerta).length;
        const sz = n < 10 ? 36 : n < 50 ? 44 : 52;
        return L.divIcon({ className: "cluster", iconSize: [sz, sz], html: `<div>${n}${al ? `<span class="al" title="${al} com alerta">${al}</span>` : ""}</div>` });
      }
    }).addTo(map);
    map.on("popupopen", e => {
      const a = e.popup.getElement().querySelector("[data-ver]");
      if (a) a.addEventListener("click", ev => { ev.preventDefault(); if ($("map").classList.contains("full")) document.querySelector(".map-ctl [title]").click(); focusRow(a.dataset.ver); });
    });
  }
  cluster.clearLayers();
  const pts = view.filter(o => o.lat != null);
  cluster.addLayers(pts.map(o => L.marker([o.lat, o.lon], { icon: pinIcon(o.alerta), alerta: o.alerta, title: o._nome, zIndexOffset: o.alerta ? 1000 : 0 })
    .bindPopup(popupObra(o), { maxWidth: 300 })));
  if (pts.length && !map._ajustado) { map.fitBounds(L.latLngBounds(pts.map(o => [o.lat, o.lon])).pad(0.05), { maxZoom: 14 }); map._ajustado = true; }
  $("map-sub").textContent = `${int.format(pts.length)} de ${int.format(view.length)} obras têm localização precisa. As demais usam um ponto genérico e ficam fora do mapa.`;
}

// ---------- tabela ----------
function setTabs() { document.querySelectorAll(".tabs button").forEach(x => x.setAttribute("aria-pressed", x.dataset.tab === tab)); }
function renderTable() {
  let rows = tab === "alerta" ? view.filter(o => o.alerta) : view;
  linhasObras = rows;
  const key = sortK === "nome" ? "_nome" : sortK;
  rows = [...rows].sort((a, b) => {
    const va = a[key], vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR")) * sortDir;
  });
  document.querySelectorAll("th[data-k]").forEach(th =>
    th.setAttribute("aria-sort", th.dataset.k === sortK ? (sortDir > 0 ? "ascending" : "descending") : "none"));
  $("tbody").innerHTML = rows.slice(0, shown).map((o, i) => `
    <tr class="row" data-i="${i}" data-id="${esc(o.id_projeto)}" tabindex="0" aria-expanded="false">
      <td class="nome"><div class="n">${esc(o._nome)}</div><div class="o">${esc(orgaoCurto(o.repassador || o.orgao_responsavel) || "Órgão não informado")}</div></td>
      <td data-label="Situação">${pill(o)}</td>
      <td class="num" data-label="Previsto">${o.previsto != null ? brlC.format(o.previsto) : '<span class="nodata">não informado</span>'}</td>
      <td class="num" data-label="Pago">${o.pago != null ? brlC.format(o.pago) : '<span class="nodata">sem dado</span>'}</td>
      <td data-label="Executado">${o.pct_fisico != null ? `<span class="bar-mini"><span class="meter"><i style="width:${Math.min(100, o.pct_fisico)}%"></i></span><span class="tabular">${pct(o.pct_fisico)}</span></span>` : '<span class="nodata">–</span>'}</td>
      <td data-label="Prazo final" class="tabular">${dataBR(o.dt_final_prevista)}</td>
    </tr>`).join("");
  $("empty").hidden = rows.length > 0;
  $("foot").hidden = rows.length <= shown;
  $("more").textContent = `Mostrar mais (${int.format(rows.length - shown)} restantes)`;
  $("tbody").querySelectorAll("tr.row").forEach(tr => {
    const toggle = () => {
      const next = tr.nextElementSibling;
      if (next && next.classList.contains("detail")) { next.remove(); tr.setAttribute("aria-expanded", "false"); return; }
      const o = rows[+tr.dataset.i];
      const d = [
        ["Nome no cadastro", o.nome], ["ID", o.id_projeto], ["Tipo", o.tipo],
        ["Repassador", o.repassador], ["Órgão responsável", o.orgao_responsavel], ["Executor", o.executor],
        ["Empenhado", o.empenhado != null ? brl.format(o.empenhado) : null],
        ["Pago", o.pago != null ? `${brl.format(o.pago)} (${pct(o.pct_pago)} do previsto)` : null],
        ["Convênio", (o.convenios || []).map(c => `nº ${c.numero}: ${brl.format(c.repassado || 0)} repassados de ${brl.format(c.acordado || 0)}`).join(" · ") || null],
        ["Paralisada/cancelada em", o.data_paralisacao_cancelamento ? dataBR(o.data_paralisacao_cancelamento) : null],
        ["Justificativa", o.justificativa],
        ["Atenção", o.outro_municipio ? `o nome cita outro local (${o.outro_municipio})` : (!o.em_teresina ? "projeto de abrangência estadual ou nacional" : null)],
      ].filter(([, v]) => v);
      tr.insertAdjacentHTML("afterend", `<tr class="detail"><td colspan="6"><dl>${d.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl><p class="det-link"><a href="${paginaObra(o.id_projeto)}">Abrir página da obra →</a></p></td></tr>`);
      tr.setAttribute("aria-expanded", "true");
    };
    tr.addEventListener("click", toggle);
    tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  });
}

// ---------- convênios ----------
let CONV = [], cvView = [], recebedor = "Prefeitura de Teresina", ctab = "andamento", cSortK = "valor_acordado", cSortDir = -1, cShown = 25;
const GRUPOS = ["Em andamento", "Prestação de contas", "Concluído"];
function renderConvenios() {
  if (!CONV.length) return;
  const q = $("f-busca").value.trim().toLowerCase();
  cvView = CONV.filter(c => c.grupo_situacao !== "Cancelado ou anulado" && (recebedor === "Todos" || c.recebedor === recebedor) &&
    (!q || [c.objeto, c._objeto, c.numero, c.concedente, c.convenente].join(" ").toLowerCase().includes(q)));
  const sum = (a, k) => a.reduce((s, c) => s + (c[k] || 0), 0);
  const ac = sum(cvView, "valor_acordado"), rp = sum(cvView, "valor_repassado");
  const and = cvView.filter(c => c.grupo_situacao === "Em andamento");
  const acA = sum(and, "valor_acordado"), rpA = sum(and, "valor_repassado");
  $("cv-acordado").textContent = brlC.format(ac);
  $("cv-acordado-n").textContent = `${int.format(cvView.length)} convênios`;
  $("cv-repassado").textContent = brlC.format(rp);
  $("cv-repassado-m").style.width = ac ? `${Math.min(100, rp / ac * 100)}%` : "0";
  $("cv-repassado-n").textContent = `${pct(ac ? rp / ac * 100 : 0)} do valor acordado`;
  $("cv-andamento").textContent = int.format(and.length);
  $("cv-andamento-n").textContent = and.length ? `${brlC.format(acA)} acordados · só ${pct(acA ? rpA / acA * 100 : 0)} repassado` : "nenhum";
  const sem = and.filter(c => c.sem_repasse);
  $("cv-sem").textContent = int.format(sem.length);
  $("cv-sem-n").textContent = sem.length ? `convênios em andamento somando ${brlC.format(sum(sem, "valor_acordado"))}` : "todos já receberam algum repasse";

  const track = "var(--track)";
  const sit = GRUPOS.map(k => { const a = cvView.filter(c => c.grupo_situacao === k); const A = sum(a, "valor_acordado"), P = sum(a, "valor_repassado"); return { k, n: a.length, A, P, a: Math.min(P, A), b: Math.max(0, A - P) }; });
  const tipCv = r => `<span class="muted">${int.format(r.n)} convênios<br>Acordado: ${brl.format(r.A)}<br>Repassado: ${brl.format(r.P)} (${pct(r.A ? r.P / r.A * 100 : 0)})</span>`;
  stackedBars($("c-cv-sit"), sit, v => brlC.format(v), tipCv, { colors: ["var(--series-1)", track], labelW: 132 });
  const porMin = {};
  cvView.forEach(c => { const k = ministerioCurto(c.orgao_superior); (porMin[k] ||= { k, n: 0, A: 0, P: 0 }); porMin[k].n++; porMin[k].A += c.valor_acordado || 0; porMin[k].P += c.valor_repassado || 0; });
  const mins = Object.values(porMin).sort((a, b) => b.A - a.A).slice(0, 8).map(r => ({ ...r, a: Math.min(r.P, r.A), b: Math.max(0, r.A - r.P) }));
  stackedBars($("c-cv-min"), mins, v => brlC.format(v), tipCv, { colors: ["var(--series-1)", track], labelW: 150, maxChars: 22 });
  renderRepassesAno();
  renderConvTable();
}
function renderConvTable() {
  let rows = ctab === "andamento" ? cvView.filter(c => c.grupo_situacao === "Em andamento") : cvView;
  linhasConv = rows;
  const key = cSortK === "objeto" ? "_objeto" : cSortK;
  rows = [...rows].sort((a, b) => {
    const va = a[key], vb = b[key];
    if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
    return (typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR")) * cSortDir;
  });
  document.querySelectorAll("th[data-ck]").forEach(th => th.setAttribute("aria-sort", th.dataset.ck === cSortK ? (cSortDir > 0 ? "ascending" : "descending") : "none"));
  $("cv-tbody").innerHTML = rows.slice(0, cShown).map((c, i) => `
    <tr class="row" data-i="${i}" tabindex="0" aria-expanded="false">
      <td class="nome"><div class="n">${esc(c._objeto)}</div><div class="o">${esc(ministerioCurto(c.orgao_superior))} · ${esc(c.recebedor === "Prefeitura de Teresina" ? "Prefeitura" : titleCase(c.convenente || ""))}</div></td>
      <td data-label="Situação">${convPill(c)}</td>
      <td class="num" data-label="Acordado">${brlC.format(c.valor_acordado || 0)}</td>
      <td data-label="Repassado"><span class="bar-mini"><span class="meter"><i style="width:${Math.min(100, c.pct_repassado || 0)}%"></i></span><span class="tabular">${pct(c.pct_repassado)}</span></span></td>
      <td data-label="Último repasse" class="tabular">${c.ultimo_repasse ? `${dataBR(c.ultimo_repasse)}` : '<span class="nodata">nenhum</span>'}</td>
      <td data-label="Fim da vigência" class="tabular">${dataBR(c.fim_vigencia)}</td>
    </tr>`).join("");
  $("cv-empty").hidden = rows.length > 0;
  $("cv-foot").hidden = rows.length <= cShown;
  $("cv-more").textContent = `Mostrar mais (${int.format(rows.length - cShown)} restantes)`;
  $("cv-tbody").querySelectorAll("tr.row").forEach(tr => {
    const toggle = () => {
      const next = tr.nextElementSibling;
      if (next && next.classList.contains("detail")) { next.remove(); tr.setAttribute("aria-expanded", "false"); return; }
      const c = rows[+tr.dataset.i];
      const obras = (c.obras_relacionadas || []).map(id => DATA.find(o => o.id_projeto === id)).filter(Boolean);
      const d = [
        ["Objeto completo", c.objeto], ["Nº do convênio", `${c.numero}${c.numero_original ? ` (original: ${c.numero_original})` : ""}`],
        ["Instrumento", c.instrumento !== "Não se aplica" ? c.instrumento : null], ["Situação no Portal", c.situacao],
        ["Concedente", c.concedente], ["Convenente", c.convenente],
        ["Acordado", brl.format(c.valor_acordado || 0)], ["Repassado", `${brl.format(c.valor_repassado || 0)} (${pct(c.pct_repassado)})`],
        ["Contrapartida", c.contrapartida ? brl.format(c.contrapartida) : null],
        ["Último repasse", c.ultimo_repasse ? `${dataBR(c.ultimo_repasse)} · ${brl.format(c.valor_ultimo_repasse || 0)} · ${tempo(mesesDesde(c.ultimo_repasse))}` : "nenhum"],
        ["Vigência", `${dataBR(c.inicio_vigencia)} a ${dataBR(c.fim_vigencia)}`],
        ["Obra no Obrasgov", obras.map(o => `${o._nome} (${o.situacao}, ${pct(o.pct_fisico)} executada)`).join(" · ") || null],
      ].filter(([, v]) => v);
      const ultimos = (c.repasses || []).slice(-5).reverse().map(([dt, v]) => `${dataBR(dt)}: ${brlC.format(v)}`).join(" · ");
      if (ultimos) d.push(["Últimos repasses", ultimos]);
      const links = obras.map(o => `<a href="${paginaObra(o.id_projeto)}">Abrir página da obra: ${esc(o._nome)} →</a>`).join("<br>");
      tr.insertAdjacentHTML("afterend", `<tr class="detail"><td colspan="6"><dl>${d.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>${links ? `<p class="det-link">${links}</p>` : ""}</td></tr>`);
      tr.setAttribute("aria-expanded", "true");
    };
    tr.addEventListener("click", toggle);
    tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  });
}
function setupConvenios(cv) {
  CONV = cv.convenios.map(c => ({ ...c, _objeto: sentenceCase(c.objeto || "Objeto não informado") }));
  if (!CONV.length) return;
  $("convenios").hidden = false;
  const opts = ["Prefeitura de Teresina", "Entidades sem fins lucrativos", "Outros órgãos públicos", "Todos"];
  $("c-recebedor").innerHTML = opts.map(o => `<button type="button" aria-pressed="${o === recebedor}" data-r="${esc(o)}">${o === "Prefeitura de Teresina" ? "Prefeitura" : o === "Entidades sem fins lucrativos" ? "Entidades" : o === "Outros órgãos públicos" ? "Outros órgãos" : "Todos"}</button>`).join("");
  $("c-recebedor").querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    recebedor = b.dataset.r; cShown = 25;
    $("c-recebedor").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    renderConvenios();
  }));
  document.querySelectorAll("[data-ctab]").forEach(b => b.addEventListener("click", () => {
    ctab = b.dataset.ctab; cShown = 25;
    document.querySelectorAll("[data-ctab]").forEach(x => x.setAttribute("aria-pressed", x === b));
    renderConvTable();
  }));
  document.querySelectorAll("th[data-ck]").forEach(th => th.addEventListener("click", () => {
    if (cSortK === th.dataset.ck) cSortDir *= -1; else { cSortK = th.dataset.ck; cSortDir = ["valor_acordado", "pct_repassado", "ultimo_repasse", "fim_vigencia"].includes(cSortK) ? -1 : 1; }
    renderConvTable();
  }));
  $("cv-more").addEventListener("click", () => { cShown += 25; renderConvTable(); });
  $("cv-fonte").innerHTML = `Fonte: <a href="https://portaldatransparencia.gov.br/download-de-dados/convenios">Portal da Transparência</a>, arquivo de ${dataBR((cv.arquivo_portal || "").replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"))}. Convênios com vigência a partir de 2015, sem os do Governo do Estado.`;
  const pref = CONV.filter(c => c.recebedor === "Prefeitura de Teresina" && c.grupo_situacao === "Em andamento");
  const A = pref.reduce((s, c) => s + (c.valor_acordado || 0), 0), P = pref.reduce((s, c) => s + (c.valor_repassado || 0), 0);
  if (A) $("lede").insertAdjacentHTML("beforeend", ` Nos convênios em andamento com a Prefeitura, a União acordou <b>${brlC.format(A)}</b>, mas repassou só <b>${pct(P / A * 100)}</b> até agora.`);
}

// ---------- o que mudou ----------
const TIPOS_MUDANCA = {
  situacao: m => `Situação: ${m.de} → ${m.para}`,
  execucao: m => `Execução física: ${pct(m.de)} → ${pct(m.para)}`,
  pagamento: m => `Novos pagamentos: +${brlC.format(m.para - (m.de || 0))}`,
  nova: m => `Nova obra no cadastro (${m.para})`,
  prazo_vencido: () => "Prazo final venceu",
  prazo_regularizado: () => "Prazo atualizado: não está mais vencido",
};
function setupNovidades(hist) {
  // repasses mais recentes (ordens bancárias)
  const reps = CONV.filter(c => c.grupo_situacao !== "Cancelado ou anulado")
    .flatMap(c => (c.repasses || []).map(([d, v]) => ({ d, v, c }))).sort((a, b) => b.d.localeCompare(a.d));
  const limite = new Date(); limite.setDate(limite.getDate() - 90);
  const recentes = reps.filter(r => new Date(r.d) >= limite);
  $("nv-rep-sub").textContent = recentes.length
    ? `Nos últimos 90 dias, a União fez ${int.format(recentes.length)} ${recentes.length === 1 ? "repasse" : "repasses"} em convênios com quem está em Teresina, somando ${brlC.format(recentes.reduce((s, r) => s + r.v, 0))}.`
    : "Nenhum repasse nos últimos 90 dias. Abaixo, os mais recentes registrados.";
  $("nv-repasses").innerHTML = reps.slice(0, 6).map(({ d, v, c }) => {
    const obra = (c.obras_relacionadas || [])[0];
    return `<li><time>${dataBR(d)}</time><div><b class="tabular">${brlC.format(v)}</b> · ${esc(c.recebedor === "Prefeitura de Teresina" ? "Prefeitura" : titleCase(c.convenente || ""))}
      <span>${esc(c._objeto)}${obra ? ` · <a href="${paginaObra(obra)}">ver obra</a>` : ""}</span></div></li>`;
  }).join("") || '<li class="nodata">Sem repasses registrados.</li>';

  // mudanças nas obras entre as duas últimas fotos semanais
  const porId = Object.fromEntries(DATA.map(o => [o.id_projeto, o]));
  const muds = (hist.mudancas || []).filter(m => porId[m.id] && porId[m.id].em_teresina);
  const inicio = (hist.datas || [])[0];
  if (!hist.comparado_com) {
    $("nv-mud-sub").textContent = inicio
      ? `O acompanhamento semanal começou em ${dataBR(inicio)}. Na próxima atualização automática (toda segunda-feira), as mudanças nas obras aparecem aqui.`
      : "O acompanhamento semanal ainda não começou.";
    $("nv-mudancas").innerHTML = '<li class="nv-vazio">Por enquanto, só existe uma foto dos dados. Na próxima, dá para comparar situação, execução física e pagamentos de cada obra.</li>';
    return;
  }
  $("nv-mud-sub").textContent = muds.length
    ? `${int.format(muds.length)} ${muds.length === 1 ? "mudança" : "mudanças"} entre ${dataBR(hist.comparado_com)} e ${dataBR(hist.datas[hist.datas.length - 1])}.`
    : `Nenhuma mudança nas obras de Teresina entre ${dataBR(hist.comparado_com)} e ${dataBR(hist.datas[hist.datas.length - 1])}.`;
  const prioridade = { situacao: 0, prazo_vencido: 1, pagamento: 2, execucao: 3, nova: 4, prazo_regularizado: 5 };
  $("nv-mudancas").innerHTML = muds.sort((a, b) => prioridade[a.tipo] - prioridade[b.tipo]).slice(0, 8).map(m => {
    const o = porId[m.id], ruim = m.tipo === "prazo_vencido" || (m.tipo === "situacao" && ["Paralisada", "Inacabada", "Cancelada"].includes(m.para));
    return `<li class="${ruim ? "ruim" : ""}"><div><a href="${paginaObra(m.id)}"><b>${esc(o._nome)}</b></a><span>${esc(TIPOS_MUDANCA[m.tipo](m))}</span></div></li>`;
  }).join("") || '<li class="nv-vazio">Nada mudou nas obras desde a última atualização.</li>';
}

function renderRepassesAno() {
  const el = $("c-cv-ano"); if (!el) return;
  const porAno = {};
  cvView.forEach(c => (c.repasses || []).forEach(([d, v]) => { const a = +d.slice(0, 4); porAno[a] = (porAno[a] || 0) + v; }));
  const anoAtual = new Date().getFullYear();
  const anos = []; for (let a = Math.max(2010, Math.min(anoAtual, ...Object.keys(porAno).map(Number))); a <= anoAtual; a++) anos.push(a);
  const W = Math.max(280, el.clientWidth), H = 220, m = { l: 8, r: 8, t: 22, b: 26 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const max = Math.max(1, ...anos.map(a => porAno[a] || 0)), bw = pw / anos.length, col = Math.min(24, bw * 0.6);
  const iMax = anos.reduce((bi, a, i) => (porAno[a] || 0) > (porAno[anos[bi]] || 0) ? i : bi, 0);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Valor repassado por ano">`;
  s += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${m.t + ph}" y2="${m.t + ph}"/>`;
  anos.forEach((a, i) => {
    const v = porAno[a] || 0, h = v / max * ph, x = m.l + i * bw + (bw - col) / 2, y = m.t + ph - h, r = Math.min(4, h);
    if (h > 0) s += `<path fill="var(--series-1)" d="M${x},${m.t + ph} V${y + r} a${r},${r} 0 0 1 ${r},-${r} h${col - 2 * r} a${r},${r} 0 0 1 ${r},${r} V${m.t + ph} Z"/>`;
    if (i === iMax || i === anos.length - 1) s += `<text class="val" x="${x + col / 2}" y="${y - 6}" text-anchor="middle">${v ? brlC.format(v) : "–"}</text>`;
    if (anos.length <= 12 || i % 2 === 0 || i === anos.length - 1) s += `<text x="${x + col / 2}" y="${H - 8}" text-anchor="middle">${a === anoAtual ? `${a}*` : a}</text>`;
    s += `<rect data-a="${a}" x="${m.l + i * bw}" y="${m.t}" width="${bw}" height="${ph}" fill="transparent"/>`;
  });
  el.innerHTML = s + "</svg>";
  el.querySelectorAll("rect[data-a]").forEach(h => {
    const a = +h.dataset.a;
    h.addEventListener("mousemove", e => showTip(e, `<b>${a}${a === anoAtual ? " (até agora)" : ""}</b><span class="muted">${brl.format(porAno[a] || 0)} repassados</span>`));
    h.addEventListener("mouseleave", hideTip);
  });
}

function baixarCSV(nome, colunas, linhas) {
  const cel = v => { if (v == null) return ""; const t = typeof v === "number" ? String(v).replace(".", ",") : String(v); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const csv = "\ufeff" + [colunas.map(c => c[0]).join(";"), ...linhas.map(l => colunas.map(c => cel(c[1](l))).join(";"))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const COLS_OBRAS = [["id_projeto", o => o.id_projeto], ["obra", o => o._nome], ["nome_no_cadastro", o => o.nome], ["situacao", o => o.situacao],
  ["com_alerta", o => o.alerta ? "sim" : "não"], ["valor_previsto", o => o.previsto], ["valor_pago", o => o.pago], ["pct_construido", o => o.pct_fisico],
  ["prazo_final", o => o.dt_final_prevista], ["repassador", o => o.repassador], ["orgao_responsavel", o => o.orgao_responsavel],
  ["latitude", o => o.lat], ["longitude", o => o.lon], ["pagina", o => new URL(paginaObra(o.id_projeto), location.href).href]];
const COLS_CONV = [["numero", c => c.numero], ["objeto", c => c.objeto], ["situacao", c => c.situacao], ["recebedor", c => c.recebedor], ["convenente", c => c.convenente],
  ["ministerio", c => c.orgao_superior], ["concedente", c => c.concedente], ["valor_acordado", c => c.valor_acordado], ["valor_repassado", c => c.valor_repassado],
  ["pct_repassado", c => c.pct_repassado], ["ultimo_repasse", c => c.ultimo_repasse], ["inicio_vigencia", c => c.inicio_vigencia], ["fim_vigencia", c => c.fim_vigencia]];
let linhasObras = [], linhasConv = [];

function render() { renderTiles(); renderFeatures(); renderBars(); renderComparison(); renderMap(); renderTable(); renderConvenios(); }

// ---------- início ----------
Promise.all([
  fetch("data.json").then(r => r.json()),
  fetch("convenios.json").then(r => r.ok ? r.json() : { convenios: [] }).catch(() => ({ convenios: [] })),
  fetch("historico.json").then(r => r.ok ? r.json() : {}).catch(() => ({})),
]).then(([d, cv, hist]) => {
  DATA = d.obras.map(o => ({ ...o, _nome: nomeObra(o) }));
  const base = DATA.filter(o => o.em_teresina), al = base.filter(o => o.alerta);
  const valAl = al.reduce((s, o) => s + (o.previsto || 0), 0);
  $("headline").innerHTML = `<em>${int.format(al.length)} obras federais</em> em Teresina estão paradas ou com o prazo vencido`;
  $("lede").innerHTML = `Juntas, somam <b>${brlC.format(valAl)}</b> em investimento previsto. Este painel mostra a situação de <b>${int.format(base.length)} obras</b> com recursos federais na capital do Piauí: quanto já foi pago, quanto foi construído e onde estão.`;
  const atual = `Base do Obrasgov.br atualizada em ${dataBR(d.data_atualizacao_base)}`;
  $("meta").innerHTML = `<span>${atual}</span><a href="#metodologia">Como ler estes dados</a><a href="https://api-publica.obrasgov.gestao.gov.br/obras/docs">Fonte: API Obrasgov.br</a>`;
  $("foot-meta").textContent = atual;
  SITUACOES.forEach(s => $("f-situacao").insertAdjacentHTML("beforeend", `<option>${s}</option>`));
  // o cadastro traz o mesmo órgão com e sem acento: agrupa pela forma normalizada
  const reps = {};
  DATA.flatMap(o => (o.repassador || "").split("; ").filter(Boolean)).forEach(r => {
    const k = normaliza(r), acentos = (r.match(/[^\x00-\x7f]/g) || []).length;
    if (!reps[k] || acentos > reps[k].acentos) reps[k] = { nome: r, acentos };
  });
  Object.entries(reps).map(([k, v]) => [k, orgaoCurto(v.nome)]).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
    .forEach(([k, nome]) => $("f-repassador").insertAdjacentHTML("beforeend", `<option value="${esc(k)}">${esc(nome)}</option>`));
  ["f-situacao", "f-repassador", "f-todas"].forEach(id => $(id).addEventListener("change", applyFilters));
  let t; $("f-busca").addEventListener("input", () => { clearTimeout(t); t = setTimeout(applyFilters, 200); });
  $("limpar").addEventListener("click", () => { $("f-busca").value = ""; $("f-situacao").value = ""; $("f-repassador").value = ""; $("f-todas").checked = false; applyFilters(); });
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => { tab = b.dataset.tab; shown = 40; setTabs(); renderTable(); }));
  document.querySelectorAll("th[data-k]").forEach(th => th.addEventListener("click", () => {
    if (sortK === th.dataset.k) sortDir *= -1; else { sortK = th.dataset.k; sortDir = ["previsto", "pago", "pct_fisico"].includes(sortK) ? -1 : 1; }
    renderTable();
  }));
  $("more").addEventListener("click", () => { shown += 40; renderTable(); });
  $("cmp-more").addEventListener("click", () => { cmpAll = true; renderComparison(); });
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { renderBars(); renderConvenios(); if (map) map.invalidateSize(); }, 150); });
    applyFilters();
  setupConvenios(cv);
  renderConvenios();
  setupNovidades(hist);
  $("csv-obras").addEventListener("click", () => baixarCSV(`obras-teresina-${tab}.csv`, COLS_OBRAS, linhasObras));
  $("csv-conv").addEventListener("click", () => baixarCSV(`convenios-teresina-${ctab}.csv`, COLS_CONV, linhasConv));
}).catch(err => { $("lede").textContent = "Erro ao carregar os dados: " + err.message; });
