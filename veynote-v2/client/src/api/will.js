import { api, API_BASE } from "./client";

async function openProtectedDocument(record) {
  const popup = window.open("", "_blank");
  if (popup) popup.opener = null;
  try {
    const response = await fetch(`${API_BASE}${record.downloadUrl}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("veynote_token") || ""}`,
        "X-Will-Token": sessionStorage.getItem("veynote_will_token") || "",
      },
    });
    if (!response.ok) {
      let message = "This protected document could not be opened.";
      try { message = (await response.json())?.error || message; } catch { /* binary or empty error */ }
      const error = new Error(message); error.status = response.status; throw error;
    }
    const blobUrl = URL.createObjectURL(await response.blob());
    if (popup) popup.location.href = blobUrl;
    else {
      const anchor = document.createElement("a");
      anchor.href = blobUrl; anchor.download = record.originalName || "estate-document"; anchor.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch (error) {
    popup?.close();
    throw error;
  }
}

export const willApi = {
  get() {
    return api.get("/will");
  },

  update(data) {
    return api.patch("/will", data);
  },

  details: {
    get(id) {
      return api.get(`/will/details/${id}`);
    },

    create(data) {
      return api.post("/will/details", data);
    },

    update(id, data) {
      return api.patch(`/will/details/${id}`, data);
    },

    remove(id) {
      return api.delete(`/will/details/${id}`);
    },
  },

  assets: {
    get(id) {
      return api.get(`/will/assets/${id}`);
    },

    create(data) {
      return api.post("/will/assets", data);
    },

    update(id, data) {
      return api.patch(`/will/assets/${id}`, data);
    },

    remove(id) {
      return api.delete(`/will/assets/${id}`);
    },
  },

  beneficiaries: {
    get(id) {
      return api.get(`/will/beneficiaries/${id}`);
    },

    create(data) {
      return api.post("/will/beneficiaries", data);
    },

    update(id, data) {
      return api.patch(`/will/beneficiaries/${id}`, data);
    },

    remove(id) {
      return api.delete(`/will/beneficiaries/${id}`);
    },
  },

  contacts: {
    get(id) {
      return api.get(`/will/contacts/${id}`);
    },

    create(data) {
      return api.post("/will/contacts", data);
    },

    update(id, data) {
      return api.patch(`/will/contacts/${id}`, data);
    },

    remove(id) {
      return api.delete(`/will/contacts/${id}`);
    },
  },

  executors: {
    get(id) {
      return api.get(`/will/executors/${id}`);
    },

    create(data) {
      return api.post("/will/executors", data);
    },

    update(id, data) {
      return api.patch(`/will/executors/${id}`, data);
    },

    remove(id) {
      return api.delete(`/will/executors/${id}`);
    },
  },

  liabilities: {
    get(id) {
      return api.get(`/will/liabilities/${id}`);
    },

    create(data) {
      return api.post("/will/liabilities", data);
    },

    update(id, data) {
      return api.patch(`/will/liabilities/${id}`, data);
    },

    remove(id) {
      return api.delete(`/will/liabilities/${id}`);
    },
  },

  documents: {
    list() {
      return api.get("/will/documents");
    },

    upload(formData, onProgress) {
      return api.upload("/will/documents", formData, onProgress);
    },

    remove(id) {
      return api.delete(`/will/documents/${id}`);
    },

    open(document) {
      return openProtectedDocument(document);
    },
  },

  activity() {
    return api.get("/will/activity");
  },
};
