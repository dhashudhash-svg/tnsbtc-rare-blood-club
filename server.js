const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

// Store donor responses for the current server session
const donorResponses = new Map();

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        service: "TNSBTC Brevo Mail Server",
        emailConfigured: Boolean(process.env.BREVO_API_KEY),
        senderConfigured: Boolean(process.env.BREVO_SENDER_EMAIL)
    });
});

// Send donor email through Brevo
app.post("/api/notifications/donor-email", async (req, res) => {
    try {
        const {
            requestId,
            donorId,
            to,
            donorName,
            subject,
            body
        } = req.body || {};

        // Validate recipient
        if (!to || !String(to).trim()) {
            return res.status(400).json({
                success: false,
                status: "Failed",
                message: "Recipient email is required."
            });
        }

        if (!String(to).includes("@")) {
            return res.status(400).json({
                success: false,
                status: "Failed",
                message: "Invalid recipient email address."
            });
        }

        if (!subject || !body) {
            return res.status(400).json({
                success: false,
                status: "Failed",
                message: "Email subject and body are required."
            });
        }

        const apiKey = process.env.BREVO_API_KEY;
        const senderEmail = process.env.BREVO_SENDER_EMAIL;
        const senderName =
            process.env.BREVO_SENDER_NAME || "TN Rare Blood Club";
        const replyTo =
            process.env.BREVO_REPLY_TO || senderEmail;

        if (!apiKey) {
            throw new Error("BREVO_API_KEY is not configured.");
        }

        if (!senderEmail) {
            throw new Error("BREVO_SENDER_EMAIL is not configured.");
        }

        // Send through Brevo
        const response = await fetch(
            "https://api.brevo.com/v3/smtp/email",
            {
                method: "POST",
                headers: {
                    "accept": "application/json",
                    "api-key": apiKey,
                    "content-type": "application/json"
                },
                body: JSON.stringify({
                    sender: {
                        name: senderName,
                        email: senderEmail
                    },
                    to: [
                        {
                            email: String(to).trim(),
                            name: donorName || "Donor"
                        }
                    ],
                    replyTo: {
                        email: replyTo
                    },
                    subject: String(subject),
                    htmlContent: `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222;">
        <div style="white-space:pre-line;">
            ${String(body)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;")}
        </div>

        <div style="margin-top:25px;">
            <a href="${process.env.PUBLIC_BASE_URL}/api/donor-response?requestId=${encodeURIComponent(requestId)}&donorId=${encodeURIComponent(donorId)}&response=available"
               style="display:inline-block;padding:12px 22px;background:#16803c;color:white;text-decoration:none;border-radius:6px;font-weight:bold;margin-right:10px;">
               I AM AVAILABLE
            </a>

            <a href="${process.env.PUBLIC_BASE_URL}/api/donor-response?requestId=${encodeURIComponent(requestId)}&donorId=${encodeURIComponent(donorId)}&response=not_available"
               style="display:inline-block;padding:12px 22px;background:#c62828;color:white;text-decoration:none;border-radius:6px;font-weight:bold;">
               I AM NOT AVAILABLE
            </a>
        </div>

        <p style="margin-top:25px;color:#666;font-size:13px;">
            TN Rare Blood Club<br>
            Tamil Nadu State Blood Transfusion Council
        </p>
    </div>
`
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            console.error("Brevo API error:", result);

            return res.status(500).json({
                success: false,
                status: "Failed",
                message:
                    result.message ||
                    "Brevo email sending failed."
            });
        }

        const messageId = result.messageId || "";

        console.log(
            `BREVO EMAIL SENT | request=${requestId || ""} | donor=${donorId || ""} | to=${to} | messageId=${messageId}`
        );

        // Create initial response record
        if (requestId && donorId) {
            donorResponses.set(
                `${requestId}_${donorId}`,
                {
                    requestId,
                    donorId,
                    donorName: donorName || "",
                    email: String(to).trim(),
                    status: "No Response",
                    response: "",
                    messageId,
                    sentAt: new Date().toISOString(),
                    respondedAt: ""
                }
            );
        }

        return res.json({
            success: true,
            status: "Sent",
            message: "Email accepted by Brevo.",
            requestId: requestId || "",
            donorId: donorId || "",
            donorName: donorName || "",
            messageId
        });

    } catch (error) {
        console.error("Email sending error:", error);

        return res.status(500).json({
            success: false,
            status: "Failed",
            message:
                error.message ||
                "Unable to send email."
        });
    }
});

// Donor response endpoint
app.get("/api/donor-response", (req, res) => {
    const {
        requestId,
        donorId,
        response
    } = req.query;

    if (!requestId || !donorId || !response) {
        return res.status(400).send(`
            <html>
            <head>
                <title>TNSBTC - Invalid Response</title>
            </head>
            <body style="font-family:Arial;text-align:center;padding:60px;">
                <h2>Invalid response link</h2>
                <p>The donor response information is incomplete.</p>
            </body>
            </html>
        `);
    }

    const key = `${requestId}_${donorId}`;

    const record = donorResponses.get(key) || {
        requestId,
        donorId,
        donorName: "",
        email: "",
        status: "No Response",
        response: "",
        sentAt: "",
        respondedAt: ""
    };

    let status = "No Response";
    let displayMessage = "";

    if (
        String(response).toLowerCase() === "available"
    ) {
        status = "Available";
        displayMessage =
            "Thank you. Your availability has been recorded. The blood centre will contact you if further coordination is required.";
    } else if (
        String(response).toLowerCase() === "not_available" ||
        String(response).toLowerCase() === "not-available"
    ) {
        status = "Not Available";
        displayMessage =
            "Thank you for responding. Your response has been recorded.";
    } else {
        return res.status(400).send(`
            <html>
            <head>
                <title>TNSBTC - Invalid Response</title>
            </head>
            <body style="font-family:Arial;text-align:center;padding:60px;">
                <h2>Invalid response</h2>
                <p>Please use the response buttons from the email.</p>
            </body>
            </html>
        `);
    }

    record.status = status;
    record.response = response;
    record.respondedAt = new Date().toISOString();

    donorResponses.set(key, record);

    console.log(
        `DONOR RESPONSE | request=${requestId} | donor=${donorId} | status=${status}`
    );

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>TN Rare Blood Club</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>

        <body style="
            margin:0;
            font-family:Arial,sans-serif;
            background:#f5f7fb;
            display:flex;
            align-items:center;
            justify-content:center;
            min-height:100vh;
        ">

            <div style="
                background:white;
                width:90%;
                max-width:520px;
                padding:40px;
                border-radius:16px;
                box-shadow:0 8px 30px rgba(0,0,0,0.10);
                text-align:center;
            ">

                <h1 style="margin-bottom:10px;">
                    TN Rare Blood Club
                </h1>

                <h2 style="color:#16803c;">
                    Response Recorded
                </h2>

                <p style="font-size:18px;line-height:1.6;">
                    ${displayMessage}
                </p>

                <p style="
                    margin-top:30px;
                    color:#666;
                    font-size:14px;
                ">
                    You may close this page now.
                </p>

            </div>

        </body>
        </html>
    `);
});

// Get donor response
app.get("/api/notification-response", (req, res) => {
    const {
        requestId,
        donorId
    } = req.query;

    if (!requestId || !donorId) {
        return res.status(400).json({
            success: false,
            message: "requestId and donorId are required."
        });
    }

    const key = `${requestId}_${donorId}`;
    const record = donorResponses.get(key);

    if (!record) {
        return res.json({
            success: true,
            status: "No Response"
        });
    }

    res.json({
        success: true,
        ...record
    });
});

// Get all notification responses
app.get("/api/notification-responses", (req, res) => {
    res.json({
        success: true,
        count: donorResponses.size,
        records: Array.from(donorResponses.values())
    });
});

// Main application
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `TNSBTC Brevo Mail Server running on port ${PORT}`
    );
});
