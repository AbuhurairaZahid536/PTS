const {
  getAuthToken,
  getEmployees,
  getAreas,
  getDepartments,
  getPositions,
} = require("../integrations/zkbiotime/client");


const {
  syncEmployees,
  syncAllEmployees,
} = require("../integrations/zkbiotime/employeeSync.service");

async function testConnection(req, res, next) {
  try {
    const token = await getAuthToken();

    return res.json({
      success: true,
      data: {
        connected: true,
        message: "ZKBioTime authentication successful.",
        token_received: Boolean(token),
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function listEmployees(req, res, next) {
  try {
    const data = await getEmployees({
      page: req.query.page || 1,
      page_size: req.query.page_size || 20,
      ...(req.query.emp_code
        ? { emp_code: req.query.emp_code }
        : {}),
      ...(req.query.first_name
        ? { first_name: req.query.first_name }
        : {}),
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function listAreas(req, res, next) {
  try {
    const data = await getAreas({
      page: req.query.page || 1,
      page_size: req.query.page_size || 20,
      ...(req.query.area_code
        ? { area_code: req.query.area_code }
        : {}),
      ...(req.query.area_name
        ? { area_name: req.query.area_name }
        : {}),
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}
async function listDepartments(req, res, next) {
  try {
    const data = await getDepartments({
      page: req.query.page || 1,
      page_size: req.query.page_size || 100,
      ...(req.query.dept_code
        ? { dept_code: req.query.dept_code }
        : {}),
      ...(req.query.dept_name
        ? { dept_name: req.query.dept_name }
        : {}),
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function listPositions(req, res, next) {
  try {
    const data = await getPositions({
      page: req.query.page || 1,
      page_size: req.query.page_size || 100,
      ...(req.query.position_code
        ? { position_code: req.query.position_code }
        : {}),
      ...(req.query.position_name
        ? { position_name: req.query.position_name }
        : {}),
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function syncEmployeeRecords(req, res, next) {
  try {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.page_size || 5);

    if (!Number.isInteger(page) || page < 1) {
      return res.status(400).json({
        success: false,
        message: "page must be a positive integer.",
      });
    }

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return res.status(400).json({
        success: false,
        message: "page_size must be between 1 and 100.",
      });
    }

    const result = await syncEmployees(page, pageSize);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}
async function syncAllEmployeeRecords(req, res, next) {
  try {
    const pageSize = Number(req.query.page_size || 100);

    if (
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "page_size must be between 1 and 100.",
      });
    }

    const result = await syncAllEmployees(pageSize);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  testConnection,
  listEmployees,
  listAreas,
  listDepartments,
  listPositions,
  syncEmployeeRecords,
  syncAllEmployeeRecords,
};