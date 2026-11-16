const {
  getActiveGeneralStatementCourses,
  getGeneralStatement,
} = require(
  "../models/generalStatement.model"
);

function pad(value) {
  return String(
    value
  ).padStart(
    2,
    "0"
  );
}

const GENERAL_STATEMENT_TIME_ZONE =
  "Asia/Karachi";

function pakistanNowParts() {
  const parts =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone:
          GENERAL_STATEMENT_TIME_ZONE,
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit",
        hour:
          "2-digit",
        minute:
          "2-digit",
        second:
          "2-digit",
        hourCycle:
          "h23",
      }
    ).formatToParts(
      new Date()
    );

  const values = {};

  parts.forEach(
    (part) => {
      if (
        part.type !==
        "literal"
      ) {
        values[part.type] =
          part.value;
      }
    }
  );

  return {
    year:
      Number(
        values.year
      ),
    month:
      Number(
        values.month
      ),
    day:
      Number(
        values.day
      ),
    hour:
      Number(
        values.hour
      ),
    minute:
      Number(
        values.minute
      ),
    second:
      Number(
        values.second
      ),
  };
}

function sqlDateTimeFromParts({
  year,
  month,
  day,
  hour,
  minute,
  second,
}) {
  return [
    year,
    "-",
    pad(month),
    "-",
    pad(day),
    " ",
    pad(hour),
    ":",
    pad(minute),
    ":",
    pad(second),
  ].join("");
}

function nowSqlDateTime() {
  return sqlDateTimeFromParts(
    pakistanNowParts()
  );
}

function normalizeStatementDateTime(
  value
) {
  if (!value) {
    return nowSqlDateTime();
  }

  const text =
    String(
      value
    ).trim();

  const match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
    );

  if (!match) {
    throw new Error(
      "statement_datetime must be in YYYY-MM-DD HH:mm:ss format."
    );
  }

  const year =
    Number(
      match[1]
    );

  const month =
    Number(
      match[2]
    );

  const day =
    Number(
      match[3]
    );

  const hour =
    Number(
      match[4]
    );

  const minute =
    Number(
      match[5]
    );

  const second =
    Number(
      match[6] ||
        0
    );

  /*
  |--------------------------------------------------------------------------
  | DATE VALIDATION (TIMEZONE INDEPENDENT)
  |--------------------------------------------------------------------------
  |
  | The Portal sends Pakistan wall-clock time. Production containers may run
  | in UTC, therefore new Date(year, month, ...) must NOT be used here.
  | Validate calendar components with UTC getters, then compare the fixed SQL
  | datetime text against the current Asia/Karachi wall-clock time.
  |
  |--------------------------------------------------------------------------
  */

  const validationDate =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        hour,
        minute,
        second,
        0
      )
    );

  if (
    validationDate.getUTCFullYear() !==
      year ||
    validationDate.getUTCMonth() !==
      month - 1 ||
    validationDate.getUTCDate() !==
      day ||
    validationDate.getUTCHours() !==
      hour ||
    validationDate.getUTCMinutes() !==
      minute ||
    validationDate.getUTCSeconds() !==
      second
  ) {
    throw new Error(
      "Invalid statement date/time."
    );
  }

  const statementDateTime =
    sqlDateTimeFromParts({
      year,
      month,
      day,
      hour,
      minute,
      second,
    });

  if (
    statementDateTime >
    nowSqlDateTime()
  ) {
    throw new Error(
      "General Statement cannot be generated for a future date/time."
    );
  }

  return statementDateTime;
}

async function listActiveCourses(
  req,
  res,
  next
) {
  try {
    const rows =
      await getActiveGeneralStatementCourses();

    return res.json({
      success:
        true,

      data:
        rows,
    });
  } catch (error) {
    return next(
      error
    );
  }
}

async function courseGeneralStatement(
  req,
  res,
  next
) {
  try {
    const courseId =
      Number(
        req.params.courseId
      );

    if (
      !Number.isInteger(
        courseId
      ) ||
      courseId <=
        0
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Valid Course ID is required.",
        });
    }

    let statementDatetime;

    try {
      statementDatetime =
        normalizeStatementDateTime(
          req.query
            .statement_datetime
        );
    } catch (error) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            error.message,
        });
    }

    const result =
      await getGeneralStatement({
        courseId,

        statementDatetime,
      });

    if (!result) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Course not found, inactive, or selected date is outside the Course training period.",
        });
    }

    return res.json({
      success:
        true,

      data:
        result,
    });
  } catch (error) {
    return next(
      error
    );
  }
}

module.exports = {
  listActiveCourses,
  courseGeneralStatement,
};