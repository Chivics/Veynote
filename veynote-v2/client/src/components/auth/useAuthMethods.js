import { useEffect, useState } from "react";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { api } from "../../api/client";

export default function useAuthMethods() {
  const [methods, setMethods] = useState({ google: false, passkey: false });
  useEffect(() => {
    let active = true;
    api.get("/auth/methods")
      .then((available) => {
        if (active) setMethods({ google: Boolean(available.google), passkey: Boolean(available.passkey) && browserSupportsWebAuthn() });
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  return methods;
}
