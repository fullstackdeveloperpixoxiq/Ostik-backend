const mongoose = require("mongoose");

const ProductSchema = require("../models/ProductSchema");
const Variant = require("../models/VariantSchema");
const CategorySchema = require("../models/CategorySchema");
const OrderSchema = require("../models/OrderSchema");
const ReturnSchema = require("../models/ReturnSchema");
const ExchangeSchema = require("../models/ExchangeSchema");
const ShippingSettings = require("../models/ShippingSettingSchema");
const { getPolicy, PAGES } = require("./ChatbotKnowledge");

/*
  READ-ONLY data access for the customer chatbot.

  SECURITY RULES (do not relax):
  - Every function here only READS data. Nothing creates, updates or deletes.
  - Gemini never builds queries. It can only pass a few validated, typed
    arguments; all filters are constructed here.
  - Customer-specific functions take `userId` from the verified JWT
    (req.user.userId), passed in by the controller, never from tool arguments,
    and every query is scoped with { user: userId }.
  - Output is a minimal projection. Shipping addresses, phone numbers, emails,
    payment IDs and admin-only fields are never returned.
*/

// ---------------------------------------------------------------------------
// Customer visibility of products
// ---------------------------------------------------------------------------
// ProductSchema.status: active | inactive | pending | approved | rejected.
// Existing customer-facing backend queries (GetHotSellingProducts,
// GetLimitedStockProducts) only show "approved", and the admin product list
// styles "approved" and "active" identically as the live/published states.
// "pending", "inactive" and "rejected" are never shown to customers here.
const VISIBLE_PRODUCT_STATUSES = ["approved", "active"];

const MAX_SEARCH_RESULTS = 6;
const MAX_CANDIDATES = 200;
const MAX_ORDERS = 5;
const RETURN_EXCHANGE_WINDOW_DAYS = 7; // mirrors Return/ExchangeController

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "for", "with", "show", "me", "find", "any",
  "do", "you", "have", "some", "please", "products", "product", "items",
  "item", "under", "below", "above", "over", "less", "than", "more", "rs",
  "inr", "price", "prices", "cheap", "best", "good", "new", "latest", "i",
  "want", "need", "looking", "something", "in", "of", "to", "is", "are",
  "available", "your", "my", "on", "all", "get", "buy",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// "t-shirt" also matches "t shirt" / "tshirt"
const keywordPattern = (k) => escapeRegex(k).replace(/-/g, "[- ]?");
const keywordRegex = (k) => new RegExp(keywordPattern(k), "i");

const isValidId = (value) =>
  typeof value === "string" && mongoose.Types.ObjectId.isValid(value) && /^[a-f0-9]{24}$/i.test(value);

const toNumberOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const truncate = (text, max) => {
  if (!text) return "";
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

// Same formula used by the storefront (ProductDetail.jsx / Product.jsx)
const finalPriceOf = (variant) => {
  const price = Number(variant.price) || 0;
  const discount = Number(variant.discountPercent) || 0;
  return Math.round(price - (price * discount) / 100);
};

const isPurchasable = (variant) => variant.isActive !== false && Number(variant.stock) > 0;

const shortOrderId = (id) => String(id).slice(-8).toUpperCase();

const toDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

// Turn free text into a few search keywords: "black shirts" -> ["black","shirt"]
const extractKeywords = (text) => {
  if (!text || typeof text !== "string") return [];

  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .map((w) => w.replace(/^-+|-+$/g, ""))
        .filter((w) => w.length > 1 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
        .map((w) => (w.length > 3 && w.endsWith("es") && /(sh|ch|x|s)es$/.test(w) ? w.slice(0, -2) : w))
        .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    ),
  ].slice(0, 6);
};

// Flatten the free-form `specs` object into a short list of "key: value"
const flattenSpecs = (specs, maxEntries = 25) => {
  const out = [];

  const walk = (value, prefix) => {
    if (out.length >= maxEntries || value === null || value === undefined) return;

    if (Array.isArray(value)) {
      if (value.every((v) => typeof v !== "object")) {
        out.push({ name: prefix, value: truncate(value.join(", "), 200) });
      } else {
        value.forEach((v, i) => {
          if (v && typeof v === "object" && ("key" in v || "name" in v || "label" in v) && "value" in v) {
            out.push({ name: truncate(String(v.key || v.name || v.label), 60), value: truncate(String(v.value), 200) });
          } else {
            walk(v, prefix ? `${prefix} ${i + 1}` : String(i + 1));
          }
        });
      }
      return;
    }

    if (typeof value === "object") {
      Object.entries(value).forEach(([k, v]) => walk(v, prefix ? `${prefix} > ${k}` : k));
      return;
    }

    out.push({ name: truncate(prefix || "spec", 60), value: truncate(String(value), 200) });
  };

  walk(specs, "");
  return out.slice(0, maxEntries);
};

// Active categories (plus children of a matched parent)
const getActiveCategories = async () =>
  CategorySchema.find({ isActive: true }).select("_id name slug parentCategory").lean();

