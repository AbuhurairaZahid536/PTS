const axios = require("axios");

const BASE_URL = process.env.ZKBIO_BASE_URL;
const USERNAME = process.env.ZKBIO_USERNAME;
const PASSWORD = process.env.ZKBIO_PASSWORD;

const COMPANY_ID =
  process.env.ZKBIO_COMPANY_ID || "1";

const POSITION_ACTION_NAME =
  "47656e6572616c416374696f6e4e6577";

/*
 * Captured from the native ZKBioTime 9.0.6 Device → Enroll Remotely
 * browser request. Hex decodes to: TerminalEnrollRemotely
 */
const REMOTE_ENROLL_ACTION_NAME =
  "5465726d696e616c456e726f6c6c52656d6f74656c79";

let cachedToken = null;


/*
|--------------------------------------------------------------------------
| BASIC HELPERS
|--------------------------------------------------------------------------
*/

function cleanText(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const text =
    String(value).trim();

  return text || null;
}


function normalizeRows(response) {
  if (!response) {
    return [];
  }

  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response.data)) {
    return response.data;
  }

  if (Array.isArray(response.results)) {
    return response.results;
  }

  return [];
}


function unwrapCreatedRecord(
  responseData
) {
  if (!responseData) {
    return null;
  }

  if (
    typeof responseData ===
      "object" &&
    !Array.isArray(responseData) &&
    responseData.id
  ) {
    return responseData;
  }

  if (
    responseData.data &&
    typeof responseData.data ===
      "object" &&
    !Array.isArray(
      responseData.data
    ) &&
    responseData.data.id
  ) {
    return responseData.data;
  }

  if (
    responseData.result &&
    typeof responseData.result ===
      "object" &&
    responseData.result.id
  ) {
    return responseData.result;
  }

  return null;
}


/*
|--------------------------------------------------------------------------
| COOKIE HELPERS
|--------------------------------------------------------------------------
*/

function extractCookies(
  setCookieHeaders = []
) {
  const cookies = {};

  for (
    const header of setCookieHeaders ||
    []
  ) {
    if (!header) {
      continue;
    }

    const firstPart =
      String(header)
        .split(";")[0];

    const separatorIndex =
      firstPart.indexOf("=");

    if (
      separatorIndex <= 0
    ) {
      continue;
    }

    const name =
      firstPart
        .slice(
          0,
          separatorIndex
        )
        .trim();

    const value =
      firstPart
        .slice(
          separatorIndex + 1
        )
        .trim();

    if (name) {
      cookies[name] =
        value;
    }
  }

  return cookies;
}


function mergeCookies(
  ...cookieObjects
) {
  return Object.assign(
    {},
    ...cookieObjects
  );
}


function cookieHeader(
  cookies
) {
  return Object.entries(
    cookies || {}
  )
    .map(
      ([name, value]) =>
        `${name}=${value}`
    )
    .join("; ");
}


/*
|--------------------------------------------------------------------------
| HTML / CSRF
|--------------------------------------------------------------------------
*/

function decodeHtmlEntity(
  value
) {
  return String(
    value || ""
  )
    .replace(
      /&quot;/g,
      "\""
    )
    .replace(
      /&#39;/g,
      "'"
    )
    .replace(
      /&amp;/g,
      "&"
    )
    .replace(
      /&lt;/g,
      "<"
    )
    .replace(
      /&gt;/g,
      ">"
    );
}


