const express = require("express")
const router = express.Router()
const Group = require("../models/Group")

// GET /api/groups - Get all groups
router.get("/", async (req, res) => {
  try {
    console.log("[v0] Fetching all groups")
    const groups = await Group.find({ archived: false }).sort({ createdAt: -1 })
    console.log(`[v0] Found ${groups.length} groups`)
    res.json(groups)
  } catch (error) {
    console.error("[v0] Error fetching groups:", error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/groups/:id - Get single group
router.get("/single", async (req, res) => {
  try {
    const { id } = req.body

    if (!id) {
      return res.status(400).json({ error: "Id is required" })
    }
    const group = await Group.findById(id)
    if (!group) {
      return res.status(404).json({ error: "Group not found" })
    }
    res.json(group)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/groups - Create new group
router.post("/", async (req, res) => {
  try {
    const { name, year } = req.body

    if (!name || !year) {
      return res.status(400).json({ error: "Group name & year is required" })
    }

    const group = new Group({
      name,
      year
    })

    const savedGroup = await group.save()
    res.status(201).json(savedGroup)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// PUT /api/groups - Update group (ID in body)
router.put("/", async (req, res) => {
  try {
    const { id, name, year, members, matchIds } = req.body;

    // Check if ID is provided
    if (!id) {
      return res.status(400).json({ error: "Group ID is required in request body" });
    }

    // First, find the group to check if it's archived
    const existingGroup = await Group.findById(id);
    
    if (!existingGroup) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if group is archived
    if (existingGroup.archived) {
      return res.status(400).json({ 
        error: "Cannot update archived group" 
      });
    }

    // Build update object with only the fields that should be updated
    const updateData = {};
    
    if (name !== undefined) updateData.name = name;
    if (year !== undefined) updateData.year = year;
    
    // Replace arrays completely if provided (not add to them)
    if (members !== undefined) updateData.members = members;
    if (matchIds !== undefined) updateData.matchIds = matchIds;

    const group = await Group.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json(group);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/groups/:id - Delete group (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.body

    // Check if ID is provided
    if (!id) {
      return res.status(400).json({ error: "Group ID is required in request body" });
    }

    const group = await Group.findByIdAndUpdate(id, { archived: false }, { new: true })

    if (!group) {
      return res.status(404).json({ error: "Group not found" })
    }

    res.json({ message: "Group deleted successfully" })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
