/**
 * iOS 18 Control Center Glassmorphism & Spring Motion Controller
 * Captures Apple's fluid tap/spring physics, specular borders, and glassmorphism.
 */

const MOTION_ID = 'ios18-control-center-glass';

export function init(containerSelector = '[data-motion="ios18-control-center-glass"]') {
  const container = document.querySelector(containerSelector);
  if (!container) return null;

  // Add subtle dynamic specular reflection on pointer move
  const cards = container.querySelectorAll('[data-motion-item], .cd, .mb, .login-card');
  
  const handlePointerMove = (e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty('--pointer-x', `${x}px`);
    card.style.setProperty('--pointer-y', `${y}px`);
  };

  const handlePointerDown = (e) => {
    e.currentTarget.classList.add('ios-pressed');
  };

  const handlePointerUp = (e) => {
    e.currentTarget.classList.remove('ios-pressed');
  };

  cards.forEach(card => {
    card.addEventListener('pointermove', handlePointerMove, { passive: true });
    card.addEventListener('pointerdown', handlePointerDown, { passive: true });
    card.addEventListener('pointerup', handlePointerUp, { passive: true });
    card.addEventListener('pointercancel', handlePointerUp, { passive: true });
  });

  return {
    destroy() {
      cards.forEach(card => {
        card.removeEventListener('pointermove', handlePointerMove);
        card.removeEventListener('pointerdown', handlePointerDown);
        card.removeEventListener('pointerup', handlePointerUp);
        card.removeEventListener('pointercancel', handlePointerUp);
        card.classList.remove('ios-pressed');
      });
    }
  };
}

export default { init };

