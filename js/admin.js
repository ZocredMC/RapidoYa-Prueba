import { supabase } from './config.js';

function obtenerInicioDiaColombiaISO() {
  const ahora = new Date();
  const fechaCo = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(ahora);

  const [m, d, y] = fechaCo.split('/');
  return new Date(`${y}-${m}-${d}T00:00:00-05:00`).toISOString();
}

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

export async function obtenerEstadisticasAdmin() {
  const inicioDia = obtenerInicioDiaColombiaISO();

  // 1. Consultar todos los usuarios para mostrar la lista en el Admin
  const { data: usuariosTotal, error: errUsers } = await supabase
    .from('usuarios')
    .select('*')
    .order('nombre', { ascending: true });

  if (errUsers) console.error("Error cargando usuarios admin:", errUsers);

  // 2. Pedidos de hoy
  const { data: pedidosHoy } = await supabase
    .from('pedidos')
    .select('*')
    .gte('created_at', inicioDia);

  // 3. Todos los pedidos históricos
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
    listaDomiciliarios: usuariosTotal || [],
    todosLosPedidos: todosLosPedidos || []
  };
}
