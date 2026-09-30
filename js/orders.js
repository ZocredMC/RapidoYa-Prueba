import { supabase } from './config.js';

let canalRealtime = null;

// Crear un nuevo pedido en la base de datos
export async function crearPedido(datosPedido) {
  const { data, error } = await supabase
    .from('pedidos')
    .insert([datosPedido])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Escuchar nuevos pedidos en Tiempo Real (Para Domiciliarios y Admins)
export function escucharNuevosPedidos(callbackAlerta) {
  if (canalRealtime) supabase.removeChannel(canalRealtime);

  canalRealtime = supabase
    .channel('cambios-pedidos')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pedidos' },
      (payload) => {
        callbackAlerta(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pedidos' },
      (payload) => {
        callbackAlerta(payload.new);
      }
    )
    .subscribe();
}

// Cambiar estado del pedido ('aceptado', 'en_camino', 'completado', 'cancelado')
export async function cambiarEstadoPedido(pedidoId, nuevoEstado, domiciliarioId = null) {
  const datosUpdate = { estado: nuevoEstado };

  if (nuevoEstado === 'aceptado') {
    datosUpdate.domiciliario_id = domiciliarioId;
    datosUpdate.fecha_aceptado = new Date().toISOString();
  } else if (nuevoEstado === 'en_camino') {
    datosUpdate.fecha_en_camino = new Date().toISOString();
  } else if (nuevoEstado === 'completado') {
    datosUpdate.fecha_completado = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('pedidos')
    .update(datosUpdate)
    .eq('id', pedidoId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Obtener pedidos pendientes para la bolsa de domiciliarios
export async function obtenerPedidosPendientes() {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Obtener pedidos activos de un domiciliario especifico
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

// Obtener historial de pedidos de un cliente
export async function obtenerPedidosCliente(clienteId) {
  // 1. Obtener los pedidos del cliente
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!pedidos || pedidos.length === 0) return [];

  // 2. Extraer los IDs de domiciliarios asignados
  const domiciliariosIds = [...new Set(pedidos.map(p => p.domiciliario_id).filter(Boolean))];

  if (domiciliariosIds.length > 0) {
    // 3. Consultar los datos de esos domiciliarios en la tabla usuarios
    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('id, nombre, username')
      .in('id', domiciliariosIds);

    if (usuarios) {
      const mapaUsuarios = {};
      usuarios.forEach(u => { mapaUsuarios[u.id] = u; });

      // 4. Adjuntar el domiciliario correspondiente a cada pedido
      return pedidos.map(p => ({
        ...p,
        domiciliario: p.domiciliario_id ? mapaUsuarios[p.domiciliario_id] : null
      }));
    }
  }

  return pedidos;
}
