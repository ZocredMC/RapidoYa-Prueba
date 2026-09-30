import { obtenerUsuarioActual, registrarUsuario, iniciarSesion, cerrarSesion } from './auth.js';
import { inicializarMapa, cotizarRuta, limpiarMapa } from './map.js';
import { NUMERO_WHATSAPP } from './config.js';
import { crearPedido, escucharNuevosPedidos, cambiarEstadoPedido, obtenerPedidosPendientes, obtenerPedidosActivosDomiciliario } from './orders.js';
import { obtenerCuadreDiarioDomiciliario, obtenerEstadisticasAdmin } from './admin.js';

let usuarioActual = null;
let datosCotizacionGlobal = null;
let modoAuth = 'login';

document.addEventListener('DOMContentLoaded', async () => {
  inicializarMapa('map');
  await verificarEstadoSesion();
  vincularEventosUI();
});

async function verificarEstadoSesion() {
  try {
    usuarioActual = await obtenerUsuarioActual();
    if (usuarioActual && usuarioActual.profile) {
      document.getElementById('guestButtons').style.display = 'none';
      document.getElementById('userBadge').style.display = 'block';
      const displayTag = usuarioActual.profile.username ? `@${usuarioActual.profile.username}` : usuarioActual.profile.nombre;
      document.getElementById('userNameTxt').innerText = `👋 ${displayTag} (${usuarioActual.profile.rol || 'cliente'})`;

      // Renderizar vista según el ROL
      configurarVistaSegunRol(usuarioActual.profile.rol);
    } else {
      document.getElementById('guestButtons').style.display = 'block';
      document.getElementById('userBadge').style.display = 'none';
      configurarVistaSegunRol('cliente');
    }
  } catch (err) {
    console.error("Error al cargar sesión:", err);
  }
}

async function configurarVistaSegunRol(rol) {
  const pCliente = document.getElementById('panelCliente');
  const pDom = document.getElementById('panelDomiciliario');
  const pAdmin = document.getElementById('panelAdmin');

  pCliente.style.display = 'none';
  pDom.style.display = 'none';
  pAdmin.style.display = 'none';

  if (rol === 'domiciliario') {
    pDom.style.display = 'block';
    cargarVistaDomiciliario();
  } else if (rol === 'admin') {
    pAdmin.style.display = 'block';
    cargarVistaAdmin();
  } else {
    pCliente.style.display = 'block';
  }
}

// ---------------- PANEL DOMICILIARIO ----------------
async function cargarVistaDomiciliario() {
  actualizarCuadreDiario();
  cargarListasPedidos();

  // Escuchar nuevos pedidos en tiempo real
  escucharNuevosPedidos((pedido) => {
    // Alerta sonora / recarga de listas
    cargarListasPedidos();
    actualizarCuadreDiario();
  });
}

async function actualizarCuadreDiario() {
  if (!usuarioActual) return;
  const cuadre = await obtenerCuadreDiarioDomiciliario(usuarioActual.id);
  document.getElementById('cuadreDiarioTxt').innerText = cuadre.totalRecaudado.toLocaleString('es-CO');
  document.getElementById('conteoEntregasTxt').innerText = cuadre.totalViajes;
}

async function cargarListasPedidos() {
  const pendientes = await obtenerPedidosPendientes();
  const activos = await obtenerPedidosActivosDomiciliario(usuarioActual.id);

  const contPendientes = document.getElementById('listaPedidosPendientes');
  const contActivos = document.getElementById('listaPedidosActivos');

  contPendientes.innerHTML = pendientes.length ? '' : '<p style="color: #888;">No hay pedidos pendientes en la ciudad.</p>';
  pendientes.forEach(p => {
    contPendientes.appendChild(crearCardPedido(p, 'pendiente'));
  });

  contActivos.innerHTML = activos.length ? '' : '<p style="color: #888;">Sin pedidos activos en este momento.</p>';
  activos.forEach(p => {
    contActivos.appendChild(crearCardPedido(p, p.estado));
  });
}

