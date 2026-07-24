/**
 * StudyTrack - Configuración y subida de archivos con Cloudinary
 *
 * Estos datos pueden estar en el frontend porque se usa un preset NO FIRMADO.
 * Nunca agregues aquí el API Secret de Cloudinary.
 */

export const CLOUDINARY_CONFIG = Object.freeze({
  cloudName: "buy1s7n1",
  uploadPreset: "studytrack_tasks",
  endpoint: "https://api.cloudinary.com/v1_1/buy1s7n1/auto/upload",
  timeoutMs: 45000
});

/**
 * Sube una imagen o PDF directamente desde el navegador.
 *
 * @param {Object} options
 * @param {File} options.file
 * @param {string} options.userId
 * @param {string} options.taskId
 * @param {(progress:number) => void} [options.onProgress]
 * @returns {Promise<Object>}
 */
export function uploadFileToCloudinary({
  file,
  userId,
  taskId,
  onProgress = () => {}
}) {
  if (!(file instanceof File)) {
    return Promise.reject(
      createCloudinaryError(
        "cloudinary/invalid-file",
        "No se recibió un archivo válido."
      )
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append(
    "upload_preset",
    CLOUDINARY_CONFIG.uploadPreset
  );

  // Ayudan a localizar los archivos desde la biblioteca de Cloudinary.
  formData.append(
    "tags",
    [
      "studytrack",
      `uid_${sanitizeTag(userId)}`,
      `task_${sanitizeTag(taskId)}`
    ].join(",")
  );

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open(
      "POST",
      CLOUDINARY_CONFIG.endpoint,
      true
    );

    request.timeout =
      CLOUDINARY_CONFIG.timeoutMs;

    request.upload.addEventListener(
      "progress",
      (event) => {
        if (!event.lengthComputable) {
          return;
        }

        const progress = Math.round(
          (event.loaded / event.total) * 100
        );

        onProgress(progress);
      }
    );

    request.addEventListener("load", () => {
      const response = parseJson(request.responseText);

      if (
        request.status < 200 ||
        request.status >= 300
      ) {
        reject(
          createCloudinaryError(
            "cloudinary/upload-failed",
            response?.error?.message ||
              "Cloudinary rechazó el archivo."
          )
        );
        return;
      }

      if (!response?.secure_url) {
        reject(
          createCloudinaryError(
            "cloudinary/invalid-response",
            "Cloudinary no devolvió una URL válida."
          )
        );
        return;
      }

      onProgress(100);

      resolve({
        provider: "cloudinary",
        name:
          response.original_filename
            ? `${response.original_filename}.${response.format || ""}`
                .replace(/\.$/, "")
            : file.name,
        originalName: file.name,
        type: file.type,
        size: Number(response.bytes) || file.size,
        url: response.secure_url,
        secureUrl: response.secure_url,
        publicId: response.public_id || "",
        assetId: response.asset_id || "",
        resourceType: response.resource_type || "auto",
        format: response.format || "",
        version: response.version || null,
        width: response.width || null,
        height: response.height || null,
        uploadedAt: new Date().toISOString()
      });
    });

    request.addEventListener("error", () => {
      reject(
        createCloudinaryError(
          "cloudinary/network-error",
          "No se pudo conectar con Cloudinary."
        )
      );
    });

    request.addEventListener("timeout", () => {
      reject(
        createCloudinaryError(
          "cloudinary/upload-timeout",
          "La carga tardó demasiado."
        )
      );
    });

    request.addEventListener("abort", () => {
      reject(
        createCloudinaryError(
          "cloudinary/upload-cancelled",
          "La carga fue cancelada."
        )
      );
    });

    request.send(formData);
  });
}

function createCloudinaryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sanitizeTag(value = "") {
  return String(value)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
}
