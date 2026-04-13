/**
 * MOTOR LÓGICO: MIS FINANZAS HN PRO
 * Versión: 4.5 - Edición "Revolución Financiera"
 * Desarrollado para: Análisis de flujo de caja y saneamiento de deudas.
 */

// 1. CONFIGURACIÓN DE ESTRATEGIAS (PLANES)
const FINANCIAL_PLANS = {
  crecimiento: { name: 'Crecimiento', op: 0.65, cre: 0.20, ev: 0.15, color: '#4a9ef8', desc: 'Prioridad: Construcción de capital y proyectos.' },
  estandar: { name: 'Equilibrado', op: 0.50, cre: 0.20, ev: 0.30, color: '#2ecc8a', desc: 'Prioridad: Balance entre ahorro y estilo de vida.' },
  austeridad: { name: 'Austeridad', op: 0.70, cre: 0.20, ev: 0.10, color: '#f97316', desc: 'Prioridad: Optimización bajo costos fijos altos.' },
  rescate: { name: 'Rescate', op: 0.50, cre: 0.40, ev: 0.10, color: '#e85d5d', desc: 'Prioridad: Eliminación agresiva de deuda tóxica.' }
};

const LS_KEY = 'mifinanzashn_v4_prod';

// 2. ESTADO INICIAL Y PERSISTENCIA
let state = JSON.parse(localStorage.getItem(LS_KEY)) || {
  setup: false,
  salario: 0,
  plan: 'crecimiento',
  transactions: [],
  cards: [],
  goals: []
};

// 3. UTILIDADES FORMATEO (MONEDA HONDURAS)
const fL = n => 'L. ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const save = () => { localStorage.setItem(LS_KEY, JSON.stringify(state)); renderAll(); };

// 4. ALGORITMO DE CALIFICACIÓN (HEALTH SCORE)
function calcularSaludFinanciera() {
  const p = FINANCIAL_PLANS[state.plan];
  const totalSalario = state.salario;
  
  const spent = cat => state.transactions.filter(t => t.cat === cat).reduce((a, b) => a + b.amount, 0);
  
  const gastos = { op: spent('op'), cre: spent('cre'), ev: spent('ev') };
  const limites = { op: totalSalario * p.op, cre: totalSalario * p.cre, ev: totalSalario * p.ev };

  let fallos = 0;
  if (gastos.op > limites.op) fallos++;
  if (gastos.ev > limites.ev) fallos++;
  
  const ratioTotal = (gastos.op + gastos.cre + gastos.ev) / totalSalario;

  if (fallos === 0 && ratioTotal <= 1) return { grado: 'A', msg: 'Excelente Control', color: 'var(--green)' };
  if (fallos === 1 || ratioTotal <= 1.05) return { grado: 'B', msg: 'Disciplina Moderada', color: 'var(--amber)' };
  return { grado: 'C', msg: 'Riesgo de Liquidez', color: 'var(--red)' };
}

// 5. RENDERIZADO DEL DASHBOARD
function renderDashboard() {
  const p = FINANCIAL_PLANS[state.plan];
  const salud = calcularSaludFinanciera();
  const spent = cat => state.transactions.filter(t => t.cat === cat).reduce((a, b) => a + b.amount, 0);

  // Renderizar Tarjeta de Salud
  document.getElementById('header-status').innerHTML = `
    <div style="background:var(--bg2); border:1px solid var(--border); border-radius:var(--r); padding:20px; display:flex; align-items:center; gap:20px; margin-bottom:20px;">
      <div style="width:65px; height:65px; border-radius:50%; border:4px solid ${salud.color}; display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:800; color:${salud.color}">
        ${salud.grado}
      </div>
      <div>
        <div class="status-badge" style="color:${p.color}; border-color:${p.color}; margin:0;">Plan ${p.name}</div>
        <div style="font-size:16px; font-weight:600; margin-top:5px;">${salud.msg}</div>
        <div style="font-size:11px; color:var(--text2);">${fL(state.salario)} Ingreso Mensual</div>
      </div>
    </div>
  `;

  // Renderizar Barras de Límites
  const categorias = [
    { id: 'op', n: 'Operación (Gastos Fijos)', lim: state.salario * p.op, color: 'var(--blue)' },
    { id: 'cre', n: state.plan === 'rescate' ? 'Pago de Deuda' : 'Crecimiento/Ahorro', lim: state.salario * p.cre, color: 'var(--green)' },
    { id: 'ev', n: 'Estilo de Vida (Gusto)', lim: state.salario * p.ev, color: 'var(--purple)' }
  ];

  document.getElementById('limits-container').innerHTML = categorias.map(c => {
    const s = spent(c.id);
    const perc = Math.min((s / c.lim) * 100, 100);
    const colorBarra = s > c.lim ? 'var(--red)' : c.color;
    return `
      <div class="limit-card">
        <div class="limit-label"><span>${c.n}</span><span>${fL(c.lim - s)} disponible</span></div>
        <div class="limit-val">${fL(s)} <small style="font-size:10px; color:var(--text2)">de ${fL(c.lim)}</small></div>
        <div style="height:6px; background:var(--bg4); border-radius:10px; overflow:hidden;">
          <div style="width:${perc}%; height:100%; background:${colorBarra}; transition:width 0.6s cubic-bezier(0.17, 0.67, 0.83, 0.67);"></div>
        </div>
      </div>
    `;
  }).join('');

  renderHistory();
}

