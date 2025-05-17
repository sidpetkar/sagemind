'use client';

/**
 * Forces a browser style recalculation to ensure theme changes are applied
 */
export function forceStyleRecalculation() {
  // Create a temporary DOM node
  const temp = document.createElement('div');
  temp.style.display = 'none';
  document.body.appendChild(temp);
  
  // Force a reflow by accessing offsetHeight
  void temp.offsetHeight;
  
  // Clean up
  document.body.removeChild(temp);
  
  console.log('[themeUtils] Forced style recalculation');
  
  return true;
} 