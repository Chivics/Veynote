import { useEffect, useState } from "react";
import { API_BASE } from "../api/client";
import { resolveMediaUrl } from "../utils/media";

const API_ORIGIN = new URL(API_BASE, window.location.href).origin;

/**
 * Authentication headers used only for protected API endpoints.
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
 * Decide whether this media request should receive Authorization headers.
 *
 * IMPORTANT:
 * /uploads/... URLs using ?access= already have their own access token.
 * Sending Authorization to those URLs causes the CORS error we saw.
 */
function shouldSendAuthHeaders(url) {
  try {
    const parsed = new URL(url, window.location.href);

    // Only our API origin can receive Veynote auth headers.
    if (parsed.origin !== API_ORIGIN) {
      return false;
    }

    // Signed upload/media URLs already contain authorization in the URL.
    if (
      parsed.pathname.startsWith("/uploads/") ||
      parsed.searchParams.has("access")
    ) {
      return false;
    }

    // Protected /api/... endpoints can receive Authorization.
    return parsed.pathname.startsWith("/api/");
  } catch {
    return false;
  }
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
 * Convert a media path returned from the API into an absolute URL.
 */
function toAbsoluteUrl(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  // Browser-generated previews.
  if (value.startsWith("blob:") || value.startsWith("data:")) {
    return value;
  }

  // Already absolute.
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  // API endpoint.
  if (value.startsWith("/api/")) {
    return `${API_ORIGIN}${value}`;
  }

  // Uploaded file.
  if (value.startsWith("/uploads/")) {
    return `${API_ORIGIN}${value}`;
  }

  // Other root-relative backend path.
  if (value.startsWith("/")) {
    return `${API_ORIGIN}${value}`;
  }

  // Relative media path.
  try {
    return new URL(
      value,
      `${API_BASE.replace(/\/$/, "")}/`
    ).href;
  } catch {
    return null;
  }
}

/**
 * Creates possible media URLs to try.
 *
 * Examples:
 *
 * /uploads/file.png
 *
 * OR
 *
 * /api/trading/images/123
 * /api/trading/images/123/file
 */
function buildCandidates({ src }) {
  if (!src || typeof src !== "string") {
    return [];
  }

  if (src.startsWith("blob:") || src.startsWith("data:")) {
    return [src];
  }

  const result = [];

  const absolute = toAbsoluteUrl(src);

  if (!absolute) {
    return [];
  }

  result.push(absolute);

  /**
   * Only add /file alternatives for API-style image endpoints.
   *
   * DO NOT append /file to /uploads/image.png.
   */
  try {
    const parsed = new URL(absolute);

    const isUpload = parsed.pathname.startsWith("/uploads/");

    if (!isUpload) {
      if (
        parsed.pathname.includes("/images/") &&
        !parsed.pathname.endsWith("/file")
      ) {
        const fileUrl = new URL(parsed.toString());

        fileUrl.pathname = `${fileUrl.pathname.replace(
          /\/$/,
          ""
        )}/file`;

        result.push(fileUrl.toString());
      }

      if (
        parsed.pathname.includes("/attachments/") &&
        !parsed.pathname.endsWith("/file")
      ) {
        const fileUrl = new URL(parsed.toString());

        fileUrl.pathname = `${fileUrl.pathname.replace(
          /\/$/,
          ""
        )}/file`;

        result.push(fileUrl.toString());
      }
    }
  } catch {
    // The original absolute URL can still be attempted.
  }

  return [...new Set(result.filter(Boolean))];
}

/**
 * Fetch an image and return a local browser blob URL.
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
      /**
       * resolveMediaUrl may transform:
       *
       * /uploads/file.png
       *
       * into something like:
       *
       * https://api.veynote.app/uploads/file.png?access=...
       */
      const resolvedUrl = await resolveMediaUrl(candidate);

      const useAuth = shouldSendAuthHeaders(resolvedUrl);

      const response = await fetch(resolvedUrl, {
        headers: useAuth ? authHeaders() : {},

        credentials: "omit",

        redirect: "follow",

        referrerPolicy: "no-referrer",
      });

      if (!response.ok) {
        lastError = `Image request failed: ${response.status}`;

        console.warn("AuthImage request failed:", {
          candidate,
          resolvedUrl,
          status: response.status,
        });

        continue;
      }

      const contentType = (
        response.headers.get("content-type") || ""
      ).toLowerCase();

      const blob = await response.blob();

      const blobType = (blob.type || "").toLowerCase();

      const finalType = blobType || contentType;

      /**
       * If the backend returned JSON/HTML/text,
       * it is not actually returning the image.
       */
      if (
        finalType.includes("application/json") ||
        finalType.includes("text/html") ||
        finalType.includes("text/plain")
      ) {
        lastError = `Endpoint returned ${finalType} instead of an image`;

        console.warn("AuthImage received non-image response:", {
          candidate,
          resolvedUrl,
          contentType: finalType,
        });

        continue;
      }

      /**
       * Accept proper image MIME types.
       *
       * application/octet-stream is also accepted because some
       * file servers return images using this generic MIME type.
       */
      if (
        finalType &&
        !finalType.startsWith("image/") &&
        finalType !== "application/octet-stream"
      ) {
        lastError = `Unsupported image content type: ${finalType}`;

        continue;
      }

      if (!blob.size) {
        lastError = "Image response was empty";
        continue;
      }

      return URL.createObjectURL(blob);
    } catch (error) {
      lastError =
        error?.message ||
        "Unexpected error while loading image";

      console.warn("AuthImage fetch attempt failed:", {
        candidate,
        error,
      });
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

  /**
   * Loading state.
   */
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

  /**
   * Error state.
   *
   * Do not display the filename here because that made it
   * look like the filename was the uploaded content.
   */
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
        <span
          aria-hidden="true"
          style={{
            fontSize: 22,
          }}
        >
          🖼
        </span>

        <span
          style={{
            fontSize: 11,
          }}
        >
          Image couldn't be displayed
        </span>
      </div>
    );
  }

  /**
   * Successfully loaded image.
   */
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
        objectPosition: "center",
        ...style,
      }}
      onClick={onClick}
      loading="lazy"
      draggable={false}
    />
  );
}