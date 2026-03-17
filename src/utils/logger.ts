// Structured stderr logger — keeps stdout clean for MCP stdio transport
// Colors aligned with proxypi_cli_preview.html

type Level = "info" | "warn" | "error" | "debug";

const TTY = process.stderr?.isTTY ?? false;
const R = "\x1b[0m";

// From preview: info #5a9fd4, warn #e0a060, success #5ac97a, error #e05a5a
const INFO = TTY ? "\x1b[38;5;74m" : "";
const WARN = TTY ? "\x1b[38;5;215m" : "";
const SUCCESS = TTY ? "\x1b[38;5;78m" : "";
const ERROR = TTY ? "\x1b[38;5;167m" : "";
const PROXYPY = TTY ? "\x1b[38;5;140m" : ""; // section/violet #a370db

function write(level: Level, message: string, data?: unknown) {
  const prefix = {
    info:  `${INFO}▶${R} ${PROXYPY}proxypi${R} `,
    warn:  `${WARN}⚠${R} ${PROXYPY}proxypi${R} `,
    error: `${ERROR}✖${R} ${PROXYPY}proxypi${R} `,
    debug: `${INFO}·${R} ${PROXYPY}proxypi${R} `,
  }[level];

  const line = data
    ? `${prefix}${message} ${JSON.stringify(data)}`
    : `${prefix}${message}`;

  process.stderr.write(line + "\n");
}

export const logger = {
  info:  (msg: string, data?: unknown) => write("info",  msg, data),
  warn:  (msg: string, data?: unknown) => write("warn",  msg, data),
  error: (msg: string, data?: unknown) => write("error", msg, data),
  debug: (msg: string, data?: unknown) => write("debug", msg, data),
  done:  (msg: string) =>
    process.stderr.write(`${SUCCESS}✔${R} ${PROXYPY}proxypi${R}  ${msg}\n`),
};

/** Rainbow gradient for banner — keep banner.txt as plain ASCII, colors applied at display */
const RAINBOW = [196, 208, 226, 46, 51, 39, 129, 201]; // red→orange→yellow→green→cyan→blue→violet→magenta

export function applyRainbowToBanner(text: string): string {
  if (!TTY) return text;
  let i = 0;
  return text
    .replace(/\r?\n/g, "\n")
    .split("")
    .map((ch) => {
      if (ch === "\n") return ch;
      const code = RAINBOW[i % RAINBOW.length];
      i++;
      return `\x1b[38;5;${code}m${ch}`;
    })
    .join("") + R;
}

/** Footer line (version, URL) — blue like dispatch-mcp */
const B = TTY ? "\x1b[38;5;51m" : "";
export function colorizeBannerFooter(text: string): string {
  return TTY ? `${B}${text}${R}` : text;
}
