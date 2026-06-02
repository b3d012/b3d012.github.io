const phrases = [
  "computer vision demos",
  "fairness research pipelines",
  "CV-ready AI projects",
  "clean model evaluation",
  "future AI tools"
];

const typingTarget = document.querySelector("#typing-text");
let phraseIndex = 0;
let charIndex = 0;
let deleting = false;

function typeLoop() {
  if (!typingTarget) return;

  const currentPhrase = phrases[phraseIndex];

  if (!deleting) {
    typingTarget.textContent = currentPhrase.slice(0, charIndex + 1);
    charIndex += 1;

    if (charIndex === currentPhrase.length) {
      deleting = true;
      setTimeout(typeLoop, 1200);
      return;
    }
  } else {
    typingTarget.textContent = currentPhrase.slice(0, charIndex - 1);
    charIndex -= 1;

    if (charIndex === 0) {
      deleting = false;
      phraseIndex = (phraseIndex + 1) % phrases.length;
    }
  }

  setTimeout(typeLoop, deleting ? 45 : 70);
}

typeLoop();

const revealElements = document.querySelectorAll(".reveal");

const observer = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  },
  { threshold: 0.18 }
);

revealElements.forEach(element => observer.observe(element));

const panels = document.querySelectorAll(".project-panel");

panels.forEach(panel => {
  panel.addEventListener("focus", () => setActivePanel(panel));
  panel.addEventListener("click", () => setActivePanel(panel));
});

function setActivePanel(activePanel) {
  panels.forEach(panel => panel.classList.remove("active"));
  activePanel.classList.add("active");
  activePanel.classList.remove("is-entering");
  void activePanel.offsetWidth;
  activePanel.classList.add("is-entering");

  window.clearTimeout(activePanel._enterTimer);
  activePanel._enterTimer = window.setTimeout(() => {
    activePanel.classList.remove("is-entering");
  }, 420);
}

const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

const yearTarget = document.querySelector("#year");
if (yearTarget) {
  yearTarget.textContent = new Date().getFullYear();
}
