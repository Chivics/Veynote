import { useEffect, useState } from "react";
import { API_BASE } from "../api/client";
import { isApiUrl } from "../utils/apiOrigin";
import { resolveMediaUrl } from "../utils/media";

const API_ORIGIN = new URL(API_BASE, window.location.href).origin;

/**
 * Returns authentication headers required for protected Veynote media.
 */
function authHeaders() {
  const token = localStorage.getItem("veynote_token");
  const vaultToken = sessionStorage.getItem("veynote_vault_token");
  const willToken = sessionStorage.getItem("veynote_will_token");

  return {
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),

    ...(vaultToken
      ? {
          "X-Vault-Token": vaultToken,
        }
      : {}),

    ...(willToken
      ? {
          "X-Will-Token": willToken,
        }
      : {}),
  };
}

/**
 * Determines whether something looks like an image.
 */
export function isImageFile({
  mimeType,
  originalName,
  name,
  url,
} = {}) {
  if (
    typeof mimeType === "string" &&
    mimeType.toLowerCase().startsWith("image/")
  ) {
    return true;
  }

  const value = originalName || name || url || "";

  return /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)(\?.*)?$/i.test(
    value
  );
}

/**
 * Convert a media path returned from the API into a real absolute URL.
 */
function toAbsoluteUrl(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  // Browser generated image previews
  if (value.startsWith("blob:") || value.startsWith("data:")) {
    return value;
  }

  // Already absolute
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  // Backend API route
  if (value.startsWith("/api/")) {
    return `${API_ORIGIN}${value}`;
  }

  // Uploaded static file
  if (value.startsWith("/uploads/")) {
    return `${API_ORIGIN}${value}`;
  }

  // Other root-relative backend path
  if (value.startsWith("/")) {
    return `${API_ORIGIN}${value}`;
  }

  // Relative media URL
  try {
    return new URL(value, `${API_BASE.replace(/\/$/, "")}/`).href;
  } catch {
    return null;
  }
}

/**
 * Creates every sensible image URL we can try.
 *
 * Example:
 *
 * /api/trading/images/123
 *
 * becomes:
 *
 * https://api.example.com/api/trading/images/123
 * https://api.example.com/api/trading/images/123/file
 */
function buildCandidates({ src }) {
  if (!src) return [];

  if (src.startsWith("blob:") || src.startsWith("data:")) {
    return [src];
  }

  const result = [];

  const absolute = toAbsoluteUrl(src);

  if (absolute) {
    result.push(absolute);

    // Many Veynote attachment APIs return metadata from:
    // /images/:id
    //
    // and the actual binary from:
    // /images/:id/file
    if (
      absolute.includes("/images/") &&
      !absolute.match(/\/file(?:\?|$)/)
    ) {
      const [base, query] = absolute.split("?");

      result.push(
        query
          ? `${base.replace(/\/$/, "")}/file?${query}`
          : `${base.replace(/\/$/, "")}/file`
      );
    }

    // Also support attachment-style endpoints.
    if (
      absolute.includes("/attachments/") &&
      !absolute.match(/\/file(?:\?|$)/)
    ) {
      const [base, query] = absolute.split("?");

      result.push(
        query
          ? `${base.replace(/\/$/, "")}/file?${query}`
          : `${base.replace(/\/$/, "")}/file`
      );
    }
  }

  return [...new Set(result.filter(Boolean))];
}

/**
 * Fetch protected image binary and create a local browser URL.
 */
async function fetchImageBlob(urls) {
  let lastError = "Unable to load image";

  for (const candidate of urls) {
    if (
      candidate.startsWith("blob:") ||
      candidate.startsWith("data:")
    ) {
      return candidate;
    }

    try {
      const resolvedUrl = await resolveMediaUrl(candidate);

      const response = await fetch(resolvedUrl, {
        headers: isApiUrl(
          resolvedUrl,
          API_BASE,
          window.location.href
        )
          ? authHeaders()
          : {},

        credentials: "omit",
        redirect: "follow",
        referrerPolicy: "no-referrer",
      });

      if (!response.ok) {
        lastError = `Image request failed: ${response.status}`;
        continue;
      }

      const contentType = (
        response.headers.get("content-type") || ""
      ).toLowerCase();

      const blob = await response.blob();

      const blobType = (blob.type || "").toLowerCase();

      const finalType = blobType || contentType;

      // Reject API JSON / HTML error responses.
      if (
        finalType.includes("application/json") ||
        finalType.includes("text/html") ||
        finalType.includes("text/plain")
      ) {
        lastError = `Endpoint returned ${finalType} instead of image`;
        continue;
      }

      // Prefer an actual image MIME type.
      if (
        finalType &&
        !finalType.startsWith("image/") &&
        finalType !== "application/octet-stream"
      ) {
        lastError = `Unsupported image content type: ${finalType}`;
        continue;
      }

      return URL.createObjectURL(blob);
    } catch (error) {
      lastError =
        error?.message ||
        "Unexpected error while loading image";
    }
  }

  throw new Error(lastError);
}

export default function AuthImage({
  src,
  alt = "",
  className = "",
  style,
  onClick,
}) {
  const [blobUrl, setBlobUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let createdBlobUrl = "";

    setBlobUrl("");
    setLoading(true);
    setFailed(false);

    const urls = buildCandidates({ src });

    if (!urls.length) {
      setLoading(false);
      setFailed(true);
      return undefined;
    }

    fetchImageBlob(urls)
      .then((url) => {
        if (cancelled) {
          if (url.startsWith("blob:")) {
            URL.revokeObjectURL(url);
          }

          return;
        }

        createdBlobUrl = url;

        setBlobUrl(url);
        setFailed(false);
        setLoading(false);
      })
      .catch((error) => {
        console.error("AuthImage failed:", {
          src,
          error,
          candidates: urls,
        });

        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;

      if (
        createdBlobUrl &&
        createdBlobUrl.startsWith("blob:")
      ) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [src]);

  if (loading) {
    return (
      <div
        className={className}
        style={{
          width: "100%",
          height: "100%",
          minHeight: 160,
          background: "#0c0f13",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...style,
        }}
        aria-label="Loading image"
      >
        <span
          style={{
            width: 22,
            height: 22,
            border: "2px solid rgba(255,255,255,0.12)",
            borderTopColor: "rgba(255,255,255,0.65)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
      </div>
    );
  }

  if (failed || !blobUrl) {
    return (
      <div
        className={className}
        style={{
          width: "100%",
          height: "100%",
          minHeight: 160,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          background: "#0c0f13",
          color: "#8d96a5",
          padding: 16,
          textAlign: "center",
          ...style,
        }}
      >
        <span style={{ fontSize: 22 }}>🖼</span>

        <span style={{ fontSize: 11 }}>
          Image couldn't be displayed
        </span>
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        ...style,
      }}
      onClick={onClick}
      loading="lazy"
      draggable={false}
    />
  );
}