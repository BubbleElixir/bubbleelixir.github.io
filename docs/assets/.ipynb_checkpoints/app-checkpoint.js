// ---- Config ----
const DATAPIPE_EXPERIMENT_ID = "YOUR_EXPERIMENT_ID"; // <-- set this
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
  const claims = ex.extraction.claims.map(c => {
    const lab = c.quote === "" ? `${c.id} — <span class="badge">implicit</span>` : c.id;
    const body = c.quote === "" ? c.canonical : c.quote;
    return `<li><strong>${lab}:</strong> ${escapeHtml(body)}</li>`
  }).join("");
  const infs = ex.extraction.inferences.map(e => {
    return `<li><code>${e.from.join(' + ')} ⇒ ${e.to}</code> <em>(${e.type}, ${e.structure})</em><br><small>${escapeHtml(e.warrant.text)}${e.warrant.explicit ? " [explicit]" : ""}</small></li>`
  }).join("");
  const concs = ex.extraction.conclusions.map(c => {
    const body = c.quote === "" ? c.canonical : c.quote;
    return `<li data-conclusion-id="${c.id}"><strong>${c.id}:</strong> ${escapeHtml(body)}<br>${renderClassSelect(c.id)}</li>`
  }).join("");

  return `
    <div class="card">
      <h3>Source Text</h3>
      <pre>${escapeHtml(ex.text)}</pre>
    </div>
    <div class="card">
      <h3>Claims</h3>
      <ul>${claims}</ul>
    </div>
    <div class="card">
      <h3>Inferences</h3>
      <ul>${infs}</ul>
    </div>
    <div class="card">
      <h3>Conclusions (label each)</h3>
      <ul>${concs}</ul>
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
