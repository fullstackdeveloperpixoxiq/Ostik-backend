const NewsletterSubscriber = require("../models/NewsletterSchema");

// Subscribe to newsletter
const subscribeNewsletter = async (req, res) => {
  try {
    const { email } = req.body;

    // Check email
    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    // Check if already subscribed
    const existingSubscriber = await NewsletterSubscriber.findOne({ email });

    if (existingSubscriber) {
      // If previously unsubscribed, activate again
      if (!existingSubscriber.isActive) {
        existingSubscriber.isActive = true;
        existingSubscriber.subscribedAt = new Date();

        await existingSubscriber.save();

        return res.status(200).json({
          message: "You have successfully subscribed to our newsletter",
        });
      }

      return res.status(409).json({
        message: "This email is already subscribed",
      });
    }

    // Create new subscriber
    const subscriber = await NewsletterSubscriber.create({
      email,
    });

    return res.status(201).json({
      message: "You have successfully subscribed to our newsletter",
      subscriber: {
        id: subscriber._id,
        email: subscriber.email,
      },
    });
  } catch (error) {
    console.error("Newsletter subscription error:", error);

    return res.status(500).json({
      message: "Something went wrong. Please try again",
    });
  }
};

module.exports = {
  subscribeNewsletter,
};