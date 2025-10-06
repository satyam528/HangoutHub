import express from 'express';
import Room from './Room.js'; // Your mongoose Room model

const router = express.Router();

// Route to create room
router.post('/create', async (req, res) => {
  const { hostProfile } = req.body;

  if (!hostProfile || !hostProfile.name) {
    return res.status(400).json({ error: 'Invalid host profile' });
  }

  try {
    const room = new Room({
      hostName: hostProfile.name,
      hostProfile,
      admissionRequired: true,
      waitingList: [],
    });

    await room.save();

    res.json({ roomCode: room.code });
  } catch (error) {
    console.error('Room creation error:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Route to get room by code
router.get('/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const room = await Room.findOne({ code });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.json(room);
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Failed to retrieve room' });
  }
});

export default router;
