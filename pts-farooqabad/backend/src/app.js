// All PTS timetable and biometric wall-clock dates use Pakistan time.
process.env.TZ = "Asia/Karachi";
const express =
  require("express");

const crypto =
  require("crypto");

const helmet =
  require("helmet");

const cors =
  require("cors");

const compression =
  require("compression");

const rateLimit =
  require("express-rate-limit");

const pinoHttp =
  require("pino-http");


const config =
  require("./config/env");

const logger =
  require("./utils/logger");


/*
|--------------------------------------------------------------------------
| ROUTES
|--------------------------------------------------------------------------
*/

const routes =
  require("./routes");

const profileRoutes =
  require(
    "./routes/profile.routes"
  );

const generalStatementRoutes =
  require(
    "./routes/generalStatement.routes"
  );

const weekendRoutes =
  require(
    "./routes/weekend.routes"
  );


/*
|--------------------------------------------------------------------------
| ERROR HANDLERS
|--------------------------------------------------------------------------
*/

const {
  notFoundHandler,
  errorHandler,
} = require(
  "./middleware/errorHandler"
);


/*
|--------------------------------------------------------------------------
| MULTI-PC CORS / RATE-LIMIT HELPERS
|--------------------------------------------------------------------------
|
| Local PTS testing commonly runs Vite on one PC and is opened from several
| LAN computers. In that setup all proxied API calls can reach Express from
| 127.0.0.1, so a single IP-only limiter incorrectly makes all computers
| share one 300-request bucket.
|
| Authenticated requests are therefore isolated by Bearer token. Login stays
| IP-limited separately. CORS accepts configured origins plus local/private
| network origins used during PTS LAN testing.
|--------------------------------------------------------------------------
*/

function hashKey(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      String(
        value ||
        "unknown"
      )
    )
    .digest(
      "hex"
    )
    .slice(
      0,
      32
    );
}

function requestNetworkKey(
  req
) {
  const forwarded =
    String(
      req.headers[
        "x-forwarded-for"
      ] ||
      ""
    )
      .split(",")[0]
      .trim();

  const address =
    forwarded ||
    req.ip ||
    req.socket
      ?.remoteAddress ||
    "unknown";

  return `ip:${hashKey(
    address
  )}`;
}

function requestApiKey(
  req
) {
  const authorization =
    String(
      req.headers
        .authorization ||
      ""
    ).trim();

  if (
    authorization
      .toLowerCase()
      .startsWith(
        "bearer "
      )
  ) {
    return `auth:${hashKey(
      authorization.slice(7)
    )}`;
  }

  return requestNetworkKey(
    req
  );
}

const configuredCorsOrigins =
  String(
    config.corsOrigin ||
    ""
  )
    .split(",")
    .map(
      (item) =>
        item.trim()
    )
    .filter(Boolean);

