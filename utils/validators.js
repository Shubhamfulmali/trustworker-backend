const { body, param, query, validationResult } = require("express-validator");

// Basic Indian-friendly phone check: allows +91, spaces, dashes, 8-14 digits total
const PHONE_REGEX = /^[+]?[\d\s-]{8,16}$/;

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

const workerCreateRules = [
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 120 }),
  body("service").trim().notEmpty().withMessage("Service is required").isLength({ max: 60 }),
  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone is required")
    .matches(PHONE_REGEX)
    .withMessage("Enter a valid phone number"),
  body("city").optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body("note").optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  body("photo_url").optional({ checkFalsy: true }).trim().isURL().withMessage("photo_url must be a valid URL"),
  body("lat").optional({ checkFalsy: true }).isFloat({ min: -90, max: 90 }).toFloat(),
  body("lng").optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }).toFloat(),
  body("verified").optional().isBoolean().toBoolean(),
  body("available").optional().isBoolean().toBoolean(),
];

const workerUpdateRules = [
  param("id").isInt({ min: 1 }).withMessage("Invalid worker id"),
  body("name").optional().trim().notEmpty().isLength({ max: 120 }),
  body("service").optional().trim().notEmpty().isLength({ max: 60 }),
  body("phone").optional().trim().matches(PHONE_REGEX).withMessage("Enter a valid phone number"),
  body("city").optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body("note").optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  body("photo_url").optional({ checkFalsy: true }).trim().isURL().withMessage("photo_url must be a valid URL"),
  body("lat").optional({ checkFalsy: true }).isFloat({ min: -90, max: 90 }).toFloat(),
  body("lng").optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }).toFloat(),
  body("verified").optional().isBoolean().toBoolean(),
  body("available").optional().isBoolean().toBoolean(),
];

const idParamRule = [param("id").isInt({ min: 1 }).withMessage("Invalid id")];

const reviewCreateRules = [
  param("id").isInt({ min: 1 }).withMessage("Invalid worker id"),
  body("reviewer_name").optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating must be 1-5"),
  body("comment").optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
];

const listQueryRules = [
  query("service").optional().trim().isLength({ max: 60 }),
  query("city").optional().trim().isLength({ max: 100 }),
  query("q").optional().trim().isLength({ max: 120 }),
  query("available").optional().isBoolean().toBoolean(),
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = {
  handleValidation,
  workerCreateRules,
  workerUpdateRules,
  idParamRule,
  reviewCreateRules,
  listQueryRules,
};
