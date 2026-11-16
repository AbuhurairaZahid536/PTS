const {
  pool,
} = require("../config/db");

/*
|--------------------------------------------------------------------------
| DEFAULT PUBLIC WEBSITE CONTENT
|--------------------------------------------------------------------------
*/

const DEFAULT_CONTENT = {
  brand: {
    short_name:
      "PTS Farooqabad",

    school_name:
      "Police Training School Farooqabad",

    department:
      "Punjab Police",

    motto:
      "DISCIPLINE • TRAINING • SERVICE",

    logo_media_id:
      null,

    department_logo_media_id:
      null,
  },

  hero: {
    badge:
      "Punjab Police Training Institution",

    title_line_1:
      "Police Training",

    title_line_2:
      "School Farooqabad",

    description:
      "Developing disciplined, professional and service-oriented police personnel through structured training, modern learning, leadership and technology.",

    primary_button:
      "Explore PTS",

    secondary_button:
      "Secure Portal",

    media_id:
      null,

    features: [
      "Professional Training",
      "Digital Management",
      "Institutional Discipline",
    ],
  },

  // Administratively managed public announcements and tenders.
  news_updates: [],
  tenders: [],

  stats: [
    {
      value:
        "1975",

      label:
        "Training Center Established",
    },

    {
      value:
        "2001",

      label:
        "Police Training School Status",
    },

    {
      value:
        "PTS",

      label:
        "Professional Training",
    },

    {
      value:
        "24/7",

      label:
        "Digital Portal Availability",
    },
  ],

  about: {
    kicker:
      "OUR INSTITUTION",

    title:
      "A tradition of professional police training",

    description:
      "Police Training School Farooqabad provides an organized environment for discipline, academic learning, professional development and modern training management.",

    media_id:
      null,

    history: [
      {
        year:
          "1975",

        title:
          "Foundation",

        description:
          "The institution began its journey as a Police Recruit Training Center, supporting structured recruit training.",
      },

      {
        year:
          "2001",

        title:
          "Police Training School",

        description:
          "The institution was elevated to Police Training School status, strengthening its role within Punjab Police training.",
      },

      {
        year:
          "NOW",

        title:
          "Digital Transformation",

        description:
          "Modern digital systems now support trainee records, biometric attendance, reporting and administration.",
      },
    ],

    values: [
      {
        title:
          "Discipline",

        description:
          "Professional habits, responsibility and consistency.",
      },

      {
        title:
          "Integrity",

        description:
          "Ethical conduct, accountability and responsible service.",
      },

      {
        title:
          "Professionalism",

        description:
          "Knowledge, confidence and professional competence.",
      },

      {
        title:
          "Service",

        description:
          "Commitment to disciplined and respectful public service.",
      },
    ],
  },

  principal: {
    kicker:
      "MESSAGE FROM THE PRINCIPAL",

    title:
      "Building disciplined professionals for responsible policing.",

    message:
      "Our objective is to develop disciplined, knowledgeable and professionally prepared police personnel through effective training, responsible leadership and continuous learning.",

    name:
      "Principal",

    designation:
      "Police Training School Farooqabad",

    photo_media_id:
      null,

    note:
      "",
  },

  leadership: {
    kicker:
      "LEADERSHIP",

    title:
      "Command & instructional leadership",

    description:
      "Key officers responsible for administration, instruction, discipline and professional training.",

    items: [
      {
        key:
          "principal",

        short:
          "P",

        designation:
          "Principal",

        name:
          "Officer Name",

        description:
          "Responsible for overall command, administration, institutional standards and professional training at Police Training School Farooqabad.",

        photo_media_id:
          null,

        is_active:
          true,
      },

      {
        key:
          "cdi",

        short:
          "CDI",

        designation:
          "Chief Drill Instructor",

        name:
          "Officer Name",

        description:
          "Supervises drill, discipline, parade standards and structured physical training of trainees.",

        photo_media_id:
          null,

        is_active:
          true,
      },

      {
        key:
          "cli",

        short:
          "CLI",

        designation:
          "Chief Law Instructor",

        name:
          "Officer Name",

        description:
          "Coordinates academic instruction, law subjects, classroom learning and professional knowledge development.",

        photo_media_id:
          null,

        is_active:
          true,
      },

      {
        key:
          "cwi",

        short:
          "CWI",

        designation:
          "Chief Weapon Instructor",

        name:
          "Officer Name",

        description:
          "Coordinates professional instructional standards and specialized training responsibilities.",

        photo_media_id:
          null,

        is_active:
          true,
      },

      {
        key:
          "adjutant",

        short:
          "ADJ",

        designation:
          "Adjutant",

        name:
          "Officer Name",

        description:
          "Supports institutional discipline, daily coordination, administrative orders and command functions.",

        photo_media_id:
          null,

        is_active:
          true,
      },

      {
        key:
          "osi",

        short:
          "OSI",

        designation:
          "Office Superintendent",

        name:
          "Officer Name",

        description:
          "Supports administration, office management, records and internal institutional coordination.",

        photo_media_id:
          null,

        is_active:
          true,
      },
    ],
  },

  training: {
    kicker:
      "TRAINING",

    title:
      "Professional development for modern policing",

    description:
      "A balanced environment combining discipline, academic learning, professional skills and technology.",

    items: [
      {
        key:
          "drill",

        icon:
          "TROPHY",

        title:
          "Discipline & Drill",

        description:
          "Structured training focused on discipline, confidence, teamwork and professional bearing.",

        is_active:
          true,
      },

      {
        key:
          "law",

        icon:
          "READ",

        title:
          "Law & Academics",

        description:
          "Academic instruction designed to strengthen legal knowledge, procedures and professional understanding.",

        is_active:
          true,
      },

      {
        key:
          "leadership",

        icon:
          "TEAM",

        title:
          "Leadership & Ethics",

        description:
          "Professional conduct, responsibility, teamwork and service-oriented leadership development.",

        is_active:
          true,
      },

      {
        key:
          "driving",

        icon:
          "CAR",

        title:
          "Driving & Traffic",

        description:
          "Specialized learning opportunities relating to driving, road safety and traffic responsibilities.",

        is_active:
          true,
      },

      {
        key:
          "digital",

        icon:
          "LAPTOP",

        title:
          "Digital Learning",

        description:
          "Technology-enabled training support, biometric attendance and digital management systems.",

        is_active:
          true,
      },

      {
        key:
          "readiness",

        icon:
          "SAFETY",

        title:
          "Professional Readiness",

        description:
          "Practical development and structured learning designed to strengthen professional readiness.",

        is_active:
          true,
      },
    ],
  },

  facilities: {
    kicker:
      "CAMPUS FACILITIES",

    title:
      "Supporting institutional and training life",

    description:
      "Core facilities support administration, academics, welfare and professional training activities.",

    main_media_id:
      null,

    secondary_media_id:
      null,

    items: [
      {
        key:
          "administration",

        icon:
          "BANK",

        title:
          "Administration Block",

        is_active:
          true,
      },

      {
        key:
          "academic",

        icon:
          "BOOK",

        title:
          "Academic Block",

        is_active:
          true,
      },

      {
        key:
          "mess",

        icon:
          "TEAM",

        title:
          "Mess",

        is_active:
          true,
      },

      {
        key:
          "dispensary",

        icon:
          "SAFETY",

        title:
          "Dispensary",

        is_active:
          true,
      },

      {
        key:
          "mt",

        icon:
          "CAR",

        title:
          "MT Shed",

        is_active:
          true,
      },

      {
        key:
          "library",

        icon:
          "READ",

        title:
          "Library",

        is_active:
          true,
      },

      {
        key:
          "canteen",

        icon:
          "CHECK",

        title:
          "Canteen",

        is_active:
          true,
      },
    ],
  },

  video: {
    kicker:
      "DISCOVER PTS FAROOQABAD",

    title:
      "Campus & Training Experience",

    description:
      "A campus documentary or official institutional video can be published here.",

    button_label:
      "Play Video",

    media_id:
      null,
  },

  gallery: {
    kicker:
      "GALLERY",

    title:
      "Life at PTS Farooqabad",

    description:
      "Campus, training and institutional photographs from Police Training School Farooqabad.",
  },

  portal_cta: {
    kicker:
      "DIGITAL TRANSFORMATION",

    title:
      "PTS Management Portal",

    description:
      "Authorized users can access trainee records, biometric attendance, timetables, General Statements, reporting and administrative functions.",

    button_label:
      "Portal Login",
  },

  contact: {
    kicker:
      "CONTACT",

    title:
      "Police Training School Farooqabad",

    description:
      "Official contact and visitor information.",

    location:
      "Farooqabad, Punjab, Pakistan",

    location_map_url:
      "",

    phone:
      "",

    email:
      "",

    visitor_hours:
      "",
  },

  footer: {
    school_name:
      "Police Training School Farooqabad",

    department:
      "Punjab Police",

    motto:
      "DISCIPLINE • TRAINING • SERVICE",
  },
};


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function clone(
  value
) {
  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}


