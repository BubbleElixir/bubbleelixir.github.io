// ---- Config ----
const DATAPIPE_EXPERIMENT_ID = "ZteOOhPgsNcI"; // <-- set this
const REQUIRED_COUNT = 50;

// ---- Helpers ----
function qs(sel){return document.querySelector(sel)}
function qsa(sel){return Array.from(document.querySelectorAll(sel))}
function requireId(){
  const id = localStorage.getItem('participant_id');
  if(!id){ window.location.href = 'id.html'; return null; }
  return id;
}

async function loadExamples(){
  const res = await fetch('assets/examples.json', {cache:'no-store'});
  const data = await res.json();
  return data.examples;
}

function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, function(m){
    switch (m) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return m;
    }
  });
}

// UTF-8 -> base64
function toBase64UTF8(str){
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i=0;i<bytes.length;i++){ bin += String.fromCharCode(bytes[i]); }
  return btoa(bin);
}

// Renderers
function renderClassSelect(conclusion){
  const cid = conclusion.id;
  const opts = (conclusion.classes && conclusion.classes.length)
    ? conclusion.classes
    : ["Strongly Supported","Weakly Supported","Not Supported","Contradicted"]; // fallback if classes missing

  return `<label>Choose one:
    <select name="cls-${cid}" required>
      <option value="">-- select --</option>
      ${opts.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("")}
    </select>
  </label>`;
}

