import { obtenerUsuarioActual, registrarUsuario, iniciarSesion, cerrarSesion } from './auth.js';
import { inicializarMapa, cotizarRuta, limpiarMapa } from './map.js';
import { NUMERO_WHATSAPP } from './config.js';
import { 
  crearPedido, 
  escucharNuevosPedidos, 
  escucharEstadoDomiciliarios,
  cambiarEstadoPedido, 
  cambiarEstadoServicioDomiciliario,
  obtenerPedidosPendientes, 
  obtenerPedidosActivosDomiciliario, 
  obtenerPedidosCliente 
} from './orders.js';
import { obtenerCuadreDiarioDomiciliario, obtenerEstadisticasAdmin } from './admin.js';

let usuarioActual = null;
let datosCotizacionGlobal = null;
let modoAuth = 'login';
let esCotizacionManual = false;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    inicializarMapa('map');
  } catch (e) {
    console.error("Error al inicializar mapa:", e);
  }
  await verificarEstadoSesion();
  vincularEventosUI();
});

async function verificarEstadoSesion() {
  try {
    usuarioActual = await obtenerUsuarioActual();
    if (usuarioActual && usuarioActual.profile) {
      const guestBtn = document.getElementById('guestButtons');
      const userBadge = document.getElementById('userBadge');
      if (guestBtn) guestBtn.style.display = 'none';
      if (userBadge) userBadge.style.display = 'block';

      const displayTag = usuarioActual.profile.username ? `@${usuarioActual.profile.username}` : usuarioActual.profile.nombre;
      const userNameTxt = document.getElementById('userNameTxt');
      if (userNameTxt) userNameTxt.innerText = `👋 ${displayTag} (${usuarioActual.profile.rol || 'cliente'})`;

      configurarVistaSegunRol(usuarioActual.profile.rol);
    } else {
      const guestBtn = document.getElementById('guestButtons');
      const userBadge = document.getElementById('userBadge');
      if (guestBtn) guestBtn.style.display = 'block';
      if (userBadge) userBadge.style.display = 'none';
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

  if (pCliente) pCliente.style.display = 'none';
  if (pDom) pDom.style.display = 'none';
  if (pAdmin) pAdmin.style.display = 'none';

  if (rol === 'domiciliario') {
    if (pDom) pDom.style.display = 'block';
    cargarVistaDomiciliario();
  } else if (rol === 'admin') {
    if (pAdmin) pAdmin.style.display = 'block';
    cargarVistaAdmin();
  } else {
    if (pCliente) pCliente.style.display = 'block';
  }
}

// ---------------- VER MIS PEDIDOS (CLIENTE) ----------------
async function abrirModalMisPedidos() {
  if (!usuarioActual) return;
  
  const modal = document.getElementById('modalMisPedidos');
  if (modal) modal.style.display = 'flex';
  const contList = document.getElementById('contenedorMisPedidosList');
  if (contList) contList.innerHTML = '<p style="color:#888;">Cargando pedidos...</p>';

  try {
    const pedidos = await obtenerPedidosCliente(usuarioActual.id);
    if (!contList) return;

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
      else if (p.estado === 'cancelado') badgeEstado = '<span style="color:#ff5555; font-weight:bold;">❌ Cancelado / No Recibido</span>';
      else badgeEstado = `<span style="color:#aaa; font-weight:bold;">${p.estado}</span>`;

      const domNombre = p.nombreDomiciliario ? p.nombreDomiciliario : 'Buscando domiciliario...';
      const fechaFormat = new Date(p.created_at).toLocaleString('es-CO');
      const precioMostrar = p.precio === 0 ? 'Por definir por operador' : `$${Number(p.precio).toLocaleString('es-CO')} COP`;

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
    if (contList) contList.innerHTML = `<p style="color:#ff5555;">Error al cargar pedidos: ${err.message}</p>`;
  }
}

// ---------------- PANEL DOMICILIARIO ----------------
async function cargarVistaDomiciliario() {
  actualizarCuadreDiario();
  cargarListasPedidos();
  actualizarBotonEstadoServicio();

  escucharNuevosPedidos(() => {
    cargarListasPedidos();
    actualizarCuadreDiario();
  });
}

function actualizarBotonEstadoServicio() {
  const txt = document.getElementById('txtEstadoServicio');
  const btn = document.getElementById('btnToggleServicio');
  if (!txt || !btn || !usuarioActual || !usuarioActual.profile) return;
  
  const est = usuarioActual.profile.estado_servicio || 'fuera_de_servicio';

  if (est === 'activo') {
    txt.innerText = '🟢 En Servicio (Activo)';
    txt.style.color = '#00ff88';
    btn.innerText = '🔴 Ponerme Fuera de Servicio';
    btn.className = 'btn btn-secondary';
  } else if (est === 'ocupado') {
    txt.innerText = '🟠 En Carrera (Ocupado)';
    txt.style.color = '#ff9900';
    btn.innerText = '🔴 Ponerme Fuera de Servicio';
    btn.className = 'btn btn-secondary';
  } else {
    txt.innerText = '🔴 Fuera de Servicio';
    txt.style.color = '#ff5555';
    btn.innerText = '🟢 Ponerme En Servicio';
    btn.className = 'btn btn-primary';
  }
}

async function alternarEstadoServicio() {
  if (!usuarioActual) return;
  const estActual = usuarioActual.profile.estado_servicio || 'fuera_de_servicio';
  const nuevoEst = (estActual === 'activo' || estActual === 'ocupado') ? 'fuera_de_servicio' : 'activo';

  await cambiarEstadoServicioDomiciliario(usuarioActual.id, nuevoEst);
  usuarioActual.profile.estado_servicio = nuevoEst;
  actualizarBotonEstadoServicio();
}

async function actualizarCuadreDiario() {
  if (!usuarioActual) return;
  const cuadre = await obtenerCuadreDiarioDomiciliario(usuarioActual.id);
  const cuadreTxt = document.getElementById('cuadreDiarioTxt');
  const conteoTxt = document.getElementById('conteoEntregasTxt');
  if (cuadreTxt) cuadreTxt.innerText = cuadre.totalRecaudado.toLocaleString('es-CO');
  if (conteoTxt) conteoTxt.innerText = cuadre.totalViajes;
}

async function cargarListasPedidos() {
  if (!usuarioActual) return;
  const pendientes = await obtenerPedidosPendientes();
  const activos = await obtenerPedidosActivosDomiciliario(usuarioActual.id);

  const contPendientes = document.getElementById('listaPedidosPendientes');
  const contActivos = document.getElementById('listaPedidosActivos');

  if (contPendientes) {
    contPendientes.innerHTML = pendientes.length ? '' : '<p style="color: #888;">No hay pedidos pendientes en la ciudad.</p>';
    pendientes.forEach(p => {
      contPendientes.appendChild(crearCardPedido(p, 'pendiente'));
    });
  }

  if (contActivos) {
    contActivos.innerHTML = activos.length ? '' : '<p style="color: #888;">Sin pedidos activos en este momento.</p>';
    activos.forEach(p => {
      contActivos.appendChild(crearCardPedido(p, p.estado));
    });
  }
}

function crearCardPedido(p, tipoEstado) {
  const card = document.createElement('div');
  card.style.cssText = "background: #2a2a2a; border: 1px solid #444; border-radius: 8px; padding: 12px; margin-bottom: 10px;";
  
  const precioTxt = p.precio === 0 ? 'Por definir por operador' : `$${Number(p.precio).toLocaleString('es-CO')} COP (${p.distancia_km} km)`;

  let html = `<p><strong>📍 Recoger:</strong> ${p.origen_barrio} (${p.origen_direccion})</p>
              <p><strong>🏁 Entregar:</strong> ${p.destino_barrio} (${p.destino_direccion})</p>
              <p><strong>💰 Tarifa:</strong> ${precioTxt}</p>
              <p><strong>👤 Cliente:</strong> ${p.cliente_nombre} - ${p.cliente_telefono}</p>
              <p style="color:#aaa; font-size:0.8rem;">📝 ${p.observaciones || 'Sin detalles'}</p>`;

  if (tipoEstado === 'pendiente') {
    html += `<button class="btn btn-primary" style="margin-top: 8px;" id="btnAceptar_${p.id}">Aceptar Pedido</button>`;
  } else if (tipoEstado === 'aceptado') {
    html += `<div style="display:flex; gap:8px; margin-top:8px;">
               <button class="btn btn-primary" style="flex:1;" id="btnEnCamino_${p.id}">Marcar En Camino</button>
               <button class="btn btn-secondary" style="flex:1; background:#ff5555;" id="btnNoReciben_${p.id}">❌ No Reciben / Cancelar</button>
             </div>`;
  } else if (tipoEstado === 'en_camino') {
    html += `<div style="display:flex; gap:8px; margin-top:8px;">
               <button class="btn btn-whatsapp" style="flex:1;" id="btnCompletado_${p.id}">Confirmar Entrega y Cobro</button>
               <button class="btn btn-secondary" style="flex:1; background:#ff5555;" id="btnNoReciben_${p.id}">❌ No Reciben / Cancelar</button>
             </div>`;
  }

  card.innerHTML = html;

  setTimeout(() => {
    const btnAceptar = document.getElementById(`btnAceptar_${p.id}`);
    const btnCamino = document.getElementById(`btnEnCamino_${p.id}`);
    const btnCompletado = document.getElementById(`btnCompletado_${p.id}`);
    const btnNoReciben = document.getElementById(`btnNoReciben_${p.id}`);

    if (btnAceptar) btnAceptar.onclick = () => procesarCambioEstado(p.id, 'aceptado');
    if (btnCamino) btnCamino.onclick = () => procesarCambioEstado(p.id, 'en_camino');
    if (btnCompletado) btnCompletado.onclick = () => procesarCambioEstado(p.id, 'completado');
    if (btnNoReciben) btnNoReciben.onclick = () => procesarCambioEstado(p.id, 'cancelado');
  }, 100);

  return card;
}

async function procesarCambioEstado(pedidoId, nuevoEstado) {
  try {
    await cambiarEstadoPedido(pedidoId, nuevoEstado, usuarioActual.id);
    
    if (nuevoEstado === 'aceptado' || nuevoEstado === 'en_camino') {
      usuarioActual.profile.estado_servicio = 'ocupado';
    } else {
      usuarioActual.profile.estado_servicio = 'activo';
    }

    actualizarBotonEstadoServicio();
    await cargarListasPedidos();
    await actualizarCuadreDiario();
  } catch (err) {
    alert("Error al actualizar el pedido: " + err.message);
  }
}

// ---------------- PANEL ADMIN ----------------
let datosAdminGlobales = null;

async function cargarVistaAdmin() {
  datosAdminGlobales = await obtenerEstadisticasAdmin();
  
  const vTxt = document.getElementById('adminTotalVentas');
  const pTxt = document.getElementById('adminTotalPedidos');
  const cTxt = document.getElementById('adminTotalCompletados');

  if (vTxt) vTxt.innerText = datosAdminGlobales.totalVentas.toLocaleString('es-CO');
  if (pTxt) pTxt.innerText = datosAdminGlobales.totalPedidos;
  if (cTxt) cTxt.innerText = datosAdminGlobales.totalCompletados;

  renderizarEstadosDomiciliariosAdmin();
  poblarSelectorDomiciliarios();

  escucharEstadoDomiciliarios(async () => {
    datosAdminGlobales = await obtenerEstadisticasAdmin();
    renderizarEstadosDomiciliariosAdmin();
    poblarSelectorDomiciliarios();
  });
}

function renderizarEstadosDomiciliariosAdmin() {
  const cont = document.getElementById('listaEstadoDomiciliarios');
  if (!cont) return;
  cont.innerHTML = '';

  if (!datosAdminGlobales || !datosAdminGlobales.listaDomiciliarios.length) {
    cont.innerHTML = '<p style="color:#888;">No hay domiciliarios registrados aún.</p>';
    return;
  }

  datosAdminGlobales.listaDomiciliarios.forEach(d => {
    const item = document.createElement('div');
    item.style.cssText = "background: #2a2a2a; padding: 10px; margin-bottom: 8px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #444;";

    let badge = '';
    const est = d.estado_servicio || 'fuera_de_servicio';
    if (est === 'activo') badge = '<span style="color:#00ff88; font-weight:bold;">🟢 En Servicio</span>';
    else if (est === 'ocupado') badge = '<span style="color:#ff9900; font-weight:bold;">🟠 En Carrera</span>';
    else badge = '<span style="color:#ff5555; font-weight:bold;">🔴 Fuera de Servicio</span>';

    item.innerHTML = `<div><strong>${d.nombre}</strong> (@${d.username || 'user'})</div><div>${badge}</div>`;
    cont.appendChild(item);
  });
}

function poblarSelectorDomiciliarios() {
  const select = document.getElementById('selectFiltroDomiciliario');
  if (!select || !datosAdminGlobales) return;
  const valorPrevio = select.value;
  select.innerHTML = '<option value="">-- Seleccionar Domiciliario --</option>';

  datosAdminGlobales.listaDomiciliarios.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.innerText = `${d.nombre} (@${d.username || 'user'})`;
    select.appendChild(opt);
  });

  if (valorPrevio) select.value = valorPrevio;

  select.onchange = (e) => mostrarHistoricoDomiciliario(e.target.value);
}

