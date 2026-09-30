import { supabase } from './config.js';

// Calcular el inicio del día en hora de Colombia (00:00:00)
function obtenerInicioDiaColombiaISO() {
  const ahora = new Date();
  // Formatear la fecha actual a zona horaria de Colombia
  const fechaCo = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(ahora);

  const [m, d, y] = fechaCo.split('/');
  return new Date(`${y}-${m}-${d}T00:00:00-05:00`).toISOString();
}

// Obtener el cuadre diario de un domiciliario (desde las 00:00 de hoy)
export async function obtenerCuadreDiarioDomiciliario(domiciliarioId) {
  const inicioDia = obtenerInicioDiaColombiaISO();

  const { data, error } = await supabase
    .from('pedidos')
    .select('precio')
    .eq('domiciliario_id', domiciliarioId)
    .eq('estado', 'completado')
    .gte('created_at', inicioDia);

  if (error) throw error;

  let totalRecaudado = 0;
  if (data) {
    totalRecaudado = data.reduce((acc, p) => acc + Number(p.precio || 0), 0);
  }

  return {
    totalViajes: data ? data.length : 0,
    totalRecaudado: totalRecaudado
  };
}

// Obtener estadísticas globales y lista de domiciliarios con sus estados
export async function obtenerEstadisticasAdmin() {
  const inicioDia = obtenerInicioDiaColombiaISO();

  // 1. Obtener todos los domiciliarios
  const { data: domiciliarios } = await supabase
    .from('usuarios')
    .select('*')
    .in('rol', ['domiciliario', 'admin']);

  // 2. Obtener pedidos completados hoy
  const { data: pedidosHoy } = await supabase
    .from('pedidos')
    .select('*')
    .gte('created_at', inicioDia);

  // 3. Obtener histórico general de pedidos
  const { data: todosLosPedidos } = await supabase
    .from('pedidos')
    .select('*');

  let totalVentasHoy = 0;
  let totalCompletadosHoy = 0;

  if (pedidosHoy) {
    pedidosHoy.forEach(p => {
      if (p.estado === 'completado') {
        totalVentasHoy += Number(p.precio || 0);
        totalCompletadosHoy++;
      }
    });
  }

  return {
    totalVentas: totalVentasHoy,
    totalPedidos: todosLosPedidos ? todosLosPedidos.length : 0,
    totalCompletados: totalCompletadosHoy,
    listaDomiciliarios: domiciliarios || [],
    todosLosPedidos: todosLosPedidos || []
  };
}
