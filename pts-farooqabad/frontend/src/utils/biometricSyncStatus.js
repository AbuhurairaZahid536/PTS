import { useEffect, useState } from "react";
const key = "pts_biometric_sync_status_v1";
function read() { try { return JSON.parse(sessionStorage.getItem(key) || "{}"); } catch { return {}; } }
export function publishBiometricSyncStatus(source, result) {
  const status = {...read(),[source]:{...result,checkedAt:new Date().toISOString()}};
  try { sessionStorage.setItem(key,JSON.stringify(status)); } catch { /* Status must not block sync. */ }
  window.dispatchEvent(new CustomEvent("pts-biometric-sync-status",{detail:status}));
}
export function useBiometricSyncStatus() {
  const [sources,setSources] = useState(read);
  useEffect(() => {
    const update = event => setSources(event.detail || {});
    window.addEventListener("pts-biometric-sync-status",update);
    return () => window.removeEventListener("pts-biometric-sync-status",update);
  },[]);
  return {sources,issues:Object.entries(sources).filter(([,value]) => value.ok === false)
    .map(([source,value]) => `${source === 'employees' ? 'Employee' : 'Transaction'} sync: ${value.message || 'incomplete'}`)};
}
