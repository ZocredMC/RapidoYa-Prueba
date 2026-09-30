import { obtenerUsuarioActual, registrarUsuario, iniciarSesion, cerrarSesion } from './auth.js';
import { inicializarMapa, cotizarRuta, limpiarMapa } from './map.js';
import { NUMERO_WHATSAPP } from './config.js';
import { 
  crearPedido, 
  escucharNuevosPedidos, 
  cambiarEstadoPedido, 
  obtenerPedidosPendientes, 
  obtenerPedidosActivosDomiciliario, 
  obtenerPedidosCliente,
  cambiarEstadoDisponibilidadDomiciliario
} from './orders.js';
import { obtenerCuadreDiarioDomiciliario, obtenerEstadisticasAdmin } from './admin.js';

let usuarioActual = null;
let datosCotizacionGlobal = null;
let modoAuth = 'login';
let esCotizacionManual = false;
let datosAdminCache = null;

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

      if (usuarioActual.profile.estado_servicio) {
        document.getElementById('selectEstadoDomiciliario').value = usuarioActual.profile.estado_servicio;
      }

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
    pDom.style.display = 'block';
    cargarVistaAdmin();
    cargarVistaDomiciliario();
  } else {
    pCliente.style.display = 'block';
  }
}

// ---------------- MODO MANUAL O MAPA ----------------
function activarModoCotizacion(manual) {
  esCotizacionManual = manual;
  const mapaDiv = document.getElementById('map');
  const distCont = document.getElementById('distanciaCont');

  if (manual) {
    mapaDiv.style.display = 'none';
    distCont.style.display = 'none';
    document.getElementById('precioTxt').innerText = "El operador te dará el valor";
    document.getElementById('resultBox').style.display = 'block';
  } else {
    mapaDiv.style.display = 'block';
    distCont.style.display = 'block';
    document.getElementById('resultBox').style.display = 'none';
  }
}

