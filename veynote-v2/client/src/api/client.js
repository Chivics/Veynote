import { uploadForm } from "../utils/uploadForm";
import { queryPath } from "../utils/queryPath";
import { getNoteGrant } from "../utils/noteGrant";
import { createQueryCache, cacheablePath } from "../utils/queryCache";
import { protectedAccess } from "../utils/protectedAccess";

const cache = createQueryCache();
let cacheOwner = null;
function scopedCache() {
  const owner = getAuthToken();
  if (cacheOwner !== owner) { cacheOwner = owner; cache.clear(); }
  return cache;
}
const cacheChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("veynote-cache-invalidation") : null;
cacheChannel?.addEventListener("message", () => cache.clear());
function clearCache() { cache.clear(); cacheChannel?.postMessage("invalidate"); }

const BASE = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "/api" : "https://api.veynote.app/api")).replace(/\/$/, "");

export const API_BASE = BASE;

function getAuthToken() {
  return localStorage.getItem("veynote_token");
}

function getVaultToken() {
  return sessionStorage.getItem("veynote_vault_token");
}

function getWillToken() {
  return sessionStorage.getItem("veynote_will_token");
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  let data;

  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = {};
    }
  } else {
    try {
      const text = await response.text();
      data = text ? { error: text } : {};
    } catch {
      data = {};
    }
  }

  if (response.ok) {
    return data;
  }

  let message =
    data?.error ||
    data?.message ||
    "Something went wrong. Please try again.";

  switch (response.status) {
    case 400:
      message = data?.error || "The request could not be completed.";
      break;
    case 401:
      message = data?.error || "Your session or secure access has expired.";
      break;
    case 403:
      message = data?.error || "You do not have permission to access this resource.";
      break;
    case 404:
      message = data?.error || "The requested resource could not be found.";
      break;
    case 413:
      message = data?.error || "The uploaded file is too large.";
      break;
    case 415:
      message = data?.error || "This file type is not supported.";
      break;
    case 500:
      message = data?.error || "The server encountered an error.";
      break;
    case 502:
      message = data?.error || "The server gateway is unavailable.";
      break;
    case 503:
      message = data?.error || "The service is temporarily unavailable.";
      break;
    default:
      break;
  }

  const error = new Error(message);
  error.status = response.status;
  error.data = data;
  error.requiresVault = data?.requiresVault || null;
  if (data?.code === "SESSION_LOCKED" || data?.code === "REAUTH_REQUIRED") window.dispatchEvent(new Event("veynote:session-locked"));
  throw error;
}

async function request(path, options = {}) {
  protectedAccess.assert(path);
  const affectsRecords = options.method && options.method !== "GET" && !path.startsWith("/auth/") && !path.startsWith("/sessions/");
  if (affectsRecords) clearCache();
  const headers = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };

  const authToken = getAuthToken();
  const vaultToken = getVaultToken();
  const willToken = getWillToken();

  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (vaultToken) headers["X-Vault-Token"] = vaultToken;
  if (willToken) headers["X-Will-Token"] = willToken;
  if (getNoteGrant()) headers["X-Note-Token"] = getNoteGrant();

  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  let data;
  try { data = await parseResponse(response); }
  catch (error) { protectedAccess.assert(path); throw error; }
  // A response that started before locking must not clear a private draft or
  // repopulate its UI while the independent access boundary is paused.
  protectedAccess.assert(path);
  // Invalidate again after persistence: a read during a write must not remain fresh.
  if (affectsRecords) clearCache();
  return data;
}

export const api = {
  clearCache,
  subscribe: listener => cache.subscribe(listener),
  peek(path, params) { const key = queryPath(path, params); return cacheablePath(key) ? scopedCache().peek(key) : undefined; },
  get(path, params, options = {}) {
    const key = queryPath(path, params);
    return cacheablePath(key) ? scopedCache().get(key, () => request(key), options.force) : request(key, { signal: options.signal });
  },
  prefetch(path, params) { if (cacheablePath(queryPath(path, params))) return api.get(path, params).catch(() => {}); },

  post(path, body) {
    return request(path, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  },

  patch(path, body) {
    return request(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  put(path, body) {
    return request(path, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  delete(path) {
    return request(path, { method: "DELETE" });
  },

  uploadMultiple(path, files, onProgress, fields) {
    return api.upload(path, uploadForm(files, fields, true), onProgress);
  },

  upload(path, input, onProgress, fields, method = "POST") {
    clearCache();
    return new Promise((resolve, reject) => {
      protectedAccess.assert(path);
      const formData = uploadForm(input, fields);
      const xhr = new XMLHttpRequest();
      xhr.open(method, `${BASE}${path}`);
      xhr.timeout = 120000;

      const authToken = getAuthToken();
      const vaultToken = getVaultToken();
      const willToken = getWillToken();

      if (authToken) xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
      if (vaultToken) xhr.setRequestHeader("X-Vault-Token", vaultToken);
      if (willToken) xhr.setRequestHeader("X-Will-Token", willToken);
      if (getNoteGrant()) xhr.setRequestHeader("X-Note-Token", getNoteGrant());

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        if (onProgress) onProgress(percent);
      };

      xhr.onload = () => {
        try { protectedAccess.assert(path); } catch (error) { reject(error); return; }
        let data = {};
        try {
          data = JSON.parse(xhr.responseText || "{}");
        } catch {
          data = {};
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          clearCache();
          resolve(data);
          return;
        }
        const error = new Error(data?.error || "The upload could not be completed.");
        error.status = xhr.status;
        error.data = data;
        error.requiresVault = data?.requiresVault || null;
        if (data?.code === "SESSION_LOCKED" || data?.code === "REAUTH_REQUIRED") window.dispatchEvent(new Event("veynote:session-locked"));
        reject(error);
      };

      xhr.onerror = () => {
        const error = new Error("Network error while uploading the file.");
        error.status = 0;
        reject(error);
      };
      xhr.ontimeout = () => reject(new Error("The upload timed out. Check your connection and try again."));
      xhr.onabort = () => reject(new Error("The upload was cancelled."));

      xhr.send(formData);
    });
  },
};
