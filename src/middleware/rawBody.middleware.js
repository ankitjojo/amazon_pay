/**
 * Raw Body Capture Middleware
 *
 * Buffers the raw request body stream and attaches it to `req.rawBody`.
 * This is essential for cryptographic signature verification (HMAC / JWT)
 * where body re-serialization would invalidate the signature.
 *
 * Must be registered BEFORE express.json() or bodyParser for the webhook route.
 */
const captureRawBody = (req, res, next) => {
  let data = [];

  req.on("data", (chunk) => {
    data.push(chunk);
  });

  req.on("end", () => {
    req.rawBody = Buffer.concat(data).toString("utf8");

    // Also parse JSON so controllers can access req.body normally
    try {
      req.body = JSON.parse(req.rawBody);
    } catch {
      req.body = {};
    }

    next();
  });

  req.on("error", (err) => {
    console.error("❌  Error reading request stream:", err.message);
    res.status(400).json({ success: false, message: "Bad request stream" });
  });
};

module.exports = captureRawBody;