function extractCsrfToken(
  html
) {
  const source =
    String(
      html || ""
    );

  const patterns = [
    /name=["']csrfmiddlewaretoken["'][^>]*value=["']([^"']+)["']/i,

    /value=["']([^"']+)["'][^>]*name=["']csrfmiddlewaretoken["']/i,
  ];

  for (
    const pattern of patterns
  ) {
    const match =
      source.match(
        pattern
      );

    if (
      match?.[1]
    ) {
      return decodeHtmlEntity(
        match[1]
      );
    }
  }

  return null;
}


/*
|--------------------------------------------------------------------------
| TOKEN AUTH
|--------------------------------------------------------------------------
*/

async function getAuthToken() {
  if (
    !BASE_URL ||
    !USERNAME ||
    !PASSWORD
  ) {
    throw new Error(
      "ZKBioTime environment variables are missing."
    );
  }

  try {
    const response =
      await axios.post(
        `${BASE_URL}/api-token-auth/`,
        {
          username:
            USERNAME,

          password:
            PASSWORD,
        },
        {
          headers: {
            "Content-Type":
              "application/json",
          },

          timeout:
            15000,
        }
      );

    const token =
      response.data?.token;

    if (!token) {
      throw new Error(
        "ZKBioTime authentication succeeded but no token was returned."
      );
    }

    cachedToken =
      token;

    return token;
  } catch (
    error
  ) {
    const status =
      error.response
        ?.status;

    const data =
      error.response
        ?.data;

    throw new Error(
      `ZKBioTime authentication failed${
        status
          ? ` (HTTP ${status})`
          : ""
      }: ${JSON.stringify(
        data ||
          error.message
      )}`
    );
  }
}


async function getToken() {
  if (cachedToken) {
    return cachedToken;
  }

  return getAuthToken();
}


/*
|--------------------------------------------------------------------------
| TOKEN API REQUEST
|--------------------------------------------------------------------------
*/

async function zkbioRequest({
  method = "GET",
  path,
  params = {},
  data = undefined,
}) {
  const token =
    await getToken();

  try {
    return await axios({
      method,

      url:
        `${BASE_URL}${path}`,

      params,

      data,

      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Token ${token}`,
      },

      timeout:
        60000,
    });
  } catch (
    error
  ) {
    /*
    |--------------------------------------------------------------------------
    | TOKEN REFRESH
    |--------------------------------------------------------------------------
    */

    if (
      error.response
        ?.status ===
      401
    ) {
      cachedToken =
        null;

      const freshToken =
        await getAuthToken();

      try {
        return await axios({
          method,

          url:
            `${BASE_URL}${path}`,

          params,

          data,

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Token ${freshToken}`,
          },

          timeout:
            60000,
        });
      } catch (
        retryError
      ) {
        const status =
          retryError
            .response
            ?.status;

        const responseData =
          retryError
            .response
            ?.data;

        throw new Error(
          `ZKBioTime request failed${
            status
              ? ` (HTTP ${status})`
              : ""
          } ${path}: ${JSON.stringify(
            responseData ||
              retryError.message
          )}`
        );
      }
    }

    const status =
      error.response
        ?.status;

    const responseData =
      error.response
        ?.data;

    throw new Error(
      `ZKBioTime request failed${
        status
          ? ` (HTTP ${status})`
          : ""
      } ${path}: ${JSON.stringify(
        responseData ||
          error.message
      )}`
    );
  }
}


/*
|--------------------------------------------------------------------------
| ZK WEB SESSION LOGIN
|--------------------------------------------------------------------------
*/

async function getWebSession() {
  if (
    !BASE_URL ||
    !USERNAME ||
    !PASSWORD
  ) {
    throw new Error(
      "ZKBioTime credentials are missing."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | STEP 1
  | GET LOGIN PAGE
  |--------------------------------------------------------------------------
  */

  const loginPage =
    await axios.get(
      `${BASE_URL}/login/`,
      {
        maxRedirects:
          0,

        validateStatus:
          (status) =>
            status >= 200 &&
            status < 400,

        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },

        timeout:
          30000,
      }
    );


  const initialCookies =
    extractCookies(
      loginPage
        .headers[
          "set-cookie"
        ]
    );


  const csrfToken =
    extractCsrfToken(
      loginPage.data
    ) ||
    initialCookies
      .csrftoken;


  if (!csrfToken) {
    throw new Error(
      "Could not obtain ZKBioTime CSRF token from login page."
    );
  }


  /*
  |--------------------------------------------------------------------------
  | STEP 2
  | LOGIN POST
  |--------------------------------------------------------------------------
  */

  const loginForm =
    new URLSearchParams();

  loginForm.set(
    "csrfmiddlewaretoken",
    csrfToken
  );

  loginForm.set(
    "username",
    USERNAME
  );

  loginForm.set(
    "password",
    PASSWORD
  );

  loginForm.set(
    "captcha",
    ""
  );

  loginForm.set(
    "check_agreement",
    "on"
  );

  loginForm.set(
    "template10",
    ""
  );

  loginForm.set(
    "login_type",
    "pwd"
  );


  const loginResponse =
    await axios.post(
      `${BASE_URL}/login/`,
      loginForm.toString(),
      {
        maxRedirects:
          0,

        validateStatus:
          (status) =>
            status >= 200 &&
            status < 400,

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",

          Cookie:
            cookieHeader(
              initialCookies
            ),

          Referer:
            `${BASE_URL}/login/`,

          Origin:
            BASE_URL,
        },

        timeout:
          30000,
      }
    );


  const loginCookies =
    extractCookies(
      loginResponse
        .headers[
          "set-cookie"
        ]
    );


  const cookies =
    mergeCookies(
      initialCookies,
      loginCookies
    );


  /*
   * Browser screenshot se confirmed:
   * authenticated session `sessionid`
   * cookie use karta hai.
   */
  if (
    !cookies.sessionid
  ) {
    throw new Error(
      "ZKBioTime web login did not return an authenticated sessionid cookie."
    );
  }


  return {
    cookies,

    csrfToken:
      cookies.csrftoken ||
      csrfToken,
  };
}


