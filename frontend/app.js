// --- Socket.io ---
const socket = io("http://localhost:3000");

// --- Global state ---
let userProfile = null;
let currentUser = null;
let currentRoom = null;
let localStream = null;
let localScreenStream = null;
const peerConnections = {};
let isAudioMuted = false, isVideoMuted = false, isScreenSharing = false;

// --- Helper: unique ID ---
function generateUniqueId() {
  return 'user_' + Math.random().toString(36).substr(2, 9);
}

// --- DOM Elements ---
const homePage = document.getElementById('homePage');
const chatApp = document.getElementById('chatApp');
const usernameInput = document.getElementById('username');
const roomControls = document.getElementById('roomControls');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');

// --- LOGIN ---
document.getElementById("loginBtn").onclick = () => {
  const username = usernameInput.value.trim();
  if (!username) return alert("Please enter a username");

  userProfile = { name: username, id: generateUniqueId() };
  currentUser = userProfile;

  // Show room controls (inside home page)
  roomControls.classList.remove('hidden');

  // Disable login input/button after logging in
  usernameInput.disabled = true;
  document.getElementById("loginBtn").disabled = true;

  alert(`Welcome, ${username}! Now create or join a room.`);
};

// --- CREATE ROOM ---
createRoomBtn.onclick = () => {
  if (!userProfile) return alert("Please log in first.");
  socket.emit("create-room", { hostProfile: userProfile });
};

// --- JOIN ROOM ---
joinRoomBtn.onclick = () => {
  if (!userProfile) return alert("Please log in first.");
  const code = roomCodeInput.value.trim();
  if (!code) return alert("Enter a room code.");
  socket.emit("join-room", { roomCode: code, userProfile });
};

// --- COPY ROOM CODE ---
document.getElementById("copyRoomCode").onclick = () => {
  navigator.clipboard.writeText(roomCodeDisplay.textContent);
  alert("Copied: " + roomCodeDisplay.textContent);
};

// --- ROOM CREATED ---
socket.on("room-created", async ({ roomCode, room, hostUser }) => {
  currentRoom = room;
  currentUser = hostUser;
  if (!currentUser.id) currentUser.id = generateUniqueId();

  // Hide home page and show chat app
  homePage.classList.add("hidden");
  chatApp.classList.remove("hidden");
  roomCodeDisplay.textContent = roomCode;

  await startLocalMediaAndControls();
  renderParticipants([currentUser]);
  renderMessages(room.messages || []);
});

// --- ROOM JOINED ---
socket.on("room-joined", async ({ room, user, participants }) => {
  currentRoom = room;
  currentUser = user;

  // Ensure currentUser has an id
  if (!currentUser.id) currentUser.id = generateUniqueId();

  // Ensure participants is always an array
  participants = participants || [];

  // Hide home page and show chat app
  homePage.classList.add("hidden");
  chatApp.classList.remove("hidden");
  roomCodeDisplay.textContent = room.code;

  // Render participants (including self)
  renderParticipants([currentUser, ...participants]);

  // Render past messages if any
  renderMessages(room.messages || []);

  // Start local media (camera/mic)
  await startLocalMediaAndControls();

  // Start WebRTC connections for all participants with valid IDs
  participants.forEach(p => {
    if (p.id) startConnection(p.id);
  });
});


// --- LOCAL MEDIA ---
async function startLocalMediaAndControls() {
  if (!localStream) {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  }
  document.getElementById("localVideo").srcObject = localStream;
  initializeMediaControls();
}

// --- PARTICIPANTS / MESSAGES ---
function renderParticipants(list) {
  const ul = document.getElementById("userList");
  ul.innerHTML = "";
  list.forEach(p => {
    const li = document.createElement("li");
    li.textContent = p.name;
    ul.appendChild(li);
  });
}

function renderMessages(messages) {
  messages.forEach(m => addMessage(m));
}

// --- ADD MESSAGE ---
function addMessage({ sender, message, type = "user", fileData }) {
  const container = document.getElementById("messages");
  const div = document.createElement("div");

  if (type === "system") {
    div.className = "italic text-gray-400";
    div.textContent = message;
  } else if (type === "file-upload" && fileData) {
    div.innerHTML = `<strong>${sender}:</strong>
      <a href="${fileData.downloadUrl}" target="_blank" class="underline ml-2">📎 ${fileData.originalName}</a>`;
  } else {
    div.className = "flex";
    div.innerHTML = `<strong>${sender}:</strong> <span class="ml-2">${message}</span>`;
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// --- MEDIA CONTROLS ---
function initializeMediaControls() {
  document.getElementById('muteBtn').addEventListener('click', toggleMicrophone);
  document.getElementById('videoBtn').addEventListener('click', toggleCamera);
  document.getElementById('hangupBtn').addEventListener('click', leaveCall);
  document.getElementById('chatToggleBtn').addEventListener('click', () =>
    document.getElementById('chatPanel').classList.toggle('translate-x-full')
  );
  document.getElementById('closeChatBtn').addEventListener('click', () =>
    document.getElementById('chatPanel').classList.add('translate-x-full')
  );
}

// --- MUTE / CAMERA ---
function toggleMicrophone() {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  isAudioMuted = !track.enabled;
  track.enabled = !isAudioMuted;
  document.getElementById('muteBtn').classList.toggle('disabled', isAudioMuted);
}

function toggleCamera() {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  isVideoMuted = !track.enabled;
  track.enabled = !isVideoMuted;
  document.getElementById('videoBtn').classList.toggle('disabled', isVideoMuted);
  document.getElementById('localVideo').style.display = isVideoMuted ? 'none' : 'block';
}

// --- LEAVE CALL ---
function leaveCall() {
  if (!confirm('Leave the call?')) return;
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  if (localScreenStream) localScreenStream.getTracks().forEach(t => t.stop());
  Object.values(peerConnections).forEach(pc => pc.close());
  chatApp.classList.add("hidden");
  homePage.classList.remove("hidden");
  roomControls.classList.remove("hidden"); // show controls again after leaving
}
