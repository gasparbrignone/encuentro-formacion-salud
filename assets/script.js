// ── BURGER MENU
function toggleMenu() {
  const links = document.getElementById('navLinks');
  const burger = document.getElementById('burger');
  const isOpen = links.classList.toggle('open');
  burger.setAttribute('aria-expanded', String(isOpen));
}

// ── SCROLL REVEAL
const revealEls = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((e, i) => {
    if (e.isIntersecting) {
      setTimeout(() => e.target.classList.add('visible'), i * 80);
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });
revealEls.forEach(el => observer.observe(el));

// ── AGENDA + SPEAKERS (rendered from assets/data/*.json)
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function renderAgenda(blocks) {
  const container = document.getElementById('agendaItems');
  if (!container) return;
  container.innerHTML = '';

  blocks.forEach(block => {
    const bloque = el('div', 'agenda-bloque');
    bloque.style.gridColumn = '1/-1';
    bloque.appendChild(el('div', 'agenda-bloque-hora', block.hora));

    const itemsWrap = el('div', 'agenda-bloque-items');
    if (block.gridCols) itemsWrap.style.gridTemplateColumns = block.gridCols;

    block.items.forEach(item => {
      const card = el('div', 'agenda-item' + (item.especial ? ' agenda-item-especial' : ''));
      card.appendChild(el('div', 'agenda-item-icon', item.icon || ''));

      const body = document.createElement('div');
      body.appendChild(el('div', 'agenda-talk-title', item.title));
      if (item.speaker) body.appendChild(el('div', 'agenda-talk-speaker', item.speaker));
      if (item.desc) body.appendChild(el('div', 'agenda-talk-desc', item.desc));
      if (item.type) body.appendChild(el('span', 'agenda-talk-type', item.type));
      card.appendChild(body);

      itemsWrap.appendChild(card);
    });

    bloque.appendChild(itemsWrap);
    container.appendChild(bloque);
  });
}

function renderSpeakers(speakers) {
  const container = document.getElementById('speakersGrid');
  if (!container) return;
  container.innerHTML = '';

  speakers.forEach(sp => {
    const card = el('div', 'speaker-card');
    card.appendChild(el('div', 'speaker-avatar', sp.initials));
    card.appendChild(el('div', 'speaker-name', sp.name));
    card.appendChild(el('div', 'speaker-role', sp.role));
    card.appendChild(el('div', 'speaker-institution', sp.institution));
    container.appendChild(card);
  });

  const more = el('div', 'speaker-card');
  more.style.display = 'flex';
  more.style.alignItems = 'center';
  more.style.justifyContent = 'center';
  more.style.minHeight = '180px';
  const moreText = el('span', null, 'Más disertantes próximamente');
  moreText.style.fontStyle = 'italic';
  moreText.style.color = 'var(--text-muted)';
  moreText.style.fontSize = '0.95rem';
  more.appendChild(moreText);
  container.appendChild(more);
}

Promise.all([
  fetch('assets/data/agenda.json').then(r => r.json()),
  fetch('assets/data/speakers.json').then(r => r.json())
]).then(([agendaData, speakersData]) => {
  renderAgenda(agendaData.bloques || []);
  renderSpeakers(speakersData.speakers || []);
}).catch(err => {
  console.error('No se pudo cargar el contenido de agenda/disertantes:', err);
  const agendaEl = document.getElementById('agendaItems');
  const speakersEl = document.getElementById('speakersGrid');
  if (agendaEl) agendaEl.innerHTML = '<p class="agenda-placeholder">No se pudo cargar el programa. Recargá la página.</p>';
  if (speakersEl) speakersEl.innerHTML = '<p class="speakers-placeholder">No se pudo cargar la lista de disertantes.</p>';
});

// ── NAV ACTIVE HIGHLIGHT ON SCROLL
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-links a');
window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(s => {
    if (window.scrollY >= s.offsetTop - 100) current = s.id;
  });
  navLinks.forEach(a => {
    a.style.color = a.getAttribute('href') === '#' + current ? 'var(--blue)' : '';
  });
});
