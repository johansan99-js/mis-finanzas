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
const