function mostrarHistoricoDomiciliario(domiciliarioId) {
  const cont = document.getElementById('contenedorHistoricoDomiciliario');
  if (!cont) return;
  if (!domiciliarioId) {
    cont.innerHTML = '';
    return;
  }

  const pedidosDom = datosAdminGlobales.todosLosPedidos.filter(p => p.domiciliario_id === domiciliarioId);
  if (!pedidosDom.length) {
    cont.innerHTML = '<p style="color:#888;">Este domiciliario aún no registra viajes.</p>';
    return;
  }

  let html = `<p style="margin-bottom:10px;">Total viajes registrados: <strong>${pedidosDom.length}</strong></p>`;
  pedidosDom.forEach(p => {
    const fechaFormat = new Date(p.created_at).toLocaleString('es-CO');
    const precio = p.precio === 0 ? 'Por definir' : `$${Number(p.precio).toLocaleString('es-CO')} COP`;

    html += `
      <div style="background:#1e1e1e; padding:10px; margin-bottom:8px; border-radius:6px; border-left: 3px solid #00ff88;">
        <small style="color:#888;">${fechaFormat} - Estado: ${p.estado.toUpperCase()}</small>
        <p><strong>Origen:</strong> ${p.origen_barrio} | <strong>Destino:</strong> ${p.destino_barrio}</p>
        <p><strong>Valor:</strong> ${precio} | <strong>Cliente:</strong> ${p.cliente_nombre}</p>
      </div>
    `;
  });

  cont.innerHTML = html;
}