/*
|--------------------------------------------------------------------------
| WEB POSITION CREATE FALLBACK
|--------------------------------------------------------------------------
*/

async function createPositionViaWeb(
  positionData
) {
  const positionCode =
    cleanText(
      positionData
        ?.position_code
    );

  const positionName =
    cleanText(
      positionData
        ?.position_name
    );

  if (!positionCode) {
    throw new Error(
      "ZKBioTime Position Code is required."
    );
  }

  if (!positionName) {
    throw new Error(
      "ZKBioTime Position Name is required."
    );
  }


  /*
  |--------------------------------------------------------------------------
  | AUTHENTICATED WEB SESSION
  |--------------------------------------------------------------------------
  */

  const session =
    await getWebSession();

  const currentCookies = {
    ...session.cookies,
  };


  /*
  |--------------------------------------------------------------------------
  | OPEN POSITION ADD FORM
  |--------------------------------------------------------------------------
  |
  | Login ke baad Django session rotate ho sakta hai.
  |
  | Is liye login page wala CSRF reuse nahi karna.
  | Authenticated Position form se fresh token uthana hai.
  |--------------------------------------------------------------------------
  */

  const addPage =
    await axios.get(
      `${BASE_URL}/personnel/position/add/`,
      {
        maxRedirects:
          0,

        validateStatus:
          (status) =>
            status >= 200 &&
            status < 400,

        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

          Cookie:
            cookieHeader(
              currentCookies
            ),

          Referer:
            `${BASE_URL}/personnel/position/`,
        },

        timeout:
          30000,
      }
    );


  /*
  |--------------------------------------------------------------------------
  | MERGE ANY COOKIES RETURNED BY POSITION FORM
  |--------------------------------------------------------------------------
  */

  const addPageCookies =
    extractCookies(
      addPage
        .headers[
          "set-cookie"
        ]
    );

  Object.assign(
    currentCookies,
    addPageCookies
  );


  /*
  |--------------------------------------------------------------------------
  | FRESH AUTHENTICATED CSRF
  |--------------------------------------------------------------------------
  */

  const positionCsrf =
    extractCsrfToken(
      addPage.data
    ) ||
    currentCookies
      .csrftoken;


  if (!positionCsrf) {
    throw new Error(
      "Could not obtain authenticated ZKBioTime Position CSRF token."
    );
  }


  /*
  |--------------------------------------------------------------------------
  | BUILD EXACT ZK WEB FORM
  |--------------------------------------------------------------------------
  */

  const form =
    new URLSearchParams();

  form.set(
    "csrfmiddlewaretoken",
    positionCsrf
  );

  form.set(
    "company",
    String(
      COMPANY_ID
    )
  );

  form.set(
    "position_code",
    positionCode
  );

  form.set(
    "position_name",
    positionName
  );

  form.set(
    "action_name",
    POSITION_ACTION_NAME
  );


  if (
    positionData
      ?.parent_position !==
      undefined &&
    positionData
      ?.parent_position !==
      null
  ) {
    form.set(
      "parent_position",
      String(
        positionData
          .parent_position
      )
    );
  }


  /*
  |--------------------------------------------------------------------------
  | CREATE POSITION
  |--------------------------------------------------------------------------
  */

  const response =
    await axios.post(
      `${BASE_URL}/personnel/position/add/`,
      form.toString(),
      {
        maxRedirects:
          0,

        validateStatus:
          () =>
            true,

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",

          Accept:
            "*/*",

          Cookie:
            cookieHeader(
              currentCookies
            ),

          Referer:
            `${BASE_URL}/personnel/position/add/`,

          Origin:
            BASE_URL,

          "X-CSRFToken":
            positionCsrf,

          "X-Requested-With":
            "XMLHttpRequest",
        },

        timeout:
          60000,
      }
    );


  /*
  |--------------------------------------------------------------------------
  | REAL ERROR DETAILS
  |--------------------------------------------------------------------------
  */

  if (
    response.status < 200 ||
    response.status >= 400
  ) {
    throw new Error(
      `ZKBioTime web Position create failed ` +
      `(HTTP ${response.status}): ` +
      `${JSON.stringify(response.data)}`
    );
  }


  /*
  |--------------------------------------------------------------------------
  | RESOLVE CREATED POSITION BY CODE
  |--------------------------------------------------------------------------
  */

  const searchResponse =
    await getPositions({
      page:
        1,

      page_size:
        100,

      position_code:
        positionCode,
    });


  const rows =
    normalizeRows(
      searchResponse
    );


  let created =
    rows.find(
      (item) =>
        cleanText(
          item
            ?.position_code
        ) ===
        positionCode
    );


  /*
  |--------------------------------------------------------------------------
  | FALLBACK LOOKUP BY NAME
  |--------------------------------------------------------------------------
  */

  if (!created) {
    const nameResponse =
      await getPositions({
        page:
          1,

        page_size:
          100,

        position_name:
          positionName,
      });


    created =
      normalizeRows(
        nameResponse
      ).find(
        (item) =>
          cleanText(
            item
              ?.position_name
          )?.toLowerCase() ===
          positionName
            .toLowerCase()
      );
  }


  if (!created?.id) {
    throw new Error(
      `ZKBioTime Position request completed but Position could not be resolved afterward. ` +
      `Code=${positionCode}, Name=${positionName}, Response=${JSON.stringify(response.data)}`
    );
  }


  return created;
}

