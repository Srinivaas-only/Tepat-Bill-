export const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };
