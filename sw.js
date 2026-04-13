/**
 * MIS FINANZAS HN - MOTOR LÓGICO v5.1
 * Persistencia robusta + Onboarding simplificado + Score A-B-C
 */

// ==========================================
// 1. SISTEMA DE PERSISTENCIA ROBUSTO
// ==========================================
const LS_KEY = 'mifinanzashn_v5_final';

function getSafeStorage(key, fallback) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    console.warn('⚠️ LocalStorage no disponible. Usando memoria temporal.');
    return fallback;
  }
}

function setSafeStorage(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } 
  catch (e) { console.warn('⚠️ No se pudo guardar en disco.'); }
}

let state = getSafeStorage(LS_KEY, {
  setup: false, nombre: '', perfil: 'empleado', salario: 0, plan: 'crecimiento',
  transactions: [], cards: [], goals: [], deudaToxica: 0, frecuencia: 'mensual'
});

const fL = n => 'L. ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Guardado seguro con log de depuración
const save = () => { 
  setSafeStorage(LS_KEY, state); 
  console.log('💾 Datos guardados correctamente'); 
  renderAll(); 
};

// ==========================================
// 2. CONFIGURACIÓN DE PERFILES Y PLANES
// ==========================================
const USER_PROFILES = {
  empleado: { name: 'Empleado', desc: 'Salario fijo', rule: { op: 0.65, cre: 0.20, ev: 0.15 }, plan: 'crecimiento', hint: 'Usaremos la regla 65/20/15 clásica' },
  estudiante: { name: 'Estudiante', desc: 'Mesada/Beca', rule: { op: 0.70, cre: 0.15, ev: 0.15 }, plan: 'estandar', hint: 'Enfoque en ahorro flexible' },
  semanal: { name: 'Pago Semanal', desc: 'Ingresos variables', rule: { op: 0.60, cre: 0.25, ev: 0.15 }, plan: 'austeridad', hint: 'Calcularemos tu presupuesto semanal' },
  freelance: { name: 'Freelance', desc: 'Ingresos irregulares', rule: { op: 0.50, cre: 0.30, ev: 0.20 }, plan: 'rescate', hint: 'Usaremos un promedio móvil' },
  mixto: { name: 'Mixto', desc: 'Fijo + Variable', rule: { op: 0.60, cre: 0.25, ev: 0.15 }, plan: 'crecimiento', hint: 'Separaremos ingresos fijos y variables' }
};

const FINANCIAL_PLANS = {
  crecimiento: { name: 'Crecimiento', op: 0.65, cre: 0.20, ev: 0.15, color: '#4a9ef8' },
  estandar: { name: 'Equilibrado', op: 0.50, cre: 0.20, ev: 0.30, color: '#2ecc8a' },
  austeridad: { name: 'Austeridad', op: 0.70, cre: 0.20, ev: 0.10, color: '#f97316' },
  rescate: { name: 'Rescate', op: 0.50, cre: 0.40, ev: 0.10, color: '#e85d5d' }
};

// ==========================================
// 3. ONBOARDING
// ==========================================
function updateOnboardingStep() {
  const nombre = document.getElementById('ob-nombre').value.trim();
  const perfil = document.getElementById('ob-perfil').value;
  const ingresoSection = document.getElementById('ob-ingreso-section');
  const ingresoLabel = document.getElementById('ob-ingreso-label');
  const ingresoHint = document.getElementById('ob-ingreso-hint');
  const ingresoInput = document.getElementById('ob-ingreso');
  const preview = document.getElementById('ob-preview');
  const btn = document.getElementById('ob-btn-comenzar');
  
  if (perfil) {
    ingresoSection.classList.remove('hidden');
    const p = USER_PROFILES[perfil];
    ingresoLabel.textContent = perfil === 'semanal' ? 'Ingreso promedio SEMANAL (L)' : 'Ingreso promedio mensual (L)';
    ingresoHint.textContent = p.hint;
    
    const ingreso = parseFloat(ingresoInput.value) || 0;
    if (ingreso > 0) {
      const base = perfil === 'semanal' ? ingreso * 4.33 : ingreso;
      preview.classList.remove('hidden');
      document.getElementById('preview-content').innerHTML = `
        <div style="margin:4px 0;"><strong>Plan:</strong> ${p.name}</div>
        <div style="margin:4px 0;"><strong>Operación (${p.rule.op*100}%):</strong> ${fL(base * p.rule.op)}</div>
        <div style="margin:4px 0;"><strong>Crecimiento (${p.rule.cre*100}%):</strong> ${fL(base * p.rule.cre)}</div>
      `;
    } else { preview.classList.add('hidden'); }
  } else { ingresoSection.classList.add('hidden'); preview.classList.add('hidden'); }
  
  btn.disabled = !(nombre && perfil && parseFloat(ingresoInput.value) > 0);
}

function finishOnboarding() {
  const nombre = document.getElementById('ob-nombre').value.trim();
  const perfil = document.getElementById('ob-perfil').value;
  let ingreso = parseFloat(document.getElementById('ob-ingreso').value) || 0;
  
  if (!nombre || !perfil || ingreso <= 0) return alert("Completa todos los campos.");
  
  const p = USER_PROFILES[perfil];
  if (perfil === 'semanal') ingreso = ingreso * 4.33;
  
  state.nombre = nombre; state.perfil = perfil; state.salario = ingreso;
  state.plan = p.plan; state.setup = true;
  state.frecuencia = perfil === 'semanal' ? 'semanal' : 'mensual';
  save();
  document.getElementById('onboarding').style.display = 'none';
  renderAll();
}

// ==========================================
// 4. CÁLCULOS Y LÓGICA
// ==========================================
function calcularSaludFinanciera() {
  const perfil = USER_PROFILES[state.perfil] || USER_PROFILES.empleado;
  const p = perfil.rule;
  const totalSalario = state.salario;
  
  const spent = cat => state.transactions.filter(t => t.cat === cat).reduce((a, b) => a + b.amount, 0);
  const gastos = { op: spent('op'), cre: spent('cre'), ev: spent('ev') };
  
  let fallos = 0;
  if (gastos.op > totalSalario * p.op) fallos++;
  if (gastos.ev > totalSalario * p.ev) fallos++;
  
  const ratioTotal = (gastos.op + gastos.cre + gastos.ev) / totalSalario;

  const mensajes = { A: '¡Excelente Control!', B: 'Disciplina Moderada', C: 'Riesgo de Liquidez' };
  if (fallos === 0 && ratioTotal <= 1) return { grado: 'A', msg: mensajes.A, color: 'var(--green)' };
  if (fallos === 1 || ratioTotal <= 1.05) return { grado: 'B', msg: mensajes.B, color: 'var(--amber)' };
  return { grado: 'C', msg: mensajes.C, color: 'var(--red)' };
}

function calcularDiasPara(diaObjetivo) {
  const hoyNum = new Date().getDate();
  return diaObjetivo >= hoyNum ? diaObjetivo - hoyNum : (30 - hoyNum) + diaObjetivo;
}

// ==========================================
// 5. RENDERIZADO
// ==========================================
function renderDashboard() {
  if (!state.setup) return;
  const salud = calcularSaludFinanciera();
  const p = FINANCIAL_PLANS[state.plan];
  
  // Saldo
  const totalIncome = state.transactions.filter(t => t.type === 'ingreso').reduce((a,b) => a + b.amount, 0);
  const totalExpenses = state.transactions.filter(t => t.type === 'gasto').reduce((a,b) => a + b.amount, 0);
  const currentBalance = totalIncome - totalExpenses;
  
  const balEl = document.getElementById('current-balance');
  balEl.textContent = fL(currentBalance);
  balEl.style.color = currentBalance >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('balance-status').textContent = currentBalance >= 0 ? '✅ Dentro de tu presupuesto' : '⚠️ Estás gastando de más';

  // Score
  document.getElementById('health-score-container').innerHTML = `
    <div class="health-card">
      <div class="grade-circle" style="color:${salud.color}; border-color:${salud.color}">${salud.grado}</div>
      <div class="health-info">
        <div class="status-badge" style="color:${p.color}; border-color:${p.color}; margin:0;">Plan ${p.name}</div>
        <div class="health-message">${salud.msg}</div>
        <div class="health-ratio">Ingreso base: ${fL(state.salario)}</div>
      </div>
    </div>
  `;

  // Límites
  const spent = cat => state.transactions.filter(t => t.cat === cat).reduce((a,b) => a + b.amount, 0);
  const categorias = [
    { id: 'op', n: 'Operación', lim: state.salario * p.op, color: 'var(--blue)' },
    { id: 'cre', n: 'Crecimiento', lim: state.salario * p.cre, color: 'var(--green)' },
    { id: 'ev', n: 'Estilo Vida', lim: state.salario * p.ev, color: 'var(--purple)' }
  ];

  document.getElementById('limits-container').innerHTML = categorias.map(c => {
    const s = spent(c.id);
    const remaining = c.lim - s;
    const perc = Math.min((s / c.lim) * 100, 100);
    const colorBarra = s > c.lim ? 'var(--red)' : c.color;
    const colorText = remaining < 0 ? 'var(--red)' : 'var(--green)';
    return `
      <div class="limit-item">
        <div class="limit-header">
          <span class="limit-name">${c.n}</span>
          <span class="limit-remaining" style="color:${colorText}">${remaining >= 0 ? '+' : ''}${fL(remaining)}</span>
        </div>
        <div class="limit-amount">${fL(s)} <small style="font-size:11px; color:var(--text2)">/ ${fL(c.lim)}</small></div>
        <div class="limit-bar-bg"><div class="limit-bar-fill" style="width:${perc}%; background:${colorBarra};"></div></div>
      </div>
    `;
  }).join('');

  renderGrowthProgress();
  renderHistory();
}