/*
|--------------------------------------------------------------------------
| READ
|--------------------------------------------------------------------------
*/

async function getEmployees(
  params = {}
) {
  const response =
    await zkbioRequest({
      method:
        "GET",

      path:
        "/personnel/api/employees/",

      params,
    });

  return response.data;
}


async function getDepartments(
  params = {}
) {
  const response =
    await zkbioRequest({
      method:
        "GET",

      path:
        "/personnel/api/departments/",

      params,
    });

  return response.data;
}


async function getPositions(
  params = {}
) {
  const response =
    await zkbioRequest({
      method:
        "GET",

      path:
        "/personnel/api/positions/",

      params,
    });

  return response.data;
}


async function getAreas(
  params = {}
) {
  const response =
    await zkbioRequest({
      method:
        "GET",

      path:
        "/personnel/api/areas/",

      params,
    });

  return response.data;
}


async function getDevices(
  params = {}
) {
  const response =
    await zkbioRequest({
      method:
        "GET",

      path:
        "/iclock/api/terminals/",

      params,
    });

  return response.data;
}


/*
|--------------------------------------------------------------------------
| DEVICE MANAGEMENT
|--------------------------------------------------------------------------
|
| Keep every ZKBioTime terminal operation in this client. Controllers and
| services should call these helpers instead of building terminal URLs.
|
| Standard terminal command endpoints use ZKBioTime terminal database IDs.
| Remote enrollment is different: it uses terminal serial number(s).
|--------------------------------------------------------------------------
*/

function normalizeTerminalIds(
  terminalIds
) {
  const values =
    Array.isArray(terminalIds)
      ? terminalIds
      : [terminalIds];

  const normalized =
    values
      .map((value) =>
        Number(value)
      )
      .filter((value) =>
        Number.isInteger(value) &&
        value > 0
      );

  return [
    ...new Set(normalized),
  ];
}


function normalizeDeviceSerials(
  deviceSerials
) {
  const values =
    Array.isArray(deviceSerials)
      ? deviceSerials
      : [deviceSerials];

  return [
    ...new Set(
      values
        .map(cleanText)
        .filter(Boolean)
    ),
  ];
}

