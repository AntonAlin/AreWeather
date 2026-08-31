/* Point the site at a domain, or back at GitHub Pages.

   GitHub Pages needs a CNAME file in the published root, and a few files carry
   an absolute URL that a search engine will believe: robots.txt names the
   sitemap, and the sitemap names every page. This updates all of them together
   so they cannot drift apart.

   Usage:
     node tools/set-domain.mjs areweather.se           # apex
     node tools/set-domain.mjs www.areweather.se       # subdomain
     node tools/set-domain.mjs --reset                 # back to github.io

   Then commit the result. Setting the domain in Settings → Pages writes its own
   CNAME file; keeping it in the repository as well means a later push cannot
   quietly delete it. */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FALLBACK = 'https://antonalin.github.io/AreWeather';
const PAGES = ['', 'compare.html', 'methods.html'];

const arg = process.argv[2];
if (!arg) {
  console.error('usage: node tools/set-domain.mjs <domain> | --reset');
  process.exit(1);
}

const reset = arg === '--reset';
const domain = reset ? null : arg.replace(/^https?:\/\//, '').replace(/\/+$/, '');
if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
  console.error(`"${domain}" does not look like a domain name.`);
  process.exit(1);
}
const origin = domain ? `https://${domain}` : FALLBACK;

const write = (name, body) => { writeFileSync(join(root, name), body); console.log(`  ${name}`); };
const read = (name) => readFileSync(join(root, name), 'utf8');

console.log(reset ? 'Resetting to GitHub Pages:' : `Pointing the site at ${origin}:`);

/* CNAME — the file GitHub Pages reads to know the domain is yours. */
const cnamePath = join(root, 'CNAME');
if (domain) write('CNAME', `${domain}\n`);
else if (existsSync(cnamePath)) { unlinkSync(cnamePath); console.log('  CNAME (removed)'); }

write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map((page, i) => `  <url>
    <loc>${origin}/${page}</loc>
    <changefreq>${i === 2 ? 'monthly' : 'daily'}</changefreq>
    <priority>${[1.0, 0.9, 0.6][i].toFixed(1)}</priority>
  </url>`).join('\n')}
</urlset>
`);

write('robots.txt', read('robots.txt').replace(/^Sitemap: .*$/m, `Sitemap: ${origin}/sitemap.xml`));
write('README.md', read('README.md')
  .replace(/Live at \*\*[^*]+\*\*/, `Live at **${origin}/**`)
  .replace(/^Live at \*\*.+$/m, `Live at **${origin}/**`));

console.log(domain
  ? `\nNow: commit this, then set the domain in Settings → Pages and tick Enforce HTTPS.\n`
  : '\nBack to GitHub Pages. Remember to clear the custom domain in Settings → Pages too.\n');
