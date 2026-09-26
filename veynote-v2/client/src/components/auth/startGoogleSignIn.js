import { API_BASE, api } from "../../api/client";

export async function startGoogleSignIn() {
  let available;
  try {
    available = await api.get("/auth/methods", undefined, { force: true });
  } catch {
    throw new Error("We couldn't reach Veynote to start Google sign-in. Check your connection and try again.");
  }
  if (!available.google) {
    throw new Error("Google sign-in is being configured. Use your email and password for now.");
  }
  window.location.assign(`${API_BASE}/auth/google`);
}
