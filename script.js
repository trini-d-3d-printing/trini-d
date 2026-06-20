
const root = document.documentElement;
const themeToggle = document.querySelector('#themeToggle');

function applyTheme(theme) {
  const selectedTheme = theme === 'dark' ? 'dark' : 'light';
  root.setAttribute('data-theme', selectedTheme);
  localStorage.setItem('trini-d-theme', selectedTheme);

  if (themeToggle) {
    const isDark = selectedTheme === 'dark';
    themeToggle.setAttribute('aria-pressed', String(isDark));
    themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggle.querySelector('.theme-icon').textContent = isDark ? '☀️' : '🌙';
    themeToggle.querySelector('.theme-text').textContent = isDark ? 'Light' : 'Dark';
  }
}
applyTheme(localStorage.getItem('trini-d-theme') || 'light');
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const currentTheme = root.getAttribute('data-theme') || 'light';
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });
}

const menuBtn = document.querySelector('#menuBtn');
const mobileMenu = document.querySelector('#mobileMenu');
if (menuBtn && mobileMenu) {
  menuBtn.addEventListener('click', () => {
    mobileMenu.classList.toggle('show');
    menuBtn.setAttribute('aria-expanded', mobileMenu.classList.contains('show'));
  });
}

document.querySelectorAll('[data-nav]').forEach(link => {
  const current = location.pathname.split('/').pop() || 'index.html';
  if (link.getAttribute('href') === current) link.classList.add('active');
});

const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();

const quoteForm = document.querySelector('#quoteForm');
const quoteOutput = document.querySelector('#quoteOutput');
if (quoteForm && quoteOutput) {
  const fileInput = quoteForm.querySelector('#modelFile');
  const fileLabel = quoteForm.querySelector('#fileLabel');
  let selectedFileName = '';
  if (fileInput && fileLabel) {
    fileInput.addEventListener('change', () => {
      selectedFileName = fileInput.files.length ? fileInput.files[0].name : '';
      fileLabel.textContent = selectedFileName || 'Choose .stl or .3mf file name';
    });
  }
  quoteForm.addEventListener('submit', e => {
    e.preventDefault();
    const data = new FormData(quoteForm);
    const name = data.get('name') || 'Customer';
    const phone = data.get('phone') || '';
    const material = data.get('material') || 'Not sure';
    const qty = data.get('quantity') || '1';
    const color = data.get('color') || 'Not specified';
    const purpose = data.get('purpose') || 'Not specified';
    const notes = data.get('notes') || 'No extra notes';
    const fileName = selectedFileName || 'I will attach the STL/3MF file';
    const lines = [
      'Hello Trini-D, I want a 3D printing price estimate.',
      `Name: ${name}`,
      `My WhatsApp/Phone: ${phone}`,
      `Material: ${material}`,
      `Quantity: ${qty}`,
      `Preferred Color: ${color}`,
      `Purpose: ${purpose}`,
      `File: ${fileName}`,
      `Notes: ${notes}`,
      'I will attach my .stl/.3mf model file in this chat.'
    ];
    const url = `https://wa.me/94751656777?text=${encodeURIComponent(lines.join('\n'))}`;
    quoteOutput.innerHTML = `<strong>Request ready.</strong><br>Click the button below to send your quotation request on WhatsApp. Attach your model file in the chat after it opens.<br><br><a class="btn primary" href="${url}" target="_blank" rel="noopener">Send on WhatsApp</a>`;
  });
}

const revealItems = document.querySelectorAll('.reveal-up,.service-card,.info-card,.step-card,.gallery-card,.glass-panel,.quote-strip,.material-card,.machine-card,.launch-card,.faq details');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.transform = 'translateY(0)';
        entry.target.style.opacity = '1';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .12 });
  revealItems.forEach(item => {
    item.style.transform = 'translateY(24px)';
    item.style.opacity = '.001';
    item.style.transition = 'opacity .65s ease, transform .65s ease';
    observer.observe(item);
  });
}

// Auto slideshow for hero 3D printed item photos
const slideshows = document.querySelectorAll('[data-slideshow]');
slideshows.forEach(slideshow => {
  const slides = Array.from(slideshow.querySelectorAll('.print-slide'));
  const nextBtn = slideshow.querySelector('.slide-control.next');
  const prevBtn = slideshow.querySelector('.slide-control.prev');
  const dotsWrap = slideshow.querySelector('.slide-dots');
  const intervalTime = Number(slideshow.dataset.interval) || 3500;
  let currentIndex = Math.max(0, slides.findIndex(slide => slide.classList.contains('active')));
  let timer;

  function showSlide(index) {
    currentIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => slide.classList.toggle('active', i === currentIndex));
    if (dotsWrap) {
      dotsWrap.querySelectorAll('.slide-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === currentIndex);
        dot.setAttribute('aria-current', i === currentIndex ? 'true' : 'false');
      });
    }
  }

  function startAutoPlay() {
    stopAutoPlay();
    timer = setInterval(() => showSlide(currentIndex + 1), intervalTime);
  }

  function stopAutoPlay() {
    if (timer) clearInterval(timer);
  }

  if (dotsWrap) {
    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'slide-dot';
      dot.setAttribute('aria-label', `Show slide ${i + 1}`);
      dot.addEventListener('click', () => {
        showSlide(i);
        startAutoPlay();
      });
      dotsWrap.appendChild(dot);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      showSlide(currentIndex + 1);
      startAutoPlay();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      showSlide(currentIndex - 1);
      startAutoPlay();
    });
  }

  slideshow.addEventListener('mouseenter', stopAutoPlay);
  slideshow.addEventListener('mouseleave', startAutoPlay);
  showSlide(currentIndex);
  startAutoPlay();
});
