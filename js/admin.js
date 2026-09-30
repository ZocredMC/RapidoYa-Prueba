import { supabase } from './config.js';

// Calcula las 00:00:00 de hoy en la zona horaria de Colombia
function obtenerInicioHoyColombiaISO() {
  const ahora = new Date();
  const opciones = { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' };
  const partes = new Intl.DateTimeFormat('es-CO', opciones).formatToParts(ahora);
  
  const yyyy = partes.find(p => p.type === 'year').value;
  const mm = partes.find(p => p.type === 'month').value;
  const dd = partes.find(p => p.type === 'day').value;

  // Retorna ISO String correspondiente a medianoche en Colombia (-05:00)
  return `${yyyy}-${mm}-${dd}T00:00:00.000-05:00`;
}

// Cuadre diario del domiciliario (Reinicia a las 00:00 Hora Colombia)
export async function obtenerCuadreDiarioDomiciliario(domiciliarioId) {
  const inicioHoy = obtenerInicioHoyColombiaISO();

  const { data, error } = await supabase
    .from('pedidos')
    .select('precio')
    .eq('domiciliario_id', domiciliarioId)
    .eq('estado', 'completado')
    .gte('fecha_completado', inicioHoy);

  if (error) throw error;

  const totalRecaudado = data.reduce((sum, p) => sum + Number(p.precio || 0), 0);
  return {
    totalRecaudado,
    totalViajes: data.length
  };
}

// Estadísticas globales e historial por domiciliario para el Admin
export async function obtenerEstadisticasAdmin() {
  // 1. Obtener todos los pedidos
  const { data: pedidos, error: errP } = await supabase
    .from('pedidos')
    .select('*')
    .order('created_at', { ascending: false });

  if (errP) throw errP;

  // 2. Obtener todos los domiciliarios registrados
  const { data: domiciliarios, error: errD } = await supabase
    .from('usuarios')
    .select('*')
    .in('rol', ['domiciliario', 'admin']);

  if (errD) throw errD;

  const totalPedidos = pedidos.length;
  const pedidosCompletados = pedidos.filter(p => p.estado === 'completado');
  const totalVentas = pedidosCompletados.reduce((sum, p) => sum + Number(p.precio || 0), 0);

  const inicioHoy = obtenerInicioHoyColombiaISO();

  // 3. Mapear estado y rendimiento individual de cada domiciliario
  const rendimientoDomiciliarios = domiciliarios.map(dom => {
    const pedidosDom = pedidos.filter(p => p.domiciliario_id === dom.id);
    const completadosDom = pedidosDom.filter(p => p.estado === 'completado');
    const completadosHoy = completadosDom.filter(p => p.fecha_completado >= inicioHoy);
    
    const recaudoHoy = completadosHoy.reduce((sum, p) => sum + Number(p.precio || 0), 0);
    const recaudoHistorico = completadosDom.reduce((sum, p) => sum + Number(p.precio || 0), 0);

    return {
      id: dom.id,
      nombre: dom.nombre,
      username: dom.username,
      telefono: dom.telefono,
      estadoServicio: dom.estado_servicio || 'inactivo',
      viajesHoy: completadosHoy.length,
      recaudoHoy,
      viajesHistorico: completadosDom.length,
      recaudoHistorico,
      historialPedidos: pedidosDom
    };
  });

  return {
    totalPedidos,
    totalCompletados: pedidosCompletados.length,
    totalVentas,
    rendimientoDomiciliarios,
    todosLosPedidos: pedidos
  };
}