function renderGrowthProgress() {
  const container = document.getElementById('growth-progress-container');
  const totalSaved = state.goals.reduce((a,b) => a + b.ahorrado, 0);
  const totalGoals = state.goals.reduce((a,b) => a + b.objetivo, 0);
  const goalPct = totalGoals > 0 ? Math.min(100, (totalSaved / totalGoals) * 100) : 0;
  
  let html = '';
  if (state.goals.length > 0) {
    html += `<div class="growth-item"><div class="growth-icon">🎯</div><div class="growth-info"><div class="growth-label">Metas Ahorro</div><div class="growth-value">${fL(totalSaved)} / ${fL(totalGoals)}</div></div><div class="growth-status" style="background:rgba(46,204,138,0.2); color:var(--green);">${goalPct.toFixed(0)}%</div></div>`;
  }
  if (state.deudaToxica > 0) {
    html += `<div class="growth-item"><div class="growth-icon">💳</div><div class="growth-info"><div class="growth-label">Deuda Tóxica</div><div class="growth-value">${fL(state.deudaToxica)}</div></div><div class="growth-status" style="background:rgba(232,93,93,0.2); color:var(--red);">Pendiente</div></div>`;
  }
  html += `<div class="growth-item"><div class="growth-icon">📊</div><div class="growth-info"><div class="growth-label">Regla Activa</div><div class="growth-value">Perfil ${USER_PROFILES[state.perfil]?.name || 'Custom'}</div></div><div class="growth-status" style="background:rgba(74,158,248,0.2); color:var(--blue);">Activo</div></div>`;
  
  container.innerHTML = html || '<p class="empty-state">💡 Crea una meta para ver tu progreso</p>';
}

function renderHistory() {
  const container = document.getElementById('recent-history');
  const ultimos = [...state.transactions].reverse().slice(0, 5);
  if (ultimos.length === 0) { container.innerHTML = '<p class="empty-state">Sin movimientos aún.</p>'; return; }
  container.innerHTML = ultimos.map(t => `
    <div class="history-item">
      <div><div style="font-size:14px; font-weight:600;">${t.subcat || 'Sin detalle'}</div><div style="font-size:10px; color:var(--text2);">${t.cat?.toUpperCase() || ''}</div></div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-family:'JetBrains Mono'; font-weight:700; color:${t.type==='ingreso'?'var(--green)':'var(--red)'}">${t.type==='ingreso'?'+':'-'}${fL(t.amount)}</span>
        <button onclick="deleteTx(${t.id})" style="background:none; border:none; color:var(--text3); cursor:pointer;">✕</button>
      </div>
    </div>
  `).join('');
}

