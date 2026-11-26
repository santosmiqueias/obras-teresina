/* Página de uma obra (obra.html?id=...). Depende de assets/comum.js. */
let map;

const SITUACAO_PARADA = new Set(["Paralisada", "Inacabada"]);

function tile(label, value, note, extra = "", cls = "") {
  return `<div class="card tile ${cls}"><div class="label">${label}</div><div class="value tabular">${value}</div>${extra}<div class="note">${note}</div></div>`;
}

function barraCmp(lbl, v, cor) {
  if (v == null) return `<div class="cmp-line"><span>${lbl}</span><div class="cmp-track"></div><span class="cmp-val nodata" title="sem dado">–</span></div>`;
  return `<div class="cmp-line"><span>${lbl}</span><div class="cmp-track"><i style="width:${Math.max(v > 0 ? 1.5 : 0, Math.min(100, v))}%;background:var(${cor})"></i></div><span class="cmp-val">${pct(v)}</span></div>`;
}

/** Gráfico em degraus do valor acumulado repassado ao longo do tempo. */
function graficoRepasses(el, repasses, acordado) {
  if (!repasses.length) { el.innerHTML = '<p class="nodata">Nenhum repasse registrado até agora.</p>'; return; }
  const pts = []; let acc = 0;
  repasses.forEach(([d, v]) => { acc += v; pts.push([new Date(d), acc]); });
  const W = Math.max(280, el.clientWidth), H = 200, m = { l: 64, r: 16, t: 14, b: 28 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const t0 = pts[0][0].getTime(), t1 = Math.max(Date.now(), pts[pts.length - 1][0].getTime() + 864e5);
  const ymax = Math.max(acordado || 0, acc) * 1.05 || 1;
  const x = t => m.l + (t - t0) / (t1 - t0) * pw, y = v => m.t + ph - v / ymax * ph;
  let d = `M${x(t0)},${y(0)}`;
  pts.forEach(([t, v]) => { d += ` H${x(t.getTime())} V${y(v)}`; });
  d += ` H${x(t1)}`;
  const area = d + ` V${y(0)} Z`;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Valor repassado acumulado ao longo do tempo">`;
  [0, 0.5, 1].forEach(f => { const v = ymax / 1.05 * f; s += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${brlC.format(v)}</text>`; });
  if (acordado) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(acordado)}" y2="${y(acordado)}" stroke="var(--text-tertiary)" stroke-width="1"/><text x="${W - m.r}" y="${y(acordado) - 6}" text-anchor="end">acordado: ${brlC.format(acordado)}</text>`;
  const a0 = new Date(t0).getFullYear(), a1 = new Date(t1).getFullYear(), passo = Math.max(1, Math.ceil((a1 - a0 + 1) / 6));
  for (let a = a0; a <= a1; a += passo) { const t = new Date(a, 0, 1).getTime(); if (t >= t0) s += `<text x="${x(t)}" y="${H - 8}" text-anchor="middle">${a}</text>`; }
  s += `<path d="${area}" fill="var(--series-1)" opacity=".1"/><path d="${d}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round"/>`;
  pts.forEach(([t, v], i) => { s += `<circle cx="${x(t.getTime())}" cy="${y(v)}" r="4" fill="var(--series-1)" stroke="var(--surface-1)" stroke-width="2"/><circle data-i="${i}" cx="${x(t.getTime())}" cy="${y(v)}" r="10" fill="transparent"/>`; });
  el.innerHTML = s + "</svg>";
  el.querySelectorAll("circle[data-i]").forEach(h => {
    const i = +h.dataset.i, [dt, v] = repasses[i];
    h.addEventListener("mousemove", e => showTip(e, `<b>${dataBR(dt)}</b><span class="muted">Repasse: ${brl.format(v)}<br>Acumulado: ${brl.format(pts[i][1])}</span>`));
    h.addEventListener("mouseleave", hideTip);
  });
}

function eventosLinhaDoTempo(o, convs, serie, inicioMonitoramento) {
  const ev = [];
  if (o.dt_inicial_prevista) ev.push({ d: o.dt_inicial_prevista, t: "Início previsto", tipo: "plano" });
  if (o.dt_final_prevista) ev.push({ d: o.dt_final_prevista, t: o.prazo_vencido ? "Prazo final (vencido)" : "Prazo final previsto", tipo: o.prazo_vencido ? "alerta" : "plano" });
  if (o.data_paralisacao_cancelamento) ev.push({ d: o.data_paralisacao_cancelamento, t: o.situacao === "Cancelada" ? "Cancelada" : "Paralisada", desc: o.justificativa && o.justificativa !== o.situacao ? o.justificativa : "", tipo: "alerta" });
  convs.forEach(c => {
    if (c.inicio_vigencia) ev.push({ d: c.inicio_vigencia, t: `Convênio nº ${c.numero} assinado`, desc: `${brl.format(c.valor_acordado || 0)} acordados`, tipo: "dinheiro" });
    (c.repasses || []).forEach(([d, v]) => ev.push({ d, t: `Repasse de ${brlC.format(v)}`, desc: `convênio nº ${c.numero}`, tipo: "dinheiro" }));
  });
  (serie || []).slice(1).forEach((p, i) => {
    const ant = serie[i];
    if (p[1] !== ant[1]) ev.push({ d: p[0], t: `Situação: ${ant[1]} → ${p[1]}`, tipo: SITUACAO_PARADA.has(p[1]) ? "alerta" : "mudanca" });
    if (p[2] != null && p[2] !== ant[2]) ev.push({ d: p[0], t: `Execução física: ${pct(ant[2])} → ${pct(p[2])}`, tipo: "mudanca" });
    if ((p[3] || 0) > (ant[3] || 0)) ev.push({ d: p[0], t: `Pagamentos: ${brlC.format(ant[3] || 0)} → ${brlC.format(p[3])}`, tipo: "dinheiro" });
  });
  if (inicioMonitoramento) ev.push({ d: inicioMonitoramento, t: "Início do acompanhamento semanal", desc: "a partir daqui, mudanças são registradas toda semana", tipo: "plano" });
  ev.push({ d: new Date().toISOString().slice(0, 10), t: "Hoje", desc: `${o.situacao}${o.pct_fisico != null ? ` · ${pct(o.pct_fisico)} construído` : ""}`, tipo: "hoje" });
  return ev.sort((a, b) => a.d.localeCompare(b.d));
}

function renderObra(o, convs, hist) {
  document.title = `${o._nome} · Obras Federais em Teresina`;
  $("o-nome").textContent = o._nome;
  const parada = SITUACAO_PARADA.has(o.situacao);
  $("o-pills").innerHTML = pill(o) + (o.prazo_vencido || parada ? ` <span class="pill">${esc(o.situacao)}</span>` : "") +
    (!o.em_teresina ? ' <span class="pill warn">⚠ Pode não ficar em Teresina</span>' : "");
  $("o-org").textContent = [orgaoCurto(o.repassador || o.orgao_responsavel), o.tipo].filter(Boolean).join(" · ");

  // resumo
  const mPrazo = mesesDesde(o.dt_final_prevista);
  $("o-tiles").innerHTML = [
    tile("Valor previsto", o.previsto != null ? brlC.format(o.previsto) : "–", o.previsto != null ? brl.format(o.previsto) : "não informado (ou valor simbólico)"),
    tile("Pago", o.pago != null ? brlC.format(o.pago) : "–", o.pago != null ? `${pct(o.pct_pago)} do previsto · ${brlC.format(o.empenhado || 0)} empenhados` : "sem dado de pagamento nesta base",
      o.pct_pago != null ? `<div class="meter" aria-hidden="true"><i style="width:${Math.min(100, o.pct_pago)}%;background:var(--series-3)"></i></div>` : ""),
    tile("Construído", pct(o.pct_fisico), o.pct_fisico != null ? "execução física declarada pelo gestor" : "sem dado de execução",
      o.pct_fisico != null ? `<div class="meter" aria-hidden="true"><i style="width:${Math.min(100, o.pct_fisico)}%"></i></div>` : ""),
    tile("Prazo final", dataBR(o.dt_final_prevista), o.prazo_vencido ? `venceu ${tempo(mPrazo)}` : parada ? `obra ${o.situacao.toLowerCase()}` : "data prevista no cadastro", "", o.prazo_vencido || parada ? "alert" : ""),
  ].join("");

  // pago x construído
  if (o.pct_pago != null || o.pct_fisico != null) {
    const d = o.pct_pago != null && o.pct_fisico != null ? Math.round(o.pct_pago - o.pct_fisico) : null;
    $("o-cmp-sub").innerHTML = d == null ? "Falta um dos dois dados para comparar."
      : !o.pago ? "Nenhum pagamento registrado nesta base. Isso pode significar só que os pagamentos não estão registrados aqui (por exemplo, repasses por convênio)."
      : Math.abs(d) <= 10 ? "O pagamento acompanha o avanço da obra."
      : d > 0 ? `Foi pago proporcionalmente <b>${int.format(d)} pontos a mais</b> do que foi construído.`
      : `Foi construído proporcionalmente <b>${int.format(-d)} pontos a mais</b> do que foi pago.`;
    $("o-cmp-bars").innerHTML = barraCmp("Construído", o.pct_fisico, "--series-1") + barraCmp("Pago", o.pct_pago, "--series-3") +
      '<div class="legend" style="margin-top:10px"><span><i class="sw" style="background:var(--series-1)"></i>Construído (execução física)</span><span><i class="sw" style="background:var(--series-3)"></i>Pago (% do valor previsto)</span></div>';
  } else $("o-cmp").hidden = true;

  // linha do tempo
  const serie = hist.series?.[o.id_projeto];
  const inicio = hist.datas?.[0];
  const ev = eventosLinhaDoTempo(o, convs, serie, inicio);
  $("o-tempo-sub").textContent = inicio
    ? `Datas do cadastro, repasses e mudanças registradas pelo acompanhamento semanal (desde ${dataBR(inicio)}).`
    : "Datas do cadastro e repasses.";
  $("o-timeline").innerHTML = ev.map(e => `<li class="ev ev-${e.tipo}"><time>${dataBR(e.d)}</time><div><b>${esc(e.t)}</b>${e.desc ? `<span>${esc(e.desc)}</span>` : ""}</div></li>`).join("");

  // convênios
  if (convs.length) {
    $("o-conv").hidden = false;
    $("o-conv-body").innerHTML = convs.map((c, i) => `
      <div class="conv-item">
        <p class="conv-obj">${esc(sentenceCase(c.objeto || ""))}</p>
        <div class="kv conv-kv">
          <span>Convênio</span><span>nº ${esc(c.numero)} · ${esc(sentenceCase(c.situacao || ""))}</span>
          <span>Acordado</span><span>${brl.format(c.valor_acordado || 0)}</span>
          <span>Repassado</span><span>${brl.format(c.valor_repassado || 0)} (${pct(c.pct_repassado)})</span>
          <span>Vigência</span><span>${dataBR(c.inicio_vigencia)} a ${dataBR(c.fim_vigencia)}</span>
        </div>
        <div class="chart" id="o-conv-chart-${i}"></div>
      </div>`).join("");
    convs.forEach((c, i) => graficoRepasses($(`o-conv-chart-${i}`), c.repasses || [], c.valor_acordado));
  }

  // mapa
  const gmaps = o.lat != null ? `https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lon}` : null;
  if (o.lat != null && window.L) {
    $("o-map").hidden = false;
    $("o-map-sub").textContent = "Ponto informado no cadastro da obra.";
    map = L.map("o-map", { scrollWheelZoom: false }).setView([o.lat, o.lon], 16);
    map.on("click focus", () => map.scrollWheelZoom.enable());
    const Ctl = L.Control.extend({ onAdd() {
      const d = L.DomUtil.create("div", "map-ctl");
      d.innerHTML = '<button type="button" data-base="mapa" aria-pressed="true">Mapa</button><button type="button" data-base="satelite" aria-pressed="false">Satélite</button>';
      L.DomEvent.disableClickPropagation(d);
      d.querySelectorAll("[data-base]").forEach(b => b.addEventListener("click", () => trocarBase(b.dataset.base)));
      return d;
    } });
    new Ctl({ position: "topright" }).addTo(map);
    trocarBase("mapa");
    L.marker([o.lat, o.lon], { icon: pinIcon(o.alerta), title: o._nome }).addTo(map);
    $("o-gmaps").innerHTML = `<a href="${gmaps}" target="_blank" rel="noopener">Abrir no Google Maps ↗</a> · ver rotas e Street View`;
  } else {
    $("o-map-sub").textContent = "Esta obra não tem localização precisa no cadastro: o ponto informado é genérico (centro da cidade) ou fica fora de Teresina, então ela não aparece no mapa.";
  }

  // dados do cadastro
  const dados = [
    ["Nome no cadastro", o.nome], ["ID no Obrasgov", o.id_projeto], ["Situação", o.situacao], ["Natureza", o.natureza], ["Tipo", o.tipo],
    ["Repassador", o.repassador], ["Órgão responsável", o.orgao_responsavel], ["Executor", o.executor],
    ["Valor previsto", o.previsto != null ? brl.format(o.previsto) : "não informado"],
    ["Empenhado", o.empenhado != null ? brl.format(o.empenhado) : null], ["Pago", o.pago != null ? brl.format(o.pago) : null],
    ["Prazo final previsto", dataBR(o.dt_final_prevista)],
    ["Paralisada/cancelada em", o.data_paralisacao_cancelamento ? dataBR(o.data_paralisacao_cancelamento) : null],
    ["Justificativa", o.justificativa],
    ["Atenção", o.outro_municipio ? `o nome cita outro local (${o.outro_municipio}); a obra pode não ficar em Teresina` : (!o.em_teresina ? "projeto de abrangência estadual ou nacional" : null)],
  ].filter(([, v]) => v);
  $("o-dados").innerHTML = dados.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
}

function compartilhar() {
  const url = location.href, titulo = document.title;
  if (navigator.share) { navigator.share({ title: titulo, url }).catch(() => {}); return; }
  const ok = () => { $("compartilhar-lbl").textContent = "Link copiado!"; setTimeout(() => { $("compartilhar-lbl").textContent = "Compartilhar"; }, 2000); };
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(ok, () => prompt("Copie o link:", url));
  else prompt("Copie o link:", url);
}

const id = new URLSearchParams(location.search).get("id");
$("compartilhar").addEventListener("click", compartilhar);
Promise.all([
  fetch("data.json").then(r => r.json()),
  fetch("convenios.json").then(r => r.ok ? r.json() : { convenios: [] }).catch(() => ({ convenios: [] })),
  fetch("historico.json").then(r => r.ok ? r.json() : {}).catch(() => ({})),
]).then(([d, cv, hist]) => {
  $("foot-meta").textContent = `Base do Obrasgov.br atualizada em ${dataBR(d.data_atualizacao_base)}`;
  const o = d.obras.find(x => x.id_projeto === id);
  if (!o) {
    $("o-nome").textContent = "Obra não encontrada";
    $("o-org").innerHTML = id ? `Não há obra com o ID <b>${esc(id)}</b> nesta base. Ela pode ter sido removida do cadastro.` : "Nenhuma obra foi indicada no endereço.";
    $("conteudo").innerHTML = '<p class="empty"><a href="./">Voltar ao painel</a></p>';
    return;
  }
  o._nome = nomeObra(o);
  const convs = cv.convenios.filter(c => (c.obras_relacionadas || []).includes(o.id_projeto));
  renderObra(o, convs, hist);
}).catch(err => { $("o-nome").textContent = "Erro ao carregar os dados"; $("o-org").textContent = err.message; });
