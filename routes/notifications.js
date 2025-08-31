const express = require("express")
const router = express.Router()
const Match = require("../models/Match")
const Member = require("../models/Member")
const twilio = require("twilio")
const brevo = require("@getbrevo/brevo")

// Initialize Twilio (if credentials provided)
let twilioClient = null
if (process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN)
}

// Initialize Brevo (if API key provided)
let brevoApiInstance = null
if (process.env.BREVO_API_KEY) {
  const defaultClient = brevo.ApiClient.instance
  const apiKey = defaultClient.authentications["api-key"]
  apiKey.apiKey = process.env.BREVO_API_KEY
  brevoApiInstance = new brevo.TransactionalEmailsApi()
}

// POST /api/notifications/send - Send notifications to all matched members
router.post("/send", async (req, res) => {
  try {
    const { groupId, method = "email" } = req.body

    // Get all matches (optionally filter by group)
    const filter = {}
    if (groupId) filter.groupId = groupId

    const matches = await Match.find(filter)
      .populate("groupId", "name budget")
      .populate("giverId", "name email phone")
      .populate("receiverId", "name email phone")

    if (matches.length === 0) {
      return res.status(404).json({ error: "No matches found to notify" })
    }

    const results = []
    let successCount = 0
    let errorCount = 0

    for (const match of matches) {
      try {
        if (method === "sms" && twilioClient) {
          await sendSMS(match)
        } else if (method === "email" && brevoApiInstance) {
          await sendEmail(match)
        } else {
          // Default to console log if no service configured
          console.log(`Notification for ${match.giverId.name}: You are giving a gift to ${match.receiverId.name}`)
        }

        // Mark notification as sent
        await Match.findByIdAndUpdate(match._id, {
          notificationSent: true,
          notificationSentAt: new Date(),
        })

        results.push({
          matchId: match._id,
          giver: match.giverId.name,
          receiver: match.receiverId.name,
          status: "sent",
        })
        successCount++
      } catch (error) {
        console.error(`Failed to send notification for match ${match._id}:`, error)
        results.push({
          matchId: match._id,
          giver: match.giverId.name,
          receiver: match.receiverId.name,
          status: "failed",
          error: error.message,
        })
        errorCount++
      }
    }

    res.json({
      message: `Notifications processed: ${successCount} sent, ${errorCount} failed`,
      results,
      summary: {
        total: matches.length,
        sent: successCount,
        failed: errorCount,
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Helper function to send SMS
async function sendSMS(match) {
  if (!twilioClient) {
    throw new Error("Twilio not configured")
  }

  if (!match.giverId.phone) {
    throw new Error("Giver phone number not available")
  }

  const message = `🎅 Secret Santa Alert! You are giving a gift to: ${match.receiverId.name}. ${match.groupId.budget ? `Budget: $${match.groupId.budget}` : "No budget specified"}. Happy gifting!`

  await twilioClient.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: match.giverId.phone,
  })
}

// Helper function to send email
async function sendEmail(match) {
  if (!brevoApiInstance) {
    throw new Error("Brevo not configured")
  }

  const emailData = {
    sender: {
      name: process.env.EMAIL_FROM_NAME || "Secret Santa",
      email: process.env.EMAIL_FROM_ADDRESS || "noreply@secretsanta.com",
    },
    to: [
      {
        email: match.giverId.email,
        name: match.giverId.name,
      },
    ],
    subject: `🎅 Your Secret Santa Assignment - ${match.groupId.name}`,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d32f2f;">🎅 Secret Santa Assignment</h2>
        <p>Hi ${match.giverId.name},</p>
        <p>You have been assigned to give a gift to:</p>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0; color: #2e7d32;">${match.receiverId.name}</h3>
        </div>
        <p><strong>Group:</strong> ${match.groupId.name}</p>
        ${match.groupId.budget ? `<p><strong>Budget:</strong> $${match.groupId.budget}</p>` : ""}
        <p>Remember to keep it a secret! 🤫</p>
        <p>Happy gifting!</p>
        <hr style="margin: 30px 0;">
        <p style="font-size: 12px; color: #666;">This is an automated message from your Secret Santa organizer.</p>
      </div>
    `,
  }

  await brevoApiInstance.sendTransacEmail(emailData)
}

// GET /api/notifications/status - Get notification status for matches
router.get("/status", async (req, res) => {
  try {
    const { groupId } = req.query
    const filter = {}
    if (groupId) filter.groupId = groupId

    const matches = await Match.find(filter)
      .populate("groupId", "name")
      .populate("giverId", "name email")
      .select("notificationSent notificationSentAt giverId groupId")

    const summary = {
      total: matches.length,
      sent: matches.filter((m) => m.notificationSent).length,
      pending: matches.filter((m) => !m.notificationSent).length,
    }

    res.json({
      summary,
      matches: matches.map((match) => ({
        matchId: match._id,
        giver: match.giverId.name,
        group: match.groupId.name,
        notificationSent: match.notificationSent,
        notificationSentAt: match.notificationSentAt,
      })),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
