const { put } = require('@vercel/blob');

// Avatares y portadas de manga — bucket público (BLOB_READ_WRITE_TOKEN viene
// del Blob store conectado al proyecto en Vercel). Reemplaza a Cloudinary,
// que nunca llegó a tener credenciales configuradas.
function uploadImage(buffer, mimeType, pathname) {
  return put(pathname, buffer, {
    access: 'public',
    contentType: mimeType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

module.exports = { uploadImage };
