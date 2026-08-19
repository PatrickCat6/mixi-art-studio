// Vercel Speed Insights initialization for static HTML
// This script loads Speed Insights asynchronously
(function() {
  // Create script element
  var script = document.createElement('script');
  script.src = '/_vercel/speed-insights/script.js';
  script.defer = true;
  
  // Initialize Speed Insights queue
  window.si = window.si || function() {
    (window.siq = window.siq || []).push(arguments);
  };
  
  // Append script to head
  document.head.appendChild(script);
})();
