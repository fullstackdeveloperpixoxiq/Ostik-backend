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
  price: Number(v.price),
  discountPercent: Number(v.discountPercent) || 0,
  finalPrice: finalPriceOf(v),
  stock: Number(v.stock) > 0 ? (Number(v.stock) <= 15 ? `Only ${v.stock} left` : "In stock") : "Out of stock",
});

// ---------------------------------------------------------------------------
// PUBLIC TOOLS
// ---------------------------------------------------------------------------

/**
 * Search customer-visible, purchasable products.
 * Returns { forModel, cards }.
 */
const searchProducts = async (args = {}) => {
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
    .select("product name price discountPercent stock images isActive")
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
    return {
      forModel: { found: false, note: "This product was not found or is not currently available on Ostik." },
      cards: [],
    };
  }

  const variants = await Variant.find({ product: product._id, isActive: true })
    .select("name price discountPercent stock images isActive")
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
  // exported for tests
  _internal: { extractKeywords, finalPriceOf, matchesOrderRef, flattenSpecs },
};
