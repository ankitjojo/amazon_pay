/**
 * Standardized API response helpers.
 */

const sendSuccess = (res, statusCode = 200, message = "OK", data = null) => {
  const payload = { success: true, message };
  if (data !== null) payload.data = data;
  return res.status(statusCode).json(payload);
};

const sendError = (res, statusCode = 500, message = "Internal Server Error", error = null) => {
  const payload = { success: false, message };
  if (error && process.env.NODE_ENV !== "production") {
    payload.error = error.toString();
  }
  return res.status(statusCode).json(payload);
};

module.exports = { sendSuccess, sendError };
