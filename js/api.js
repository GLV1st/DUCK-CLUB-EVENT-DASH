window.DuckClubAPI = {
  async health() {
    try {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
};
