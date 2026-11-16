const readline = require("readline");
const { hashPassword } = require("../src/utils/password");
const { pool } = require("../src/config/db");

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const username = await ask("Admin username: ");
  const fullName = await ask("Full name: ");
  const password = await ask("Admin password: ");

  if (!username || !fullName || !password) {
    throw new Error("All fields are required.");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const passwordHash = await hashPassword(password);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [roles] = await connection.query(
      `
        SELECT id
        FROM roles
        WHERE role_name = 'SUPER_ADMIN'
          AND is_active = TRUE
        LIMIT 1
      `
    );

    if (!roles[0]) {
      throw new Error(
        "SUPER_ADMIN role is missing. Create the role first."
      );
    }

    const roleId = roles[0].id;

    const [existingUsers] = await connection.query(
      `
        SELECT id
        FROM users
        WHERE username = :username
        LIMIT 1
      `,
      { username }
    );

    if (existingUsers.length > 0) {
      throw new Error("That username already exists.");
    }

    const [result] = await connection.query(
      `
        INSERT INTO users (
          username,
          password_hash,
          full_name,
          role_id,
          is_active
        )
        VALUES (
          :username,
          :passwordHash,
          :fullName,
          :roleId,
          TRUE
        )
      `,
      {
        username,
        passwordHash,
        fullName,
        roleId,
      }
    );

    await connection.commit();

    console.log(
      `Admin user '${username}' created successfully. User ID: ${result.insertId}`
    );
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {
      // Ignore rollback errors.
    }

    throw err;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Could not create admin:", err.message);
  process.exit(1);
});