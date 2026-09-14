const ContactSchema = require("../models/ContactSchema");


const CreateContactMessage = async (req, res) => {
  try {

    const {
      name,
      email,
      phone,
      subject,
      message,
    } = req.body;


    // Required fields check
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

        email: email.trim().toLowerCase(),

        phone: phone
          ? phone.trim()
          : "",

        subject: subject.trim(),

        message: message.trim(),

        status: "unread",

      });


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

//ADMIN
const GetContactMessages = async (req, res) => {
  try {

    const messages =
      await ContactSchema.find()
        .sort({ createdAt: -1 });


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



const GetSingleContactMessage = async (req, res) => {
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



const UpdateContactStatus = async (req, res) => {
  try {

    const { id } = req.params;

    const { status } = req.body;


    if (
      !status ||
      !["unread", "read", "replied"].includes(status)
    ) {
      return res.status(400).json({

        message:
          "Valid status is required",

      });
    }


    const contactMessage =
      await ContactSchema.findByIdAndUpdate(
        id,
        { status },
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



const DeleteContactMessage = async (req, res) => {
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


module.exports = {CreateContactMessage,GetContactMessages,GetSingleContactMessage,UpdateContactStatus,DeleteContactMessage,};