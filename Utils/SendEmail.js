const Brevo= require("@getbrevo/brevo");

const sendEmail= async({ to, subject, text}) => {
    try{
        const brevo= new Brevo.BrevoClient({
            apiKey:process.env.BREVO_API_KEY,
        })


        const response= await brevo.transactionalEmails.sendTransacEmail({
            sender: {
                name: process.env.BREVO_SENDER_NAME,
                email: process.env.BREVO_SENDER_EMAIL,
            },
            to:[
                {
                    email: to,
                }
            ],
            subject: subject,
            textContent: text,
        })
        console.log("BREVO EMAIL SEND:", response);

        return response
        
    }
    catch(error){
        console.error(
            "BREVO EMAIL ERROR:",
            error?.response?.body ||  error?.message || error
        );
        throw error
    }
}

module.exports= sendEmail;