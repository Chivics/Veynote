import { useEffect, useState } from "react";
import { api } from "../api/client";
import { queryPath } from "../utils/queryPath";

export function useApiQuery(path, params) {
  const key = queryPath(path, params);
  const [state, setState] = useState(() => ({ key, data: api.peek(key), error: null, fetching: true }));
  const current = state.key === key ? state : { key, data: api.peek(key), error: null, fetching: true };
  useEffect(() => {
    let active = true;
    const read = force => {
      setState(previous => ({ key, data: previous.key === key ? previous.data : api.peek(key), error: null, fetching: true }));
      api.get(key, undefined, { force }).then(data => { if (active) setState({ key, data, error: null, fetching: false }); })
        .catch(error => { if (active) setState(previous => ({ ...previous, key, error, fetching: false })); });
    };
    const unsubscribe = api.subscribe(changed => {
      if (changed === key) setState({ key, data: api.peek(key), error: null, fetching: false });
      // Explicit navigation/focus fetches revalidate invalidated entries.
    });
    const focus = () => read(false);
    read(false); window.addEventListener("focus", focus); window.addEventListener("online", focus);
    return () => { active = false; unsubscribe(); window.removeEventListener("focus", focus); window.removeEventListener("online", focus); };
  }, [key]);
  return { ...current, refresh: async () => {
    try {
      const data = await api.get(key, undefined, { force: true });
      setState(previous => previous.key === key ? { key, data, error: null, fetching: false } : previous);
      return data;
    } catch (error) {
      setState(previous => previous.key === key ? { ...previous, error, fetching: false } : previous);
      throw error;
    }
  } };
}