/*
|--------------------------------------------------------------------------
| REMOTE-ENROLL DEVICE REFERENCES
|--------------------------------------------------------------------------
|
| The ZKBioTime/EasyTime remote-enroll endpoint is named `devices_sn`, but
| published examples send numeric terminal references (for example [1]).
| Preserve an actual numeric terminal ID as a JSON number instead of
| converting it to the string "1". Serial-number callers remain supported.
|
|--------------------------------------------------------------------------
*/

function normalizeRemoteEnrollmentDeviceRefs(
  deviceRefs
) {
  const values =
    Array.isArray(deviceRefs)
      ? deviceRefs
      : [deviceRefs];

  const normalized = [];
  const seen = new Set();

  for (const value of values) {
    let normalizedValue = null;

    if (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value > 0
    ) {
      normalizedValue = value;
    } else {
      normalizedValue = cleanText(value);
    }

    if (
      normalizedValue === null ||
      normalizedValue === undefined ||
      normalizedValue === ""
    ) {
      continue;
    }

    const key =
      `${typeof normalizedValue}:${String(normalizedValue)}`;

    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(normalizedValue);
    }
  }

  return normalized;
}


async function getDevice(
  deviceId
) {
  if (!deviceId) {
    throw new Error(
      "ZKBioTime device ID is required."
    );
  }

  const response =
    await zkbioRequest({
      method:
        "GET",

      path:
        `/iclock/api/terminals/${deviceId}/`,
    });

  return response.data;
}


async function createDevice(
  deviceData
) {
  const response =
    await zkbioRequest({
      method:
        "POST",

      path:
        "/iclock/api/terminals/",

      data:
        deviceData,
    });

  return response.data;
}


async function updateDevice(
  deviceId,
  deviceData
) {
  if (!deviceId) {
    throw new Error(
      "ZKBioTime device ID is required for update."
    );
  }

  const response =
    await zkbioRequest({
      method:
        "PUT",

      path:
        `/iclock/api/terminals/${deviceId}/`,

      data:
        deviceData,
    });

  return response.data;
}


async function deleteDevice(
  deviceId
) {
  if (!deviceId) {
    throw new Error(
      "ZKBioTime device ID is required for delete."
    );
  }

  const response =
    await zkbioRequest({
      method:
        "DELETE",

      path:
        `/iclock/api/terminals/${deviceId}/`,
    });

  return response.data;
}


async function runTerminalAction(
  actionName,
  terminalIds
) {
  const terminals =
    normalizeTerminalIds(
      terminalIds
    );

  if (!terminals.length) {
    throw new Error(
      "At least one valid ZKBioTime terminal ID is required."
    );
  }

  const response =
    await zkbioRequest({
      method:
        "POST",

      path:
        `/iclock/api/terminals/${actionName}/`,

      data: {
        terminals,
      },
    });

  return response.data;
}


async function clearDeviceCommands(
  terminalIds
) {
  return runTerminalAction(
    "clear_command",
    terminalIds
  );
}


async function clearDeviceCapture(
  terminalIds
) {
  return runTerminalAction(
    "clear_capture",
    terminalIds
  );
}


async function clearDeviceAll(
  terminalIds
) {
  return runTerminalAction(
    "clear_all",
    terminalIds
  );
}


async function uploadDeviceAll(
  terminalIds
) {
  return runTerminalAction(
    "upload_all",
    terminalIds
  );
}


async function uploadDeviceTransactions(
  terminalIds
) {
  return runTerminalAction(
    "upload_transaction",
    terminalIds
  );
}


async function rebootDevices(
  terminalIds
) {
  return runTerminalAction(
    "reboot",
    terminalIds
  );
}


