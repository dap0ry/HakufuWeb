// Pequeño helper compartido para hablar con la API de contenido de Dropbox
// (content.dropboxapi.com) — usado por webapp.js, reader.js y settings.js
// para descargar mangas respaldados. La subida real solo la hace la app de
// escritorio (ver Hakufu/Services/DropboxService.cs); aquí solo se lee.

// Dropbox exige el valor de la cabecera Dropbox-API-Arg como JSON en crudo,
// solo con los caracteres no-ASCII (y 0x7F) escapados como \uXXXX — nunca
// percent-encoded. encodeURIComponent codificaba también los caracteres
// estructurales del JSON ({, ", :, /), lo que hacía que Dropbox no pudiera
// parsear la cabecera como JSON en absoluto.
const NON_ASCII = /[\u007f-\uffff]/g;
export function dropboxArgHeader(args) {
  return JSON.stringify(args).replace(NON_ASCII,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
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
