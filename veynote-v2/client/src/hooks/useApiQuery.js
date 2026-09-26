import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { queryPath } from "../utils/queryPath";

export function useApiQuery(path, params) {
  const key = queryPath(path, params);
  const sequence = useRef(0);
  const activeKey = useRef(key);
  const mounted = useRef(false);
  activeKey.current = key;
  const [state, setState] = useState(() => ({ key, data: api.peek(key), error: null, fetching: true }));
  const current = state.key === key ? state : { key, data: api.peek(key), error: null, fetching: true };
  useEffect(() => {
    let active = true;
    mounted.current = true;
    const read = force => {
      const request = ++sequence.current;
      setState(previous => ({ key, data: previous.key === key ? previous.data : api.peek(key), error: null, fetching: true }));
      api.get(key, undefined, { force }).then(data => { if (active && activeKey.current === key && sequence.current === request) setState({ key, data, error: null, fetching: false }); })
        .catch(error => { if (active && activeKey.current === key && sequence.current === request) setState(previous => ({ ...previous, key, error, fetching: false })); });
    };
    const unsubscribe = api.subscribe(changed => {
      if (changed === key && activeKey.current === key) {
        ++sequence.current;
        setState({ key, data: api.peek(key), error: null, fetching: false });
      }
      // Explicit navigation/focus fetches revalidate invalidated entries.
    });
    const focus = () => read(false);
    read(false); window.addEventListener("focus", focus); window.addEventListener("online", focus);
    return () => { active = false; mounted.current = false; ++sequence.current; unsubscribe(); window.removeEventListener("focus", focus); window.removeEventListener("online", focus); };
  }, [key]);
  return { ...current, refresh: async () => {
    const request = ++sequence.current;
    setState(previous => previous.key === key ? { ...previous, error: null, fetching: true } : previous);
    try {
      const data = await api.get(key, undefined, { force: true });
      if (mounted.current && activeKey.current === key && sequence.current === request) setState({ key, data, error: null, fetching: false });
      return data;
    } catch (error) {
      if (mounted.current && activeKey.current === key && sequence.current === request) setState(previous => ({ ...previous, error, fetching: false }));
      throw error;
    }
  } };
}
