/*
|--------------------------------------------------------------------------
| ZKBIOTIME SINGLE-FLIGHT SYNC COORDINATOR
|--------------------------------------------------------------------------
|
| Purpose:
|
| Agar multiple users ek hi waqt:
|
| - login karein
| - browser refresh karein
| - biometric live sync trigger karein
| - manual current-date sync trigger karein
|
| to ZKBioTime par duplicate / triple heavy requests na jayen.
|
| Same key ki sirf ONE task execute hogi.
| Baqi callers usi running Promise ka result wait/share karenge.
|
| IMPORTANT:
|
| Ye in-memory lock hai.
| Current single Node / Railway instance ke liye correct hai.
|
| Future mein multiple backend replicas hon to Redis/MySQL distributed
| lock use karna hoga.
|--------------------------------------------------------------------------
*/

const runningTasks =
  new Map();


/*
|--------------------------------------------------------------------------
| RUN SINGLE FLIGHT
|--------------------------------------------------------------------------
|
| Example:
|
| runSingleFlight(
|   "employee-master-sync",
|   () => syncAllEmployees()
| );
|
| Agar same key already chal rahi ho:
| - naya task execute nahi hoga
| - existing Promise return hogi
|--------------------------------------------------------------------------
*/

function runSingleFlight(
  key,
  task
) {
  if (
    !key ||
    typeof key !==
      "string"
  ) {
    throw new Error(
      "Single-flight key is required."
    );
  }

  if (
    typeof task !==
    "function"
  ) {
    throw new Error(
      "Single-flight task must be a function."
    );
  }


  /*
  |--------------------------------------------------------------------------
  | EXISTING RUNNING TASK
  |--------------------------------------------------------------------------
  */

  const existing =
    runningTasks.get(
      key
    );

  if (existing) {
    return existing;
  }


  /*
  |--------------------------------------------------------------------------
  | START NEW TASK
  |--------------------------------------------------------------------------
  */

  let promise;

  promise =
    Promise.resolve()
      .then(
        () =>
          task()
      )
      .finally(
        () => {
          /*
          |--------------------------------------------------------------------------
          | SAFELY RELEASE ONLY OUR OWN PROMISE
          |--------------------------------------------------------------------------
          */

          if (
            runningTasks.get(
              key
            ) ===
            promise
          ) {
            runningTasks.delete(
              key
            );
          }
        }
      );


  runningTasks.set(
    key,
    promise
  );


  return promise;
}


/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

function isRunning(
  key
) {
  return runningTasks.has(
    key
  );
}


/*
|--------------------------------------------------------------------------
| RUNNING KEYS
|--------------------------------------------------------------------------
|
| Debugging / diagnostics ke liye.
|--------------------------------------------------------------------------
*/

function getRunningKeys() {
  return [
    ...runningTasks.keys(),
  ];
}


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  runSingleFlight,
  isRunning,
  getRunningKeys,
};