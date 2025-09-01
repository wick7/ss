//#region Required & Setup 
//Express Setup
const express = require('express');
const router = express.Router()
const Member = require("../models/Member")
const Group = require("../models/Group")
const Match = require("../models/Match")

const mongoose = require('mongoose');

router.post('/email-notification', async (req, res) => {
  try {
    const { groupId } = req.body;

    // Validate groupId
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID format'
      });
    }

    // Find the group
    const group = await Group.findById(groupId).populate('members');
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check if group has any matches
    if (!group.matchIds || group.matchIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No matches found for this group'
      });
    }

    // If group is already archived, return an error
    if (group.archived) {
      return res.status(400).json({
        success: false,
        message: 'Group is already archived (notifications already sent)'
      });
    }

    // Find all non-archived matches for this group
    const matches = await Match.find({
      _id: { $in: group.matchIds },
      archived: false
    });

    if (matches.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'All matches in this group are already archived'
      });
    }

    // Verify API key exists
    if (!process.env.BREVO_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Brevo API key is not configured'
      });
    }

    // Set up direct API access using Axios instead of the Brevo SDK
    const axios = require('axios');
    const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Secret Santa App';
    const EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'secretsanta@example.com';

    // Prepare to store results of all notifications
    const notificationResults = [];
    const failedNotifications = [];

    // Process each match and send notifications
    for (const match of matches) {
      // Get the secret Santa and giftee details
      const secretSanta = await Member.findById(match.secretSantaId);
      const giftee = await Member.findById(match.gifteeId);

      if (!secretSanta || !giftee) {
        console.log(`Match ${match._id} failed: Secret Santa or giftee member not found`);
        failedNotifications.push({
          matchId: match._id,
          error: 'Secret Santa or giftee member not found'
        });
        continue;
      }

      // Check if Secret Santa has an email
      if (!secretSanta.email) {
        console.log(`Match ${match._id} failed: Secret Santa email is missing`);
        failedNotifications.push({
          matchId: match._id,
          secretSantaId: secretSanta._id,
          error: 'Secret Santa email is missing'
        });
        continue;
      }

      // Generate email content
      const emailSubject = `${group.name} - Your Secret Santa Assignment - TEST`;
      const emailText = `Hi ${secretSanta.firstName},\n\nYou are the Secret Santa for ${giftee.firstName} ${giftee.lastName}!\n\nPlease refer to the Excel spreadsheet for gift ideas.\n\nHappy gifting!`;
      const emailHtml = `
        <h2>Secret Santa Assignment - TEST</h2>
        <p>Hi ${secretSanta.firstName},</p>
        <p>You are the Secret Santa for <strong>${giftee.firstName} ${giftee.lastName}</strong>!</p>
        <p>Please refer to the Excel spreadsheet for gift ideas.</p>
        <p>Happy gifting!</p>
      `;

      try {
        // Create email data object
        const emailData = {
          sender: { 
            name: EMAIL_FROM_NAME, 
            email: EMAIL_FROM_ADDRESS 
          },
          to: [{ 
            email: secretSanta.email, 
            name: `${secretSanta.firstName} ${secretSanta.lastName}` 
          }],
          subject: emailSubject,
          htmlContent: emailHtml,
          textContent: emailText,
          replyTo: { 
            email: EMAIL_FROM_ADDRESS,
            name: EMAIL_FROM_NAME 
          },
          headers: { 
            "X-Secret-Santa-Match-ID": match._id.toString() 
          },
          params: { 
            secretSantaName: secretSanta.firstName,
            gifteeName: `${giftee.firstName} ${giftee.lastName}`,
            groupName: group.name
          }
        };

        // Send the email using direct API call
        const emailResponse = await axios.post(
          process.env.BREV_BASE_EMAIL,
          emailData,
          {
            headers: {
              'accept': 'application/json',
              'api-key': process.env.BREVO_API_KEY,
              'content-type': 'application/json'
            }
          }
        );
        
        console.log(`Email sent successfully for match ${match._id}:`, emailResponse.data.messageId);

        // ONLY after successful email:
        // 1. Update the match to archived status
        match.archived = true;
        await match.save();

        // 2. Update the secretSanta's lastGifteeMatch array by adding giftee's ID
        await Member.findByIdAndUpdate(
          secretSanta._id,
          { $push: { lastGifteeMatch: giftee._id } }
        );

        // 3. Add successful notification to results
        notificationResults.push({
          success: true,
          emailMessageId: emailResponse.data.messageId,
          secretSanta: {
            id: secretSanta._id,
            name: `${secretSanta.firstName} ${secretSanta.lastName}`,
            email: secretSanta.email
          },
          giftee: {
            id: giftee._id,
            name: `${giftee.firstName} ${giftee.lastName}`
          },
          emailSubject,
          matchId: match._id,
          matchArchived: true,
          memberUpdated: true
        });
      } catch (emailError) {
        // If email fails, DO NOT archive the match
        console.error(`Error sending email for match ${match._id}:`, emailError);
        failedNotifications.push({
          matchId: match._id,
          secretSantaId: secretSanta._id,
          gifteeId: giftee._id,
          error: `Failed to send email: ${emailError.message}`,
          matchArchived: false,
          memberUpdated: false
        });
      }
    }

    // If all notifications were successful, archive the group
    if (failedNotifications.length === 0 && notificationResults.length > 0) {
      group.archived = true;
      await group.save();
    }

    // Prepare response data
    const responseData = {
      success: notificationResults.length > 0,
      totalMatches: matches.length,
      successfulNotifications: notificationResults.length,
      failedNotifications: failedNotifications.length,
      groupArchived: group.archived,
      notifications: notificationResults
    };

    // If there were failures, include them in the response
    if (failedNotifications.length > 0) {
      responseData.failures = failedNotifications;
    }
  
    // Always return JSON response
    return res.json(responseData);
  } catch (error) {
    console.error('Error generating email notifications:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while generating email notifications',
      error: error.message
    });
  }
});

module.exports = router