function vincularEventosUI() {
  const btnCalcular = document.getElementById('btnCalcular');
  const btnManual = document.getElementById('btnCotizacionManual');
  const btnPedido = document.getElementById('btnHacerPedido');
  const btnWsp = document.getElementById('btnEnviarWhatsApp');
  const btnAuth = document.getElementById('btnAuthSubmit');
  const btnServicio = document.getElementById('btnToggleServicio');
  const btnMisPedidos = document.getElementById('btnMisPedidosCliente');
  const btnSalir = document.getElementById('btnCerrarSesion');

  if (btnCalcular) btnCalcular.addEventListener('click', manejarCotizacion);
  if (btnManual) btnManual.addEventListener('click', manejarCotizacionManual);
  if (btnPedido) btnPedido.addEventListener('click', manejarPreguntaOModal);
  if (btnWsp) btnWsp.addEventListener('click', enviarWhatsApp);
  if (btnAuth) btnAuth.addEventListener('click', manejarSubmitAuth);
  if (btnServicio) btnServicio.addEventListener('click', alternarEstadoServicio);
  if (btnMisPedidos) btnMisPedidos.addEventListener('click', abrirModalMisPedidos);
  if (btnSalir) {
    btnSalir.addEventListener('click', async (e) => {
      e.preventDefault();
      await cerrarSesion();
      location.reload();
    });
  }
}