function renderGastos() {
  const list = document.getElementById('gastos-list');
  const gastosMes = state.transactions.filter(t => t.type === 'gasto');
  const total = gastosMes.reduce((a,b) => a + b.amount, 0);
  document.getElementById('gastos-mes').textContent = fL(total);
  document.getElementById('gastos-count').textContent = gastosMes.length;
  list.innerHTML = gastosMes.slice(-10).reverse().map(t => `
    <div class="card" style="padding:12px;"><div style="display:flex; justify-content:space-between;"><strong>${t.subcat || 'Sin detalle'}</strong><span class="text-red">-${fL(t.amount)}</span></div><div style="font-size:12px; color:var(--text2); margin-top:5px;">${t.cat?.toUpperCase() || ''}</div></div>
  `).join('') || '<p class="empty-state">Sin gastos</p>';
}

function renderIngresos() {
  const list = document.getElementById('ingresos-list');
  const ingresos = state.transactions.filter(t => t.type === 'ingreso');
  const salario = ingresos.filter(t => t.subtype === 'salario').reduce((a,b) => a + b.amount, 0);
  const extra = ingresos.filter(t => t.subtype === 'extra').reduce((a,b) => a + b.amount, 0);
  document.getElementById('ingreso-salario').textContent = fL(salario);
  document.getElementById('ingreso-extra').textContent = fL(extra);
  list.innerHTML = ingresos.slice(-10).reverse().map(t => `
    <div class="card" style="padding:12px;"><div style="display:flex; justify-content:space-between;"><strong>${t.subtype === 'salario' ? '💼 Salario' : '✨ Extra'}</strong><span class="text-green">+${fL(t.amount)}</span></div></div>
  `).join('') || '<p class="empty-state">Sin ingresos</p>';
}

function renderMetas() {
  const container = document.getElementById('metas-list');
  container.innerHTML = state.goals.map(g => {
    const pct = Math.min(100, (g.ahorrado / g.objetivo) * 100);
    return `<div class="card-plan"><div style="display:flex; justify-content:space-between;"><strong>${g.nombre}</strong><span>${fL(g.ahorrado)}/${fL(g.objetivo)}</span></div><div class="progress-container" style="height:4px; background:var(--bg4); border-radius:4px; margin:8px 0;"><div style="width:${pct}%; height:100%; background:var(--green); border-radius:4px;"></div></div><button class="btn btn-secondary" style="width:auto; padding:6px 10px; font-size:11px;" onclick="openAbono(${g.id})">+ Abonar</button></div>`;
  }).join('') || '<p class="empty-state">Sin metas</p>';
}

function renderCardAlerts() {
  const container = document.getElementById('cards-alerts-container');
  const noAlerts = document.getElementById('no-alerts');
  container.innerHTML = '';
  state.cards.forEach(c => {
    const faltanPago = calcularDiasPara(c.pago);
    if (faltanPago <= 5) {
      container.innerHTML += `<div class="card-alert" style="border-left:4px solid var(--red);"><div style="font-weight:700;">${c.nombre}</div><div style="font-size:12px; color:var(--red); margin-top:4px;">⚠️ Pagar en ${faltanPago} días</div></div>`;
    }
  });
  noAlerts.classList.toggle('hidden', container.innerHTML !== '');
}

// ==========================================
// 6. ACCIONES DE USUARIO
// ==========================================
function saveMovimiento() {
  const monto = parseFloat(document.getElementById('mv-monto').value);
  const cat = document.getElementById('mv-cat').value;
  const sub = document.getElementById('mv-subcat').value || 'Gasto';
  if (!monto || monto <= 0) return alert("Monto inválido.");
  state.transactions.push({ id: Date.now(), amount: monto, cat, subcat: sub, date: new Date().toISOString() });
  save(); closeModal('modal-movimiento');
  document.getElementById('mv-monto').value = ''; document.getElementById('mv-subcat').value = '';
}

function saveGasto() {
  const monto = parseFloat(document.getElementById('gasto-monto').value);
  if (!monto || monto <= 0) return alert("Monto inválido.");
  state.transactions.push({ id: Date.now(), type: 'gasto', amount: monto, cat: document.getElementById('gasto-cat').value, subcat: document.getElementById('gasto-subcat').value, date: new Date() });
  save(); closeModal('modal-gasto'); renderAll();
}

function saveIngreso() {
  const monto = parseFloat(document.getElementById('ingreso-monto').value);
  if (!monto || monto <= 0) return alert("Monto inválido.");
  const tipo = document.getElementById('ingreso-tipo').value;
  state.transactions.push({ id: Date.now(), type: 'ingreso', subtype: tipo, amount: monto, cat: tipo === 'extra' ? 'cre' : 'op', date: new Date() });
  save(); closeModal('modal-ingreso'); renderAll();
}