// 6. GESTIÓN DE TRANSACCIONES (CON BORRADO DE ERRORES)
function saveMovimiento() {
  const monto = parseFloat(document.getElementById('mv-monto').value);
  const cat = document.getElementById('mv-cat').value;
  const sub = document.getElementById('mv-subcat').value || 'Gasto General';
  
  if (!monto || monto <= 0) return alert("Por favor ingresa un monto válido.");

  state.transactions.push({
    id: Date.now(),
    amount: monto,
    cat: cat,
    subcat: sub,
    date: new Date().toISOString()
  });

  save();
  closeModal('modal-movimiento');
  // Reset fields
  document.getElementById('mv-monto').value = '';
  document.getElementById('mv-subcat').value = '';
}

function deleteTx(id) {
  if (confirm("¿Deseas eliminar este registro por error de dedo? Esta acción recalculará tus límites inmediatamente.")) {
    state.transactions = state.transactions.filter(t => t.id !== id);
    save();
  }
}

function renderHistory() {
  const container = document.getElementById('recent-history');
  const ultimos = [...state.transactions].reverse().slice(0, 5);

  if (ultimos.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:var(--text3); padding:20px;">No hay movimientos este mes.</p>';
    return;
  }

  container.innerHTML = ultimos.map(t => `
    <div class="history-item">
      <div>
        <div style="font-size:14px; font-weight:600;">${t.subcat}</div>
        <div style="font-size:10px; color:var(--text2); text-transform:uppercase;">${t.cat}</div>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-family:'JetBrains Mono'; font-weight:700;">${fL(t.amount)}</span>
        <button onclick="deleteTx(${t.id})" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:16px; padding:5px;">✕</button>
      </div>
    </div>
  `).join('');
}

// 7. ALERTAS DE TARJETAS DE CRÉDITO
function saveTarjeta() {
  const nombre = document.getElementById('tc-nombre').value;
  const corte = parseInt(document.getElementById('tc-corte').value);
  const pago = parseInt(document.getElementById('tc-pago').value);

  if (!nombre || !corte || !pago) return alert("Completa todos los campos de la tarjeta.");

  state.cards.push({ id: Date.now(), nombre, corte, pago });
  save();
  closeModal('modal-tarjeta');
}

function renderCardsList() {
  const container = document.getElementById('cards-list');
  const hoy = new Date().getDate();

  if (state.cards.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:var(--text3); padding:20px;">Sin tarjetas vinculadas.</p>';
    return;
  }

  container.innerHTML = state.cards.map(c => {
    const faltanPago = c.pago - hoy;
    const alertaPago = (faltanPago <= 5 && faltanPago >= 0);
    
    return `
      <div class="card-plan" style="border-left:4px solid ${alertaPago ? 'var(--red)' : 'var(--amber)'}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <strong>${c.nombre}</strong>
            <div style="font-size:12px; color:var(--text2); margin-top:4px;">
              Corte: Día ${c.corte} | Pago: Día ${c.pago}
            </div>
          </div>
          <button onclick="deleteCard(${c.id})" style="background:none; border:none; color:var(--text3); cursor:pointer;">✕</button>
        </div>
        ${alertaPago ? `<div style="color:var(--red); font-size:11px; font-weight:700; margin-top:8px;">⚠ RECUERDO: Pagar en ${faltanPago} días</div>` : ''}
      </div>
    `;
  }).join('');
}

function deleteCard(id) {
  if (confirm("¿Desvincular esta tarjeta?")) {
    state.cards = state.cards.filter(c => c.id !== id);
    save();
  }
}

// 8. ONBOARDING Y CONFIGURACIÓN
function updateObPreview() {
  const planKey = document.getElementById('ob-plan').value;
  const salario = parseFloat(document.getElementById('ob-salario').value) || 0;
  const p = FINANCIAL_PLANS[planKey];
  
  document.getElementById('ob-preview').innerHTML = `
    <strong>Distribución proyectada:</strong><br>
    • Op: ${fL(salario * p.op)}<br>
    • Cre: ${fL(salario * p.cre)}<br>
    • Ev: ${fL(salario * p.ev)}
  `;
}

function finishOnboarding() {
  const s = parseFloat(document.getElementById('ob-salario').value);
  if (!s || s <= 0) return alert("Ingresa un sueldo válido para empezar.");
  
  state.salario = s;
  state.plan = document.getElementById('ob-plan').value;
  state.setup = true;
  save();
  document.getElementById('onboarding').style.display = 'none';
}

// 9. FUNCIONES DE SISTEMA (PWA / EXPORT)
function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "MisFinanzas_Respaldo.json");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

function resetApp() {
  if (confirm("¿ESTÁS SEGURO? Se borrarán todos tus registros y configuraciones de forma permanente.")) {
    localStorage.clear();
    location.reload();
  }
}

// Navegación de Vistas
function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  
  document.getElementById('view-' + view).classList.add('active');
  event.currentTarget.classList.add('active');
  renderAll();
}

// Modales
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// 10. INICIALIZACIÓN
function renderAll() {
  renderDashboard();
  renderCardsList();
}

window.onload = () => {
  if (!state.setup) openModal('onboarding');
  renderAll();
};

// Registro de Service Worker para PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(() => {
    console.log("Service Worker Activo: Modo Offline habilitado.");
  });
}
