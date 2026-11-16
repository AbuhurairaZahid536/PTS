const {
  pool,
} = require(
  "../src/config/db"
);

/*
|--------------------------------------------------------------------------
| PTS PORTAL PERMISSION MASTER
|--------------------------------------------------------------------------
|
| Standard:
|
| *.view  = page/list/detail dekh sakta hai
| *.edit  = add/update/import/delete/manage kar sakta hai
|
| Special workflows apni granular permissions retain karte hain.
|--------------------------------------------------------------------------
*/

const PERMISSIONS = [
  /*
  |--------------------------------------------------------------------------
  | DASHBOARD
  |--------------------------------------------------------------------------
  */

  {
    key: "dashboard.view",
    name: "View Dashboard",
    module: "DASHBOARD",
    description:
      "Dashboard, summaries and charts view kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | TRAINEE MANAGEMENT
  |--------------------------------------------------------------------------
  */

  {
    key: "trainees.view",
    name: "View Trainees",
    module: "TRAINEE MANAGEMENT",
    description:
      "Trainee list, detail, search and export view kar sakta hai.",
  },

  {
    key: "trainees.edit",
    name: "Edit Trainees",
    module: "TRAINEE MANAGEMENT",
    description:
      "Trainees add, edit, import and normal delete/manage kar sakta hai.",
  },

  {
    key: "courses.view",
    name: "View Courses",
    module: "TRAINEE MANAGEMENT",
    description:
      "Courses aur Course period/status view kar sakta hai.",
  },

  {
    key: "courses.edit",
    name: "Edit Courses",
    module: "TRAINEE MANAGEMENT",
    description:
      "Courses add aur edit kar sakta hai.",
  },

  {
    key: "platoons.view",
    name: "View Platoons",
    module: "TRAINEE MANAGEMENT",
    description:
      "Course Platoons view kar sakta hai.",
  },

  {
    key: "platoons.edit",
    name: "Edit Platoons",
    module: "TRAINEE MANAGEMENT",
    description:
      "Course Platoons add aur manage kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | STAFF MANAGEMENT
  |--------------------------------------------------------------------------
  */

  {
    key: "staff.view",
    name: "View Staff",
    module: "STAFF MANAGEMENT",
    description:
      "PTS Staff, Categories and Branches view kar sakta hai.",
  },

  {
    key: "staff.edit",
    name: "Edit Staff",
    module: "STAFF MANAGEMENT",
    description:
      "Staff, Categories and Branches add/edit/manage kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | TIMETABLE
  |--------------------------------------------------------------------------
  */

  {
    key: "timetable.view",
    name: "View Timetable",
    module: "TIMETABLE",
    description:
      "Timetables aur assignments view kar sakta hai.",
  },

  {
    key: "timetable.edit",
    name: "Edit Timetable",
    module: "TIMETABLE",
    description:
      "Timetable create, update and delete kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | ATTENDANCE
  |--------------------------------------------------------------------------
  */

  {
    key: "attendance.view",
    name: "View Attendance",
    module: "ATTENDANCE",
    description:
      "Attendance records aur summaries view kar sakta hai.",
  },

  {
    key: "attendance.correct",
    name: "Process / Correct Attendance",
    module: "ATTENDANCE",
    description:
      "Attendance process ya recalculate kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | GENERAL STATEMENT
  |--------------------------------------------------------------------------
  */

  {
    key: "general_statement.view",
    name: "View General Statement",
    module: "GENERAL STATEMENT",
    description:
      "Course General Statements view kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | PROFILE
  |--------------------------------------------------------------------------
  */

  {
    key: "profiles.view",
    name: "View Profiles",
    module: "PROFILE",
    description:
      "Trainee aur Staff detailed historical profiles view kar sakta hai.",
  },

  {
    key: "profiles.edit",
    name: "Edit Profile",
    module: "PROFILE",
    description:
      "Profile photo aur editable Profile information manage kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | BIOMETRIC TRANSACTIONS
  |--------------------------------------------------------------------------
  */

  {
    key: "biometric.view",
    name: "View Biometric Transactions",
    module: "BIOMETRIC / ZKBIOTIME",
    description:
      "ZKBioTime transactions aur related filters view kar sakta hai.",
  },

  {
    key: "biometric.sync",
    name: "Sync Biometric Transactions",
    module: "BIOMETRIC / ZKBIOTIME",
    description:
      "Transactions manually ya live sync kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | DEVICES
  |--------------------------------------------------------------------------
  */

  {
    key: "devices.view",
    name: "View Devices",
    module: "BIOMETRIC / ZKBIOTIME",
    description:
      "Connected ZKTeco devices aur status view kar sakta hai.",
  },

  {
    key: "devices.manage",
    name: "Manage Devices",
    module: "BIOMETRIC / ZKBIOTIME",
    description:
      "Device commands, add/edit/delete, upload and reboot actions use kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | REPORTS
  |--------------------------------------------------------------------------
  */

  {
    key: "reports.view",
    name: "View Reports",
    module: "REPORTS",
    description:
      "PTS reports view kar sakta hai.",
  },

  {
    key: "reports.export",
    name: "Export Reports",
    module: "REPORTS",
    description:
      "Reports Excel ya supported format mein export kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | LEAVE
  |--------------------------------------------------------------------------
  */

  {
    key: "leave.view",
    name: "View Leave",
    module: "LEAVE MANAGEMENT",
    description:
      "Leave records view kar sakta hai.",
  },

  {
    key: "leave.create",
    name: "Create Leave",
    module: "LEAVE MANAGEMENT",
    description:
      "Normal Leave create/import kar sakta hai.",
  },

  {
    key: "leave.edit",
    name: "Edit Leave",
    module: "LEAVE MANAGEMENT",
    description:
      "Existing Leave record edit kar sakta hai.",
  },

  {
    key: "leave.emergency.submit",
    name: "Submit Emergency Leave",
    module: "LEAVE MANAGEMENT",
    description:
      "Emergency Leave submit kar sakta hai.",
  },

  {
    key: "leave.approve",
    name: "Approve Emergency Leave",
    module: "LEAVE MANAGEMENT",
    description:
      "Emergency Leave approve kar sakta hai.",
  },

  {
    key: "leave.reject",
    name: "Reject Emergency Leave",
    module: "LEAVE MANAGEMENT",
    description:
      "Emergency Leave reject kar sakta hai.",
  },

  {
    key: "leave.cancel",
    name: "Cancel Leave",
    module: "LEAVE MANAGEMENT",
    description:
      "Leave record cancel kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | OSD / SHORT PERMISSION
  |--------------------------------------------------------------------------
  */

  {
    key: "osd.view",
    name: "View OSD / Permission",
    module: "OSD / PERMISSION",
    description:
      "OSD aur Short Period Permission records view kar sakta hai.",
  },

  {
    key: "osd.create",
    name: "Create OSD",
    module: "OSD / PERMISSION",
    description:
      "OSD record create kar sakta hai.",
  },

  {
    key: "osd.edit",
    name: "Edit OSD",
    module: "OSD / PERMISSION",
    description:
      "OSD record edit kar sakta hai.",
  },

  {
    key: "osd.cancel",
    name: "Cancel OSD / Permission",
    module: "OSD / PERMISSION",
    description:
      "OSD ya Permission cancel kar sakta hai.",
  },

  {
    key: "short_permission.create",
    name: "Create Short Permission",
    module: "OSD / PERMISSION",
    description:
      "Short Period Permission create kar sakta hai.",
  },

  {
    key: "short_permission.edit",
    name: "Edit Short Permission",
    module: "OSD / PERMISSION",
    description:
      "Short Period Permission edit kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | OUTDOOR / MEDICAL
  |--------------------------------------------------------------------------
  */

  {
    key: "outdoor.view",
    name: "View Outdoor / Medical",
    module: "OUTDOOR / MEDICAL",
    description:
      "Outdoor, Medical and Home Rest records view kar sakta hai.",
  },

  {
    key: "outdoor.create",
    name: "Create Outdoor / Medical",
    module: "OUTDOOR / MEDICAL",
    description:
      "Outdoor / Medical record create kar sakta hai.",
  },

  {
    key: "outdoor.edit",
    name: "Edit Outdoor / Medical",
    module: "OUTDOOR / MEDICAL",
    description:
      "Outdoor / Medical record edit kar sakta hai.",
  },

  {
    key: "outdoor.cancel",
    name: "Cancel Outdoor / Medical",
    module: "OUTDOOR / MEDICAL",
    description:
      "Outdoor / Medical record cancel kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | MANUAL ABSENCE
  |--------------------------------------------------------------------------
  */

  {
    key: "manual_absence.view",
    name: "View Manual Absence",
    module: "MANUAL ABSENCE",
    description:
      "Manual Absence records view kar sakta hai.",
  },

  {
    key: "manual_absence.create",
    name: "Create Manual Absence",
    module: "MANUAL ABSENCE",
    description:
      "Manual Absence record create kar sakta hai.",
  },

  {
    key: "manual_absence.edit",
    name: "Edit Manual Absence",
    module: "MANUAL ABSENCE",
    description:
      "Manual Absence record edit kar sakta hai.",
  },

  {
    key: "manual_absence.cancel",
    name: "Cancel Manual Absence",
    module: "MANUAL ABSENCE",
    description:
      "Manual Absence record cancel kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | TRAINING DROP
  |--------------------------------------------------------------------------
  */

  {
    key: "training_drop.view",
    name: "View Training Drop",
    module: "TRAINING DROP",
    description:
      "Training Drop history view kar sakta hai.",
  },

  {
    key: "training_drop.create",
    name: "Create Training Drop",
    module: "TRAINING DROP",
    description:
      "Trainee Training Drop mark kar sakta hai.",
  },

  {
    key: "training_drop.rejoin",
    name: "Rejoin Training",
    module: "TRAINING DROP",
    description:
      "Dropped trainee ko rejoin kar sakta hai.",
  },

  {
    key: "training_drop.cancel",
    name: "Cancel Training Drop",
    module: "TRAINING DROP",
    description:
      "Training Drop record cancel kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | USER MANAGEMENT
  |--------------------------------------------------------------------------
  */

  {
    key: "users.view",
    name: "View Users",
    module: "USER MANAGEMENT",
    description:
      "Portal users view kar sakta hai.",
  },

  {
    key: "users.manage",
    name: "Manage Users",
    module: "USER MANAGEMENT",
    description:
      "Portal users create/edit, activate/deactivate, password aur permissions manage kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | ROLE MANAGEMENT
  |--------------------------------------------------------------------------
  */

  {
    key: "roles.view",
    name: "View Roles",
    module: "USER MANAGEMENT",
    description:
      "Roles aur assigned permissions view kar sakta hai.",
  },

  {
    key: "roles.manage",
    name: "Manage Roles",
    module: "USER MANAGEMENT",
    description:
      "Roles create/edit aur Role permissions manage kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | PUBLIC WEBSITE
  |--------------------------------------------------------------------------
  */

  {
    key: "public_site.manage",
    name: "Manage Public Website",
    module: "PUBLIC WEBSITE",
    description:
      "Public website content, media and settings manage kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | AUDIT
  |--------------------------------------------------------------------------
  */

  {
    key: "audit.view",
    name: "View Audit Logs",
    module: "AUDIT LOGS",
    description:
      "Portal audit/activity logs view kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | SETTINGS
  |--------------------------------------------------------------------------
  */

  {
    key: "settings.view",
    name: "View Settings",
    module: "SETTINGS",
    description:
      "Portal runtime and system settings view kar sakta hai.",
  },

  {
    key: "settings.manage",
    name: "Manage Settings",
    module: "SETTINGS",
    description:
      "Portal runtime and system settings update kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | WEEKEND / DUTY REST / DUTY ROSTER
  |--------------------------------------------------------------------------
  */

  {
    key: "weekend.manage",
    name: "Manage Long Weekend",
    module: "TIMETABLE",
    description:
      "Long Weekend create, edit, delete, detained trainee aur departure settings manage kar sakta hai.",
  },

  {
    key: "duty_rest.view",
    name: "View Duty Rest",
    module: "STAFF MANAGEMENT",
    description:
      "Staff Duty Rest records view kar sakta hai.",
  },

  {
    key: "duty_rest.manage",
    name: "Manage Duty Rest",
    module: "STAFF MANAGEMENT",
    description:
      "Staff Duty Rest create, edit aur cancel kar sakta hai.",
  },

  {
    key: "duty_roster.view",
    name: "View Duty Roster",
    module: "TIMETABLE",
    description:
      "Shift Duty / Duty Roster aur biometric shift attendance view kar sakta hai.",
  },

  {
    key: "duty_roster.manage",
    name: "Manage Duty Roster",
    module: "TIMETABLE",
    description:
      "Shift Duty / Duty Roster create, edit, copy aur delete/manage kar sakta hai.",
  },

  /*
  |--------------------------------------------------------------------------
  | DATA MANAGEMENT
  |--------------------------------------------------------------------------
  */

  {
    key: "data_management.view",
    name: "View Data Management",
    module: "DATA MANAGEMENT",
    description:
      "Data management tools aur available records view kar sakta hai.",
  },

  {
    key: "data_management.manage",
    name: "Manage / Permanently Delete Data",
    module: "DATA MANAGEMENT",
    description:
      "Permanent deletion aur high-risk data management actions perform kar sakta hai.",
  },
];


/*
|--------------------------------------------------------------------------
| UPSERT PERMISSION
|--------------------------------------------------------------------------
*/

async function upsertPermission(
  permission
) {
  const [
    existingRows,
  ] =
    await pool.query(
      `
        SELECT id
        FROM permissions
        WHERE permission_key = ?
        LIMIT 1
      `,
      [
        permission.key,
      ]
    );

  if (
    existingRows.length
  ) {
    const id =
      Number(
        existingRows[0].id
      );

    await pool.query(
      `
        UPDATE permissions

        SET
          permission_name = ?,
          module_name = ?,
          description = ?,
          is_active = 1

        WHERE id = ?
      `,
      [
        permission.name,
        permission.module,
        permission.description,
        id,
      ]
    );

    return {
      id,
      action:
        "UPDATED",
      ...permission,
    };
  }


  const [
    result,
  ] =
    await pool.query(
      `
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
          ?,
          ?,
          ?,
          ?,
          1
        )
      `,
      [
        permission.key,
        permission.name,
        permission.module,
        permission.description,
      ]
    );

  return {
    id:
      Number(
        result.insertId
      ),

    action:
      "CREATED",

    ...permission,
  };
}


/*
|--------------------------------------------------------------------------
| ASSIGN PERMISSION TO SUPER ADMIN
|--------------------------------------------------------------------------
*/

async function assignToSuperAdmin(
  roleId,
  permissionId
) {
  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          role_id

        FROM role_permissions

        WHERE
          role_id = ?
          AND permission_id = ?

        LIMIT 1
      `,
      [
        roleId,
        permissionId,
      ]
    );

  if (
    rows.length
  ) {
    return;
  }

  await pool.query(
    `
      INSERT INTO role_permissions
      (
        role_id,
        permission_id
      )

      VALUES
      (
        ?,
        ?
      )
    `,
    [
      roleId,
      permissionId,
    ]
  );
}


/*
|--------------------------------------------------------------------------
| RUN
|--------------------------------------------------------------------------
*/

async function main() {
  const [
    roleRows,
  ] =
    await pool.query(
      `
        SELECT id
        FROM roles
        WHERE UPPER(TRIM(role_name)) = 'SUPER_ADMIN'
        LIMIT 1
      `
    );

  const superAdminRoleId =
    roleRows[0]
      ? Number(
          roleRows[0].id
        )
      : null;


  const results =
    [];

  for (
    const permission
    of PERMISSIONS
  ) {
    const saved =
      await upsertPermission(
        permission
      );

    results.push(
      saved
    );

    if (
      superAdminRoleId
    ) {
      await assignToSuperAdmin(
        superAdminRoleId,
        saved.id
      );
    }
  }


  console.log(
    "\n===== PERMISSION SYNC COMPLETE =====\n"
  );

  console.table(
    results.map(
      (
        item
      ) => ({
        id:
          item.id,

        permission:
          item.key,

        module:
          item.module,

        action:
          item.action,
      })
    )
  );


  console.log(
    `\nTotal Permissions: ${results.length}`
  );

  console.log(
    superAdminRoleId
      ? `SUPER_ADMIN Role ID ${superAdminRoleId}: all permissions ensured.`
      : "WARNING: SUPER_ADMIN Role not found."
  );
}


main()
  .catch(
    (
      error
    ) => {
      console.error(
        "\nPermission sync failed:"
      );

      console.error(
        error
      );

      process.exitCode =
        1;
    }
  )
  .finally(
    async () => {
      try {
        await pool.end();
      } catch (_) {
        // ignore
      }
    }
  );