const sanitizeHtml = require("sanitize-html");

function sanitizeDocument(html, { imageUrl } = {}) {
  return sanitizeHtml(typeof html === "string" ? html : "", {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "input", "font", "mark", "s", "u", "strike"],
    allowedAttributes: {
      "*": ["class", "style", "data-note-id", "data-checked", "data-type"],
      a: ["href", "title", "target", "rel", "data-note-id", "class"],
      img: ["src", "alt", "width", "height"], input: ["type", "checked", "disabled"],
      td: ["colspan", "rowspan", "style"], th: ["colspan", "rowspan", "style"],
      ol: ["start"], font: ["color", "face", "size"],
    },
    allowedSchemes: ["https", "http", "mailto"], allowProtocolRelative: false,
    allowedStyles: { "*": {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i],
      "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i],
      "font-size": [/^\d+(\.\d+)?(px|em|rem|%)$/], "font-family": [/^[a-z\s,'"-]+$/i],
      "text-align": [/^(left|right|center|justify)$/], "line-height": [/^\d+(\.\d+)?(px|em|rem|%)?$/],
      "margin-bottom": [/^\d+(\.\d+)?(px|em|rem)$/], "font-weight": [/^(normal|bold|[1-9]00)$/],
      "font-style": [/^(normal|italic)$/], "text-decoration": [/^(underline|line-through|none)$/],
    } },
    transformTags: {
      input: (_tag, attrs) => ({ tagName: "input", attribs: { type: "checkbox", ...(Object.hasOwn(attrs, "checked") && { checked: "" }), disabled: "" } }),
      a: (_tag, attrs) => ({ tagName: "a", attribs: { ...attrs, rel: "noopener noreferrer" } }),
      img: (_tag, attrs) => {
        let src = attrs.src || "";
        try {
          const url = new URL(src, "https://api.veynote.app");
          if (["https://api.veynote.app", "https://veynote.app"].includes(url.origin) && url.pathname.startsWith("/uploads/")) src = url.pathname;
        } catch { src = ""; }
        return { tagName: "img", attribs: { ...attrs, src: imageUrl ? imageUrl(src) : src } };
      },
    },
  });
}

function sanitizeContent(req, res, next) {
  if (req.body?.content !== undefined) {
    if (typeof req.body.content !== "string") return res.status(400).json({ error: "Document content must be text." });
    req.body.content = sanitizeDocument(req.body.content);
  }
  next();
}

module.exports = { sanitizeDocument, sanitizeContent };
