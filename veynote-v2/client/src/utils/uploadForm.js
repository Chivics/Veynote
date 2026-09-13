export function uploadForm(input, fields = {}, multiple = false) {
  if (input instanceof FormData) return input;
  const form = new FormData();
  for (const [key, value] of Object.entries(fields || {})) {
    if (value !== undefined && value !== null) form.append(key, String(value));
  }
  for (const file of multiple ? Array.from(input) : [input]) {
    if (!(file instanceof Blob)) throw new TypeError("Choose a file to upload.");
    form.append(multiple ? "files" : "file", file, file.name || "upload");
  }
  return form;
}
