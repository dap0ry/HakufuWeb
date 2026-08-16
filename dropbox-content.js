// Pequeño helper compartido para hablar con la API de contenido de Dropbox
// (content.dropboxapi.com) — usado por webapp.js, reader.js y settings.js
// para descargar mangas respaldados. La subida real solo la hace la app de
// escritorio (ver Hakufu/Services/DropboxService.cs); aquí solo se lee.

// Los valores de la cabecera Dropbox-API-Arg deben ser ASCII de 7 bits — los
// títulos de manga pueden llevar tildes/ñ, así que hay que codificar el JSON
// con encodeURIComponent antes de meterlo en la cabecera.
export function dropboxArgHeader(args) {
  return encodeURIComponent(JSON.stringify(args));
}

export async function downloadFromDropbox(accessToken, path) {
  const resp = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': dropboxArgHeader({ path }),
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp;
}
