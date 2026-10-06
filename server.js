const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        service: "TNSBTC Mail Server",
        emailConfigured: Boolean(process.env.RESEND_API_KEY)
    });
});

/*
 * Endpoint used by index.html:
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

        const apiKey = process.env.RESEND_API_KEY;

        if (!apiKey) {
            throw new Error("RESEND_API_KEY is not configured.");
        }

        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "TN Rare Blood Club <onboarding@resend.dev>",
                to: [String(to).trim()],
                subject: String(subject),
                text: String(body)
            })
        });

        const result = await response.json();

        if (!response.ok) {
            console.error("Resend API error:", result);

            return res.status(500).json({
                success: false,
                status: "Failed",
                message: result.message || "Resend email failed."
            });
        }

        console.log(
            `Email sent | request=${requestId || ""} | donor=${donorId || ""} | to=${to} | id=${result.id || ""}`
        );

        return res.json({
            success: true,
            status: "Sent",
            message: "Email accepted by Resend.",
            requestId: requestId || "",
            donorId: donorId || "",
            donorName: donorName || "",
            messageId: result.id || ""
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
