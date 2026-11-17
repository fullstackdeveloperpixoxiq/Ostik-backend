const jwt = require("jsonwebtoken");
const UserSchema = require("../models/UserSchema");

/*
  OPTIONAL AUTH (used by the customer chatbot)

  - No Authorization header      -> guest (req.user = null). Public product / FAQ
                                    questions are still allowed.
  - Malformed / invalid / expired -> 401. We do NOT silently downgrade to guest,
                                    so the frontend can tell the customer that
                                    their session expired.
  - Valid customer token          -> req.user = { userId, role: "user" }
  - Valid admin token             -> treated as guest. The chatbot is a customer
                                    feature and must never expose admin data or
                                    behave differently for admins.

  SECURITY: identity comes ONLY from the verified JWT. A userId sent in the
  request body/query is never trusted.
*/
const optionalAuthMiddleware = async (req, res, next) => {
  req.user = null;

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  const parts = authHeader.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    return res.status(401).json({
      success: false,
      code: "AUTH_INVALID",
      message: "Invalid authorization format. Please log in again.",
    });
  }

  let decoded;

  try {
    decoded = jwt.verify(parts[1], process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({
      success: false,
      code: err.name === "TokenExpiredError" ? "AUTH_EXPIRED" : "AUTH_INVALID",
      message:
        err.name === "TokenExpiredError"
          ? "Your session has expired. Please log in again."
          : "Your session is invalid. Please log in again.",
    });
  }

  // Admin tokens (payload { id, role: "admin" }) or tokens without a
  // customer userId get no customer identity in the chatbot.
  if (!decoded || decoded.role === "admin" || !decoded.userId) {
    return next();
  }

  try {
    // Make sure the account still exists and is active before
    // granting access to personal order data.
    const user = await UserSchema.findById(decoded.userId)
      .select("_id role isActive")
      .lean();

    if (!user || user.isActive === false || user.role !== "user") {
      return res.status(401).json({
        success: false,
        code: "AUTH_INVALID",
        message: "Your session is no longer valid. Please log in again.",
      });
    }

    req.user = { userId: String(user._id), role: "user" };
    return next();
  } catch (err) {
    console.error("Chatbot optional auth error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
};

module.exports = optionalAuthMiddleware;
