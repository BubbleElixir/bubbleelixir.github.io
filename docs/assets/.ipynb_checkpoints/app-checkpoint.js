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
function escapeHtml(s){return s.replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[m]))}

// UTF-8 -> base64
function toBase64UTF8(str){
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i=0;i<bytes.length;i++){ bin += String.fromCharCode(bytes[i]); }
  return btoa(bin);
}

// Renderers
function renderClassSelect(conclusionId){
  const options = ["Strongly Supported","Weakly Supported","Not Supported","Contradicted"];
  return `<label>Choose one:
  <select name="cls-${conclusionId}" required>
    <option value="">-- select --</option>
    ${options.map(o=>`<option value="${o}">${o}</option>`).join("")}
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
  const reasoning = ex.reasoning || ex.extraction; // backward-compat if needed

  const explicitClaims = reasoning.claims || [];
  const implicitClaims = reasoning.claims_extra || [];
  const allClaims = [...explicitClaims, ...implicitClaims];

  const claimMap = {};
  for (const c of allClaims) claimMap[c.id] = c;

  const inferences = reasoning.inferences || [];
  const conclusions = reasoning.conclusions || [];

  // index inferences by their target
  const infByTo = {};
  for (const inf of inferences) {
    if (!infByTo[inf.to]) infByTo[inf.to] = [];
    infByTo[inf.to].push(inf);
  }

  // --- Helper: node label + type ---
  function nodeType(id){
    if (id.startsWith('c')) return 'conclusion';
    if (id.startsWith('ic')) return 'implicit';
    return 'premise';
  }
  function nodeText(id){
    const c = claimMap[id] || {};
    if (c.quote && c.quote.trim() !== "") return c.quote;
    if (c.canonical) return c.canonical;
    return id;
  }
  function nodeChip(id){
    const t = nodeType(id);
    const cls =
      t === 'premise' ? 'chip-premise' :
      t === 'implicit' ? 'chip-implicit' : 'chip-conclusion';
    return `<span class="chip ${cls}">${id}</span>`;
  }

  // --- Recursive render of support chains for a target (conclusion or implicit) ---
  function renderSupportChains(targetId, visited = new Set()){
    // prevent cycles
    if (visited.has(targetId)) return '';
    visited.add(targetId);

    const infs = infByTo[targetId] || [];
    if (!infs.length) return '';

    return infs.map(inf => {
      const premiseLines = inf.from.map(pid => {
        const txt = nodeText(pid);
        return `${nodeChip(pid)} ${escapeHtml(txt)}`;
      }).join('<br>');

      const warrant = inf.warrant && inf.warrant.text ? escapeHtml(inf.warrant.text) : '';

      // nested: if any premise is implicit / intermediate, show its own chains
      let nested = '';
      for (const pid of inf.from) {
        if (nodeType(pid) === 'implicit') {
          const sub = renderSupportChains(pid, new Set(visited));
          if (sub) nested += `<div class="chain-nested">${sub}</div>`;
        }
      }

      return `
        <div class="chain-block">
          <div><strong>Premises → ${nodeChip(targetId)} ${escapeHtml(nodeText(targetId))}</strong></div>
          <div>${premiseLines}</div>
          ${warrant ? `<div class="chain-warrant"><strong>Warrant:</strong> ${warrant}</div>` : ''}
          ${nested}
        </div>
      `;
    }).join('');
  }

  // --- Claims table (overview) ---
  const claimsTable = `
    <div class="card">
      <h3>Claims overview</h3>
      <table class="claim-table">
        <thead><tr><th>ID</th><th>Type</th><th>Text</th></tr></thead>
        <tbody>
          ${allClaims.map(c => {
            const t = nodeType(c.id);
            const typeLabel =
              t === 'premise' ? 'Explicit premise' :
              t === 'implicit' ? 'Implicit derived claim' : 'Conclusion';
            const text = c.quote && c.quote.trim() !== "" ? c.quote : (c.canonical || '');
            return `<tr>
              <td>${nodeChip(c.id)}</td>
              <td>${typeLabel}</td>
              <td>${escapeHtml(text)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  // --- Per-conclusion trees ---
  const conclusionBlocks = conclusions.map(c => {
    const cid = c.id;
    const cText = nodeText(cid);
    const chains = renderSupportChains(cid);
    return `
      <div class="card">
        <h3>${nodeChip(cid)} Conclusion</h3>
        <p>${escapeHtml(cText)}</p>
        ${chains || '<p><em>No explicit support chains recorded for this conclusion.</em></p>'}
      </div>
    `;
  }).join('');

  // --- Full source text + reasoning ---
  return `
    <div class="card">
      <h3>Source Text</h3>
      <pre>${escapeHtml(ex.text)}</pre>
    </div>
    ${claimsTable}
    <div>
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
  }

  qs('#next').addEventListener('click', async () => {
    const ex = examples[idx];
    const likert = qsa('input[name="likert"]').find(x => x.checked)?.value;
    if(!likert){ alert('Please choose a Likert rating.'); return; }

    const concIds = ex.extraction.conclusions.map(c => c.id);
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
