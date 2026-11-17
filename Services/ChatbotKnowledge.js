/*
  Static store policy knowledge for the customer chatbot.

  Source of truth:
  - Text summarised from the existing customer pages in Ostik-frontend:
      src/Pages/ShippingPolicy/ShippingPolicy.jsx
      src/Pages/ReturnAndRefund/ReturnAndRefund.jsx
      src/Pages/Contact/Contact.jsx
  - Eligibility rules taken from the backend controllers:
      Controller/ReturnController.js, Controller/ExchangeController.js,
      Controller/OrderController.js, models/OrderSchema.js

  Shipping CHARGES are deliberately NOT listed here: they are read live from
  the ShippingSettings collection (the policy page hardcodes example numbers
  that can differ from the configured settings).

  If any of those pages or rules change, update this file too.
*/

const PAGES = {
  home: "/",
  products: "/products",
  offers: "/offers",
  bundles: "/bundles",
  cart: "/cart",
  wishlist: "/wishlist",
  orders: "/orders",
  returns: "/returns",
  exchanges: "/exchanges",
  shippingPolicy: "/shippingPolicy",
  returnPolicy: "/return&refund",
  contact: "/contact",
  login: "/login",
  register: "/register",
  profile: "/profile",
};

const POLICIES = {
  shipping: {
    page: PAGES.shippingPolicy,
    points: [
      "Shipping charge is calculated on the order subtotal and is shown at checkout before the order is placed.",
      "Orders are checked and packed before being handed to the shipping carrier; processing can take longer during high order volume, promotions or holidays.",
      "Orders are generally expected to arrive within approximately 4 to 8 days after processing, depending on destination and courier service.",
      "Delivery estimates are NOT guaranteed. Delays can happen due to weather, transport/logistics disruptions, public or regional holidays, incorrect address details or courier disruptions.",
      "Once tracking information is available, customers can view shipment status in their order details (My Orders) after logging in.",
      "Delivery is only possible to serviceable locations supported by the shipping network.",
      "Customers should check their address carefully; Ostik may not be responsible for delays caused by incorrect or incomplete addresses.",
      "If the package looks damaged, opened or tampered with, take photos/videos and contact Ostik support with order details as soon as possible.",
      "For missing or incorrect items, contact support with the order number; keep the original packaging.",
      "If an order is delayed beyond the estimated period, contact support with the order number.",
    ],
  },

  returns: {
    page: PAGES.returnPolicy,
    points: [
      "Returns can be requested only for orders with status Delivered, and only within 7 days of the delivery date.",
      "A return is requested per item from the order details page (My Orders -> select order -> Return on the item). Only one active return per item is allowed.",
      "Situations that may qualify: product received damaged, manufacturing/functional defect, different product received, missing item, or another issue covered by the applicable policy.",
      "Not accepted: misuse/accidental damage after delivery, unauthorised modification or repair, missing essential accessories or required original packaging, items that cannot be verified as part of the order.",
      "Products should be returned in the condition received, with accessories and packaging. Do not send a product back before receiving return instructions.",
      "Returned products may be inspected; eligibility is decided after review.",
      "Return statuses: Pending, Approved, Rejected, Picked Up, Received, Refunded, Cancelled.",
      "A customer can cancel their own return request only while it is Pending (from the return details page).",
    ],
  },

  exchanges: {
    page: PAGES.exchanges,
    points: [
      "Exchanges can be requested only for orders with status Delivered, and only within 7 days of the delivery date.",
      "An exchange is requested per item from the order details page (My Orders -> select order -> Exchange on the item). Only one active exchange per item is allowed.",
      "Exchange statuses: Pending, Approved, Rejected, Pickup Scheduled, Received, Replacement Shipped, Completed, Cancelled.",
      "A customer can cancel their own exchange request only while it is Pending (from the exchange details page).",
    ],
  },

  refunds: {
    page: PAGES.returnPolicy,
    points: [
      "Approved refunds for online payments are generally processed back to the original payment method.",
      "For eligible Cash on Delivery refunds, support may request bank or payment details.",
      "Refund processing starts after the return is received and reviewed (where a return is required). The time for money to appear depends on the bank/payment provider.",
      "The final refund amount may depend on the nature of the return, the order and the resolution approved by Ostik.",
    ],
  },

  cancellation: {
    page: PAGES.orders,
    points: [
      "Customers can cancel their own order from the order details page while it is not yet Shipped, Delivered or Cancelled. A cancellation reason is required.",
      "If an order has already shipped, the return or delivery resolution process applies instead of cancellation.",
      "If an eligible prepaid order is cancelled, the refund follows the payment method's refund process.",
    ],
  },

  payments: {
    page: PAGES.cart,
    points: [
      "Supported payment methods at checkout: Cash on Delivery (COD) and online payment via Razorpay.",
      "Prices are in Indian Rupees (INR).",
    ],
  },

  contact: {
    page: PAGES.contact,
    points: [
      "Customer support email: support@ostik.in",
      "Customer support phone: +91 85904 973558",
      "Customers can also use the Contact page form.",
    ],
  },
};

const getPolicy = (topic) => {
  if (topic && POLICIES[topic]) {
    return { topic, ...POLICIES[topic] };
  }

  return { topics: Object.keys(POLICIES), pages: PAGES };
};

module.exports = { PAGES, POLICIES, getPolicy };
