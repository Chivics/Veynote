const BASE = "/api";

function getToken() {
  return localStorage.getItem("veynote_token");
}

async function request(path, { method = "GET", body, params } = {}) {
  let url = `${BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}

async function uploadFile(path, file, onProgress, extraFields) {
  // Uses XMLHttpRequest instead of fetch so we get real upload progress
  // events — fetch has no progress API for request bodies.
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    if (extraFields) {
      Object.entries(extraFields).forEach(([key, value]) => {
        if (value !== undefined && value !== null) form.append(key, value);
      });
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}${path}`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error body — fall through with empty data
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || "Upload failed. Please try again."));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.send(form);
  });
}

export const api = {
  get: (path, params) => request(path, { params }),
  post: (path, body) => request(path, { method: "POST", body }),
  patch: (path, body) => request(path, { method: "PATCH", body }),
  delete: (path) => request(path, { method: "DELETE" }),
  upload: uploadFile,
};

export { getToken };