async function enrollRemotely({
  device_id,
  deviceId,
  id,
  bio_type,
  bioType,
  emp_code,
  empCode,
  finger = 0,
} = {}) {
  const terminalId =
    Number(
      device_id ??
      deviceId ??
      id
    );

  const employeeCode =
    cleanText(
      emp_code ??
      empCode
    );

  const biometricType =
    String(
      bio_type ??
      bioType ??
      ""
    ).trim();

  if (
    !Number.isInteger(
      terminalId
    ) ||
    terminalId <= 0
  ) {
    throw new Error(
      "A valid ZKBioTime terminal ID is required for remote enrollment."
    );
  }

  if (!employeeCode) {
    throw new Error(
      "Employee code is required for remote enrollment."
    );
  }

  if (
    ![
      "1",
      "2",
    ].includes(
      biometricType
    )
  ) {
    throw new Error(
      "Remote enrollment bio_type must be 1 (Fingerprint) or 2 (Face)."
    );
  }

  const fingerIndex =
    Number(finger);

  if (
    biometricType === "1" &&
    (
      !Number.isInteger(
        fingerIndex
      ) ||
      fingerIndex < 0 ||
      fingerIndex > 9
    )
  ) {
    throw new Error(
      "A valid finger index from 0 to 9 is required for fingerprint remote enrollment."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | NATIVE ZKBIOTIME 9.0.6 WEB ACTION
  |--------------------------------------------------------------------------
  |
  | Verified from the installed server's own browser request:
  |
  |   POST /iclock/terminal/action/
  |   Content-Type: application/x-www-form-urlencoded
  |
  | Form fields:
  |   csrfmiddlewaretoken
  |   bio_type
  |   emp_code
  |   finger
  |   action_name = hex("TerminalEnrollRemotely")
  |   id          = ZKBioTime terminal database ID
  |
  | Successful response:
  |   {"msg":"","code":0}
  |
  | This is an authenticated Django web action, not the public
  | /iclock/api/terminals/enroll_remotely/ endpoint.
  |--------------------------------------------------------------------------
  */

  const session =
    await getWebSession();

  const currentCookies = {
    ...session.cookies,
  };

  /*
   * Open the native Device page once with the authenticated session.
   * This keeps cookies/CSRF aligned with the same screen from which
   * ZKBioTime itself sends the remote-enrollment action.
   */
  const devicePage =
    await axios.get(
      `${BASE_URL}/iclock/terminal/`,
      {
        maxRedirects:
          0,

        validateStatus:
          (status) =>
            status >= 200 &&
            status < 400,

        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

          Cookie:
            cookieHeader(
              currentCookies
            ),

          Referer:
            `${BASE_URL}/iclock/terminal/`,
        },

        timeout:
          30000,
      }
    );

  Object.assign(
    currentCookies,
    extractCookies(
      devicePage
        .headers[
          "set-cookie"
        ]
    )
  );

  const csrfToken =
    extractCsrfToken(
      devicePage.data
    ) ||
    currentCookies
      .csrftoken ||
    session.csrfToken;

  if (!csrfToken) {
    throw new Error(
      "Could not obtain authenticated ZKBioTime CSRF token for remote enrollment."
    );
  }

  const form =
    new URLSearchParams();

  form.set(
    "csrfmiddlewaretoken",
    csrfToken
  );

  form.set(
    "bio_type",
    biometricType
  );

  form.set(
    "emp_code",
    employeeCode
  );

  form.set(
    "finger",
    String(
      biometricType === "1"
        ? fingerIndex
        : 0
    )
  );

  form.set(
    "action_name",
    REMOTE_ENROLL_ACTION_NAME
  );

  form.set(
    "id",
    String(
      terminalId
    )
  );

  const response =
    await axios.post(
      `${BASE_URL}/iclock/terminal/action/`,
      form.toString(),
      {
        maxRedirects:
          0,

        validateStatus:
          () =>
            true,

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded; charset=UTF-8",

          Accept:
            "application/json, text/javascript, */*; q=0.01",

          Cookie:
            cookieHeader(
              currentCookies
            ),

          Referer:
            `${BASE_URL}/iclock/terminal/`,

          Origin:
            BASE_URL,

          "X-CSRFToken":
            csrfToken,

          "X-Requested-With":
            "XMLHttpRequest",
        },

        timeout:
          60000,
      }
    );

  if (
    response.status < 200 ||
    response.status >= 300
  ) {
    throw new Error(
      `ZKBioTime native remote enrollment failed (HTTP ${response.status}) /iclock/terminal/action/: ${JSON.stringify(
        response.data
      )}`
    );
  }

  if (
    typeof response.data ===
      "string" &&
    (
      /<html/i.test(
        response.data
      ) ||
      /csrfmiddlewaretoken/i.test(
        response.data
      )
    )
  ) {
    throw new Error(
      "ZKBioTime remote enrollment returned an HTML/login response instead of the command result."
    );
  }

  const result =
    response.data;

  if (
    result &&
    typeof result ===
      "object" &&
    result.code !==
      undefined &&
    Number(
      result.code
    ) !== 0
  ) {
    throw new Error(
      `ZKBioTime rejected remote enrollment (code ${result.code}): ${result.msg || "Unknown error."}`
    );
  }

  return result;
}


