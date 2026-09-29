import { obtenerUsuarioActual, registrarUsuario, iniciarSesion, cerrarSesion } from './auth.js';
import { inicializarMapa, cotizarRuta, limpiarMapa } from './map.js';
import { NUMERO_WHATSAPP } from './config.js';

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
      document.getElementById('userNameTxt').innerText = `👋 ${displayTag}`;
    } else {
      document.getElementById('guestButtons').style.display = 'block';
      document.getElementById('userBadge').style.display = 'none';
    }
  } catch (err) {
    console.error("Error al cargar sesión:", err);
  }
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

function enviarWhatsApp() {
  const nombre = document.getElementById('clienteNombre').value.trim();
  const telefono = document.getElementById('clienteTelefono').value.trim();
  const dirOrigen = document.getElementById('dirExactaOrigen').value.trim();
  const dirDestino = document.getElementById('dirExactaDestino').value.trim();
  const obs = document.getElementById('observacionesInput').value.trim() || "Sin observaciones";

  if (!nombre || !telefono || !dirOrigen || !dirDestino) {
    alert("Por favor completa tu nombre, teléfono y las direcciones exactas.");
    return;
  }

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
