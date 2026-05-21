(function () {
  function createApiClient({ onUnauthorized } = {}) {
    return async function api(path, options = {}) {
      const response = await fetch(path, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...(options.headers || {}) },
        credentials: 'same-origin',
        ...options,
      });
      const payload = await response.json().catch(() => ({ success: false, message: 'Nem olvasható válasz.' }));
      if (!response.ok || payload.success === false) {
        if (response.status === 401 && typeof onUnauthorized === 'function') onUnauthorized();
        throw new Error(payload.message || 'Sikertelen kérés.');
      }
      return payload.data;
    };
  }

  window.MGM_API = { createApiClient };
})();
