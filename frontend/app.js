const socket = io("http://localhost:3000"); // Connect to backend

let currentUser = null;
let currentRoom = null;

// DOM elements
const homePage = document.getElementById("homePage");
const chatApp = document.getElementById("chatApp");
const sidebar = document.getElementById("sidebar");
const messagesDiv = document.getElementById("messages");

const createForm = document.getElementById("createRoomForm");
const joinForm = document.getElementById("joinRoomForm");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");

// --- Create Room ---
createForm.onsubmit = async (e) => {
  e.preventDefault();
  const userName = document.getElementById("createUserName").value.trim();
  if (!userName) return alert("Enter your name");

  try {
    // Call backend REST API to create a room
    const res = await fetch("http://localhost:3000/api/rooms/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostName: userName })
    });

    const data = await res.json();
    if (data.error) return alert(data.error);

    const roomCode = data.roomCode;

    // Join the newly created room via Socket.IO
    socket.emit("join-room", { roomCode, userName });

  } catch (err) {
    console.error(err);
    alert("Failed to create room");
  }
};

// --- Join Existing Room ---
joinForm.onsubmit = (e) => {
  e.preventDefault();
  const userName = document.getElementById("joinUserName").value.trim();
  const roomCode = document.getElementById("joinRoomCode").value.trim().toUpperCase();
  if (!userName || !roomCode) return alert("Enter name and room code");

  socket.emit("join-room", { roomCode, userName });
};

// --- Send Chat Message ---
messageForm.onsubmit = (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  socket.emit("send-message", { message: text });
  messageInput.value = "";
};

// --- Socket Event Handlers ---
socket.on("room-joined", ({ room, user }) => {
  currentUser = user;
  currentRoom = room;

  homePage.classList.add("hidden");
  chatApp.classList.remove("hidden");

  // ✅ Set room code in existing span
  document.getElementById("roomCodeDisplay").textContent = room.code;

  // ✅ Handle copy button click
  const copyBtn = document.getElementById("copyRoomCode");
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(room.code).then(() => {
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy Code"), 2000);
    }).catch(err => {
      alert("Failed to copy code.");
      console.error(err);
    });
  };

  renderSidebar(room.participants);
  renderMessages(room.messages);
});



socket.on("user-joined", ({ user }) => {
  addMessage({ sender: "System", message: `${user.name} joined the room`, type: "system" });
  updateParticipants(user, true);
});

socket.on("new-message", (msg) => addMessage(msg));

socket.on("user-left", ({ userId, userName }) => {
  addMessage({ sender: "System", message: `${userName} left the room`, type: "system" });
  updateParticipants({ id: userId, name: userName }, false);
});

// --- Rendering Functions ---
function renderSidebar(participants) {
  sidebar.innerHTML = `
    <h2 class="text-xl font-bold mb-2">Users</h2>
    <ul>${participants.map(u => `<li>${u.name}</li>`).join("")}</ul>
  `;
}

function updateParticipants(user, add) {
  const list = Array.from(sidebar.querySelectorAll("li")).map(li => li.textContent);
  if (add && !list.includes(user.name)) list.push(user.name);
  if (!add) list.splice(list.indexOf(user.name), 1);

  sidebar.innerHTML = `
    <h2 class="text-xl font-bold mb-2">Users</h2>
    <ul>${list.map(name => `<li>${name}</li>`).join("")}</ul>
  `;
}

function renderMessages(messages) {
  messagesDiv.innerHTML = "";
  messages.forEach(addMessage);
}

function addMessage(msg) {
  const div = document.createElement("div");
  div.className = "mb-2";
  
  if (msg.type === "system") {
    div.innerHTML = `<em class="text-gray-400">${msg.message}</em>`;
  } else {
    div.innerHTML = `<strong class="text-purple-400">${msg.sender}:</strong> ${msg.message}`;
  }
  
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
