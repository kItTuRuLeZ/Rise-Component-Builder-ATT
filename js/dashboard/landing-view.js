/**
 * Animated Particle Hero Landing Page Controller
 * Native Vanilla JS implementation of the ParticleHero experience
 */

export class LandingView {
  constructor({ container = null, onEnterDashboard = null } = {}) {
    this.container = container;
    this.onEnterDashboard = onEnterDashboard;

    this.particleCount = 14;
    this.particles = [];
    this.cursor = { x: 0, y: 0 };
    this.staticCursor = { x: 0, y: 0 };
    this.isAutoMode = true;
    this.isStaticAnimation = false;
    this.startTime = Date.now();
    this.lastMouseMove = Date.now();
    this.animationFrameId = null;
    this.timeoutId = null;
    this.idleTimerId = null;

    this.handlePointerMove = this.handlePointerMove.bind(this);
  }

  mount() {
    this.render();
    this.initParticles();
    this.startAnimationLoop();
    document.addEventListener('mousemove', this.handlePointerMove);
    document.addEventListener('touchmove', this.handlePointerMove, { passive: true });
  }

  unmount() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.idleTimerId) clearTimeout(this.idleTimerId);

    document.removeEventListener('mousemove', this.handlePointerMove);
    document.removeEventListener('touchmove', this.handlePointerMove);

    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <section class="landing-hero-view" aria-label="Welcome to Rise Component Builder">
        <!-- Ambient Atmospheric Orbs -->
        <div class="landing-ambient-orbs" aria-hidden="true">
          <div class="landing-orb landing-orb-1"></div>
          <div class="landing-orb landing-orb-2"></div>
          <div class="landing-orb landing-orb-3"></div>
        </div>

        <!-- Particle Grid Stage -->
        <div class="landing-particle-stage" aria-hidden="true">
          <div id="landing-particle-grid" class="landing-particle-grid"></div>
        </div>

        <!-- Hero Content Overlay -->
        <div class="landing-hero-content">
          <div class="landing-hero-inner">
            
            <div class="landing-brand-badge">
              <span class="landing-brand-tag">Aptara Learning Technologies</span>
              <span class="landing-brand-dot"></span>
              <span class="landing-brand-tech">Design target: WCAG 2.2 AA</span>
            </div>

            <div class="landing-title-wrap">
              <h1 class="landing-title">
                <span class="landing-title-gradient">APTARA STUDIO</span>
              </h1>
              <div class="landing-subtitle-wrap">
                <h2 class="landing-subtitle" aria-label="Rise Interaction &amp; Course Studio">
                  ${this.getAnimatedSubtitleHtml('Rise Interaction & Course Studio')}
                </h2>
                <div class="landing-subtitle-rule"></div>
              </div>
            </div>

            <p class="landing-desc">
              Design, preview, audit, and package custom interactive modules and multi-module course suites for Articulate Rise 360 without coding.
            </p>

            <div class="landing-cta-group">
              <button type="button" class="landing-btn-primary" id="btn-landing-enter-dashboard">
                <span class="landing-btn-text">Start Building Experiences</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
                <div class="landing-btn-glow"></div>
              </button>
            </div>

            <div class="landing-interactive-hint" aria-hidden="true">
              <div class="landing-hint-line"></div>
              <span class="landing-hint-text">Move cursor to interact</span>
              <div class="landing-hint-line"></div>
            </div>

          </div>
        </div>
      </section>
    `;

    // Button event listeners
    const enterDashBtn = this.container.querySelector('#btn-landing-enter-dashboard');
    if (enterDashBtn) {
      enterDashBtn.addEventListener('click', () => {
        if (this.onEnterDashboard) this.onEnterDashboard();
      });
    }
  }

  getAnimatedSubtitleHtml(text) {
    const numLetters = text.length;
    const delayMultiplier = 0.08;
    return text.split('').map((char, index) => {
      const mappedIndex = index - numLetters / 2;
      const delay = (mappedIndex * delayMultiplier).toFixed(3);
      if (char === ' ') {
        return `<span class="animated-char space" aria-hidden="true" style="animation-delay: ${delay}s;">&nbsp;</span>`;
      }
      const safeChar = char === '&' ? '&amp;' : (char === '<' ? '&lt;' : (char === '>' ? '&gt;' : char));
      return `<span class="animated-char" aria-hidden="true" style="animation-delay: ${delay}s;">${safeChar}</span>`;
    }).join('');
  }

  initParticles() {
    const gridContainer = this.container.querySelector('#landing-particle-grid');
    if (!gridContainer) return;

    gridContainer.innerHTML = '';
    this.particles = [];

    const rows = this.particleCount;
    const total = rows * rows;
    gridContainer.style.width = `${rows * 1.8}rem`;
    gridContainer.style.height = `${rows * 1.8}rem`;

    for (let i = 0; i < total; i++) {
      const particle = document.createElement('div');
      particle.className = 'landing-particle';

      const row = Math.floor(i / rows);
      const col = i % rows;
      const centerRow = Math.floor(rows / 2);
      const centerCol = Math.floor(rows / 2);

      const distanceFromCenter = Math.sqrt(
        Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2)
      );

      const scale = Math.max(0.1, 1.2 - distanceFromCenter * 0.12);
      const opacity = Math.max(0.06, 1 - distanceFromCenter * 0.1);
      const lightness = Math.max(25, 80 - distanceFromCenter * 5);
      const glowSize = Math.max(0.5, 6 - distanceFromCenter * 0.5);

      particle.style.cssText = `
        position: absolute;
        width: 0.45rem;
        height: 0.45rem;
        left: ${col * 1.8}rem;
        top: ${row * 1.8}rem;
        border-radius: 9999px;
        transform: scale(${scale});
        opacity: ${opacity};
        background: hsl(205, 100%, ${lightness}%);
        box-shadow: 0 0 ${glowSize * 0.28}rem 0 hsl(197, 100%, 55%);
        mix-blend-mode: screen;
        z-index: ${Math.round(total - distanceFromCenter * 5)};
        transition: transform 0.05s linear;
        pointer-events: none;
      `;

      gridContainer.appendChild(particle);
      this.particles.push({
        element: particle,
        distanceFromCenter,
        originalScale: scale
      });
    }
  }

  startAnimationLoop() {
    const animate = () => {
      const currentTime = (Date.now() - this.startTime) * 0.001;

      if (this.isAutoMode) {
        const x = Math.sin(currentTime * 0.3) * 200 + Math.sin(currentTime * 0.17) * 100;
        const y = Math.cos(currentTime * 0.2) * 150 + Math.cos(currentTime * 0.23) * 80;
        this.cursor = { x, y };
      } else if (this.isStaticAnimation) {
        const timeSinceLastMove = Date.now() - this.lastMouseMove;
        if (timeSinceLastMove > 200) {
          const animationStrength = Math.min((timeSinceLastMove - 200) / 1000, 1);
          const subtleX = Math.sin(currentTime * 1.5) * 20 * animationStrength;
          const subtleY = Math.cos(currentTime * 1.2) * 16 * animationStrength;
          this.cursor = {
            x: this.staticCursor.x + subtleX,
            y: this.staticCursor.y + subtleY
          };
        }
      }

      this.updateParticles();
      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  updateParticles() {
    this.particles.forEach((item) => {
      const delay = item.distanceFromCenter * 8;
      const dampening = Math.max(0.3, 1 - item.distanceFromCenter * 0.08);

      setTimeout(() => {
        const moveX = this.cursor.x * dampening;
        const moveY = this.cursor.y * dampening;
        item.element.style.transform = `translate(${moveX}px, ${moveY}px) scale(${item.originalScale})`;
        item.element.style.transition = `transform ${120 + item.distanceFromCenter * 20}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
      }, delay);
    });
  }

  handlePointerMove(e) {
    const event = e.touches ? e.touches[0] : e;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    const newCursor = {
      x: (event.clientX - centerX) * 0.8,
      y: (event.clientY - centerY) * 0.8
    };

    this.cursor = newCursor;
    this.staticCursor = newCursor;
    this.isAutoMode = false;
    this.isStaticAnimation = false;
    this.lastMouseMove = Date.now();

    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => {
      this.isStaticAnimation = true;
    }, 500);

    if (this.idleTimerId) clearTimeout(this.idleTimerId);
    this.idleTimerId = setTimeout(() => {
      if (Date.now() - this.lastMouseMove >= 4000) {
        this.isAutoMode = true;
        this.isStaticAnimation = false;
        this.startTime = Date.now();
      }
    }, 4000);
  }
}
