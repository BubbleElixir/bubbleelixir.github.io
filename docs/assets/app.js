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

  return `
    <div class="class-choices" data-cid="${cid}">
      ${opts.map(o => `
        <button type="button"
                class="class-choice"
                data-cid="${cid}"
                data-value="${escapeHtml(o)}">
          ${escapeHtml(o)}
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
    if (t === "implicit") return `Intermediate conclusion ${id}`;
    return `Conclusion ${id}`;
  }

  function nodeClass(id){
    const t = nodeType(id);
    if (t === "premise") return "hl-premise";
    if (t === "implicit") return "hl-implicit";
    return "hl-conclusion";
  }

  // Collect all intermediate conclusions that ultimately support targetId
  function collectRelevantICs(targetId, acc){
    if (!acc) acc = new Set();
    const infs = infByTo[targetId] || [];
    for (const inf of infs){
      for (const pid of inf.from){
        if (nodeType(pid) === "implicit" && !acc.has(pid)){
          acc.add(pid);
          collectRelevantICs(pid, acc);
        }
      }
    }
    return acc;
  }

  // Render one inference as: Premises (+ joins) ↓ Warrant ↓ Target
  function renderInferenceBlock(inf){
    // premises with explicit '+' joiners in their own span
    const premiseSpans = inf.from.map(pid =>
      `<span class="${nodeClass(pid)}">${escapeHtml(nodeText(pid))}</span>`
    );
    const premisesHtml = premiseSpans.map((html, idx) => {
      if (idx === 0) return html;
      return `<span class="premise-join">+</span>${html}`;
    }).join("");

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
          <div class="inf-warrant">
            <span class="hl-warrant">${escapeHtml(warrant)}</span>
          </div>
        ` : ""}
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
    const cText = nodeText(cid);

    // Direct arguments whose target is this conclusion
    const directInfs = infByTo[cid] || [];

    const directHtml = directInfs.length === 0
      ? "<p><em>No explicit arguments directly targeting this conclusion.</em></p>"
      : directInfs.map(inf => `
          <div class="card no-select chain-card" style="margin-top:8px;">
            ${renderInferenceBlock(inf)}
          </div>
        `).join("");

    // Intermediate conclusions that (recursively) support this conclusion
    const relevantICs = Array.from(collectRelevantICs(cid));

    const icSections = relevantICs.map(icId => {
      const icText = nodeText(icId);
      const icInfs = infByTo[icId] || [];
      const icBlocks = icInfs.length === 0
        ? "<p><em>No explicit arguments recorded for this intermediate conclusion.</em></p>"
        : icInfs.map(inf => `
            <div class="card no-select chain-card" style="margin-top:8px;">
              ${renderInferenceBlock(inf)}
            </div>
          `).join("");

      return `
        <div class="card no-select" style="margin-top:12px;">
          <h4>Intermediate conclusion ${icId}</h4>
          <p><span class="hl-implicit">${escapeHtml(icText)}</span></p>
          ${icBlocks}
        </div>
      `;
    }).join("");

    const icSectionWrapper = relevantICs.length
      ? `
        <div style="margin-top:12px;">
          <h4>Intermediate conclusions used in the arguments above</h4>
          ${icSections}
        </div>
      `
      : "";
    return `
      <div class="card no-select">
        <h3>Conclusion ${cid}</h3>
        <p><span class="hl-conclusion">${escapeHtml(cText)}</span></p>

        <div style="margin-top:12px;">
          <h4>Arguments directly supporting this conclusion</h4>
          ${directHtml}
        </div>

        ${icSectionWrapper}

        <div class="conclusion-rating" style="margin-top:12px;">
          <h4>
            Which reasoning categories apply to this conclusion?
            <span class="mono">(select all that apply)</span>
          </h4>
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
      <h2>Reasoning by conclusion</h2>
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
  qs('#pid').textContent = pid;

  let examples = await loadExamples();
  if (examples.length < REQUIRED_COUNT){
    console.warn('Fewer than REQUIRED_COUNT examples present.');
  }
  examples = examples.slice(0, Math.min(REQUIRED_COUNT, examples.length));
  examples = shuffle(examples);

  const ATTENTION_POINTS = [7, 22]; // after 7th and 22nd examples

  let idx = parseInt(localStorage.getItem('idx') || '0', 10);
  let done = JSON.parse(localStorage.getItem('done') || '[]');

  // attention-check state
  let attnDone = JSON.parse(localStorage.getItem('attn_done') || '[]'); // e.g. [7,22]
  let mode = localStorage.getItem('mode') || 'example';                // 'example' | 'attn'
  let currentAttnPoint = localStorage.getItem('current_attn_point');
  currentAttnPoint = currentAttnPoint ? parseInt(currentAttnPoint, 10) : null;
  let lastExampleId = localStorage.getItem('last_example_id') || null;

  function updateProgress(){
    const p = Math.round((idx / examples.length) * 100);
    qs('.progress > div').style.width = `${p}%`;
    qs('#progText').textContent = `${idx} / ${examples.length}`;
  }
  function renderAttentionCheck(){
    if (!lastExampleId){
      return `
        <div class="card no-select">
          <h3>Attention check</h3>
          <p><em>No previous example found for this check.</em></p>
        </div>
      `;
    }

    return `
      <div class="card no-select">
        <h3>Attention check</h3>
        <p>Please answer this quick question about the <strong>previous</strong> text.</p>
        <p><strong>Was the last text from an Activist or Contrarian source?</strong></p>
        <div class="attn-choices">
          <button type="button" class="attn-choice" data-value="Activist">Activist</button>
          <button type="button" class="attn-choice" data-value="Contrarian">Contrarian</button>
        </div>
        <p class="mono small-hint">Click one option, then press “Save & Next”.</p>
      </div>
    `;
  }
  async function show(){
    updateProgress();

    // attention check screen
    if (mode === 'attn'){
      qs('#exid').textContent = 'attention-check';
      qs('#content').innerHTML = renderAttentionCheck();
      qs('#comment').value = '';
      return;
    }

    // normal example
    if (idx >= examples.length){
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

  // Click-to-select option on attention check
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.attn-choice');
    if (!btn) return;
    qsa('.attn-choice').forEach(el => el.classList.remove('selected'));
    btn.classList.add('selected');
  });


  qs('#next').addEventListener('click', async () => {

    // --- ATTENTION-CHECK MODE ---
    if (mode === 'attn') {
      const choiceBtn = qs('.attn-choice.selected');
      if (!choiceBtn){
        alert('Please select Activist or Contrarian.');
        return;
      }
      const answer = choiceBtn.dataset.value;

      const exStub = { id: `ATTN_${currentAttnPoint || idx}_${lastExampleId || 'unknown'}` };

      const payload = {
        participant_id: pid,
        attention_for_example_id: lastExampleId,
        attention_point: currentAttnPoint,
        response: answer,
        ts_client: new Date().toISOString(),
        user_agent: navigator.userAgent,
        type: "attention_check_v1"
      };

      // try to send now; queue on failure
      saveToOSF_DataPipe(pid, exStub, payload).catch(e => {
        console.error('Immediate save failed (attention check), queueing:', e);
        const queue = JSON.parse(localStorage.getItem('queue') || '[]');
        queue.push({ ex: exStub, payload });
        localStorage.setItem('queue', JSON.stringify(queue));
      });

      if (currentAttnPoint && !attnDone.includes(currentAttnPoint)) {
        attnDone.push(currentAttnPoint);
        localStorage.setItem('attn_done', JSON.stringify(attnDone));
      }

      mode = 'example';
      currentAttnPoint = null;
      localStorage.setItem('mode', 'example');
      localStorage.removeItem('current_attn_point');

      await show();
      window.scrollTo(0, 0);
      return;
    }

    // --- NORMAL EXAMPLE MODE ---
    const ex = examples[idx];
    const likert = qsa('input[name="likert"]').find(x => x.checked)?.value;
    if (!likert){
      alert('Please choose a Likert rating.');
      return;
    }

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
    // remember which example the upcoming attention check refers to
    lastExampleId = ex.id;
    localStorage.setItem('last_example_id', lastExampleId);

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

    // advance index + state
    done.push(ex.id);
    localStorage.setItem('done', JSON.stringify(done));
    idx += 1;
    localStorage.setItem('idx', String(idx));

    // decide whether to show an attention check next
    const upcoming = ATTENTION_POINTS.find(
      p => p === idx && !attnDone.includes(p)
    );
    if (upcoming){
      mode = 'attn';
      currentAttnPoint = upcoming;
      localStorage.setItem('mode', 'attn');
      localStorage.setItem('current_attn_point', String(currentAttnPoint));
    } else {
      mode = 'example';
      currentAttnPoint = null;
      localStorage.setItem('mode', 'example');
      localStorage.removeItem('current_attn_point');
    }

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

document.addEventListener('DOMContentLoaded', run);