function isPlainObject(
  value
) {
  return (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  );
}


function mergeContent(
  base,
  incoming
) {
  if (
    Array.isArray(
      incoming
    )
  ) {
    return clone(
      incoming
    );
  }

  if (
    isPlainObject(
      base
    ) &&
    isPlainObject(
      incoming
    )
  ) {
    const result = {
      ...base,
    };

    for (
      const [
        key,
        value,
      ] of Object.entries(
        incoming
      )
    ) {
      result[key] =
        key in base
          ? mergeContent(
              base[key],
              value
            )
          : clone(
              value
            );
    }

    return result;
  }

  if (
    incoming ===
      undefined
  ) {
    return clone(
      base
    );
  }

  return clone(
    incoming
  );
}


function parseJson(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }

  if (
    typeof value ===
    "object"
  ) {
    return value;
  }

  try {
    return JSON.parse(
      value
    );
  } catch {
    return null;
  }
}


/*
|--------------------------------------------------------------------------
| INFRASTRUCTURE
|--------------------------------------------------------------------------
*/

let infrastructurePromise =
  null;


async function createInfrastructure() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public_site_content
    (
      id TINYINT UNSIGNED NOT NULL,
      content_json JSON NOT NULL,
      updated_by BIGINT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

      PRIMARY KEY (id)
    )
  `);


  await pool.query(`
    CREATE TABLE IF NOT EXISTS public_site_media
    (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

      media_type VARCHAR(20) NOT NULL,
      category VARCHAR(50) NOT NULL,

      title VARCHAR(200) NULL,
      caption VARCHAR(1000) NULL,

      file_path VARCHAR(500) NOT NULL,
      mime_type VARCHAR(120) NULL,
      file_size BIGINT UNSIGNED NULL,

      sort_order INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,

      created_by BIGINT NULL,
      updated_by BIGINT NULL,

      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

      PRIMARY KEY (id),

      UNIQUE KEY uq_public_site_media_path
        (file_path),

      KEY idx_public_site_media_category
        (category),

      KEY idx_public_site_media_active
        (is_active),

      KEY idx_public_site_media_sort
        (sort_order)
    )
  `);


  await pool.query(
    `
      INSERT INTO public_site_content
      (
        id,
        content_json
      )

      VALUES
      (
        1,
        :content
      )

      ON DUPLICATE KEY UPDATE
        id = VALUES(id)
    `,
    {
      content:
        JSON.stringify(
          DEFAULT_CONTENT
        ),
    }
  );


  /*
  |--------------------------------------------------------------------------
  | PERMISSION
  |--------------------------------------------------------------------------
  */

  await pool.query(`
    INSERT INTO permissions
    (
      permission_key,
      permission_name,
      module_name,
      description,
      is_active
    )

    VALUES
    (
      'public_site.manage',
      'Manage Public Website',
      'PUBLIC_SITE',
      'Manage public website content, leadership, gallery and media',
      1
    )

    ON DUPLICATE KEY UPDATE
      permission_name =
        VALUES(permission_name),

      module_name =
        VALUES(module_name),

      description =
        VALUES(description),

      is_active =
        1
  `);


  /*
  |--------------------------------------------------------------------------
  | GIVE SUPER ADMIN DEFAULT ACCESS
  |--------------------------------------------------------------------------
  */

  await pool.query(`
    INSERT IGNORE INTO role_permissions
    (
      role_id,
      permission_id
    )

    SELECT
      r.id,
      p.id

    FROM roles r

    JOIN permissions p
      ON p.permission_key =
         'public_site.manage'

    WHERE r.role_name =
          'SUPER_ADMIN'
  `);
}


async function ensurePublicSiteInfrastructure() {
  if (
    !infrastructurePromise
  ) {
    infrastructurePromise =
      createInfrastructure()
        .catch(
          (
            error
          ) => {
            infrastructurePromise =
              null;

            throw error;
          }
        );
  }

  return infrastructurePromise;
}


/*
|--------------------------------------------------------------------------
| CONTENT
|--------------------------------------------------------------------------
*/

async function getPublicSiteContent() {
  await ensurePublicSiteInfrastructure();

  const [
    rows,
  ] =
    await pool.query(`
      SELECT
        content_json

      FROM public_site_content

      WHERE id = 1

      LIMIT 1
    `);

  const stored =
    parseJson(
      rows[0]
        ?.content_json
    ) || {};

  return mergeContent(
    DEFAULT_CONTENT,
    stored
  );
}


async function savePublicSiteContent(
  content,
  userId = null
) {
  await ensurePublicSiteInfrastructure();

  const normalized =
    mergeContent(
      DEFAULT_CONTENT,
      content || {}
    );

  await pool.query(
    `
      UPDATE public_site_content

      SET
        content_json =
          :content,

        updated_by =
          :userId

      WHERE id = 1
    `,
    {
      content:
        JSON.stringify(
          normalized
        ),

      userId,
    }
  );

  return normalized;
}


/*
|--------------------------------------------------------------------------
| MEDIA
|--------------------------------------------------------------------------
*/

async function getPublicSiteMedia({
  includeInactive =
    false,
} = {}) {
  await ensurePublicSiteInfrastructure();

  const conditions = [];

  if (
    !includeInactive
  ) {
    conditions.push(
      "is_active = 1"
    );
  }

  const whereSql =
    conditions.length
      ? `WHERE ${conditions.join(
          " AND "
        )}`
      : "";

  const [
    rows,
  ] =
    await pool.query(`
      SELECT
        id,
        media_type,
        category,
        title,
        caption,
        file_path,
        mime_type,
        file_size,
        sort_order,
        is_active,
        created_at,
        updated_at

      FROM public_site_media

      ${whereSql}

      ORDER BY
        category ASC,
        sort_order ASC,
        id DESC
    `);

  return rows;
}


async function getPublicSiteMediaById(
  id
) {
  await ensurePublicSiteInfrastructure();

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT *

        FROM public_site_media

        WHERE id =
              :id

        LIMIT 1
      `,
      {
        id,
      }
    );

  return (
    rows[0] ||
    null
  );
}


