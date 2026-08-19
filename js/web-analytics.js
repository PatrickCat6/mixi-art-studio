// Vercel Web Analytics initialization for static HTML
// This script loads Web Analytics asynchronously
(function() {
  // Create script element
  var script = document.createElement('script');
  script.src = '/_vercel/insights/script.js';
  script.defer = true;
  
  // Initialize Web Analytics queue
  window.va = window.va || function() {
    (window.vaq = window.vaq || []).push(arguments);
  };
  
  // Append script to head
  document.head.appendChild(script);
})();
