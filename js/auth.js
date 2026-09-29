import { supabase } from './config.js';

export async function obtenerUsuarioActual() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', user.id)
    .single();

  return { ...user, profile: perfil };
}

export async function registrarUsuario({ email, password, username, nombre, telefono, direccion }) {
  // Verificar si el username ya está en uso
  const { data: usuarioExistente } = await supabase
    .from('usuarios')
    .select('username')
    .eq('username', username)
    .maybeSingle();

  if (usuarioExistente) {
    throw new Error('El nombre de usuario ya está ocupado. Elige otro.');
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;

  if (data.user) {
    const { error: profileError } = await supabase.from('usuarios').insert([{
      id: data.user.id,
      username: username.toLowerCase().trim(),
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      direccion: direccion ? direccion.trim() : ''
    }]);

    if (profileError) throw profileError;
  }

  return data.user;
}

export async function iniciarSesion(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function cerrarSesion() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
