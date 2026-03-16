(() => {
  if (window.__mobileLoggerInstalled) return;
  window.__mobileLoggerInstalled = true;

  const logger = document.getElementById('mobile-logger');
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  function logToUI(msg, type) {
    if (!logger) return;
    const div = document.createElement('div');
    div.className = type === 'error' ? 'log-error' : (type === 'warn' ? 'log-warn' : '');
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logger.appendChild(div);
    logger.scrollTop = logger.scrollHeight;
  }

  console.log = (...args) => {
    originalLog.apply(console, args);
    logToUI(args.map(String).join(' '), 'log');
  };
  console.error = (...args) => {
    originalError.apply(console, args);
    logToUI(args.map(String).join(' '), 'error');
  };
  console.warn = (...args) => {
    originalWarn.apply(console, args);
    logToUI(args.map(String).join(' '), 'warn');
  };

  window.onerror = (msg, url, line, col) => {
    console.error(`${msg} at ${line}:${col}`);
    return false;
  };
  window.onunhandledrejection = (event) => {
    console.error(`Promise Rejection: ${event.reason}`);
  };
})();

