const ContactSchema = require("../models/ContactSchema");
const transporter = require("../Config/Mailer");


// =========================================================
// CREATE CONTACT MESSAGE - USER
// =========================================================

const CreateContactMessage = async (req, res) => {
  try {

    const {
      name,
      email,
      phone,
      subject,
      message,
    } = req.body;

    // Required fields
    if (
      !name ||
      !email ||
      !subject ||
      !message
    ) {
      return res.status(400).json({
        message:
          "Name, email, subject and message are required",
      });
    }


    // Create contact message
    const contactMessage =
      await ContactSchema.create({

        name: name.trim(),

        email: email
          .trim()
          .toLowerCase(),

        phone: phone
          ? phone.trim()
          : "",

        subject: subject.trim(),

        message: message.trim(),

        status: "unread",

      });


    // =====================================================
    // SEND NEW MESSAGE NOTIFICATION TO ADMIN
    // =====================================================

    try {

      await transporter.sendMail({

        from: process.env.Email_User,

        to: process.env.Email_User,

        subject: `New Contact Message - ${contactMessage.subject}`,

        text: `
New contact message received on Ostik.

Name:
${contactMessage.name}

Email:
${contactMessage.email}

Phone:
${contactMessage.phone || "-"}

Subject:
${contactMessage.subject}

Message:
${contactMessage.message}
        `,

      });

    } catch (emailError) {

      console.log(
        "Admin notification email error:",
        emailError
      );

      // Contact message is already saved.
      // Email failure should not remove it.
    }


    return res.status(201).json({

      message:
        "Your message has been sent successfully",

      contact: contactMessage,

    });

  } catch (err) {

    console.log(
      "Create contact message error:",
      err
    );

    return res.status(500).json({

      message: "Server error",

      error: err.message,

    });

  }
};


// =========================================================
// GET CONTACT MESSAGES - ADMIN
// =========================================================

const GetContactMessages = async (
  req,
  res
) => {
  try {

    const messages =
      await ContactSchema.find({})
        .sort({
          createdAt: -1,
        });

    return res.status(200).json({

      message:
        "Contact messages fetched successfully",

      count: messages.length,

      messages,

    });

  } catch (err) {

    console.log(
      "Get contact messages error:",
      err
    );

    return res.status(500).json({

      message: "Server error",

      error: err.message,

    });

  }
};


// =========================================================
// GET SINGLE CONTACT MESSAGE - ADMIN
// =========================================================

const GetSingleContactMessage = async (
  req,
  res
) => {
  try {

    const { id } = req.params;

    const contactMessage =
      await ContactSchema.findById(id)
        .populate(
          "replies.repliedBy",
          "name email"
        );

    if (!contactMessage) {

      return res.status(404).json({

        message:
          "Contact message not found",

      });

    }


    // Automatically mark unread as read
    if (
      contactMessage.status ===
      "unread"
    ) {

      contactMessage.status =
        "read";

      await contactMessage.save();
    }


    return res.status(200).json({

      message:
        "Contact message fetched successfully",

      contact: contactMessage,

    });

  } catch (err) {

    console.log(
      "Get single contact message error:",
      err
    );

    return res.status(500).json({

      message: "Server error",

      error: err.message,

    });

  }
};


// =========================================================
// UPDATE CONTACT STATUS - ADMIN
// =========================================================

const UpdateContactStatus = async (
  req,
  res
) => {
  try {

    const { id } = req.params;

    const { status } = req.body;

    if (
      !status ||
      ![
        "unread",
        "read",
        "replied",
      ].includes(status)
    ) {

      return res.status(400).json({

        message:
          "Valid status is required",

      });

    }


    const contactMessage =
      await ContactSchema.findByIdAndUpdate(
        id,
        {
          status,
        },
        {
          new: true,
          runValidators: true,
        }
      );

    if (!contactMessage) {

      return res.status(404).json({

        message:
          "Contact message not found",

      });

    }


    return res.status(200).json({

      message:
        "Contact status updated successfully",

      contact: contactMessage,

    });

  } catch (err) {

    console.log(
      "Update contact status error:",
      err
    );

    return res.status(500).json({

      message: "Server error",

      error: err.message,

    });

  }
};


// =========================================================
// REPLY TO CONTACT MESSAGE - ADMIN
// =========================================================

const ReplyToContactMessage = async (
  req,
  res
) => {
  try {

    const { id } = req.params;

    const { message } = req.body;


    // Validate reply
    if (
      !message ||
      !message.trim()
    ) {

      return res.status(400).json({

        message:
          "Reply message is required",

      });

    }


    // Find contact
    const contactMessage =
      await ContactSchema.findById(id);

    if (!contactMessage) {

      return res.status(404).json({

        message:
          "Contact message not found",

      });

    }


    // =====================================================
    // SEND EMAIL TO CUSTOMER
    // =====================================================

    await transporter.sendMail({
  from: `"Ostik Support" <${process.env.Email_User}>`,
  to: contactMessage.email,
  replyTo: process.env.Email_User,
  subject: `Re: ${contactMessage.subject}`,

  text: `Hello ${contactMessage.name},

Thank you for contacting Ostik.

We have received your message and here is our response:

${message.trim()}

Regards,
Ostik Support Team
Ostik`,
  
  html: `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <p>Hello ${contactMessage.name},</p>

      <p>Thank you for contacting Ostik.</p>

      <p>We have received your message and here is our response:</p>

      <div style="
        background:#f7f7f7;
        padding:16px;
        border-radius:8px;
        margin:15px 0;
      ">
        ${message.trim().replace(/\n/g, "<br />")}
      </div>

      <p>Regards,<br />
      <strong>Ostik Support Team</strong><br />
      Ostik</p>
    </div>
  `,
});

    // =====================================================
    // SAVE REPLY
    // =====================================================

    contactMessage.replies.push({

      message: message.trim(),

      repliedAt: new Date(),

      repliedBy:
        req.user?.userId || null,

    });


    contactMessage.status =
      "replied";


    await contactMessage.save();


    return res.status(200).json({

      message:
        "Reply sent successfully",

      contact: contactMessage,

    });

  } catch (err) {

    console.log(
      "Reply contact message error:",
      err
    );

    return res.status(500).json({

      message:
        "Failed to send reply",

      error: err.message,

    });

  }
};


// =========================================================
// DELETE CONTACT MESSAGE - ADMIN
// =========================================================

const DeleteContactMessage = async (
  req,
  res
) => {
  try {

    const { id } = req.params;

    const contactMessage =
      await ContactSchema.findById(id);

    if (!contactMessage) {

      return res.status(404).json({

        message:
          "Contact message not found",

      });

    }


    await contactMessage.deleteOne();


    return res.status(200).json({

      message:
        "Contact message deleted successfully",

    });

  } catch (err) {

    console.log(
      "Delete contact message error:",
      err
    );

    return res.status(500).json({

      message: "Server error",

      error: err.message,

    });

  }
};


module.exports = {CreateContactMessage,GetContactMessages,GetSingleContactMessage,UpdateContactStatus,
  ReplyToContactMessage,DeleteContactMessage,};