// Resolve against the page for the development proxy as well as absolute
// production API URLs. Never send account/vault credentials to remote media.
export function isApiUrl(url, apiBase, pageUrl) {
  try {
    const target = new URL(url, pageUrl);
    const api = new URL(apiBase, pageUrl);
    return ["http:", "https:"].includes(target.protocol) && target.origin === api.origin
      && !target.username && !target.password;
  } catch {
    return false;
  }
}