async function createPublicSiteMedia({
  mediaType,
  category,
  title,
  caption,
  filePath,
  mimeType,
  fileSize,
  sortOrder = 0,
  isActive = true,
  userId = null,
}) {
  await ensurePublicSiteInfrastructure();

  const [
    result,
  ] =
    await pool.query(
      `
        INSERT INTO public_site_media
        (
          media_type,
          category,
          title,
          caption,
          file_path,
          mime_type,
          file_size,
          sort_order,
          is_active,
          created_by,
          updated_by
        )

        VALUES
        (
          :mediaType,
          :category,
          :title,
          :caption,
          :filePath,
          :mimeType,
          :fileSize,
          :sortOrder,
          :isActive,
          :userId,
          :userId
        )
      `,
      {
        mediaType,
        category,
        title,
        caption,
        filePath,
        mimeType,
        fileSize,
        sortOrder,

        isActive:
          isActive
            ? 1
            : 0,

        userId,
      }
    );

  return getPublicSiteMediaById(
    result.insertId
  );
}


async function updatePublicSiteMedia(
  id,
  {
    category,
    title,
    caption,
    sortOrder,
    isActive,
    filePath,
    mimeType,
    fileSize,
    mediaType,
    userId = null,
  }
) {
  await ensurePublicSiteInfrastructure();

  const assignments = [];
  const params = {
    id,
    userId,
  };

  const setValue =
    (
      field,
      paramName,
      value
    ) => {
      if (
        value !==
        undefined
      ) {
        assignments.push(
          `${field} = :${paramName}`
        );

        params[
          paramName
        ] =
          value;
      }
    };

  setValue(
    "category",
    "category",
    category
  );

  setValue(
    "title",
    "title",
    title
  );

  setValue(
    "caption",
    "caption",
    caption
  );

  setValue(
    "sort_order",
    "sortOrder",
    sortOrder
  );

  setValue(
    "is_active",
    "isActive",
    isActive ===
      undefined
      ? undefined
      : isActive
        ? 1
        : 0
  );

  setValue(
    "file_path",
    "filePath",
    filePath
  );

  setValue(
    "mime_type",
    "mimeType",
    mimeType
  );

  setValue(
    "file_size",
    "fileSize",
    fileSize
  );

  setValue(
    "media_type",
    "mediaType",
    mediaType
  );

  assignments.push(
    "updated_by = :userId"
  );

  await pool.query(
    `
      UPDATE public_site_media

      SET
        ${assignments.join(
          ", "
        )}

      WHERE id =
            :id
    `,
    params
  );

  return getPublicSiteMediaById(
    id
  );
}


async function deletePublicSiteMediaRecord(
  id
) {
  await ensurePublicSiteInfrastructure();

  const [
    result,
  ] =
    await pool.query(
      `
        DELETE FROM
          public_site_media

        WHERE id =
              :id
      `,
      {
        id,
      }
    );

  return (
    result.affectedRows >
    0
  );
}


module.exports = {
  DEFAULT_CONTENT,

  ensurePublicSiteInfrastructure,

  getPublicSiteContent,
  savePublicSiteContent,

  getPublicSiteMedia,
  getPublicSiteMediaById,

  createPublicSiteMedia,
  updatePublicSiteMedia,
  deletePublicSiteMediaRecord,
};