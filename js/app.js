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
    // El Administrador ÚNICAMENTE ve su Dashboard de Administrador
    pAdmin.style.display = 'block';
    cargarVistaAdmin();
  } else {
    pCliente.style.display = 'block';
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
      else if (p.estado === 'cancelado') badgeEstado = '<span style="color:#ff5555; font-weight:bold;">❌ No Recibido / Cancelado</span>';

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
    contList.innerHTML = `<p style="color:#ff5555;">Error al cargar pedidos: ${err.message}</p>`;
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
  const estActual = usuarioActual.profile.estado_servicio || 'fuera_de_servicio';
  const nuevoEst = (estActual === 'activo' || estActual === 'ocupado') ? 'fuera_de_servicio' : 'activo';

  await cambiarEstadoServicioDomiciliario(usuarioActual.id, nuevoEst);
  usuarioActual.profile.estado_servicio = nuevoEst;
  actualizarBotonEstadoServicio();
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
    if (document.getElementById(`btnAceptar_${p.id}`)) {
      document.getElementById(`btnAceptar_${p.id}`).onclick = () => procesarCambioEstado(p.id, 'aceptado');
    }
    if (document.getElementById(`btnEnCamino_${p.id}`)) {
      document.getElementById(`btnEnCamino_${p.id}`).onclick = () => procesarCambioEstado(p.id, 'en_camino');
    }
    if (document.getElementById(`btnCompletado_${p.id}`)) {
      document.getElementById(`btnCompletado_${p.id}`).onclick = () => procesarCambioEstado(p.id, 'completado');
    }
    if (document.getElementById(`btnNoReciben_${p.id}`)) {
      document.getElementById(`btnNoReciben_${p.id}`).onclick = () => procesarCambioEstado(p.id, 'cancelado');
    }
  }, 100);

  return card;
}

async function procesarCambioEstado(pedidoId, nuevoEstado) {
  try {
    await cambiarEstadoPedido(pedidoId, nuevoEstado, usuarioActual.id);
    
    // Regla estricta: Permanece 'ocupado' durante aceptado y en_camino
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
  
  document.getElementById('adminTotalVentas').innerText = datosAdminGlobales.totalVentas.toLocaleString('es-CO');
  document.getElementById('adminTotalPedidos').innerText = datosAdminGlobales.totalPedidos;
  document.getElementById('adminTotalCompletados').innerText = datosAdminGlobales.totalCompletados;

  renderizarEstadosDomiciliariosAdmin();
  poblarSelectorDomiciliarios();

  // Escuchar cambios de estado de usuarios en tiempo real para el Admin
  escucharEstadoDomiciliarios(() => {
    cargarVistaAdmin();
  });
}

function renderizarEstadosDomiciliariosAdmin() {
  const cont = document.getElementById('listaEstadoDomiciliarios');
  cont.innerHTML = '';

  if (!datosAdminGlobales.listaDomiciliarios.length) {
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
  document.getElementById('btnCalcular').addEventListener('click', manejarCotizacion);
  document.getElementById('btnCotizacionManual').addEventListener('click', manejarCotizacionManual);
  document.getElementById('btnHacerPedido').addEventListener('click', manejarPreguntaOModal);
  document.getElementById('btnEnviarWhatsApp').addEventListener('click', enviarWhatsApp);
  document.getElementById('btnAuthSubmit').addEventListener('click', manejarSubmitAuth);
  document.getElementById('btnToggleServicio')?.addEventListener('click', alternarEstadoServicio);
  document.getElementById('btnMisPedidosCliente')?.addEventListener('click', abrirModalMisPedidos);
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
    esCotizacionManual = false;
    datosCotizacionGlobal = await cotizarRuta(origen, destino);
    document.getElementById('distanciaTxt').innerText = datosCotizacionGlobal.distanciaKm;
    document.getElementById('precioTxtContainer').innerHTML = `$${datosCotizacionGlobal.precio.toLocaleString('es-CO')} COP`;
    document.getElementById('resultBox').style.display = 'block';
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

  document.getElementById('distanciaTxt').innerText = 'N/A';
  document.getElementById('precioTxtContainer').innerHTML = '<span style="color:#ffcc00; font-weight:bold;">El operador te dará el valor</span>';
  document.getElementById('resultBox').style.display = 'block';
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

    const userTag = (usuarioActual && usuarioActual.profile && usuarioActual.profile.username)
      ? ` (@${usuarioActual.profile.username})`
      : '';

    const precioTextoWS = datosCotizacionGlobal.precio === 0 
      ? '*POR DEFINIR POR OPERADOR*' 
      : `$${datosCotizacionGlobal.precio.toLocaleString('es-CO')} COP`;

    const mensajeTexto = `🚴‍♂ *¡NUEVO DOMICILIO - TULUÁ EXPRESS!*\n\n` +
      `👤 *Cliente:* ${nombre}${userTag}\n` +
      `📞 *Teléfono:* ${telefono}\n\n` +
      `📍 *RECOGER EN:*\n` +
      `• Barrio: ${datosCotizacionGlobal.origen}\n` +
      `• Dirección Exacta: ${dirOrigen}\n\n` +
      `🏁 *ENTREGAR EN:*\n` +
      `• Barrio: ${datosCotizacionGlobal.destino}\n` +
      `• Dirección Exacta: ${dirDestino}\n\n` +
      `📏 *Distancia:* ${datosCotizacionGlobal.distanciaKm || 'Manual'} km\n` +
      `💰 *VALOR A COBRAR:* ${precioTextoWS}\n\n` +
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
