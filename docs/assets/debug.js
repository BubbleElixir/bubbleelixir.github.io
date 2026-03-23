function clamp(value, min, max){
  return Math.min(max, Math.max(min, value));
}

function dbg(sel){
  return document.querySelector(sel);
}

async function runDebug(){
  const contentEl = dbg('#content');
  const api = window.reasoningApp;

  if (!api || typeof api.loadExamples !== 'function' || typeof api.renderExtraction !== 'function') {
    contentEl.innerHTML = '<div class="card"><p><em>Debug helpers are unavailable.</em></p></div>';
    return;
  }

  let examples = [];
  try {
    examples = await api.loadExamples();
  } catch (err) {
    console.error(err);
    contentEl.innerHTML = '<div class="card"><p><em>Failed to load examples.json.</em></p></div>';
    return;
  }

  if (!examples.length) {
    contentEl.innerHTML = '<div class="card"><p><em>No examples found.</em></p></div>';
    return;
  }

  const inputEl = dbg('#debugExampleNum');
  const prevEl = dbg('#debugPrev');
  const nextEl = dbg('#debugNext');
  const goEl = dbg('#debugGo');
  const idxEl = dbg('#debugIndex');
  const totalEl = dbg('#debugTotal');
  const idEl = dbg('#debugExId');

  totalEl.textContent = String(examples.length);
  inputEl.setAttribute('max', String(examples.length));

  const url = new URL(window.location.href);
  const fromQuery = Number.parseInt(url.searchParams.get('n') || '', 10);
  let idx = Number.isInteger(fromQuery) ? clamp(fromQuery - 1, 0, examples.length - 1) : 0;

  function updateUrl(){
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('n', String(idx + 1));
    window.history.replaceState(null, '', nextUrl);
  }

  function render(){
    const ex = examples[idx];
    idxEl.textContent = String(idx + 1);
    idEl.textContent = ex.id || '(missing-id)';
    inputEl.value = String(idx + 1);
    prevEl.disabled = idx === 0;
    nextEl.disabled = idx === examples.length - 1;
    contentEl.innerHTML = api.renderExtraction(ex);
    updateUrl();
    window.scrollTo(0, 0);
  }

  function jumpToInput(){
    const parsed = Number.parseInt(inputEl.value, 10);
    if (!Number.isInteger(parsed)) return;
    idx = clamp(parsed - 1, 0, examples.length - 1);
    render();
  }

  prevEl.addEventListener('click', () => {
    if (idx === 0) return;
    idx -= 1;
    render();
  });

  nextEl.addEventListener('click', () => {
    if (idx >= examples.length - 1) return;
    idx += 1;
    render();
  });

  goEl.addEventListener('click', jumpToInput);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    jumpToInput();
  });

  // Keep class option button behavior same as experiment page.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.class-choice');
    if (!btn) return;
    btn.classList.toggle('selected');
  });

  render();
}

document.addEventListener('DOMContentLoaded', runDebug);
