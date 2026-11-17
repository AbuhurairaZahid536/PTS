const logger = require("../utils/logger");
const { runEmployeeMasterSync, runLiveTransactionSync } = require("../controllers/biometric.controller");
let timer, initial, running = false, lastMaster = 0;
async function run() {
  if (running) return;
  running = true;
  try {
    if (Date.now() - lastMaster >= 10 * 60 * 1000) {
      try {
        const master = await runEmployeeMasterSync();
        if (master.complete !== false && !master.failed && !master.conflicts) lastMaster = Date.now();
        else logger.warn({failed:master.failed,conflicts:master.conflicts},"Scheduled BioTime employee sync incomplete");
      } catch(error) { logger.error({err:error},"Scheduled BioTime employee sync failed"); }
    }
    const transactions = await runLiveTransactionSync();
    if (transactions.failed) logger.warn({failed:transactions.failed},"BioTime transactions remain in the retry queue");
  } catch(error) { logger.error({err:error},"Scheduled BioTime transaction sync failed"); }
  finally { running = false; }
}
function startBiometricSyncScheduler() {
  if (timer || process.env.BIOMETRIC_AUTO_SYNC_ENABLED === 'false' || !process.env.ZKBIO_BASE_URL || process.env.ZKBIO_USERNAME === 'local-disabled') return;
  initial = setTimeout(run, 5000);
  timer = setInterval(run, Math.max(30, Number(process.env.BIOMETRIC_AUTO_SYNC_SECONDS) || 60) * 1000);
  logger.info("Server-side BioTime synchronization enabled; it does not require an open browser.");
}
function stopBiometricSyncScheduler() { clearTimeout(initial); clearInterval(timer); timer = initial = null; }
module.exports = { startBiometricSyncScheduler, stopBiometricSyncScheduler };