/*
|--------------------------------------------------------------------------
| EMPLOYEE → DEVICE / BIOMETRIC ACTION ESCAPE HATCHES
|--------------------------------------------------------------------------
|
| These endpoints exist in the ZKBioTime employee API, but payload details
| differ across builds. Keep the client wrapper exact and let the service
| layer pass the payload verified for the installed ZKBioTime version.
|--------------------------------------------------------------------------
*/

async function resyncEmployeesToDevice(
  payload
) {
  const response =
    await zkbioRequest({
      method:
        "POST",

      path:
        "/personnel/api/employees/resync_to_device/",

      data:
        payload,
    });

  return response.data;
}


async function deleteBiometricTemplates(
  payload
) {
  const response =
    await zkbioRequest({
      method:
        "POST",

      path:
        "/personnel/api/employees/del_bio_template/",

      data:
        payload,
    });

  return response.data;
}


async function getTransactions(
  params = {}
) {
  const response =
    await zkbioRequest({
      method:
        "GET",

      path:
        "/iclock/api/transactions/",

      params,
    });

  return response.data;
}


/*
|--------------------------------------------------------------------------
| EMPLOYEE
|--------------------------------------------------------------------------
*/

async function getEmployee(
  employeeId
) {
  if (!employeeId) {
    throw new Error(
      "ZKBioTime employee ID is required."
    );
  }

  const response =
    await zkbioRequest({
      method:
        "GET",

      path:
        `/personnel/api/employees/${employeeId}/`,
    });

  return response.data;
}


async function createEmployee(
  employeeData
) {
  const response =
    await zkbioRequest({
      method:
        "POST",

      path:
        "/personnel/api/employees/",

      data:
        employeeData,
    });

  return response.data;
}


async function updateEmployee(
  employeeId,
  employeeData
) {
  if (!employeeId) {
    throw new Error(
      "ZKBioTime employee ID is required for update."
    );
  }

  const response =
    await zkbioRequest({
      method:
        "PUT",

      path:
        `/personnel/api/employees/${employeeId}/`,

      data:
        employeeData,
    });

  return response.data;
}


async function deleteEmployee(
  employeeId
) {
  if (!employeeId) {
    throw new Error(
      "ZKBioTime employee ID is required for delete."
    );
  }

  const response =
    await zkbioRequest({
      method:
        "DELETE",

      path:
        `/personnel/api/employees/${employeeId}/`,
    });

  return response.data;
}


/*
|--------------------------------------------------------------------------
| DEPARTMENT
|--------------------------------------------------------------------------
*/

async function createDepartment(
  departmentData
) {
  const response =
    await zkbioRequest({
      method:
        "POST",

      path:
        "/personnel/api/departments/",

      data:
        departmentData,
    });

  return response.data;
}


async function updateDepartment(
  departmentId,
  departmentData
) {
  if (!departmentId) {
    throw new Error(
      "ZKBioTime department ID is required for update."
    );
  }

  const response =
    await zkbioRequest({
      method:
        "PUT",

      path:
        `/personnel/api/departments/${departmentId}/`,

      data:
        departmentData,
    });

  return response.data;
}


async function deleteDepartment(
  departmentId
) {
  if (!departmentId) {
    throw new Error(
      "ZKBioTime department ID is required for delete."
    );
  }

  const response =
    await zkbioRequest({
      method:
        "DELETE",

      path:
        `/personnel/api/departments/${departmentId}/`,
    });

  return response.data;
}


/*
|--------------------------------------------------------------------------
| POSITION
|--------------------------------------------------------------------------
*/

