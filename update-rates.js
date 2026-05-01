#!/usr/bin/env node
/**
 * Mi Pisto HN — Updater de tasas de cambio
 * ──────────────────────────────────────────
 * Ejecutado por GitHub Actions diariamente vía cron.
 * Consulta APIs públicas, calcula las tasas en formato "1 X = Y HNL"
 * y sobrescribe ./tasas.json en la raíz del repo.
 *
 * Estrategia:
 *  1. Llama a open.er-api.com con USD como base (más confiable que HNL).
 *  2. Si falla, intenta exchangerate-api.com.
 *  3. Si ambos fallan, sale con código != 0 y el commit no se hace.
 *
 * Sin dependencias npm: usa fetch nativo de Node 18+.
 */

const fs = require('fs');
const path = require('path');

// Monedas que la app soporta
const SUPPORTED = ['USD', 'EUR', 'GTQ', 'NIO', 'MXN', 'CRC', 'PAB'];

// APIs en orden de preferencia
const APIS = [
  'https://open.er-api.com/v6/latest/USD',
  'https://api.exchangerate-api.com/v4/latest/USD'
];

async function fetchWithTimeout(url, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getRatesFromApi() {
  for (const url of APIS) {
    try {
      console.log(`🌐 Probando ${url}...`);
      const data = await fetchWithTimeout(url);
      if (!data || !data.rates) {
        console.warn('  ❌ Respuesta sin "rates"');
        continue;
      }
      const usdToHnl = data.rates.HNL;
      if (!usdToHnl || usdToHnl < 10 || usdToHnl > 100) {
        console.warn(`  ❌ Tasa USD/HNL fuera de rango: ${usdToHnl}`);
        continue;
      }

      // Calcular "1 X = Y HNL" vía cruzada con USD
      const rates = {};
      for (const code of SUPPORTED) {
        if (code === 'USD') {
          rates[code] = usdToHnl;
        } else if (data.rates[code]) {
          rates[code] = usdToHnl / data.rates[code];
        }
      }

      // Validación: debe tener al menos USD, EUR y otras 2
      if (Object.keys(rates).length < 4) {
        console.warn(`  ❌ Solo se obtuvieron ${Object.keys(rates).length} tasas`);
        continue;
      }

      console.log('  ✅ OK');
      return { rates, source: url };
    } catch (e) {
      console.warn(`  ❌ ${e.message}`);
    }
  }
  return null;
}

(async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Mi Pisto HN — Update Rates');
  console.log('  Fecha: ' + new Date().toISOString());
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const result = await getRatesFromApi();
  if (!result) {
    console.error('❌ No se pudo obtener tasas de ninguna API');
    process.exit(1);
  }

  const { rates, source } = result;

  // Construir el JSON final
  const output = {
    updated_at: new Date().toISOString(),
    base: 'HNL',
    note: 'Cada valor representa cuántos HNL equivalen a 1 unidad de esa moneda. Ej: USD: 26.7295 → 1 USD = L. 26.7295',
    source: source,
    rates: {}
  };

  // Redondear a 4 decimales
  for (const [code, value] of Object.entries(rates)) {
    output.rates[code] = parseFloat(value.toFixed(4));
  }

  // Escribir tasas.json en la raíz del repo
  const outPath = path.join(__dirname, 'tasas.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');

  console.log('\n📝 Escrito en:', outPath);
  console.log('📊 Tasas obtenidas:');
  for (const [code, value] of Object.entries(output.rates)) {
    console.log(`   1 ${code} = L. ${value}`);
  }
  console.log('\n✅ Done');
})();
