import { supabase } from './config.js';

// Calcular cuadre diario para un domiciliario específico
export async function obtenerCuadreDiarioDomiciliario(domiciliarioId) {
  const hoyInicio = new Date();
  hoyInicio.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('pedidos')
    .select('precio, fecha_completado')
    .eq('domiciliario_id', domiciliarioId)
    .eq('estado', 'completado')
    .gte('fecha_completado', hoyInicio.toISOString());

  if (error) throw error;

  const totalViajes = data.length;
  const totalRecaudado = data.reduce((sum, item) => sum + Number(item.precio), 0);

  return { totalViajes, totalRecaudado };
}

// Obtener estadísticas métricas globales (Para el Administrador)
export async function obtenerEstadisticasAdmin() {
  const { data: todosLosPedidos, error } = await supabase
    .from('pedidos')
    .select('*, domiciliario:usuarios!pedidos_domiciliario_id_fkey(nombre, username)');

  if (error) throw error;

  const totalPedidos = todosLosPedidos.length;
  const completados = todosLosPedidos.filter(p => p.estado === 'completado');
  const totalVentas = completados.reduce((sum, p) => sum + Number(p.precio), 0);

  // Agrupar rendimiento por domiciliario
  const rendimientoDomiciliarios = {};
  completados.forEach(p => {
    const domId = p.domiciliario_id;
    const nombreDom = p.domiciliario ? `@${p.domiciliario.username}` : 'Sin Asignar';
    
    if (!rendimientoDomiciliarios[domId]) {
      rendimientoDomiciliarios[domId] = { nombre: nombreDom, viajes: 0, total: 0 };
    }
    rendimientoDomiciliarios[domId].viajes += 1;
    rendimientoDomiciliarios[domId].total += Number(p.precio);
  });

  return {
    totalPedidos,
    totalCompletados: completados.length,
    totalVentas,
    rendimientoDomiciliarios: Object.values(rendimientoDomiciliarios)
  };
}
