const express = require("express")
const router = express.Router()
const Match = require("../models/Match")
const Member = require("../models/Member")
const Group = require("../models/Group")
const { shuffleArray } = require('../utils/index');
const { removeUnarchivedMatches } = require('../utils/index');


// GET /api/matches - Get all matches for a group
router.get("/", async (req, res) => {
  try {
    const { groupId } = req.body;

    if (!groupId) {
      return res.status(400).json({ error: "Group ID is required" });
    }

    // First, find the group to get its matchIds
    const group = await Group.findById(groupId);
    
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Find all matches using the matchIds from the group
    const matches = await Match.find({ 
      _id: { $in: group.matchIds } 
    })
      .populate("groupId", "name")
      .populate("secretSantaId", "name email")
      .populate("gifteeId", "name email")
      .sort({ dateMatched: -1 });

    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/matches/generate - Generate matches for a group
router.post("/generate", async (req, res) => {
  try {
      const { groupId } = req.body; // Get groupId from URL params
  
      // Fetch the group and its members
      const group = await Group.findById(groupId).populate('members');
      
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
  
      // Check if the group is archived
      if (group.archived) {
        return res.status(400).json({ error: "The group is archived. No further action can be taken on it." });
      }
  
      if (group.matchIds.length > 0) {
        await removeUnarchivedMatches(group.matchIds, group._id);
      }
  
      const members = group.members;  // List of members in this group
      
      if (members.length < 2) {
        return res.status(400).json({ error: "Not enough members in the group to create matches" });
      }
  
      // Perform matching logic (e.g., randomize and ensure no repeats)
      const matches = [];
      const shuffledMembers = shuffleArray([...members]);  // Shuffle the array to randomize the matching
  
      for (let i = 0; i < shuffledMembers.length; i++) {
        let secretSanta = shuffledMembers[i];
        let giftee = shuffledMembers[(i + 1) % shuffledMembers.length]; // Circular matching
  
        // Check if secretSanta and giftee have been matched before
        let attempts = 0;
        while (secretSanta.lastGifteeMatch.includes(giftee._id) && attempts < members.length) {
          // Try next giftee in the shuffled array
          giftee = shuffledMembers[(i + 1 + attempts) % shuffledMembers.length];
          attempts++;
  
          // If we've cycled through all members, exit to prevent infinite loop
          if (attempts >= members.length) {
            return res.status(400).json({ error: "Could not find a valid match. Please try again." });
          }
        }
  
        // Create the match
        const newMatch = new Match({
          secretSantaId: secretSanta._id,
          gifteeId: giftee._id,
          groupId: group._id,
          dateMatched: new Date().toISOString(),
        });
  
        // Save the match
        const savedMatch = await newMatch.save();
        matches.push(savedMatch);
  
        // Save match Id to the group
        group.matchIds.push(savedMatch._id);
  
        // Save the updated members' lastGifteeMatch
        await secretSanta.save();
        await giftee.save();
      }
  
      await group.save();
  
      res.status(201).json({
        message: 'Matches created successfully!',
        matches: matches
      });
  
    } catch (err) {
      console.error('Error matching members:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE /api/matches/group/:groupId - Delete all matches for a group
router.delete("/group/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params
    const { year } = req.query

    const filter = { groupId }
    if (year) filter.year = Number.parseInt(year)

    const result = await Match.deleteMany(filter)

    res.json({
      message: `Deleted ${result.deletedCount} matches`,
      deletedCount: result.deletedCount,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