// ---------------- VER MIS PEDIDOS (CLIENTE) ----------------
async function abrirModalMisPedidos() {
  if (!usuarioActual) return;
  
  document.getElementById('modalMisPedidos').style.display = 'flex';
  const contList = document.getElementById('contenedorMisPedidosList');
  contList.innerHTML = '<p style="color:#888;">Cargando pedidos...</p>';

  try {
    const pedidos = await obtenerPedidosCliente(usuarioActual.id);
    if (!pedidos.length) {
      contList.innerHTML = '<p style="color:#888;">Aún no has realizado pedidos.</p>';
      return;
    }

    contList.innerHTML = '';
    pedidos.forEach(p => {
      const card = document.createElement('div');
      card.style.cssText = "background: #2a2a2a; border: 1px solid #444; border-radius: 8px; padding: 12px; margin-bottom: 10px;";

      let badgeEstado = '';
      if (p.estado === 'pendiente') badgeEstado = '<span style="color:#ffcc00; font-weight:bold;">⏳ Pendiente</span>';
      else if (p.estado === 'aceptado') badgeEstado = '<span style="color:#00ccff; font-weight:bold;">🛵 Aceptado</span>';
      else if (p.estado === 'en_camino') badgeEstado = '<span style="color:#ff9900; font-weight:bold;">🚀 En Camino</span>';
      else if (p.estado === 'completado') badgeEstado = '<span style="color:#00ff88; font-weight:bold;">✅ Entregado</span>';

      const domNombre = (p.domiciliario && p.domiciliario.nombre) ? p.domiciliario.nombre : 'Buscando domiciliario...';
      const fechaFormat = new Date(p.created_at).toLocaleString('es-CO');
      const precioMostrar = p.precio === 0 ? "Por definir por el operador" : `$${Number(p.precio).toLocaleString('es-CO')} COP`;

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 5px;">
          <small style="color:#888;">${fechaFormat}</small>
          <div>${badgeEstado}</div>
        </div>
        <p><strong>📍 Recogida:</strong> ${p.origen_barrio} (${p.origen_direccion})</p>
        <p><strong>🏁 Entrega:</strong> ${p.destino_barrio} (${p.destino_direccion})</p>
        <p><strong>💰 Tarifa:</strong> ${precioMostrar}</p>
        <p><strong>🛵 Domiciliario Asignado:</strong> ${domNombre}</p>
      `;
      contList.appendChild(card);
    });
  } catch (err) {
    contList.innerHTML = `<p style="color:#ff5555;">Error al cargar pedidos: ${err.message}</p>`;
  }
}

// ---------------- PANEL DOMICILIARIO ----------------
async function cargarVistaDomiciliario() {
  actualizarCuadreDiario();
  cargarListasPedidos();

  escucharNuevosPedidos(() => {
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
  
  const precioMostrar = p.precio === 0 ? "A convenir con operador" : `$${Number(p.precio).toLocaleString('es-CO')} COP`;

  let html = `<p><strong>📍 Recoger:</strong> ${p.origen_barrio} (${p.origen_direccion})</p>
              <p><strong>🏁 Entregar:</strong> ${p.destino_barrio} (${p.destino_direccion})</p>
              <p><strong>💰 Tarifa:</strong> ${precioMostrar} (${p.distancia_km || 0} km)</p>
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

// ---------------- PANEL ADMIN GLOBAL ----------------
async function cargarVistaAdmin() {
  datosAdminCache = await obtenerEstadisticasAdmin();
  document.getElementById('adminTotalVentas').innerText = datosAdminCache.totalVentas.toLocaleString('es-CO');
  document.getElementById('adminTotalPedidos').innerText = datosAdminCache.totalPedidos;
  document.getElementById('adminTotalCompletados').innerText = datosAdminCache.totalCompletados;

  const contRendimiento = document.getElementById('listaRendimientoDomiciliarios');
  const selectFiltro = document.getElementById('selectFiltroDomiciliario');

  contRendimiento.innerHTML = '';
  selectFiltro.innerHTML = '<option value="">-- Selecciona un domiciliario --</option>';

  datosAdminCache.rendimientoDomiciliarios.forEach(d => {
    let badgeEstado = '🔴 Fuera de Servicio';
    if (d.estadoServicio === 'activo') badgeEstado = '🟢 Activo';
    else if (d.estadoServicio === 'ocupado') badgeEstado = '🟠 Ocupado';

    const item = document.createElement('div');
    item.style.cssText = "background: #2a2a2a; border-left: 4px solid #00ff88; padding: 10px; margin-bottom: 8px; border-radius: 4px;";
    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <p><strong>${d.nombre}</strong> (@${d.username || 'sin_user'})</p>
        <span style="font-size:0.8rem; font-weight:bold;">${badgeEstado}</span>
      </div>
      <p style="font-size:0.85rem; color:#ccc; margin-top:5px;">
        📅 <strong>Hoy:</strong> ${d.viajesHoy} viajes | $${d.recaudoHoy.toLocaleString('es-CO')} COP<br>
        📈 <strong>Histórico Total:</strong> ${d.viajesHistorico} viajes | $${d.recaudoHistorico.toLocaleString('es-CO')} COP
      </p>
    `;
    contRendimiento.appendChild(item);

    const opt = document.createElement('option');
    opt.value = d.id;
    opt.innerText = `${d.nombre} (${badgeEstado})`;
    selectFiltro.appendChild(opt);
  });
}

function filtrarHistoricoDomiciliario(domId) {
  const cont = document.getElementById('contenedorHistoricoDomiciliario');
  cont.innerHTML = '';

  if (!domId || !datosAdminCache) return;

  const dom = datosAdminCache.rendimientoDomiciliarios.find(d => d.id === domId);
  if (!dom || !dom.historialPedidos.length) {
    cont.innerHTML = '<p style="color:#888;">Este domiciliario no tiene entregas registradas.</p>';
    return;
  }

  dom.historialPedidos.forEach(p => {
    const card = document.createElement('div');
    card.style.cssText = "background: #222; border: 1px solid #444; padding: 10px; margin-bottom: 8px; border-radius: 4px;";
    
    const fecha = new Date(p.created_at).toLocaleString('es-CO');
    const precio = p.precio === 0 ? "Manual/Operador" : `$${Number(p.precio).toLocaleString('es-CO')} COP`;

    card.innerHTML = `
      <small style="color:#888;">${fecha} - Estado: ${p.estado}</small>
      <p><strong>Origen:</strong> ${p.origen_barrio} | <strong>Destino:</strong> ${p.destino_barrio}</p>
      <p><strong>Cobrado:</strong> ${precio} | <strong>Cliente:</strong> ${p.cliente_nombre}</p>
    `;
    cont.appendChild(card);
  });
}

function vincularEventosUI() {
  document.getElementById('btnCalcular').addEventListener('click', manejarCotizacion);
  document.getElementById('btnHacerPedido').addEventListener('click', manejarPreguntaOModal);
  document.getElementById('btnEnviarWhatsApp').addEventListener('click', enviarWhatsApp);
  document.getElementById('btnAuthSubmit').addEventListener('click', manejarSubmitAuth);
  document.getElementById('btnMisPedidosCliente')?.addEventListener('click', abrirModalMisPedidos);
  
  document.getElementById('btnModoMapa').addEventListener('click', () => activarModoCotizacion(false));
  document.getElementById('btnModoManual').addEventListener('click', () => activarModoCotizacion(true));

  document.getElementById('selectEstadoDomiciliario')?.addEventListener('change', async (e) => {
    if (!usuarioActual) return;
    try {
      await cambiarEstadoDisponibilidadDomiciliario(usuarioActual.id, e.target.value);
    } catch (err) {
      alert("Error al actualizar disponibilidad: " + err.message);
    }
  });

  document.getElementById('selectFiltroDomiciliario')?.addEventListener('change', (e) => {
    filtrarHistoricoDomiciliario(e.target.value);
  });

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

  if (esCotizacionManual) {
    datosCotizacionGlobal = { origen, destino, distanciaKm: 0, precio: 0 };
    document.getElementById('precioTxt').innerText = "El operador te dará el valor";
    document.getElementById('resultBox').style.display = 'block';
    return;
  }

  try {
    datosCotizacionGlobal = await cotizarRuta(origen, destino);
    document.getElementById('distanciaTxt').innerText = datosCotizacionGlobal.distanciaKm;
    document.getElementById('precioTxt').innerText = `$${datosCotizacionGlobal.precio.toLocaleString('es-CO')} COP`;
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
  const origen = document.getElementById('origenInput').value.trim();
  const destino = document.getElementById('destinoInput').value.trim();

  document.getElementById('barrioOrigenModal').value = datosCotizacionGlobal ? datosCotizacionGlobal.origen : origen;
  document.getElementById('barrioDestinoModal').value = datosCotizacionGlobal ? datosCotizacionGlobal.destino : destino;

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

  const origen = datosCotizacionGlobal ? datosCotizacionGlobal.origen : document.getElementById('origenInput').value.trim();
  const destino = datosCotizacionGlobal ? datosCotizacionGlobal.destino : document.getElementById('destinoInput').value.trim();
  const precio = datosCotizacionGlobal ? datosCotizacionGlobal.precio : 0;
  const distancia = datosCotizacionGlobal ? datosCotizacionGlobal.distanciaKm : 0;

  if (!nombre || !telefono || !dirOrigen || !dirDestino) {
    alert("Por favor completa tu nombre, teléfono y las direcciones exactas.");
    return;
  }

  try {
    await crearPedido({
      cliente_id: usuarioActual ? usuarioActual.id : null,
      cliente_nombre: nombre,
      cliente_telefono: telefono,
      origen_barrio: origen,
      origen_direccion: dirOrigen,
      destino_barrio: destino,
      destino_direccion: dirDestino,
      distancia_km: distancia,
      precio: precio,
      observaciones: obs,
      estado: 'pendiente'
    });

    const userTag = (usuarioActual && usuarioActual.profile && usuarioActual.profile.username)
      ? ` (@${usuarioActual.profile.username})`
      : '';

    const precioTexto = precio === 0 ? "Por definir por operador" : `$${precio.toLocaleString('es-CO')} COP`;

    const mensajeTexto = `🚴‍♂ *¡NUEVO DOMICILIO - TULUÁ EXPRESS!*\n\n` +
      `👤 *Cliente:* ${nombre}${userTag}\n` +
      `📞 *Teléfono:* ${telefono}\n\n` +
      `📍 *RECOGER EN:*\n` +
      `• Barrio: ${origen}\n` +
      `• Dirección Exacta: ${dirOrigen}\n\n` +
      `🏁 *ENTREGAR EN:*\n` +
      `• Barrio: ${destino}\n` +
      `• Dirección Exacta: ${dirDestino}\n\n` +
      `📏 *Distancia:* ${distancia} km\n` +
      `💰 *VALOR A COBRAR:* ${precioTexto}\n\n` +
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
  activarModoCotizacion(false);
}
