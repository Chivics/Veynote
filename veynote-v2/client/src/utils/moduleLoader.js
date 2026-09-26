// Share one in-flight download. Failed downloads can be retried explicitly;
// successful modules remain available for the lifetime of this document.
export function createModuleLoader(importModule) {
  let request;
  return function load() {
    if (!request) request = Promise.resolve().then(importModule).catch(error => {
      request = undefined;
      const failure = new Error(error?.message || "Application download failed.");
      failure.code = "WORKSPACE_DOWNLOAD_FAILED";
      failure.cause = error;
      throw failure;
    });
    return request;
  };
}
