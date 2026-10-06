const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

function getTransporter() {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (!user || !pass) {
        throw new Error("GMAIL_USER or GMAIL_APP_PASSWORD is not configured.");
    }

    return nodemailer.createTransport({
        service: "gmail",
        auth: {
            user,
            pass
        }
    });
}

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        service: "TNSBTC Mail Server",
        emailConfigured: Boolean(
            process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
        )
    });
});

/*
 * Endpoint used by the current index.html:
 * POST /api/notifications/donor-email
 */
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

        const transporter = getTransporter();

        const info = await transporter.sendMail({
            from: `"TN Rare Blood Club – TNSBTC" <${process.env.GMAIL_USER}>`,
            to: String(to).trim(),
            subject: String(subject),
            text: String(body)
        });

        console.log(
            `Email sent | request=${requestId || ""} | donor=${donorId || ""} | to=${to} | messageId=${info.messageId}`
        );

        return res.json({
            success: true,
            status: "Sent",
            message: "Email accepted by Gmail.",
            requestId: requestId || "",
            donorId: donorId || "",
            donorName: donorName || "",
            messageId: info.messageId || ""
        });
    } catch (error) {
        console.error("Email sending error:", error);

        return res.status(500).json({
            success: false,
            status: "Failed",
            message: error.message || "Unable to send email."
        });
    }
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`TNSBTC Mail Server running on port ${PORT}`);
});
