import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js";
import { firebaseConfig, CONTROL_PATH } from "./reception-firebase-config.js";
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
  } catch (error) {
    showMessage("Google sign-in failed: " + (error.code || error.message), true);
  }
});
signOutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
    showMessage("Signed out.");
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
