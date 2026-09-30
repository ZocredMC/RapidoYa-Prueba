import { supabase } from './config.js';

// Crear un nuevo pedido (Soporta tarifa calculada o manual)
export async function crearPedido(datosPedido) {
  const { data, error } = await supabase
    .from('pedidos')
    .insert([datosPedido])
    .select();

  if (error) throw error;
  return data;
}

// Escuchar cambios en tiempo real en la tabla pedidos
export function escucharNuevosPedidos(callback) {
  return supabase
    .channel('pedidos-channel')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pedidos' },
      (payload) => {
        callback(payload);
      }
    )
    .subscribe();
}

// Obtener pedidos pendientes de asignación
export async function obtenerPedidosPendientes() {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Obtener pedidos activos tomados por un domiciliario
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

// Cambiar estado de pedido asignando el domiciliario desde la aceptación
export async function cambiarEstadoPedido(pedidoId, nuevoEstado, domiciliarioId) {
  const datosActualizacion = { estado: nuevoEstado };

  if (domiciliarioId) {
    datosActualizacion.domiciliario_id = domiciliarioId;
  }

  const ahora = new Date().toISOString();
  if (nuevoEstado === 'aceptado') {
    datosActualizacion.fecha_aceptado = ahora;
  } else if (nuevoEstado === 'en_camino') {
    datosActualizacion.fecha_en_camino = ahora;
  } else if (nuevoEstado === 'completado') {
    datosActualizacion.fecha_completado = ahora;
  }

  const { data, error } = await supabase
    .from('pedidos')
    .update(datosActualizacion)
    .eq('id', pedidoId)
    .select();

  if (error) throw error;
  return data;
}

// Obtener pedidos del cliente trayendo el nombre del domiciliario mediante la Foreign Key
export async function obtenerPedidosCliente(clienteId) {
  const { data, error } = await supabase
    .from('pedidos')
    .select(`
      *,
      domiciliario:usuarios!fk_pedidos_domiciliario(nombre, username)
    `)
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Cambiar estado de disponibilidad del domiciliario
export async function cambiarEstadoDisponibilidadDomiciliario(domiciliarioId, nuevoEstado) {
  const { data, error } = await supabase
    .from('usuarios')
    .update({ estado_servicio: nuevoEstado })
    .eq('id', domiciliarioId)
    .select();

  if (error) throw error;
  return data;
}