function renderLikert(name){
  const labels = [1,2,3,4,5,6,7];
  return `<div class="card">
    <h3>How good is this extraction overall?</h3>
    <div class="scale">
      ${labels.map(v => `<label><input type="radio" name="${name}" value="${v}"><span>${v}</span></label>`).join("")}
    </div>
    <small class="mono">1 = very poor, 7 = excellent</small>
  </div>`;
}
function renderExtraction(ex){
  const reasoning = ex.reasoning || ex.extraction; // backward-compat

  if (!reasoning) {
    return `
      <div class="card no-select">
        <h3>Source Text</h3>
        <pre>${escapeHtml(ex.text || "")}</pre>
      </div>
      <div class="card no-select">
        <p><em>No reasoning structure found for this example.</em></p>
      </div>`;
  }

  const explicitClaims = reasoning.claims || [];
  const implicitClaims = reasoning.claims_extra || [];
  const inferences = reasoning.inferences || [];
  const conclusions = reasoning.conclusions || [];

  const allClaims = [...explicitClaims, ...implicitClaims];

  // id -> node
  const nodeMap = {};
  allClaims.forEach(c => { nodeMap[c.id] = c; });
  conclusions.forEach(c => { nodeMap[c.id] = c; });

  // target -> [inferences]
  const infByTo = {};
  for (const inf of inferences) {
    if (!infByTo[inf.to]) infByTo[inf.to] = [];
    infByTo[inf.to].push(inf);
  }

  function nodeType(id){
    if (id.startsWith("c")) return "conclusion";
    if (id.startsWith("ic")) return "implicit";
    return "premise";
  }

  function nodeText(id){
    const n = nodeMap[id] || {};
    if (n.quote && n.quote.trim() !== "") return n.quote;
    if (n.canonical) return n.canonical;
    return id;
  }

  function nodeLabel(id){
    const t = nodeType(id);
    if (t === "premise") return `Premise ${id}`;
    if (t === "implicit") return `IC ${id}`;
    return `Conclusion ${id}`;
  }

  function nodeClass(id){
    const t = nodeType(id);
    if (t === "premise") return "hl-premise";
    if (t === "implicit") return "hl-implicit";
    return "hl-conclusion";
  }

  // Build chains as ordered lists of inferences ending at targetId
  function buildChains(targetId, visited) {
    if (!visited) visited = new Set();
    if (visited.has(targetId)) return [];
    visited.add(targetId);

    const infs = infByTo[targetId] || [];
    const chains = [];

    for (const inf of infs) {
      const implicitPremises = inf.from.filter(
        pid => nodeType(pid) === "implicit" && infByTo[pid]
      );

      if (implicitPremises.length === 0) {
        // no implicit sub-steps: this inference alone is a chain
        chains.push([inf]);
      } else {
        for (const pid of implicitPremises) {
          const subChains = buildChains(pid, new Set(visited));
          if (subChains.length === 0) {
            chains.push([inf]);
          } else {
            for (const sc of subChains) {
              chains.push([...sc, inf]);
            }
          }
        }
      }
    }

    const seen = new Set();
    const unique = [];
    for (const ch of chains) {
      const key = ch.map(x => x.to + "|" + x.from.join(",")).join("=>");
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(ch);
      }
    }
    return unique;
  }

  // Render one inference as a vertical Premises ↓ Warrant ↓ Target block
  function renderInferenceBlock(inf){
    const premisesHtml = inf.from.map(pid => (
      `<span class="${nodeClass(pid)}">${escapeHtml(nodeText(pid))}</span>`
    )).join("");

    const warrant = inf.warrant && inf.warrant.text ? inf.warrant.text : "";
    const toId = inf.to;
    const toLabel = nodeLabel(toId);
    const toCls = nodeClass(toId);
    const toText = nodeText(toId);

    return `
      <div class="inf-block">
        <div class="inf-label">Premises</div>
        <div class="inf-premises">
          ${premisesHtml}
        </div>
        ${warrant ? `
          <div class="inf-arrow">↓</div>
          <div class="inf-label">Warrant</div>
          <div class="inf-warrant"><span class="hl-warrant">${escapeHtml(warrant)}</span></div>
        ` : ""}
        <div class="inf-arrow">↓</div>
        <div class="inf-label">${escapeHtml(toLabel)}</div>
        <div class="inf-target">
          <span class="${toCls}">${escapeHtml(toText)}</span>
        </div>
      </div>
    `;
  }

  // One card per conclusion, with "Chain N" as the only chain label
  const conclusionBlocks = conclusions.map(c => {
    const cid = c.id;
    const cText = nodeText(cid);
    const chains = buildChains(cid);

    const chainsHtml = chains.length === 0
      ? "<p><em>No explicit premises linked to this conclusion.</em></p>"
      : chains.map((chain, chainIdx) => {
          const blocks = chain.map((inf, idx) => {
            const block = renderInferenceBlock(inf);
            const connector = idx < chain.length - 1
              ? `<div class="chain-between">⇓ next step</div>`
              : "";
            return block + connector;
          }).join("");

          return `
            <div class="card no-select chain-card" style="margin-top:8px;">
              <h4>Chain ${chainIdx + 1}</h4>
              ${blocks}
            </div>
          `;
        }).join("");

    return `
      <div class="card no-select">
        <h3>Conclusion ${cid}</h3>
        <p><span class="hl-conclusion">${escapeHtml(cText)}</span></p>
        ${chainsHtml}
        <div class="conclusion-rating">
          <h4>Which class best fits this conclusion?</h4>
          ${renderClassSelect(c)}
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="card no-select">
      <h3>Source Text</h3>
      <pre>${escapeHtml(ex.text || "")}</pre>
    </div>
    <div class="no-select">
      <h2>Reasoning chains by conclusion</h2>
      ${conclusionBlocks}
    </div>
  `;
}



// DataPipe save
async function saveToOSF_DataPipe(participantId, example, payload){
  if (!window.jsPsychPipe || typeof jsPsychPipe.saveBase64Data !== "function"){
    throw new Error("DataPipe (jsPsych Pipe) not available on page.");
  }
  const filename = `${participantId}/${Date.now()}_${example.id}.json`;
  const content = JSON.stringify(payload);
  const b64 = toBase64UTF8(content);
  // static method; returns a Promise
  await jsPsychPipe.saveBase64Data(DATAPIPE_EXPERIMENT_ID, filename, b64);
}

// ---- App ----
async function run(){
  const pid = requireId(); if(!pid) return;
  qs('#pid').textContent = pid;

  let examples = await loadExamples();
  if(examples.length < REQUIRED_COUNT){
    console.warn('Fewer than REQUIRED_COUNT examples present.');
  }
  examples = examples.slice(0, Math.min(REQUIRED_COUNT, examples.length));
  examples = shuffle(examples);

  let idx = parseInt(localStorage.getItem('idx') || '0', 10);
  let done = JSON.parse(localStorage.getItem('done') || '[]');

  function updateProgress(){
    const p = Math.round((idx / examples.length) * 100);
    qs('.progress > div').style.width = `${p}%`;
    qs('#progText').textContent = `${idx} / ${examples.length}`;
  }

  async function show(){
      updateProgress();
      if(idx >= examples.length){
        window.location.href = 'thanks.html';
        return;
      }
      const ex = examples[idx];
      qs('#exid').textContent = ex.id;
      qs('#content').innerHTML = renderExtraction(ex) + renderLikert('likert');
      qs('#comment').value = '';
    
      // Anti-copy in reasoning area
      const contentEl = qs('#content');
      if (contentEl && !contentEl.dataset.anticopyBound) {
        contentEl.addEventListener('copy', e => e.preventDefault());
        contentEl.addEventListener('cut', e => e.preventDefault());
        contentEl.addEventListener('contextmenu', e => e.preventDefault());
        contentEl.dataset.anticopyBound = 'true';
      }
    }

  qs('#next').addEventListener('click', async () => {
    const ex = examples[idx];
    const likert = qsa('input[name="likert"]').find(x => x.checked)?.value;
    if(!likert){ alert('Please choose a Likert rating.'); return; }

    const reasoning = ex.reasoning || ex.extraction;
    const concIds = (reasoning.conclusions || []).map(c => c.id);
    
    const labels = [];
    for(const cid of concIds){
      const sel = qs(`select[name="cls-${cid}"]`);
      if(!sel || !sel.value){ alert('Please label every conclusion.'); return; }
      labels.push({conclusion_id: cid, label: sel.value});
    }

    const payload = {
      participant_id: pid,
      example_id: ex.id,
      likert_1to7: Number(likert),
      conclusion_labels: labels,
      comment: qs('#comment').value || "",
      ts_client: new Date().toISOString(),
      user_agent: navigator.userAgent,
      version: "v1"
    };

    try{
      await saveToOSF_DataPipe(pid, ex, payload);
    }catch(e){
      console.error(e);
      alert('Save failed. Your response is cached and will retry next step.');
      const queue = JSON.parse(localStorage.getItem('queue')||'[]');
      queue.push({ex, payload});
      localStorage.setItem('queue', JSON.stringify(queue));
    }

    done.push(ex.id);
    localStorage.setItem('done', JSON.stringify(done));
    idx += 1;
    localStorage.setItem('idx', String(idx));
    await show();
  });

  // retry queue
  async function flushQueue(){
    const queue = JSON.parse(localStorage.getItem('queue')||'[]');
    const remaining = [];
    for(const item of queue){
      try{ await saveToOSF_DataPipe(pid, item.ex, item.payload) }catch{ remaining.push(item) }
    }
    localStorage.setItem('queue', JSON.stringify(remaining));
  }
  setInterval(flushQueue, 5000);

  await show();
}

document.addEventListener('DOMContentLoaded', run);
