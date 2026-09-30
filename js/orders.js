import { supabase } from './config.js';

// Crear un nuevo pedido
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

// Cambiar el estado de un pedido y registrar el domiciliario que lo aceptó
export async function cambiarEstadoPedido(pedidoId, nuevoEstado, domiciliarioId) {
  const datosActualizacion = {
    estado: nuevoEstado
  };

  // Se asigna el ID del domiciliario desde el momento en que interactúa
  if (domiciliarioId) {
    datosActualizacion.domiciliario_id = domiciliarioId;
  }

  // Marcar fechas de cambio de estado
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

// Obtener historial de pedidos del cliente mostrando su nombre real
export async function obtenerPedidosCliente(clienteId) {
  // 1. Obtener pedidos del cliente
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!pedidos || pedidos.length === 0) return [];

  // 2. Extraer los IDs de domiciliarios
  const domiciliariosIds = [...new Set(pedidos.map(p => p.domiciliario_id).filter(Boolean))];

  if (domiciliariosIds.length > 0) {
    // 3. Consultar el nombre real en la tabla usuarios
    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('id, nombre')
      .in('id', domiciliariosIds);

    if (usuarios) {
      const mapaUsuarios = {};
      usuarios.forEach(u => { mapaUsuarios[u.id] = u; });

      return pedidos.map(p => ({
        ...p,
        domiciliario: p.domiciliario_id ? mapaUsuarios[p.domiciliario_id] : null
      }));
    }
  }

  return pedidos;
}
