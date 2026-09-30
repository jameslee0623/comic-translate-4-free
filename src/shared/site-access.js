// Shared helpers for host-permission grants around the page's picture host.
//
// Some sites serve every image from a per-visit random hostname (e.g.
// e-hentai's Hentai@Home network: <random>.<random>.hath.network:25565, with
// an expiring keystamp token in the image path). Granting the exact random
// host is whack-a-mole — the grant is useless on the next visit. For the
// IMAGE host we therefore grant the base (parent) domain instead: one grant
// covers all present and future random subdomains. The PAGE host keeps the
// existing exact-host + subdomain-wildcard grant.

/**
 * Base (parent) domain of a host: the last two DNS labels.
 * 'iumglla.ffaixopsskuh.hath.network' -> 'hath.network'.
 * IP literals and single-label hosts have no parent: returned as-is.
 *
 * NOTE: naive last-two-labels over-broadens under multi-label public
 * suffixes ('pic.example.co.uk' -> 'co.uk'). Accepted: such image hosts are
 * rare, and the permission prompt always shows the exact pattern being
 * requested, so the user can judge before granting.
 */
export function baseDomain(host) {
  const h = String(host || '').toLowerCase().trim().replace(/\.$/, '');
  if (!h) return '';
  // IPv4 / IPv6 literal: no parent domain exists.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':')) return h;
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  return parts.slice(-2).join('.');
}

/**
 * Origins to request for an image host: base domain, its subdomains, and
 * the exact host (covers the no-subdomain case). One grant then survives
 * random per-visit subdomains.
 */
export function imageHostOrigins(host) {
  const h = String(host || '').toLowerCase().trim();
  if (!h) return [];
  const base = baseDomain(h);
  const out = [`*://${base}/*`, `*://*.${base}/*`];
  if (base !== h) out.push(`*://${h}/*`);
  return [...new Set(out)];
}

/**
 * Origin patterns a has-access check accepts for a host: an exact-host
 * grant (any scheme form, incl. the scheme-specific grants Firefox records)
 * OR a base-domain grant. Existing exact-host grants keep working — no
 * re-prompt after this change, unless the host itself is random per visit.
 */
export function originAccessPatterns(host) {
  const h = String(host || '').toLowerCase().trim();
  if (!h) return [];
  const base = baseDomain(h);
  const pats = [`*://${h}/*`, `http://${h}/*`, `https://${h}/*`];
  if (base && base !== h) pats.push(`*://${base}/*`, `*://*.${base}/*`);
  return pats;
}

/**
 * Short display form for messages and the grant button: '*.hath.network'
 * when a base-domain grant applies, otherwise the host unchanged.
 */
export function displayHost(host) {
  const h = String(host || '').toLowerCase().trim();
  if (!h) return '';
  const base = baseDomain(h);
  return base && base !== h ? '*.' + base : h;
}
