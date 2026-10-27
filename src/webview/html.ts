// The webview's HTML shell. No vscode import, so it is unit-testable; the host passes in
// the webview URIs. Buttons are drawn by the script from `state` messages, never here.

export interface HtmlParts {
  /** `webview.cspSource` */
  cspSource: string;
  nonce: string;
  codiconCss: string;
  gridCss: string;
  script: string;
}

export function gridHtml(p: HtmlParts): string {
  const csp = [
    "default-src 'none'",
    `font-src ${p.cspSource}`,
    `img-src ${p.cspSource}`,
    `style-src ${p.cspSource}`,
    `script-src 'nonce-${p.nonce}'`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp};">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${p.codiconCss}">
<link rel="stylesheet" href="${p.gridCss}">
</head>
<body>
<div class="tr-banner" role="alert" hidden></div>
<div class="tr-nav" hidden></div>
<div class="tr-grid" role="toolbar" aria-label="Task Runner buttons"></div>
<div class="tr-empty" hidden></div>
<div class="tr-live" role="status" aria-live="polite"></div>
<script nonce="${p.nonce}" src="${p.script}"></script>
</body>
</html>`;
}

export function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
