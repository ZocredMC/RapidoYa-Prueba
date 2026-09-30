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

// Escuchar cambios en tiempo real
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

// Cambiar estado del pedido y registrar asignación del domiciliario
export async function cambiarEstadoPedido(pedidoId, nuevoEstado, domiciliarioId) {
  const datosActualizacion = {
    estado: nuevoEstado
  };

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

// Obtener pedidos de un cliente asignando directamente los nombres reales de los domiciliarios
export async function obtenerPedidosCliente(clienteId) {
  // 1. Traer los pedidos del cliente
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!pedidos || pedidos.length === 0) return [];

  // 2. Traer todos los usuarios que son domiciliarios o admins para mapear sus nombres
  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, nombre');

  const mapaUsuarios = {};
  if (usuarios) {
    usuarios.forEach(u => {
      mapaUsuarios[u.id] = u.nombre;
    });
  }

  // 3. Adjuntar el nombre real directamente
  return pedidos.map(p => ({
    ...p,
    nombreDomiciliario: (p.domiciliario_id && mapaUsuarios[p.domiciliario_id]) 
      ? mapaUsuarios[p.domiciliario_id] 
      : null
  }));
}