async function manejarCotizacion() {
  const origen = document.getElementById('origenInput').value.trim();
  const destino = document.getElementById('destinoInput').value.trim();

  if (!origen || !destino) {
    alert("Por favor escribe el barrio de origen y el de destino.");
    return;
  }

  try {
    esCotizacionManual = false;
    datosCotizacionGlobal = await cotizarRuta(origen, destino);
    const distTxt = document.getElementById('distanciaTxt');
    const precioContainer = document.getElementById('precioTxtContainer');
    const resultBox = document.getElementById('resultBox');

    if (distTxt) distTxt.innerText = datosCotizacionGlobal.distanciaKm;
    if (precioContainer) precioContainer.innerHTML = `$${datosCotizacionGlobal.precio.toLocaleString('es-CO')} COP`;
    if (resultBox) resultBox.style.display = 'block';
  } catch (error) {
    alert(error.message);
  }
}

function manejarCotizacionManual() {
  const origen = document.getElementById('origenInput').value.trim();
  const destino = document.getElementById('destinoInput').value.trim();

  if (!origen || !destino) {
    alert("Por favor escribe el barrio de origen y el de destino primero.");
    return;
  }

  esCotizacionManual = true;
  datosCotizacionGlobal = {
    origen: origen,
    destino: destino,
    distanciaKm: 0,
    precio: 0
  };

  const distTxt = document.getElementById('distanciaTxt');
  const precioContainer = document.getElementById('precioTxtContainer');
  const resultBox = document.getElementById('resultBox');

  if (distTxt) distTxt.innerText = 'N/A';
  if (precioContainer) precioContainer.innerHTML = '<span style="color:#ffcc00; font-weight:bold;">El operador te dará el valor</span>';
  if (resultBox) resultBox.style.display = 'block';
}

