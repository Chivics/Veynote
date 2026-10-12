import { api } from "./client";

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
  },

  activity() {
    return api.get("/will/activity");
  },
};