function deleteTx(id) {
  if (confirm("¿Eliminar este registro?")) { state.transactions = state.transactions.filter(t => t.id !== id); save(); }
}

function saveMeta() {
  const nombre = document.getElementById('meta-nombre')?.value;
  const objetivo = parseFloat(document.getElementById('meta-objetivo')?.value);
  if (!nombre || !objetivo) return alert("Completa los campos");
  state.goals.push({ id: Date.now(), nombre, objetivo, ahorrado: parseFloat(document.getElementById('meta-actual')?.value) || 0 });
  save(); closeModal('modal-meta');
}

function openAbono(id) {
  const meta = state.goals.find(g => g.id === id); if (!meta) return;
  document.getElementById('abono-meta-nombre').textContent = meta.nombre;
  document.getElementById('abono-meta-id').value = id;
  openModal('modal-abono');
}

function saveAbono() {
  const id = parseInt(document.getElementById('abono-meta-id').value);
  const monto = parseFloat(document.getElementById('abono-monto').value);
  if (!monto || monto <= 0) return alert("Monto inválido");
  const meta = state.goals.find(g => g.id === id);
  if (meta) { meta.ahorrado += monto; state.transactions.push({ id: Date.now(), type: 'gasto', amount: monto, cat: 'cre', subcat: `Abono: ${meta.nombre}`, date: new Date() }); save(); }
  closeModal('modal-abono'); renderAll();
}

function saveTarjeta() {
  const nombre = document.getElementById('tc-nombre').value;
  const corte = parseInt(document.getElementById('tc-corte').value);
  const pago = parseInt(document.getElementById('tc-pago').value);
  if (!nombre || !corte || !pago) return alert("Completa todos los campos.");
  state.cards.push({ id: Date.now(), nombre, corte, pago });
  save(); closeModal('modal-tarjeta');
}

function reconciliar() {
  const saldoReal = parseFloat(document.getElementById('config-saldo-real').value);
  if (isNaN(saldoReal)) return alert("Ingresa un saldo válido.");
  const saldoCalc = state.transactions.filter(t => t.type === 'ingreso').reduce((a,b) => a + b.amount, 0) - state.transactions.filter(t => t.type === 'gasto').reduce((a,b) => a + b.amount, 0);
  const diff = saldoReal - saldoCalc;
  document.getElementById('reconciliacion-result').innerHTML = Math.abs(diff) < 1 ? '<span class="text-green">✅ Cuadrado</span>' : `<span class="text-red">❌ Diferencia: ${fL(diff)}</span>`;
}

function exportData() {
  const a = document.createElement('a');
  a.href = "text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
  a.download = "MisFinanzas_Backup.json";
  document.body.appendChild(a); a.click(); a.remove();
}

function importData(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.salario && data.transactions) {
        if (confirm("¿Reemplazar datos actuales?")) { state = data; save(); alert("✅ Importado"); location.reload(); }
      } else alert("❌ Archivo inválido");
    } catch { alert("❌ Error al leer"); }
  };
  reader.readAsText(file);
}

function resetApp() {
  if (confirm("¿BORRAR TODO?")) { localStorage.clear(); location.reload(); }
}

// ==========================================
// 7. NAVEGACIÓN Y MODALES
// ==========================================
function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  event.currentTarget.classList.add('active');
  renderAll();
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function closeModalIfBg(e, id) { if (e.target.id === id) closeModal(id); }

function renderAll() {
  if (!state.setup) return;
  renderDashboard();
  renderGastos();
  renderIngresos();
  renderMetas();
  renderCardAlerts();
}

// ==========================================
// 8. INICIALIZACIÓN Y PWA
// ==========================================
window.onload = () => {
  console.log('🚀 App iniciada. Estado setup:', state.setup);
  
  // Limpieza de Service Workers antiguos para evitar caché corrupta
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => reg.unregister());
    });
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(() => console.log('✅ SW registrado'))
      .catch(err => console.warn('⚠️ SW no registrado:', err));
  }

  if (!state.setup) {
    document.getElementById('onboarding').style.display = 'flex';
  } else {
    renderAll();
  }
};