async function createPosition(
  positionData
) {
  const positionCode =
    cleanText(
      positionData
        ?.position_code
    );

  const positionName =
    cleanText(
      positionData
        ?.position_name
    );


  if (!positionCode) {
    throw new Error(
      "ZKBioTime Position Code is required."
    );
  }


  if (!positionName) {
    throw new Error(
      "ZKBioTime Position Name is required."
    );
  }


  const payload = {
    position_code:
      positionCode,

    position_name:
      positionName,

    parent_position:
      positionData
        ?.parent_position ??
      null,
  };


  /*
  |--------------------------------------------------------------------------
  | FIRST TRY OFFICIAL REST API
  |--------------------------------------------------------------------------
  */

  try {
    const response =
      await zkbioRequest({
        method:
          "POST",

        path:
          "/personnel/api/positions/",

        data:
          payload,
      });


    const record =
      unwrapCreatedRecord(
        response.data
      );


    if (record?.id) {
      return record;
    }


    /*
     * Aapke ZKBioTime build mein POST
     * kabhi HTTP 200 + HTML 500 page
     * return kar raha hai.
     *
     * Is case mein web fallback use hoga.
     */
    if (
      typeof response.data ===
      "string"
    ) {
      console.warn(
        "[ZKBioTime] REST Position create returned non-JSON response. Falling back to web endpoint."
      );

      return createPositionViaWeb(
        payload
      );
    }


    if (
      !record?.id
    ) {
      console.warn(
        "[ZKBioTime] REST Position create returned no usable Position record. Falling back to web endpoint."
      );

      return createPositionViaWeb(
        payload
      );
    }


    return record;
  } catch (
    error
  ) {
    const message =
      String(
        error?.message ||
        ""
      );


    /*
     * Known current ZKBioTime issue:
     * Position REST POST gives internal 500.
     */
    if (
      message.includes(
        "HTTP 500"
      ) ||
      message.includes(
        "500 Error"
      ) ||
      message.includes(
        "service is not available"
      )
    ) {
      console.warn(
        "[ZKBioTime] REST Position create failed internally. Falling back to web endpoint."
      );

      return createPositionViaWeb(
        payload
      );
    }


    throw error;
  }
}


async function updatePosition(
  positionId,
  positionData
) {
  if (!positionId) {
    throw new Error(
      "ZKBioTime position ID is required for update."
    );
  }

  const response =
    await zkbioRequest({
      method:
        "PUT",

      path:
        `/personnel/api/positions/${positionId}/`,

      data:
        positionData,
    });

  return response.data;
}


async function deletePosition(
  positionId
) {
  if (!positionId) {
    throw new Error(
      "ZKBioTime position ID is required for delete."
    );
  }

  const response =
    await zkbioRequest({
      method:
        "DELETE",

      path:
        `/personnel/api/positions/${positionId}/`,
    });

  return response.data;
}


/*
|--------------------------------------------------------------------------
| AREA
|--------------------------------------------------------------------------
*/

async function createArea(
  areaData
) {
  const response =
    await zkbioRequest({
      method:
        "POST",

      path:
        "/personnel/api/areas/",

      data:
        areaData,
    });

  return response.data;
}


async function updateArea(
  areaId,
  areaData
) {
  if (!areaId) {
    throw new Error(
      "ZKBioTime area ID is required for update."
    );
  }

  const response =
    await zkbioRequest({
      method:
        "PUT",

      path:
        `/personnel/api/areas/${areaId}/`,

      data:
        areaData,
    });

  return response.data;
}


function clearToken() {
  cachedToken = null;
}


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  getAuthToken,
  getToken,
  clearToken,

  getEmployees,
  getEmployee,
  getDepartments,
  getPositions,
  getAreas,
  getDevices,
  getDevice,
  getTransactions,

  createDevice,
  updateDevice,
  deleteDevice,

  clearDeviceCommands,
  clearDeviceCapture,
  clearDeviceAll,
  uploadDeviceAll,
  uploadDeviceTransactions,
  rebootDevices,
  enrollRemotely,

  resyncEmployeesToDevice,
  deleteBiometricTemplates,

  createEmployee,
  updateEmployee,
  deleteEmployee,

  createDepartment,
  updateDepartment,
  deleteDepartment,

  createPosition,
  updatePosition,
  deletePosition,

  createArea,
  updateArea,
};