const resolveCategoryIds = (categories, text) => {
  if (!text) return null;

  const needle = text.toLowerCase().trim();
  const singular = needle.length > 3 && needle.endsWith("s") ? needle.slice(0, -1) : needle;

  const matched = categories.filter((c) => {
    const name = (c.name || "").toLowerCase();
    const slug = (c.slug || "").toLowerCase();
    return name.includes(singular) || slug.includes(singular) || singular.includes(name);
  });

  if (!matched.length) return [];

  const ids = new Set(matched.map((c) => String(c._id)));

  // include sub-categories of matched categories
  categories.forEach((c) => {
    if (c.parentCategory && ids.has(String(c.parentCategory))) ids.add(String(c._id));
  });

  return [...ids];
};

// ---------------------------------------------------------------------------
// Model number (stored inside the free-form ProductSchema.specs)
// ---------------------------------------------------------------------------
// Real data uses both "Model No" and "model No"; other spellings such as
// Model, model, Model Number, modelNumber, model_number, modelNo are supported.
const MODEL_KEY = /^\s*model[\s_.-]*(no|number|num|#)?\.?\s*$/i;
const MODEL_KEY_SOURCE = "^\\s*model[\\s_.-]*(no|number|num|#)?\\.?\\s*$";

const getModelNumber = (specs) => {
  if (!specs || typeof specs !== "object") return null;

  // [{ key|name|label, value }] format
  if (Array.isArray(specs)) {
    for (const entry of specs) {
      const key = entry && (entry.key || entry.name || entry.label);
      if (key && MODEL_KEY.test(String(key).trim()) && entry.value != null) return String(entry.value).trim();
    }
    return null;
  }

  for (const [key, value] of Object.entries(specs)) {
    if (MODEL_KEY.test(key.trim()) && (typeof value === "string" || typeof value === "number")) {
      return String(value).trim();
    }
  }

  // one level of nesting, e.g. { General: { "Model No": "OST405" } }
  for (const value of Object.values(specs)) {
    if (value && typeof value === "object") {
      const nested = getModelNumber(value);
      if (nested) return nested;
    }
  }

  return null;
};

// ---------------------------------------------------------------------------
// Identifier (SKU / model number) detection
// ---------------------------------------------------------------------------
// An identifier starts with a letter and contains digits: OST405, ost-405,
// OST-BLK-001, "OST 405". Wattages like "65W" (digit first) are not identifiers.
const IDENTIFIER_TOKEN = /\b[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*\b/gi;
const NOT_IDENTIFIER_PREFIX = new Set([...STOP_WORDS, "upto", "within", "pack", "set", "size", "rs", "inr", "only", "just"]);

const cleanIdentifier = (value) =>
  String(value || "")
    .trim()
    .replace(/^[#"'`]+|[.,!?"'`]+$/g, "")
    .slice(0, 40);

const collectIdentifiers = (explicit, query) => {
  const found = [];
  const add = (v) => {
    const id = cleanIdentifier(v);
    if (id.length >= 3 && /[a-z]/i.test(id) && /\d/.test(id) && !found.some((f) => f.toUpperCase() === id.toUpperCase())) {
      found.push(id);
    }
  };

  if (typeof explicit === "string") explicit.split(/[,;]/).forEach(add);

  if (typeof query === "string") {
    for (const m of query.matchAll(IDENTIFIER_TOKEN)) {
      // must contain a digit ("Type-C" is not an identifier)
      if (/\d/.test(m[0]) && m[0].length <= 40) add(m[0]);
    }

    // "OST 405" written with a space. Lowercase prefixes must be short and not a
    // normal word, so "under 1000" or "within 1500" are never treated as codes.
    for (const m of query.matchAll(/\b([a-z]{2,6})\s+(\d{2,8})\b/gi)) {
      const prefix = m[1];
      const isUpper = prefix === prefix.toUpperCase();
      if (!NOT_IDENTIFIER_PREFIX.has(prefix.toLowerCase()) && (isUpper || prefix.length <= 4)) {
        add(`${prefix} ${m[2]}`);
      }
    }
  }

  return found.slice(0, 4);
};

// "ost 405" -> /^O[\s_-]*S[\s_-]*T[\s_-]*4[\s_-]*0[\s_-]*5$/i (ignores separators only)
const separatorInsensitive = (id) => {
  const chars = id.replace(/[^a-z0-9]/gi, "").split("").map(escapeRegex);
  return chars.length ? new RegExp(`^${chars.join("[\\s_-]*")}$`, "i") : null;
};

// Compact product card for the frontend (only public catalogue data)
const toProductCard = (product, variants, categoryName, preferredVariant) => {
  const purchasable = variants.filter(isPurchasable);
  const pool = purchasable.length ? purchasable : variants;
  const display =
    preferredVariant ||
    [...pool].sort((a, b) => finalPriceOf(a) - finalPriceOf(b))[0] ||
    null;

  return {
    _id: String(product._id),
    name: product.name,
    image: product.images?.[0] || display?.images?.[0] || "",
    category: categoryName || "",
    variantName: display?.name || "",
    sku: display?.sku || "",
    modelNumber: getModelNumber(product.specs) || "",
    variantCount: variants.length,
    price: display ? Number(display.price) : null,
    finalPrice: display ? finalPriceOf(display) : null,
    discountPercent: display ? Number(display.discountPercent) || 0 : 0,
    inStock: purchasable.length > 0,
    url: `/product/${product._id}`,
  };
};

const variantSummary = (v) => ({
  variant: v.name,
  sku: v.sku || undefined,
  price: Number(v.price),
  discountPercent: Number(v.discountPercent) || 0,
  finalPrice: finalPriceOf(v),
  stock: Number(v.stock) > 0 ? (Number(v.stock) <= 15 ? `Only ${v.stock} left` : "In stock") : "Out of stock",
});

// ---------------------------------------------------------------------------
// PUBLIC TOOLS
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SKU / MODEL NUMBER LOOKUP
// ---------------------------------------------------------------------------
// SKU lives on VariantSchema.sku; the model number lives in ProductSchema.specs.
// Order: exact SKU -> exact model -> same code ignoring spaces/hyphens ->
// partial code. Products must be customer-visible and variants active.

const VARIANT_FIELDS = "product name sku price discountPercent stock images isActive";
const PRODUCT_FIELDS = "name description category images specs status isNewArrival";

const visibleProductFilter = (categories) => ({
  status: { $in: VISIBLE_PRODUCT_STATUSES },
  category: { $in: categories.map((c) => c._id) },
});

// Product IDs whose specs contain a model key ("Model No", "model", "modelNumber", ...)
// with a value matching `valueRegex`. Only the matching _ids are returned.
const findProductIdsByModel = async (valueRegex, matchFilter, limit = 10) => {
  const [flat, list] = await Promise.all([
    // specs stored as an object: { "Model No": "OST405", ... }
    ProductSchema.aggregate([
      { $match: matchFilter },
      {
        $project: {
          kv: {
            $cond: [{ $eq: [{ $type: "$specs" }, "object"] }, { $objectToArray: "$specs" }, []],
          },
        },
      },
      { $unwind: "$kv" },
      { $match: { "kv.k": { $regex: MODEL_KEY_SOURCE, $options: "i" }, "kv.v": valueRegex } },
      { $group: { _id: "$_id" } },
      { $limit: limit },
    ]),
    // specs stored as a list: [{ key: "Model No", value: "OST405" }, ...]
    ProductSchema.find({
      ...matchFilter,
      specs: {
        $elemMatch: {
          $or: ["key", "name", "label"].map((f) => ({ [f]: { $regex: MODEL_KEY_SOURCE, $options: "i" } })),
          value: valueRegex,
        },
      },
    })
      .select("_id")
      .limit(limit)
      .lean(),
  ]);

  return [...new Set([...flat, ...list].map((d) => String(d._id)))];
};

const variantDetail = (v) => ({
  variantId: String(v._id),
  variant: v.name,
  sku: v.sku,
  price: Number(v.price),
  discountPercent: Number(v.discountPercent) || 0,
  finalPrice: finalPriceOf(v),
  stock: Math.max(Number(v.stock) || 0, 0),
  availability: isPurchasable(v) ? (Number(v.stock) <= 15 ? `In stock (only ${v.stock} left)` : "In stock") : "Out of stock",
});

/**
 * Build the identifier result for a set of matched products/variants.
 * Re-checks visibility, so hidden products or inactive variants never leak.
 */
const buildIdentifierMatches = async ({ productIds, matchedVariantIds, categories, categoryNameById }) => {
  if (!productIds.length) return [];

  const products = await ProductSchema.find({ _id: { $in: productIds }, ...visibleProductFilter(categories) })
    .select(PRODUCT_FIELDS)
    .lean();

  if (!products.length) return [];

  const variants = await Variant.find({ product: { $in: products.map((p) => p._id) }, isActive: true })
    .select(VARIANT_FIELDS)
    .sort({ price: 1 })
    .lean();

  return products
    .map((product) => {
      const all = variants.filter((v) => String(v.product) === String(product._id));
      if (!all.length) return null; // no active variant -> not shown

      const matched = matchedVariantIds ? all.filter((v) => matchedVariantIds.has(String(v._id))) : [];
      const categoryName = categoryNameById.get(String(product.category)) || "";

      return {
        product,
        all,
        matched,
        categoryName,
        forModel: {
          productId: String(product._id),
          name: product.name,
          category: categoryName,
          url: `/product/${product._id}`,
          description: truncate(product.description, 400),
          modelNumber: getModelNumber(product.specs) || "Not listed",
          status: "Published on Ostik",
          imageCount: (product.images || []).length,
          matchedVariants: matched.map(variantDetail),
          variants: all.slice(0, 10).map(variantDetail),
        },
        card: toProductCard(product, all, categoryName, matched[0]),
      };
    })
    .filter(Boolean);
};

/**
 * Look up one SKU / model identifier. Returns
 *   { status: "found", matchType, matches }  or
 *   { status: "unavailable" }  (exists but hidden / inactive) or
 *   { status: "not_found" }
 */
const lookupIdentifier = async (identifier, categories, categoryNameById) => {
  const id = cleanIdentifier(identifier);
  const exact = new RegExp(`^\\s*${escapeRegex(id)}\\s*$`, "i");
  const visible = visibleProductFilter(categories);
  const ctx = { categories, categoryNameById };

  const fromVariants = async (skuRegex, limit = 10) => {
    const variants = await Variant.find({ sku: skuRegex, isActive: true }).select("_id product").limit(limit).lean();
    return buildIdentifierMatches({
      ...ctx,
      productIds: [...new Set(variants.map((v) => String(v.product)))],
      matchedVariantIds: new Set(variants.map((v) => String(v._id))),
    });
  };

  const fromModel = async (valueRegex, limit = 10) =>
    buildIdentifierMatches({ ...ctx, productIds: await findProductIdsByModel(valueRegex, visible, limit) });

  // 1. Exact SKU (case-insensitive, trimmed)
  let matches = await fromVariants(exact);
  if (matches.length) return { status: "found", matchType: "exact_sku", matches };

  // 2. Exact model number
  matches = await fromModel(exact);
  if (matches.length) return { status: "found", matchType: "exact_model", matches };

  // The code exists but belongs to an inactive variant / unpublished product:
  // report it as unavailable and do NOT fall through to look-alike codes.
  const hiddenSku = await Variant.exists({ sku: exact });
  const hiddenModel = hiddenSku ? null : (await findProductIdsByModel(exact, {}, 1)).length > 0;
  if (hiddenSku || hiddenModel) return { status: "unavailable" };

  // 3. Same code ignoring spaces / hyphens / underscores ("OST 405" -> OST405)
  const loose = separatorInsensitive(id);
  if (loose) {
    const [bySku, byModel] = [await fromVariants(loose), await fromModel(loose)];
    matches = mergeMatches(bySku, byModel);
    if (matches.length) return { status: "found", matchType: "same_code_different_formatting", matches };
  }

  // 4. Partial code (stored SKU / model CONTAINS what the customer typed)
  if (id.replace(/[^a-z0-9]/gi, "").length >= 4) {
    const partial = new RegExp(escapeRegex(id), "i");
    const [bySku, byModel] = [await fromVariants(partial, 12), await fromModel(partial, 12)];
    matches = mergeMatches(bySku, byModel).slice(0, MAX_SEARCH_RESULTS);
    if (matches.length) return { status: "found", matchType: "partial_code", matches };
  }

  return { status: "not_found" };
};

const mergeMatches = (...lists) => {
  const byId = new Map();
  lists.flat().forEach((m) => {
    const key = String(m.product._id);
    if (!byId.has(key)) byId.set(key, m);
    else if (m.matched.length && !byId.get(key).matched.length) byId.set(key, m);
  });
  return [...byId.values()];
};

const MATCH_NOTES = {
  exact_sku: "Exact SKU match.",
  exact_model: "Exact model number match.",
  same_code_different_formatting:
    "Matched after ignoring spaces/hyphens. Tell the customer the exact SKU/model as stored.",
  partial_code:
    "No exact match. These products have a SKU or model number that CONTAINS the code typed. Say these are close matches.",
};

const searchByIdentifiers = async (identifiers, categories, categoryNameById) => {
  const results = [];
  const cards = new Map();

  for (const identifier of identifiers) {
    const r = await lookupIdentifier(identifier, categories, categoryNameById);

    if (r.status === "found") {
      r.matches.forEach((m) => cards.set(m.card._id, m.card));
      results.push({
        identifier,
        result: "FOUND",
        matchType: r.matchType,
        note: MATCH_NOTES[r.matchType],
        products: r.matches.map((m) => m.forModel),
      });
    } else {
      // "unavailable" and "not_found" look the same to the customer on purpose:
      // never reveal details of unpublished products or inactive variants.
      results.push({
        identifier,
        result: "NOT_FOUND",
        note: `No product currently available on Ostik has the SKU or model number "${identifier}". Checked exact SKU, exact model number, alternative formatting and partial matches.`,
      });
    }
  }

  return { results, cards: [...cards.values()].slice(0, MAX_SEARCH_RESULTS) };
};

/**
 * Product search tool used by Gemini.
 * 1. SKU / model number identifiers are looked up first (exact before fuzzy).
 * 2. Otherwise (or for the rest of the message) the normal text search runs.
 * Returns { forModel, cards }.
 */
const searchProducts = async (args = {}) => {
  const query = typeof args.query === "string" ? args.query.slice(0, 120) : "";
  const identifiers = collectIdentifiers(args.identifier, query);

  if (!identifiers.length) return searchProductsText(args);

  const categories = await getActiveCategories();
  const categoryNameById = new Map(categories.map((c) => [String(c._id), c.name]));
  const idSearch = await searchByIdentifiers(identifiers, categories, categoryNameById);

  if (idSearch.results.some((r) => r.result === "FOUND")) {
    return {
      forModel: { searchType: "sku_or_model_lookup", results: idSearch.results },
      cards: idSearch.cards,
    };
  }

  // Nothing matched the code(s). Only run a text search if the customer gave
  // other criteria too (e.g. "OST999 earphones"), never on the code itself,
  // so unrelated products are not returned just because a number is similar.
  let textQuery = query;
  identifiers.forEach((id) => {
    textQuery = textQuery.replace(new RegExp(escapeRegex(id), "gi"), " ");
  });

  const hasOtherCriteria =
    extractKeywords(textQuery).length > 0 ||
    (typeof args.category === "string" && args.category.trim()) ||
    args.maxPrice != null ||
    args.minPrice != null ||
    args.onlyDiscounted === true ||
    args.newArrivals === true ||
    args.featured === true;

  const lookup = { searchType: "sku_or_model_lookup", results: idSearch.results };

  if (!hasOtherCriteria) return { forModel: lookup, cards: [] };

  const text = await searchProductsText({ ...args, query: textQuery });
  return {
    forModel: { identifierLookup: idSearch.results, ...text.forModel },
    cards: text.cards,
  };
};

const searchProductsText = async (args = {}) => {
  const query = typeof args.query === "string" ? args.query.slice(0, 120) : "";
  const categoryText = typeof args.category === "string" ? args.category.slice(0, 60) : "";
  const minPrice = toNumberOrNull(args.minPrice);
  const maxPrice = toNumberOrNull(args.maxPrice);
  const onlyDiscounted = args.onlyDiscounted === true;
  const newArrivals = args.newArrivals === true;
  const featured = args.featured === true;
  const sort = ["relevance", "price_low_to_high", "price_high_to_low", "newest", "biggest_discount"].includes(args.sort)
    ? args.sort
    : "relevance";
  const limit = Math.min(Math.max(parseInt(args.limit, 10) || MAX_SEARCH_RESULTS, 1), MAX_SEARCH_RESULTS);

  const categories = await getActiveCategories();
  const activeCategoryIds = categories.map((c) => c._id);
  const categoryNameById = new Map(categories.map((c) => [String(c._id), c.name]));

  const filter = {
    status: { $in: VISIBLE_PRODUCT_STATUSES },
    category: { $in: activeCategoryIds },
  };

  if (categoryText) {
    const ids = resolveCategoryIds(categories, categoryText);
    if (ids && ids.length) {
      filter.category = { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) };
    }
    // If no category matched, fall back to keyword search with that text.
  }

  if (newArrivals) filter.isNewArrival = true;
  if (featured) filter.isFeatured = true;

  const keywords = extractKeywords(
    [query, categoryText && !(resolveCategoryIds(categories, categoryText) || []).length ? categoryText : ""].join(" ")
  );

  // Keyword pre-filter in MongoDB (name / description / slug / variant name)
  if (keywords.length) {
    const anyKeyword = new RegExp(keywords.map(keywordPattern).join("|"), "i");

    const variantProductIds = await Variant.distinct("product", {
      isActive: true,
      name: anyKeyword,
    });

    const matchingCategoryIds = categories
      .filter((c) => anyKeyword.test(c.name) || anyKeyword.test(c.slug))
      .map((c) => c._id);

    filter.$or = [
      { name: anyKeyword },
      { description: anyKeyword },
      { slug: anyKeyword },
      { _id: { $in: variantProductIds } },
      ...(matchingCategoryIds.length ? [{ category: { $in: matchingCategoryIds } }] : []),
    ];
  }

  const products = await ProductSchema.find(filter)
    .select("name slug description category images specs isNewArrival isFeatured ratingAverage ratingCount createdAt")
    .sort({ createdAt: -1 })
    .limit(MAX_CANDIDATES)
    .lean();

  if (!products.length) {
    return { forModel: { count: 0, products: [], note: "No matching products found in the Ostik catalogue. Use list_categories to tell the customer what Ostik sells." }, cards: [] };
  }

  const variants = await Variant.find({
    product: { $in: products.map((p) => p._id) },
    isActive: true,
  })
    .select("product name sku price discountPercent stock images isActive")
    .lean();

  const variantsByProduct = new Map();
  variants.forEach((v) => {
    const key = String(v.product);
    if (!variantsByProduct.has(key)) variantsByProduct.set(key, []);
    variantsByProduct.get(key).push(v);
  });

  const results = [];

  for (const product of products) {
    const all = variantsByProduct.get(String(product._id)) || [];

    // Never recommend products without a purchasable (active + in stock) variant
    let eligible = all.filter(isPurchasable);
    if (!eligible.length) continue;

    if (minPrice !== null) eligible = eligible.filter((v) => finalPriceOf(v) >= minPrice);
    if (maxPrice !== null) eligible = eligible.filter((v) => finalPriceOf(v) <= maxPrice);
    if (onlyDiscounted) eligible = eligible.filter((v) => Number(v.discountPercent) > 0);
    if (!eligible.length) continue;

    // Relevance score: keyword hits weighted by field
    let score = 0;
    let matchedKeywords = 0;
    let productLevelHit = false; // keyword found in product name or category
    const categoryName = categoryNameById.get(String(product.category)) || "";

    if (keywords.length) {
      const name = product.name.toLowerCase();
      const desc = (product.description || "").toLowerCase();
      const cat = categoryName.toLowerCase();
      const variantNames = all.map((v) => v.name.toLowerCase()).join(" ");
      const specsText = JSON.stringify(product.specs || {}).toLowerCase();

      keywords.forEach((k) => {
        const re = keywordRegex(k);
        let hit = 0;
        if (re.test(name)) hit += 5;
        if (re.test(cat)) hit += 3;
        if (re.test(name) || re.test(cat)) productLevelHit = true;
        if (re.test(variantNames)) hit += 3;
        if (re.test(desc)) hit += 1;
        if (re.test(specsText)) hit += 1;
        if (hit) matchedKeywords += 1;
        score += hit;
      });

      if (!matchedKeywords) continue;
    }

    // Prefer variants that match a keyword (e.g. colour) for the card
    const keywordVariant = keywords.length
      ? eligible.find((v) => keywords.some((k) => keywordRegex(k).test(v.name)))
      : null;
    const cheapest = [...eligible].sort((a, b) => finalPriceOf(a) - finalPriceOf(b))[0];
    const displayVariant = keywordVariant || cheapest;

    results.push({
      product,
      all,
      eligible,
      categoryName,
      displayVariant,
      score,
      matchedAll: matchedKeywords === keywords.length,
      productLevelHit,
      minFinal: finalPriceOf(cheapest),
      maxDiscount: Math.max(...eligible.map((v) => Number(v.discountPercent) || 0)),
    });
  }

  // Prefer products that match every keyword; fall back to partial matches
  // A partial match only counts when a keyword hits the product name/category.
  // Otherwise "black shirts" would return unrelated black cables.
  let ranked = results;
  const fullMatches = results.filter((r) => r.matchedAll);
  if (fullMatches.length) {
    ranked = fullMatches;
  } else if (keywords.length > 1) {
    ranked = results.filter((r) => r.productLevelHit);
  }
  const partialOnly = keywords.length > 1 && !fullMatches.length && ranked.length > 0;

  if (!ranked.length) {
    return {
      forModel: {
        count: 0,
        products: [],
        note: "No matching products found in the Ostik catalogue. Use list_categories to tell the customer what Ostik sells.",
      },
      cards: [],
    };
  }

  const sorters = {
    relevance: (a, b) => b.score - a.score || b.product.createdAt - a.product.createdAt,
    price_low_to_high: (a, b) => a.minFinal - b.minFinal,
    price_high_to_low: (a, b) => b.minFinal - a.minFinal,
    newest: (a, b) => new Date(b.product.createdAt) - new Date(a.product.createdAt),
    biggest_discount: (a, b) => b.maxDiscount - a.maxDiscount,
  };

  ranked = [...ranked].sort(sorters[sort]).slice(0, limit);

  const forModel = {
    count: ranked.length,
    note: partialOnly
      ? "No product matched all search words; these are the closest partial matches. Say so to the customer."
      : undefined,
    products: ranked.map((r) => ({
      productId: String(r.product._id),
      name: r.product.name,
      category: r.categoryName,
      url: `/product/${r.product._id}`,
      description: truncate(r.product.description, 220),
      isNewArrival: !!r.product.isNewArrival,
      rating: r.product.ratingCount ? `${Number(r.product.ratingAverage).toFixed(1)} (${r.product.ratingCount} reviews)` : "No reviews yet",
      matchingVariants: r.eligible.slice(0, 6).map(variantSummary),
      totalActiveVariants: r.all.length,
    })),
  };

  const cards = ranked.map((r) => toProductCard(r.product, r.all, r.categoryName, r.displayVariant));

  return { forModel, cards };
};

/**
 * Full details of one customer-visible product (by ID or by name).
 */
const getProductDetails = async (args = {}) => {
  const productId = typeof args.productId === "string" ? args.productId.trim() : "";
  const name = typeof args.productName === "string" ? args.productName.trim().slice(0, 120) : "";

  const categories = await getActiveCategories();
  const categoryNameById = new Map(categories.map((c) => [String(c._id), c.name]));

  const baseFilter = {
    status: { $in: VISIBLE_PRODUCT_STATUSES },
    category: { $in: categories.map((c) => c._id) },
  };

  let product = null;

  if (isValidId(productId)) {
    product = await ProductSchema.findOne({ ...baseFilter, _id: productId }).lean();
  } else if (name) {
    product = await ProductSchema.findOne({ ...baseFilter, name: new RegExp(escapeRegex(name), "i") })
      .sort({ createdAt: -1 })
      .lean();
  }

  if (!product) {
    // "productName" may actually be a SKU or model number such as OST405.
    const identifiers = collectIdentifiers(name, name);
    if (identifiers.length) return searchProducts({ identifier: identifiers.join(",") });

    return {
      forModel: { found: false, note: "This product was not found or is not currently available on Ostik." },
      cards: [],
    };
  }

  const variants = await Variant.find({ product: product._id, isActive: true })
    .select("name sku price discountPercent stock images isActive")
    .sort({ price: 1 })
    .lean();

  const categoryName = categoryNameById.get(String(product.category)) || "";
  const specs = flattenSpecs(product.specs);

  return {
    forModel: {
      found: true,
      productId: String(product._id),
      name: product.name,
      category: categoryName,
      url: `/product/${product._id}`,
      description: truncate(product.description, 1200),
      modelNumber: getModelNumber(product.specs) || "Not listed",
      specifications: specs.length ? specs : "No specifications listed for this product.",
      imageCount: (product.images || []).length,
      isNewArrival: !!product.isNewArrival,
      rating: product.ratingCount ? `${Number(product.ratingAverage).toFixed(1)} (${product.ratingCount} reviews)` : "No reviews yet",
      variants: variants.length ? variants.slice(0, 15).map(variantSummary) : "No active variants",
      purchasable: variants.some(isPurchasable),
    },
    cards: [toProductCard(product, variants, categoryName)],
  };
};

const listCategories = async () => {
  const categories = await getActiveCategories();
  const nameById = new Map(categories.map((c) => [String(c._id), c.name]));

  return {
    forModel: {
      categories: categories.slice(0, 60).map((c) => ({
        name: c.name,
        parent: c.parentCategory ? nameById.get(String(c.parentCategory)) || null : null,
        url: `/products?category=${encodeURIComponent(c.slug)}`,
      })),
    },
    cards: [],
  };
};

const getShippingInfo = async () => {
  // Read-only: unlike the settings controller we never create a document here.
  const settings = await ShippingSettings.findOne().lean();
  const defaults = new ShippingSettings().toObject();
  const s = settings || defaults;

  return {
    forModel: {
      liveSettings: {
        standardShippingFee: `₹${Number(s.standardShippingFee)}`,
        freeDelivery: s.freeDeliveryEnabled
          ? `Free shipping on orders with subtotal of ₹${Number(s.freeDeliveryThreshold)} or more`
          : "Free shipping is currently not enabled",
        carriers: s.availableCarriers || [],
        note: "These configured settings are authoritative for charges. The exact charge is always shown at checkout.",
      },
      policy: getPolicy("shipping"),
    },
    cards: [],
  };
};

const getStorePolicy = async (args = {}) => ({ forModel: getPolicy(args.topic), cards: [] });

// ---------------------------------------------------------------------------
// CUSTOMER-ONLY TOOLS  (userId comes from the verified JWT)
// ---------------------------------------------------------------------------

const AUTH_REQUIRED = {
  forModel: {
    error: "AUTH_REQUIRED",
    note: `The customer is not logged in. Ask them to log in at ${PAGES.login} to see their personal information.`,
  },
  cards: [],
  requiresLogin: true,
};

const windowInfo = (order) => {
  if (order.orderStatus !== "Delivered" || !order.deliveredAt) {
    return { eligible: false, reason: "Only delivered orders can be returned or exchanged." };
  }

  const until = new Date(new Date(order.deliveredAt).getTime() + RETURN_EXCHANGE_WINDOW_DAYS * 86400000);
  const open = Date.now() <= until.getTime();

  return {
    eligible: open,
    windowEnds: toDate(until),
    reason: open
      ? `Return/exchange can be requested until ${toDate(until)} from the order details page.`
      : "The 7-day return/exchange window after delivery has ended.",
  };
};

const matchesOrderRef = (order, ref) => {
  if (!ref) return true;
  const clean = String(ref).replace(/^#/, "").trim().toLowerCase();
  if (clean.length < 6) return false;
  return String(order._id).toLowerCase().endsWith(clean);
};

const getMyOrders = async (args = {}, { userId } = {}) => {
  if (!userId) return AUTH_REQUIRED;

  const orderRef = typeof args.orderRef === "string" ? args.orderRef.slice(0, 30) : "";
  const limit = Math.min(Math.max(parseInt(args.limit, 10) || 3, 1), MAX_ORDERS);

  // Scoped strictly to the authenticated customer.
  const orders = await OrderSchema.find({ user: userId })
    .select(
      "items.name items.variantName items.quantity items.finalPrice paymentMethod paymentStatus subtotal shippingFee discount total currency orderStatus deliveredAt cancellation.reason cancellation.cancelledAt shipping placedAt createdAt"
    )
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  if (!orders.length) {
    return { forModel: { count: 0, note: "This customer has not placed any orders yet." }, cards: [] };
  }

  const matched = orders.filter((o) => matchesOrderRef(o, orderRef));

  if (orderRef && !matched.length) {
    return {
      forModel: {
        count: 0,
        note: `No order with reference ${orderRef} was found in this customer's account.`,
        totalOrders: orders.length,
      },
      cards: [],
    };
  }

  return {
    forModel: {
      totalOrders: orders.length,
      orders: matched.slice(0, limit).map((o) => ({
        orderRef: `#${shortOrderId(o._id)}`,
        url: `/orders/${o._id}`,
        orderedOn: toDate(o.placedAt || o.createdAt),
        orderStatus: o.orderStatus,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod === "cod" ? "Cash on Delivery" : "Online (Razorpay)",
        total: `₹${Number(o.total).toLocaleString("en-IN")}`,
        shippingFee: `₹${Number(o.shippingFee || 0)}`,
        items: (o.items || []).slice(0, 10).map((i) => ({
          name: i.name,
          variant: i.variantName || undefined,
          quantity: i.quantity,
          finalPrice: i.finalPrice,
        })),
        shipping: {
          carrier: o.shipping?.carrier || null,
          trackingNumber: o.shipping?.trackingNumber || "Not available yet",
          shippedOn: toDate(o.shipping?.shippedAt),
          estimatedDelivery:
            o.shipping?.estimatedDeliveryFrom || o.shipping?.estimatedDeliveryTo
              ? `${toDate(o.shipping.estimatedDeliveryFrom) || "?"} to ${toDate(o.shipping.estimatedDeliveryTo) || "?"}`
              : "Not available yet",
          // Only status + date; `updatedBy` and any other internal fields are dropped
          history: (o.shipping?.trackingHistory || [])
            .slice(-6)
            .map((h) => ({ status: truncate(h?.status, 40), date: toDate(h?.updatedAt || h?.date) })),
        },
        deliveredOn: toDate(o.deliveredAt),
        cancelled: o.orderStatus === "Cancelled" ? { on: toDate(o.cancellation?.cancelledAt), reason: truncate(o.cancellation?.reason, 120) } : undefined,
        canCancel: !["Shipped", "Delivered", "Cancelled", "Returned"].includes(o.orderStatus),
        returnExchange: windowInfo(o),
      })),
    },
    cards: [],
  };
};

const requestSummary = (r, kind) => ({
  requestRef: `#${shortOrderId(r._id)}`,
  url: kind === "return" ? `/returns/${r._id}` : `/exchanges/${r._id}`,
  orderRef: `#${shortOrderId(r.order)}`,
  orderUrl: `/orders/${r.order}`,
  item: `${r.item?.name || ""}${r.item?.variantName ? ` (${r.item.variantName})` : ""}`,
  quantity: r.item?.quantity,
  exchangeFor:
    kind === "exchange" && r.exchangeItem
      ? `${r.exchangeItem.name}${r.exchangeItem.variantName ? ` (${r.exchangeItem.variantName})` : ""}`
      : undefined,
  reason: truncate(r.reason, 120),
  status: r.status,
  requestedOn: toDate(r.requestedAt || r.createdAt),
  approvedOn: toDate(r.approvedAt),
  completedOn: toDate(r.completedAt),
  messageFromOstik: r.adminComment ? truncate(r.adminComment, 300) : undefined,
  canCancel: r.status === "Pending",
});

const getMyRequests = (Model, kind) => async (args = {}, { userId } = {}) => {
  if (!userId) return AUTH_REQUIRED;

  const ref = typeof args.ref === "string" ? args.ref.replace(/^#/, "").trim().toLowerCase().slice(0, 30) : "";

  const requests = await Model.find({ user: userId })
    .select("order item exchangeItem reason status requestedAt approvedAt completedAt adminComment createdAt")
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  const matched = ref.length >= 6
    ? requests.filter((r) => String(r._id).toLowerCase().endsWith(ref) || String(r.order).toLowerCase().endsWith(ref))
    : requests;

  return {
    forModel: {
      count: matched.length,
      listPage: kind === "return" ? PAGES.returns : PAGES.exchanges,
      note: matched.length ? undefined : `No ${kind} requests found${ref ? ` for ${args.ref}` : ""} in this customer's account.`,
      requests: matched.slice(0, 5).map((r) => requestSummary(r, kind)),
    },
    cards: [],
  };
};

const getMyReturns = getMyRequests(ReturnSchema, "return");
const getMyExchanges = getMyRequests(ExchangeSchema, "exchange");

module.exports = {
  VISIBLE_PRODUCT_STATUSES,
  searchProducts,
  getProductDetails,
  listCategories,
  getShippingInfo,
  getStorePolicy,
  getMyOrders,
  getMyReturns,
  getMyExchanges,
  // shared with the storefront product search (ProductController.GetProducts)
  findProductIdsByModel,
  // exported for tests
  _internal: { extractKeywords, finalPriceOf, matchesOrderRef, flattenSpecs, collectIdentifiers, getModelNumber, lookupIdentifier },
};
