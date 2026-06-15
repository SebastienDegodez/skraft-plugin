(function () {
  'use strict';

  // Defence-in-depth HTML escaping for any interpolated string.
  function esc(value) {
    if (value == null) return '';
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
  }

  // A telemetry value that may be absent (the CLI did not emit it).
  function num(value) {
    return value == null ? '<span class="na">n/a</span>' : esc(value.toLocaleString());
  }

  const state = { data: null, model: '', activeTab: 'gates' };

  function rowMatchesModel(row) {
    return state.model === '' || row.model === state.model;
  }

  function sum(rows, key) {
    return rows.reduce((acc, r) => acc + (r[key] || 0), 0);
  }

  function renderGates() {
    const panel = document.getElementById('panel-gates');
    const rows = (state.data.gates || []).filter(rowMatchesModel);
    const pass = rows.filter(r => r.status === 'PASS').length;
    const fail = rows.length - pass;

    panel.innerHTML = `
      <div class="summary-cards">
        <div class="card"><div class="card-label">Gates</div><div class="card-value">${rows.length}</div></div>
        <div class="card"><div class="card-label">Passed</div><div class="card-value" style="color:var(--green)">${pass}</div></div>
        <div class="card"><div class="card-label">Failed</div><div class="card-value" style="color:var(--red)">${fail}</div></div>
        <div class="card"><div class="card-label">AIC</div><div class="card-value">${sum(rows, 'premiumRequests').toLocaleString()}</div></div>
        <div class="card"><div class="card-label">Output tokens</div><div class="card-value">${sum(rows, 'outputTokens').toLocaleString()}</div></div>
      </div>
      <table class="table">
        <thead><tr>
          <th>Skill</th><th>Scenario</th><th>Status</th><th>Model</th>
          <th class="num">Agents</th><th class="num">Skills</th>
          <th class="num">AIC</th><th class="num">Output tok.</th><th class="num">Input tok.</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${esc(r.skill)}</td>
              <td>${esc(r.scenario)}</td>
              <td><span class="badge ${r.status === 'PASS' ? 'pass' : 'fail'}">${esc(r.status)}</span></td>
              <td>${r.model ? `<span class="badge model">${esc(r.model)}</span>` : '<span class="na">n/a</span>'}</td>
              <td class="num">${num(r.agentsInvoked)}</td>
              <td class="num">${num(r.skillsInvoked)}</td>
              <td class="num">${num(r.premiumRequests)}</td>
              <td class="num">${num(r.outputTokens)}</td>
              <td class="num"><span class="na">n/a</span></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function renderSkillValue() {
    const panel = document.getElementById('panel-skill-value');
    const rows = (state.data.skillValue || []).filter(rowMatchesModel);
    const wins = rows.filter(r => r.winner === 'WithSkill').length;

    panel.innerHTML = `
      <div class="summary-cards">
        <div class="card"><div class="card-label">Scenarios</div><div class="card-value">${rows.length}</div></div>
        <div class="card"><div class="card-label">Won by skill</div><div class="card-value" style="color:var(--accent)">${wins}</div></div>
        <div class="card"><div class="card-label">AIC</div><div class="card-value">${sum(rows, 'premiumRequests').toLocaleString()}</div></div>
        <div class="card"><div class="card-label">Output tokens</div><div class="card-value">${sum(rows, 'outputTokens').toLocaleString()}</div></div>
      </div>
      <table class="table">
        <thead><tr>
          <th>Skill</th><th>Scenario</th><th>Winner</th><th>Model</th>
          <th class="num">Agents</th><th class="num">Skills</th>
          <th class="num">AIC</th><th class="num">Output tok.</th><th class="num">Input tok.</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${esc(r.skill)}</td>
              <td>${esc(r.scenario)}</td>
              <td><span class="badge ${r.winner === 'WithSkill' ? 'win' : 'model'}">${esc(r.winner)}</span></td>
              <td>${r.model ? `<span class="badge model">${esc(r.model)}</span>` : '<span class="na">n/a</span>'}</td>
              <td class="num">${num(r.agentsInvoked)}</td>
              <td class="num">${num(r.skillsInvoked)}</td>
              <td class="num">${num(r.premiumRequests)}</td>
              <td class="num">${num(r.outputTokens)}</td>
              <td class="num"><span class="na">n/a</span></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function render() {
    renderGates();
    renderSkillValue();
  }

  function populateModelFilter() {
    const select = document.getElementById('model-filter');
    (state.data.models || []).forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      select.appendChild(option);
    });
    select.addEventListener('change', () => { state.model = select.value; render(); });
  }

  function wireTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const name = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
        document.querySelectorAll('.tab-content').forEach(p =>
          p.classList.toggle('active', p.id === `panel-${name}`));
      });
    });
  }

  async function init() {
    const statusLine = document.getElementById('status-line');
    try {
      const response = await fetch('dashboard-data.json');
      if (!response.ok) throw new Error(response.statusText);
      state.data = await response.json();
    } catch (err) {
      statusLine.textContent = 'No dashboard data found (run the harness `dashboard` command first).';
      return;
    }

    document.getElementById('generated-at').textContent =
      state.data.generatedAt ? `Generated ${new Date(state.data.generatedAt).toLocaleString()}` : '';
    populateModelFilter();
    wireTabs();
    render();
    statusLine.textContent =
      `${(state.data.gates || []).length} gate run(s), ${(state.data.skillValue || []).length} skill-value scenario(s), ${(state.data.models || []).length} model(s).`;
  }

  init();
})();