function crearCardPedido(p, tipoEstado) {
  const card = document.createElement('div');
  card.style.cssText = "background: #2a2a2a; border: 1px solid #444; border-radius: 8px; padding: 12px; margin-bottom: 10px;";
  
  let html = `<p><strong>📍 Recoger:</strong> ${p.origen_barrio} (${p.origen_direccion})</p>
              <p><strong>🏁 Entregar:</strong> ${p.destino_barrio} (${p.destino_direccion})</p>
              <p><strong>💰 Tarifa:</strong> $${Number(p.precio).toLocaleString('es-CO')} COP (${p.distancia_km} km)</p>
              <p><strong>👤 Cliente:</strong> ${p.cliente_nombre} - ${p.cliente_telefono}</p>
              <p style="color:#aaa; font-size:0.8rem;">📝 ${p.observaciones || 'Sin detalles'}</p>`;

  if (tipoEstado === 'pendiente') {
    html += `<button class="btn btn-primary" style="margin-top: 8px;" id="btnAceptar_${p.id}">Aceptar Pedido</button>`;
  } else if (tipoEstado === 'aceptado') {
    html += `<button class="btn btn-primary" style="margin-top: 8px;" id="btnEnCamino_${p.id}">Marcar En Camino</button>`;
  } else if (tipoEstado === 'en_camino') {
    html += `<button class="btn btn-whatsapp" style="margin-top: 8px;" id="btnCompletado_${p.id}">Confirmar Entrega y Cobro</button>`;
  }

  card.innerHTML = html;

  setTimeout(() => {
    if (document.getElementById(`btnAceptar_${p.id}`)) {
      document.getElementById(`btnAceptar_${p.id}`).onclick = () => procesarCambioEstado(p.id, 'aceptado');
    }
    if (document.getElementById(`btnEnCamino_${p.id}`)) {
      document.getElementById(`btnEnCamino_${p.id}`).onclick = () => procesarCambioEstado(p.id, 'en_camino');
    }
    if (document.getElementById(`btnCompletado_${p.id}`)) {
      document.getElementById(`btnCompletado_${p.id}`).onclick = () => procesarCambioEstado(p.id, 'completado');
    }
  }, 100);

  return card;
}

async function procesarCambioEstado(pedidoId, nuevoEstado) {
  try {
    await cambiarEstadoPedido(pedidoId, nuevoEstado, usuarioActual.id);
    await cargarListasPedidos();
    await actualizarCuadreDiario();
  } catch (err) {
    alert("Error al actualizar el pedido: " + err.message);
  }
}

// ---------------- PANEL ADMIN ----------------
async function cargarVistaAdmin() {
  const stats = await obtenerEstadisticasAdmin();
  document.getElementById('adminTotalVentas').innerText = stats.totalVentas.toLocaleString('es-CO');
  document.getElementById('adminTotalPedidos').innerText = stats.totalPedidos;
  document.getElementById('adminTotalCompletados').innerText = stats.totalCompletados;

  const contRendimiento = document.getElementById('listaRendimientoDomiciliarios');
  contRendimiento.innerHTML = '';

  stats.rendimientoDomiciliarios.forEach(d => {
    const item = document.createElement('div');
    item.style.cssText = "background: #2a2a2a; border-left: 4px solid #00ff88; padding: 10px; margin-bottom: 8px; border-radius: 4px;";
    item.innerHTML = `<p><strong>${d.nombre}</strong></p>
                      <p style="font-size:0.85rem; color:#ccc;">Viajes completados: ${d.viajes} | Recaudado: $${d.total.toLocaleString('es-CO')} COP</p>`;
    contRendimiento.appendChild(item);
  });
}

function vincularEventosUI() {
  document.getElementById('btnCalcular').addEventListener('click', manejarCotizacion);
  document.getElementById('btnHacerPedido').addEventListener('click', manejarPreguntaOModal);
  document.getElementById('btnEnviarWhatsApp').addEventListener('click', enviarWhatsApp);
  document.getElementById('btnAuthSubmit').addEventListener('click', manejarSubmitAuth);
  document.getElementById('btnCerrarSesion')?.addEventListener('click', async () => {
    await cerrarSesion();
    location.reload();
  });
}

async function manejarCotizacion() {
  const origen = document.getElementById('origenInput').value.trim();
  const destino = document.getElementById('destinoInput').value.trim();

  if (!origen || !destino) {
    alert("Por favor escribe el barrio de origen y el de destino.");
    return;
  }

  try {
    datosCotizacionGlobal = await cotizarRuta(origen, destino);
    document.getElementById('distanciaTxt').innerText = datosCotizacionGlobal.distanciaKm;
    document.getElementById('precioTxt').innerText = datosCotizacionGlobal.precio.toLocaleString('es-CO');
    document.getElementById('resultBox').style.display = 'block';
  } catch (error) {
    alert(error.message);
  }
}

function manejarPreguntaOModal() {
  if (!usuarioActual) {
    document.getElementById('modalPreguntaInvitado').style.display = 'flex';
  } else {
    abrirModalPedido();
  }
}

window.abrirModalPedido = function() {
  document.getElementById('barrioOrigenModal').value = datosCotizacionGlobal.origen;
  document.getElementById('barrioDestinoModal').value = datosCotizacionGlobal.destino;

  if (usuarioActual && usuarioActual.profile) {
    document.getElementById('clienteNombre').value = usuarioActual.profile.nombre || '';
    document.getElementById('clienteTelefono').value = usuarioActual.profile.telefono || '';
    document.getElementById('dirExactaOrigen').value = usuarioActual.profile.direccion || '';
  }

  document.getElementById('modalPedido').style.display = 'flex';
};

