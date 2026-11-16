import axios from "axios";

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_BASE_URL ||
    "/api/v1",

  /*
  |--------------------------------------------------------------------------
  | REQUEST TIMEOUT
  |--------------------------------------------------------------------------
  |
  | ZKBioTime operations can legitimately take longer than normal CRUD
  | requests, especially employee master sync / transaction reconciliation.
  |
  | 15 seconds was too short and caused the browser to cancel otherwise
  | valid backend requests.
  |
  |--------------------------------------------------------------------------
  */

  timeout: 120000,
});

// Auth token is attached centrally by the application's existing
// authentication flow / interceptor wiring.

export default api;