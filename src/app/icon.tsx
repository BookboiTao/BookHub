import { ImageResponse } from "next/og";

/* ------------------------------------------------------------------ *
 * Favicon — open book in indigo on near-black.
 * Matches the sidebar logo in src/components/bookhub/app-shell.tsx
 * so the browser tab icon and the in-app brand stay consistent.
 *
 * Also exposed at /icon by Next.js App Router convention, and the
 * layout.tsx metadata.icons points /logo.svg (same drawing) at it
 * for older browsers.
 * ------------------------------------------------------------------ */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c0c0e",
          borderRadius: "7px",
        }}
      >
        {/* Open book — same shape as the sidebar logo */}
        <svg
          width="22"
          height="22"
          viewBox="0 0 32 32"
          fill="none"
          stroke="#818cf8"
          strokeWidth="1.8"
          strokeLinejoin="round"
        >
          {/* faint fill behind the book */}
          <path
            d="M16 7.5C14 6 11 5.5 7 6v15.5c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V6c-4-.5-7 0-9 1.5z"
            fill="#818cf8"
            fillOpacity="0.18"
          />
          {/* book outline */}
          <path d="M16 7.5C14 6 11 5.5 7 6v15.5c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V6c-4-.5-7 0-9 1.5z" />
          {/* spine */}
          <line x1="16" y1="8" x2="16" y2="23" stroke="#818cf8" strokeWidth="1.8" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
