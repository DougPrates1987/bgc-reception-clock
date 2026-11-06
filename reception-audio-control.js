import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js";
import { firebaseConfig, CONTROL_PATH, TRACKS_PATH } from "./reception-firebase-config.js";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const signInButton = document.getElementById("signIn");
const signOutButton = document.getElementById("signOut");
const authTitle = document.getElementById("authTitle");
const authDetail = document.getElementById("authDetail");
const uidBox = document.getElementById("uidBox");
const message = document.getElementById("message");
const connectionDot = document.getElementById("connectionDot");
const connectionText = document.getElementById("connectionText");
const lastCommand = document.getElementById("lastCommand");
const commandButtons = [...document.querySelectorAll("[data-action], [data-track]")];
const volumeInput = document.getElementById("volume");
const volumeValue = document.getElementById("volumeValue");
const trackTitleInput = document.getElementById("trackTitle");
const trackUrlInput = document.getElementById("trackUrl");
const addTrackForm = document.getElementById("addTrackForm");
const addTrackButton = document.getElementById("addTrackButton");
const customTracksBox = document.getElementById("customTracks");
const libraryMessage = document.getElementById("libraryMessage");
let customTracks = [];
let currentUser = null;
let databaseConnected = false;
function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}
function updateControls() {
  const enabled = Boolean(currentUser);
  commandButtons.forEach(button => { button.disabled = !enabled; });
  volumeInput.disabled = !enabled;
  addTrackButton.disabled = !enabled;
}
function updateConnection() {
  connectionDot.classList.toggle("online", databaseConnected);
  connectionDot.classList.toggle("offline", !databaseConnected);
  connectionText.textContent = databaseConnected ? "Firebase connected" : "Firebase disconnected";
}
onValue(ref(db, ".info/connected"), snapshot => {
  databaseConnected = snapshot.val() === true;
  updateConnection();
}, () => {
  databaseConnected = false;
  updateConnection();
});
function showLibraryMessage(text, isError = false) {
  libraryMessage.textContent = text;
  libraryMessage.classList.toggle("error", isError);
}
function renderCustomTracks() {
  customTracksBox.replaceChildren();
  customTracksBox.hidden = customTracks.length === 0;
  for (const track of customTracks) {
    const row = document.createElement("div");
    row.className = "track";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = track.title || "Untitled hymn";
    const detail = document.createElement("small");
    detail.textContent = "Custom · MP3";
    copy.append(title, detail);
    const playButton = document.createElement("button");
    playButton.className = "btn";
    playButton.type = "button";
    playButton.textContent = "Play on TV";
    playButton.disabled = !currentUser;
    playButton.addEventListener("click", () => sendCommand("selectUrl", {
      trackUrl: track.url, trackTitle: track.title, trackId: track.id
    }));
    row.append(copy, playButton);
    customTracksBox.append(row);
  }
}
onValue(ref(db, TRACKS_PATH), snapshot => {
  const data = snapshot.val() || {};
  customTracks = Object.values(data).filter(track => track && typeof track.url === "string");
  renderCustomTracks();
  showLibraryMessage(customTracks.length
    ? customTracks.length + " custom hymn" + (customTracks.length === 1 ? "" : "s") + " shared with the reception TV."
    : "No custom hymns added yet.");
}, error => {
  showLibraryMessage("Could not load the shared library. The database rules may need the tracks path enabled.", true);
  console.error("Firebase hymn library error:", error);
});
onAuthStateChanged(auth, user => {
  currentUser = user;
  updateControls();
  if (user) {
    authTitle.textContent = "Google account connected";
    authDetail.textContent = user.email || "Signed in";
    signInButton.hidden = true;
    signOutButton.hidden = false;
    uidBox.hidden = false;
    uidBox.textContent = "Firebase user ID (UID): " + user.uid;
    showMessage("Connected. Database rules must authorize this account before commands can be sent.");
  } else {
    authTitle.textContent = "Connect your Google account";
    authDetail.textContent = "Sign in to send playback commands to the TV.";
    signInButton.hidden = false;
    signOutButton.hidden = true;
    uidBox.hidden = true;
    showMessage("Sign in with Google to enable the controls.");
  }
});
signInButton.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
    showMessage("Google account connected.");
    renderCustomTracks();
  } catch (error) {
    showMessage("Google sign-in failed: " + (error.code || error.message), true);
  }
});
signOutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
    showMessage("Signed out.");
    renderCustomTracks();
  } catch (error) {
    showMessage("Sign-out failed: " + (error.code || error.message), true);
  }
});
function makeCommandId() {
  return (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() :
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}
async function sendCommand(action, extra = {}) {
  if (!currentUser) {
    showMessage("Sign in with Google before sending a command.", true);
    return;
  }
  const command = { commandId: makeCommandId(), action, sentAt: Date.now(), ...extra };
  try {
    await set(ref(db, CONTROL_PATH), command);
    const label = action === "select" ? "Selected " + extra.trackId.replace(".mp3", "") :
      action === "selectUrl" ? "Selected " + extra.trackTitle :
      action.charAt(0).toUpperCase() + action.slice(1);
    lastCommand.textContent = label + " · Sent to TV";
    showMessage("Command sent. The TV receiver page must be open to receive it.");
  } catch (error) {
    const detail = error.code === "PERMISSION_DENIED" ?
      "Permission denied. Firebase database rules still need to authorize this Google account." :
      "Could not send command: " + (error.code || error.message);
    showMessage(detail, true);
  }
}
addTrackForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) {
    showLibraryMessage("Sign in with Google before adding a hymn.", true);
    return;
  }
  const title = trackTitleInput.value.trim();
  const urlText = trackUrlInput.value.trim();
  let parsed;
  try { parsed = new URL(urlText); } catch {}
  if (!title || !parsed || parsed.protocol !== "https:" || !parsed.pathname.toLowerCase().endsWith(".mp3")) {
    showLibraryMessage("Enter a title and a public HTTPS link that points directly to an MP3 file.", true);
    return;
  }
  addTrackButton.disabled = true;
  showLibraryMessage("Adding the hymn to the shared library…");
  const id = "custom-" + makeCommandId().replace(/[^a-zA-Z0-9_-]/g, "");
  const track = { id, title, url: parsed.href, addedAt: Date.now() };
  try {
    await set(ref(db, TRACKS_PATH + "/" + id), track);
    trackTitleInput.value = "";
    trackUrlInput.value = "";
    showLibraryMessage("Added " + title + " to the shared TV library.");
  } catch (error) {
    showLibraryMessage(error.code === "PERMISSION_DENIED"
      ? "The database rules need read access for the TV and write access for your account at receptionAudio/tracks."
      : "Could not add this hymn: " + (error.code || error.message), true);
  } finally {
    addTrackButton.disabled = !currentUser;
  }
});
document.querySelectorAll("[data-action]").forEach(button => {
  button.addEventListener("click", () => sendCommand(button.dataset.action));
});
document.querySelectorAll("[data-track]").forEach(button => {
  button.addEventListener("click", () => sendCommand("select", { trackId: button.dataset.track }));
});
volumeInput.addEventListener("input", () => {
  volumeValue.textContent = volumeInput.value + "%";
});
volumeInput.addEventListener("change", () => {
  sendCommand("volume", { volume: Number(volumeInput.value) / 100 });
});
