const URL_REGEX = /((https?:\/\/|www\.)[^\s<]+)/gi;

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function plainTextToLinkedHtml(text: string): string {
  if (!text) return '<div style="white-space:pre-wrap"></div>';

  let html = "";
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const full = match[0];
    const index = match.index ?? 0;
    html += escapeHtml(text.slice(lastIndex, index));

    const href =
      full.startsWith("http://") || full.startsWith("https://")
        ? full
        : `https://${full}`;

    html += `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(full)}</a>`;
    lastIndex = index + full.length;
  }

  html += escapeHtml(text.slice(lastIndex));
  return `<div style="white-space:pre-wrap">${html}</div>`;
}