window.abrirAuthModal = function(modo) {
  modoAuth = modo;
  document.getElementById('modalAuth').style.display = 'flex';
  const esRegistro = modo === 'register';
  
  document.getElementById('authModalTitle').innerText = esRegistro ? 'Crear Cuenta' : 'Iniciar Sesión';
  document.getElementById('groupUsername').style.display = esRegistro ? 'block' : 'none';
  document.getElementById('groupNombre').style.display = esRegistro ? 'block' : 'none';
  document.getElementById('groupTelefono').style.display = esRegistro ? 'block' : 'none';
  document.getElementById('groupDireccion').style.display = esRegistro ? 'block' : 'none';
  document.getElementById('btnAuthSubmit').innerText = esRegistro ? 'Registrarse' : 'Ingresar';
};

window.cerrarModal = function(modalId) {
  document.getElementById(modalId).style.display = 'none';
};

async function manejarSubmitAuth() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value.trim();

  try {
    if (modoAuth === 'register') {
      const username = document.getElementById('authUsername').value;
      const nombre = document.getElementById('authNombre').value;
      const telefono = document.getElementById('authTelefono').value;
      const direccion = document.getElementById('authDireccion').value;

      if (!email || !password || !username || !nombre || !telefono) {
        alert("Por favor completa todos los campos requeridos.");
        return;
      }

      await registrarUsuario({ email, password, username, nombre, telefono, direccion });
      alert("¡Registro exitoso!");
    } else {
      await iniciarSesion(email, password);
    }
    location.reload();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function enviarWhatsApp() {
  const nombre = document.getElementById('clienteNombre').value.trim();
  const telefono = document.getElementById('clienteTelefono').value.trim();
  const dirOrigen = document.getElementById('dirExactaOrigen').value.trim();
  const dirDestino = document.getElementById('dirExactaDestino').value.trim();
  const obs = document.getElementById('observacionesInput').value.trim() || "Sin observaciones";

  if (!nombre || !telefono || !dirOrigen || !dirDestino) {
    alert("Por favor completa tu nombre, teléfono y las direcciones exactas.");
    return;
  }

  try {
    // 1. Guardar pedido en Supabase
    await crearPedido({
      cliente_id: usuarioActual ? usuarioActual.id : null,
      cliente_nombre: nombre,
      cliente_telefono: telefono,
      origen_barrio: datosCotizacionGlobal.origen,
      origen_direccion: dirOrigen,
      destino_barrio: datosCotizacionGlobal.destino,
      destino_direccion: dirDestino,
      distancia_km: datosCotizacionGlobal.distanciaKm,
      precio: datosCotizacionGlobal.precio,
      observaciones: obs,
      estado: 'pendiente'
    });

    // 2. Redirigir a WhatsApp
    const userTag = (usuarioActual && usuarioActual.profile && usuarioActual.profile.username)
      ? ` (@${usuarioActual.profile.username})`
      : '';

    const mensajeTexto = `🚴‍♂ *¡NUEVO DOMICILIO - TULUÁ EXPRESS!*\n\n` +
      `👤 *Cliente:* ${nombre}${userTag}\n` +
      `📞 *Teléfono:* ${telefono}\n\n` +
      `📍 *RECOGER EN:*\n` +
      `• Barrio: ${datosCotizacionGlobal.origen}\n` +
      `• Dirección Exacta: ${dirOrigen}\n\n` +
      `🏁 *ENTREGAR EN:*\n` +
      `• Barrio: ${datosCotizacionGlobal.destino}\n` +
      `• Dirección Exacta: ${dirDestino}\n\n` +
      `📏 *Distancia:* ${datosCotizacionGlobal.distanciaKm} km\n` +
      `💰 *VALOR A COBRAR:* $${datosCotizacionGlobal.precio.toLocaleString('es-CO')} COP\n\n` +
      `📝 *Observaciones:* ${obs}`;

    const urlWhatsApp = `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(mensajeTexto)}`;
    
    window.open(urlWhatsApp, '_blank');
    window.cerrarModal('modalPedido');
    reiniciarCotizador();
  } catch (error) {
    alert("Error al registrar el pedido: " + error.message);
  }
}

function reiniciarCotizador() {
  document.getElementById('origenInput').value = '';
  document.getElementById('destinoInput').value = '';
  document.getElementById('dirExactaOrigen').value = '';
  document.getElementById('dirExactaDestino').value = '';
  document.getElementById('observacionesInput').value = '';
  document.getElementById('resultBox').style.display = 'none';
  limpiarMapa();
  datosCotizacionGlobal = null;
}