function manejarPreguntaOModal() {
  if (!usuarioActual) {
    const modalInv = document.getElementById('modalPreguntaInvitado');
    if (modalInv) modalInv.style.display = 'flex';
  } else {
    abrirModalPedido();
  }
}

window.abrirModalPedido = function() {
  const bOrigen = document.getElementById('barrioOrigenModal');
  const bDestino = document.getElementById('barrioDestinoModal');
  if (bOrigen && datosCotizacionGlobal) bOrigen.value = datosCotizacionGlobal.origen;
  if (bDestino && datosCotizacionGlobal) bDestino.value = datosCotizacionGlobal.destino;

  if (usuarioActual && usuarioActual.profile) {
    const cNombre = document.getElementById('clienteNombre');
    const cTel = document.getElementById('clienteTelefono');
    const dOrigen = document.getElementById('dirExactaOrigen');

    if (cNombre) cNombre.value = usuarioActual.profile.nombre || '';
    if (cTel) cTel.value = usuarioActual.profile.telefono || '';
    if (dOrigen) dOrigen.value = usuarioActual.profile.direccion || '';
  }

  const modalPedido = document.getElementById('modalPedido');
  if (modalPedido) modalPedido.style.display = 'flex';
};

window.abrirAuthModal = function(modo) {
  modoAuth = modo;
  const modalAuth = document.getElementById('modalAuth');
  if (modalAuth) modalAuth.style.display = 'flex';
  const esRegistro = modo === 'register';
  
  const title = document.getElementById('authModalTitle');
  const gUser = document.getElementById('groupUsername');
  const gNom = document.getElementById('groupNombre');
  const gTel = document.getElementById('groupTelefono');
  const gDir = document.getElementById('groupDireccion');
  const btnSub = document.getElementById('btnAuthSubmit');

  if (title) title.innerText = esRegistro ? 'Crear Cuenta' : 'Iniciar Sesión';
  if (gUser) gUser.style.display = esRegistro ? 'b
