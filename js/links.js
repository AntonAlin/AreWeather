/* The resources page: everything that decides whether a day happens and is not
   weather. Rendered from the RESOURCES block in config, so adding a link is a
   data change and the page stays bilingual for free. */

import { RESOURCES } from './config.js';
import { $, el } from './util.js';
import { t, tr, applyTranslations, renderLangToggle } from './i18n.js';

function render() {
  applyTranslations();
  const root = $('#resources');
  root.textContent = '';

  let count = 0;
  for (const group of RESOURCES.groups) {
    const section = el('section', { class: 'card', id: group.id }, root);
    const head = el('div', { class: 'card-head' }, section);
    const headText = el('div', {}, head);
    el('h2', { text: tr(group.title) }, headText);
    el('p', { class: 'sub', text: tr(group.intro) }, headText);

    const list = el('div', { class: 'link-list' }, section);
    for (const item of group.items) {
      count++;
      const a = el('a', {
        class: `link-item${item.primary ? ' primary' : ''}`,
        href: item.url, target: '_blank', rel: 'noopener',
      }, list);
      const top = el('div', { class: 'link-top' }, a);
      el('span', { class: 'link-name', text: tr(item.name) }, top);
      el('span', { class: 'link-host', text: new URL(item.url).host.replace(/^www\./, '') }, top);
      el('p', { class: 'link-note', text: tr(item.note) }, a);
    }
  }

  $('#links-count').textContent = t('links.count', { n: count });
  $('#links-verified').textContent = t('links.verified', { date: RESOURCES.verified });
}

render();
renderLangToggle($('#lang-toggle'), render);

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
