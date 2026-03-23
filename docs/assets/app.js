// ---- Config ----
const DATAPIPE_EXPERIMENT_ID = "ZteOOhPgsNcI"; // <-- set this
const REQUIRED_COUNT = 30;

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

// Renderers
function renderClassSelect(conclusion){
  const cid = conclusion.id;
  const opts = (conclusion.classes && conclusion.classes.length)
    ? conclusion.classes
    : ["Strongly Supported","Weakly Supported","Not Supported","Contradicted"]; // fallback
  function formatClassOption(option){
    const parts = String(option).split(":");
    const label = parts.shift().trim();
    const desc = parts.join(":").trim();
    if (!desc) return `<strong>${escapeHtml(label)}</strong>`;
    return `<strong>${escapeHtml(label)}</strong>: ${escapeHtml(desc)}`;
  }

  return `
    <div class="class-choices" data-cid="${cid}">
      ${opts.map(o => `
        <button type="button"
                class="class-choice"
                data-cid="${cid}"
                data-value="${escapeHtml(o)}">
          ${formatClassOption(o)}
        </button>
      `).join("")}
      <p class="mono small-hint">Click all that apply. Click again to unselect.</p>
    </div>
  `;
}

function renderLikert(name){
  const labels = [1,2,3,4,5,6,7];
  return `<div class="card">
    <h3>How good is this extraction overall?</h3>
    <div class="scale likert-scale">
      ${labels.map(v => `
        <label class="likert-option">
          <input type="radio" name="${name}" value="${v}">
          <span>${v}</span>
        </label>
      `).join("")}
    </div>
    <small class="mono">1 = very poor, 7 = excellent</small>
  </div>`;
}

function renderExtraction(ex){
  const reasoning = ex.reasoning || ex.extraction; // backward-compat

  if (!reasoning) {
    return `
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
    if (t === "premise") return "Premise";
    if (t === "implicit") return "Intermediate conclusion";
    return "Conclusion";
  }

  function nodeClass(id){
    const t = nodeType(id);
    if (t === "premise") return "hl-premise";
    if (t === "implicit") return "hl-implicit";
    return "hl-conclusion";
  }

  // Render one inference as: Premises (+ joins) ↓ Target
  function renderInferenceBlock(inf){
    // premises with explicit '+' joiners in their own span
    const premiseSpans = inf.from.map(pid =>
      `<span class="${nodeClass(pid)}">${escapeHtml(nodeText(pid))}</span>`
    );
    const premisesHtml = premiseSpans.map((html, idx) => {
      if (idx === 0) return html;
      return `<span class="premise-join">+</span>${html}`;
    }).join("");

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
        <div class="inf-arrow">↓</div>
        <div class="inf-label">${escapeHtml(toLabel)}</div>
        <div class="inf-target">
          <span class="${toCls}">${escapeHtml(toText)}</span>
        </div>
      </div>
    `;
  }

  // Per-conclusion layout
  const conclusionBlocks = conclusions.map(c => {
    const cid = c.id;

    // Direct arguments whose target is this conclusion
    const directInfs = infByTo[cid] || [];

    const directHtml = directInfs.length === 0
      ? "<p><em>No supporting statements listed for this conclusion.</em></p>"
      : directInfs.map(inf => renderInferenceBlock(inf)).join("");

    return `
      <div class="card no-select">
        ${directHtml}
        <div class="conclusion-rating" style="margin-top:12px;">
          <h4>Which reasoning categories apply?</h4>
          ${renderClassSelect(c)}
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="no-select">
      ${conclusionBlocks}
    </div>
  `;
}

// DataPipe save
async function saveToOSF_DataPipe(participantId, example, payload){
  if (!window.jsPsychPipe || typeof jsPsychPipe.saveData !== "function"){
    throw new Error("DataPipe (jsPsych Pipe) not available on page.");
  }

  const filename = `${participantId}_${Date.now()}_${example.id}.json`;
  const content  = JSON.stringify(payload);

  const res = await jsPsychPipe.saveData(
    DATAPIPE_EXPERIMENT_ID,
    filename,
    content
  );

  console.log("[DataPipe] save result", { filename, res });

  if (res.error){
    // Make it loud if OSF still refuses
    throw new Error(`${res.error}: ${res.message || "Unknown error"}`);
  }
}

// ---- App ----
async function run(){
  const pid = requireId(); 
  if (!pid) return;

  let examples = await loadExamples();
  if (examples.length < REQUIRED_COUNT){
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

    // normal example
    if (idx >= examples.length){
      window.location.href = 'thanks.html';
      return;
    }
    const ex = examples[idx];
    qs('#exid').textContent = ex.id;
    // Likert disabled for streamlined task.
    qs('#content').innerHTML = renderExtraction(ex);
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
  async function flushQueue(){
    const queue = JSON.parse(localStorage.getItem('queue') || '[]');
    if (!queue.length) return;

    const remaining = [];
    for (const item of queue){
      try {
        await saveToOSF_DataPipe(pid, item.ex, item.payload);
      } catch (e) {
        console.error('Retry failed, keeping in queue:', e);
        remaining.push(item);
      }
    }
    localStorage.setItem('queue', JSON.stringify(remaining));
  }

  setInterval(flushQueue, 5000);

    // Click-to-select class for each conclusion
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.class-choice');
    if (!btn) return;
    btn.classList.toggle('selected');  // allow multiple per conclusion
  });

  qs('#next').addEventListener('click', async () => {
    // --- NORMAL EXAMPLE MODE ---
    const ex = examples[idx];
    const reasoning = ex.reasoning || ex.extraction;
    const concIds = (reasoning.conclusions || []).map(c => c.id);

    const labels = [];
    for (const cid of concIds){
      const chosen = qsa(`.class-choice[data-cid="${cid}"].selected`);
      if (!chosen.length){
        alert('Please label every conclusion.');
        return;
      }
      labels.push({
        conclusion_id: cid,
        labels: chosen.map(btn => btn.dataset.value)  // multi-select
      });
    }
    const payload = {
      participant_id: pid,
      example_id: ex.id,
      conclusion_labels: labels,
      comment: qs('#comment').value || "",
      ts_client: new Date().toISOString(),
      user_agent: navigator.userAgent,
      version: "v1"
    };

    // advance index + state
    done.push(ex.id);
    localStorage.setItem('done', JSON.stringify(done));
    idx += 1;
    localStorage.setItem('idx', String(idx));

    await show();
    window.scrollTo(0, 0);

    // try to save now; queue on failure
    saveToOSF_DataPipe(pid, ex, payload).catch(e => {
      console.error('Immediate save failed, queueing:', e);
      const queue = JSON.parse(localStorage.getItem('queue') || '[]');
      queue.push({ ex, payload });
      localStorage.setItem('queue', JSON.stringify(queue));
    });
  });

  // initial example
  await show();
}

// Expose pure helpers for non-experiment views (e.g., debug page).
window.reasoningApp = {
  loadExamples,
  renderExtraction
};

document.addEventListener('DOMContentLoaded', () => {
  const isExperimentPage = Boolean(
    qs('#next') &&
    qs('#content') &&
    qs('#comment') &&
    qs('#exid')
  );
  if (isExperimentPage) run();
});
