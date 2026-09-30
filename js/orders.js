import { supabase } from './config.js';

// Crear pedido (admite tarifa fija o manual)
export async function crearPedido(datosPedido) {
  const { data, error } = await supabase
    .from('pedidos')
    .insert([datosPedido])
    .select();

  if (error) throw error;
  return data;
}

// Escuchar eventos en tiempo real
export function escucharNuevosPedidos(callback) {
  return supabase
    .channel('pedidos-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, (payload) => {
      callback(payload);
    })
    .subscribe();
}

// Escuchar cambios de estado de domiciliarios
export function escucharEstadoDomiciliarios(callback) {
  return supabase
    .channel('usuarios-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, (payload) => {
      callback(payload);
    })
    .subscribe();
}

// Obtener pedidos pendientes
export async function obtenerPedidosPendientes() {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Obtener pedidos activos de un domiciliario
export async function obtenerPedidosActivosDomiciliario(domiciliarioId) {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('domiciliario_id', domiciliarioId)
    .in('estado', ['aceptado', 'en_camino'])
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Cambiar estado de pedido y actualizar estado del domiciliario (Ocupado/Activo)
export async function cambiarEstadoPedido(pedidoId, nuevoEstado, domiciliarioId) {
  const datosActualizacion = { estado: nuevoEstado };
  const ahora = new Date().toISOString();

  if (nuevoEstado === 'aceptado') {
    datosActualizacion.domiciliario_id = domiciliarioId;
    datosActualizacion.fecha_aceptado = ahora;
    // Marcar domiciliario como OCUPADO
    await cambiarEstadoServicioDomiciliario(domiciliarioId, 'ocupado');
  } else if (nuevoEstado === 'en_camino') {
    datosActualizacion.fecha_en_camino = ahora;
  } else if (nuevoEstado === 'completado') {
    datosActualizacion.fecha_completado = ahora;
    // Al completar, si no tiene más pedidos activos, vuelve a ACTIVO
    const activos = await obtenerPedidosActivosDomiciliario(domiciliarioId);
    if (activos.length <= 1) {
      await cambiarEstadoServicioDomiciliario(domiciliarioId, 'activo');
    }
  }

  const { data, error } = await supabase
    .from('pedidos')
    .update(datosActualizacion)
    .eq('id', pedidoId)
    .select();

  if (error) throw error;
  return data;
}

// Cambiar el estado del servicio del domiciliario (activo, fuera_de_servicio, ocupado)
export async function cambiarEstadoServicioDomiciliario(domiciliarioId, estadoServicio) {
  const { data, error } = await supabase
    .from('usuarios')
    .update({ estado_servicio: estadoServicio })
    .eq('id', domiciliarioId);

  if (error) throw error;
  return data;
}

// Obtener historial de pedidos del cliente trayendo el nombre del domiciliario
export async function obtenerPedidosCliente(clienteId) {
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!pedidos || pedidos.length === 0) return [];

  // Mapear nombres de domiciliarios
  const { data: usuarios } = await supabase.from('usuarios').select('id, nombre');
  const mapaNombres = {};
  if (usuarios) {
    usuarios.forEach(u => { mapaNombres[u.id] = u.nombre; });
  }

  return pedidos.map(p => ({
    ...p,
    nombreDomiciliario: p.domiciliario_id ? (mapaNombres[p.domiciliario_id] || 'Domiciliario Asignado') : null
  }));
}
