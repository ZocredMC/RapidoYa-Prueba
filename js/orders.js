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
  const { data, error } = await supabase
    .from('pedidos')
    .select('*, domiciliario:usuarios!pedidos_domiciliario_id_fkey(nombre, username)')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}
