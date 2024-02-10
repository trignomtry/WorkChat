let roomListDiv = document.getElementById("room-list");
let messagesDiv = document.getElementById("messages");
let newMessageForm = document.getElementById("new-message");
let newRoomForm = document.getElementById("new-room");
let statusDiv = document.getElementById("status");

let roomTemplate = document.getElementById("room");
let messageTemplate = document.getElementById("message");

let messageField = newMessageForm.querySelector("#message");
let roomNameField = newRoomForm.querySelector("#name");

let registerUsername =  document.getElementById("register-username");
let registerButton = document.getElementById("register-button");
let registerDialog = document.getElementById("register");

var STATE = {
  room: "lobby",
  rooms: {},
  connected: false,
};

// Generate a color from a "hash" of a string. Thanks, internet.
function hashColor(str) {
  let hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }

  return `hsl(${hash % 360}, 100%, 70%)`;
}






// Add a new room `name` and change to it. Returns `true` if the room didn't
// already exist and false otherwise.
function addRoom(name) {
  if (STATE[name]) {
    changeRoom(name);
    return false;
  }

  var node = roomTemplate.content.cloneNode(true);
  var room = node.querySelector(".room");
  room.addEventListener("click", () => changeRoom(name));
  room.textContent = name;
  room.dataset.name = name;
  roomListDiv.appendChild(node);

  STATE[name] = [];
  changeRoom(name);
  return true;
}

// Change the current room to `name`, restoring its messages.
function changeRoom(name) {
  if (STATE.room == name) return;

  var newRoom = roomListDiv.querySelector(`.room[data-name='${name}']`);
  var oldRoom = roomListDiv.querySelector(`.room[data-name='${STATE.room}']`);
  if (!newRoom || !oldRoom) return;

  STATE.room = name;
  oldRoom.classList.remove("active");
  newRoom.classList.add("active");

  messagesDiv.querySelectorAll(".message").forEach((msg) => {
    messagesDiv.removeChild(msg);
  });

  STATE[name].forEach((data) => addMessage(name, data.username, data.message));
}

// Add `message` from `username` to `room`. If `push`, then actually store the
// message. If the current room is `room`, render the message.
function addMessage(room, username, message, push = false) {
  let gusername = localStorage.getItem("username");
  if (push) {
    STATE[room].push({ gusername, message });
  }

  if (STATE.room == room) {
    var node = messageTemplate.content.cloneNode(true);
    node.querySelector(".message .username").textContent = username;
    node.querySelector(".message .username").style.color = hashColor(username);
    node.querySelector(".message .text").textContent = message;
    messagesDiv.prepend(node);
  }
}

// Subscribe to the event source at `uri` with exponential backoff reconnect.
function subscribe(uri) {
  var retryTime = 1;

  function connect(uri) {
    const events = new EventSource(uri);

    events.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (!("message" in msg) || !("room" in msg) || !("username" in msg))
        return;
      addMessage(msg.room, msg.username, msg.message, true);
    });

    events.addEventListener("open", () => {
      setConnectedStatus(true);
      console.log(`connected to event stream at ${uri}`);
      retryTime = 1;
    });

    events.addEventListener("error", () => {
      setConnectedStatus(false);
      events.close();

      let timeout = retryTime;
      retryTime = Math.min(64, retryTime * 2);
      console.log(`connection lost. attempting to reconnect in ${timeout}s`);
      setTimeout(() => connect(uri), (() => timeout * 1000)());
    });
  }

  connect(uri);
}

// Set the connection status: `true` for connected, `false` for disconnected.
function setConnectedStatus(status) {
  STATE.connected = status;
  statusDiv.className = status ? "connected" : "reconnecting";
}

const d = new Date();
const months = [
  "Januray",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const fullDate =
months[d.getMonth()] +" "+  d.getDate() + ", " + d.getFullYear();
const labeld = document.getElementById("fulldate");
labeld.innerText = fullDate;

// Let's go! Initialize the world.
function init() {
  // Initialize some rooms.
  addRoom("lobby");
  addRoom("rocket");
  changeRoom("lobby");
  addMessage(
    "lobby",
    "System",
    "Server Started",
    true,
  );
  addMessage("rocket", "Rocket", "This is another room. Neat, huh?", true);


  // Set up the form handler.
  newMessageForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const room = STATE.room;
    const message = messageField.value;
    const username = localStorage.getItem("username") || "guest";
    if (!message || !username) return;

    if (STATE.connected) {
      fetch("/message", {
        method: "POST",
        body: new URLSearchParams({ room, username, message }),
      }).then((response) => {
        if (response.ok) messageField.value = "";
      });
    }
  });

  // Set up the new room handler.
  newRoomForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const room = roomNameField.value;
    if (!room) return;

    roomNameField.value = "";
    if (!addRoom(room)) return;

    addMessage(room, "Rocket", `Look, your own "${room}" room! Nice.`, true);
  });

  // Subscribe to server-sent events.
  subscribe("/events");

  let usrname = localStorage.getItem("username");
  if(usrname){

  } else{
    document.querySelector("main").style.display = "none";
    registerDialog.open = "true";
    registerButton.addEventListener("click", (e) => {
      e.preventDefault();
      registerDialog.style.display = "none";
      localStorage.setItem("username", registerUsername.value);
      if(registerUsername.value){
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
        setTimeout(() => {
          location.reload();
        }, 1000);
      } else {
        alert("Please enter a username")
        location.reload();
      }
    });
  }


}
init();

fetch('./messages.json')
  .then(response => response.json())
  .then(data => {
    for(var i = 0; i < data.length; i++){
      addMessage(data[i].room, data[i].username, data[i].message, false);
    }
  });



  //Workflow Code Exciting

  