function isPrivateLanOrigin(
  origin
) {
  try {
    const url =
      new URL(
        origin
      );

    const host =
      url.hostname;

    if (
      host ===
        "localhost" ||
      host ===
        "127.0.0.1" ||
      host ===
        "::1"
    ) {
      return true;
    }

    if (
      /^10\./.test(
        host
      ) ||
      /^192\.168\./.test(
        host
      )
    ) {
      return true;
    }

    const match =
      host.match(
        /^172\.(\d+)\./
      );

    if (
      match &&
      Number(
        match[1]
      ) >= 16 &&
      Number(
        match[1]
      ) <= 31
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function corsOriginResolver(
  origin,
  callback
) {
  /*
   * Server-to-server calls / curl / same-origin requests may not have Origin.
   */
  if (!origin) {
    return callback(
      null,
      true
    );
  }

  if (
    configuredCorsOrigins
      .includes("*") ||
    configuredCorsOrigins
      .includes(
        origin
      ) ||
    isPrivateLanOrigin(
      origin
    )
  ) {
    return callback(
      null,
      true
    );
  }

  return callback(
    new Error(
      `CORS origin not allowed: ${origin}`
    )
  );
}


/*
|--------------------------------------------------------------------------
| APP
|--------------------------------------------------------------------------
*/

const app =
  express();


/*
|--------------------------------------------------------------------------
| TRUST PROXY
|--------------------------------------------------------------------------
|
| Required when app is behind Railway / Nginx / VPS proxy.
|
|--------------------------------------------------------------------------
*/

app.set(
  "trust proxy",
  1
);


/*
|--------------------------------------------------------------------------
| SECURITY
|--------------------------------------------------------------------------
*/

app.use(
  helmet()
);


app.use(
  cors({
    origin:
      corsOriginResolver,

    credentials:
      true,
  })
);


/*
|--------------------------------------------------------------------------
| RESPONSE COMPRESSION
|--------------------------------------------------------------------------
|
| Large Dashboard/report JSON responses can be several MB. Compressing HTTP
| responses reduces LAN/Internet transfer without changing response data or
| application behavior. A 1 KB threshold avoids wasting CPU on tiny payloads.
|
|--------------------------------------------------------------------------
*/

app.use(
  compression({
    threshold:
      1024,
  })
);


/*
|--------------------------------------------------------------------------
| BODY PARSER
|--------------------------------------------------------------------------
|
| IMPORTANT:
| Weekend POST/PUT routes need req.body.
| Therefore body parser must run BEFORE API routes.
|
|--------------------------------------------------------------------------
*/

app.use(
  express.json({
    limit:
      "2mb",
  })
);

app.use(
  express.urlencoded({
    extended:
      true,

    limit:
      "2mb",
  })
);


/*
|--------------------------------------------------------------------------
| LOGGING
|--------------------------------------------------------------------------
*/

app.use(
  pinoHttp({
    logger,
  })
);


/*
|--------------------------------------------------------------------------
| AUTHENTICATED API RATE LIMIT
|--------------------------------------------------------------------------
|
| Bearer-token keying means two PCs behind the same Vite proxy / NAT no
| longer consume one shared bucket. 5000 / 15 min comfortably covers the
| Dashboard, live attendance polling and normal CRUD while still protecting
| accidental request loops.
|--------------------------------------------------------------------------
*/

app.use(
  config.apiPrefix,

  rateLimit({
    windowMs:
      15 *
      60 *
      1000,

    limit:
      5000,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator:
      requestApiKey,

    skip:
      (
        req
      ) =>
        req.path ===
          "/auth/login" ||
        req.path.startsWith(
          "/public-site/media/"
        ),
  })
);


/*
|--------------------------------------------------------------------------
| PROFILE
|--------------------------------------------------------------------------
*/

app.use(
  `${config.apiPrefix}/profiles`,
  profileRoutes
);


/*
|--------------------------------------------------------------------------
| GENERAL STATEMENT
|--------------------------------------------------------------------------
*/

app.use(
  `${config.apiPrefix}/general-statements`,
  generalStatementRoutes
);


/*
|--------------------------------------------------------------------------
| WEEKEND MANAGEMENT
|--------------------------------------------------------------------------
|
| Routes:
|
| GET    /api/weekends
| GET    /api/weekends/:id
| POST   /api/weekends
| PUT    /api/weekends/:id
| DELETE /api/weekends/:id
|
|--------------------------------------------------------------------------
*/

app.use(
  `${config.apiPrefix}/weekends`,
  weekendRoutes
);


/*
|--------------------------------------------------------------------------
| EXISTING ROUTES
|--------------------------------------------------------------------------
|
| Main route index:
| trainees
| courses
| timetable
| attendance
| staff
| reports
| settings
| etc.
|
|--------------------------------------------------------------------------
*/

app.use(
  config.apiPrefix,
  routes
);


/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
|
| Must stay AFTER all routes.
|
|--------------------------------------------------------------------------
*/

app.use(
  notFoundHandler
);


/*
|--------------------------------------------------------------------------
| ERROR HANDLER
|--------------------------------------------------------------------------
|
| Must always remain last middleware.
|
|--------------------------------------------------------------------------
*/

app.use(
  errorHandler
);


/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports =
  app;