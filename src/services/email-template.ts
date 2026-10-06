/**
 * The portal's email layout: logo, heading, message, one button, and a footer saying how to
 * change or stop these emails. Every email is sent as HTML with a plain-text version.
 * Styles are inline and the layout is a single table, because email programs ignore
 * stylesheets and most layout CSS.
 */

const brand = "#ea3435";
const ink = "#111111";
const muted = "#5a5a5a";
const line = "#d9d9d9";

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export type EmailContent = {
  heading: string;
  /** Plain text. Blank lines separate paragraphs. */
  body: string;
  link: { url: string; label: string } | null;
  logoUrl: string;
  /** Left out for emails people can't opt out of, such as an invitation. */
  footer: { preferencesUrl: string; unsubscribeUrl: string } | null;
};

export function renderNotificationEmail(content: EmailContent) {
  const paragraphs = content.body.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const font = "font-family:'Segoe UI',Arial,Helvetica,sans-serif;";

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.heading)}</title></head>
<body style="margin:0;padding:0;background:#f6f6f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${line};">
<tr><td style="padding:20px 28px;border-bottom:3px solid ${brand};"><img src="${escapeHtml(content.logoUrl)}" alt="Pfeiffer Vacuum, part of the Busch Group" height="36" style="display:block;height:36px;width:auto;border:0;"></td></tr>
<tr><td style="padding:28px;${font}color:${ink};">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;${font}">${escapeHtml(content.heading)}</h1>
${paragraphs.map((paragraph) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#333333;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("\n")}
${content.link ? `<p style="margin:22px 0 4px;"><a href="${escapeHtml(content.link.url)}" style="display:inline-block;background:${brand};color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:11px 20px;${font}">${escapeHtml(content.link.label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid ${line};${font}font-size:12px;line-height:1.6;color:${muted};">
${content.footer
    ? `You're receiving this because you have access to this repair in the VacTech service portal. <a href="${escapeHtml(content.footer.preferencesUrl)}" style="color:${muted};">Choose which emails you get</a> or <a href="${escapeHtml(content.footer.unsubscribeUrl)}" style="color:${muted};">stop emails like this one</a>.`
    : "This message was sent by the VacTech service portal."}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const plainText = [
    content.heading,
    "",
    ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(content.link ? [`${content.link.label}: ${content.link.url}`, ""] : []),
    ...(content.footer ? [`Choose which emails you get: ${content.footer.preferencesUrl}`, `Stop emails like this one: ${content.footer.unsubscribeUrl}`] : []),
  ].join("\n").trim();

  return { html, plainText };
}
