const express = require("express")
const router = express.Router()
const Member = require("../models/Member")
const Group = require("../models/Group")

// GET /api/members - Get all members
router.get("/", async (req, res) => {
  try {
    const members = await Member.find().sort({ createdAt: -1 })
    res.json(members)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/members/:id - Get single member
router.get("/:id", async (req, res) => {
  try {
    const member = await Member.findById(req.params.id).populate("groupId", "name")
    if (!member) {
      return res.status(404).json({ error: "Member not found" })
    }
    res.json(member)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/members - Create new member
router.post("/", async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber } = req.body

    if (!firstName, !lastName, !email, !phoneNumber) {
      return res.status(400).json({ error: "firstName, lastName, email, phoneNumber are required" })
    }

    // Check if email exists
    const emailExists = await Member.findOne({ email: email })
    if (emailExists) {
      return res.status(400).json({ error: "Email Already Exists. Please choose another for this user." })
    }

    const member = new Member({
      firstName, lastName, email, phoneNumber
    })

    const savedMember = await member.save()
    const populatedMember = await Member.findById(savedMember._id)

    res.status(201).json(populatedMember)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// PUT /api/members/:id - Update member TBD
// router.put("/", async (req, res) => {
//   try {
//     const { id, name, email, phone, groupId } = req.body

//     const updateData = { name, email, phone }
//     if (groupId) {
//       // Check if group exists
//       const group = await Group.findById(groupId)
//       if (!group) {
//         return res.status(400).json({ error: "Invalid group ID" })
//       }
//       updateData.groupId = groupId
//     }

//     const member = await Member.findByIdAndUpdate(req.params.id, updateData, {
//       new: true,
//       runValidators: true,
//     }).populate("groupId", "name")

//     if (!member) {
//       return res.status(404).json({ error: "Member not found" })
//     }

//     res.json(member)
//   } catch (error) {
//     res.status(400).json({ error: error.message })
//   }
// })

// DELETE /api/members/:id - Delete member (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const member = await Member.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true })

    if (!member) {
      return res.status(404).json({ error: "Member not found" })
    }

    res.json({ message: "Member deleted successfully" })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
